import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./outbox", () => ({
  enqueue: vi.fn(),
  flush: vi.fn(),
}));
vi.mock("@/app/actions/telemetry", () => ({
  insertTelemetryEventAction: vi.fn(),
}));
vi.mock("@/app/actions/job-sessions", () => ({
  applyQueuedJobActualConfirmationAction: vi.fn(),
  applyQueuedJobSessionPatchAction: vi.fn(),
  applyQueuedManualJobSessionStartAction: vi.fn(),
}));

import { enqueue, flush } from "./outbox";
import { insertTelemetryEventAction } from "@/app/actions/telemetry";
import {
  applyQueuedJobActualConfirmationAction,
  applyQueuedJobSessionPatchAction,
  applyQueuedManualJobSessionStartAction,
} from "@/app/actions/job-sessions";
import {
  enqueueJobActualConfirmation,
  enqueueJobSessionGpsObservation,
  enqueueJobSessionLifecyclePatch,
  enqueueManualJobSessionStart,
  flushJobSessionOutbox,
} from "./job-session-sync";

const mockEnqueue = vi.mocked(enqueue);
const mockFlush = vi.mocked(flush);
const mockInsertTelemetryEventAction = vi.mocked(insertTelemetryEventAction);
const mockApplyQueuedJobActualConfirmationAction = vi.mocked(applyQueuedJobActualConfirmationAction);
const mockApplyQueuedJobSessionPatchAction = vi.mocked(applyQueuedJobSessionPatchAction);
const mockApplyQueuedManualJobSessionStartAction = vi.mocked(applyQueuedManualJobSessionStartAction);

afterEach(() => {
  vi.clearAllMocks();
});

describe("enqueue helpers", () => {
  it("enqueues a GPS observation keyed by the event's own id", async () => {
    await enqueueJobSessionGpsObservation("farm-1", {
      id: "event-1",
      farmId: "farm-1",
      source: "phone_gps",
      recordedAt: "2026-09-02T09:00:00Z",
      payload: { lat: 52.5, lng: -7.9 },
      jobSessionId: "session-1",
    });
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ id: "event-1", type: "job_session_gps_observation", farmId: "farm-1" }),
    );
  });

  it("enqueues a manual job session start keyed by the session's own id", async () => {
    const payload = {
      decision: { id: "decision-1" } as never,
      jobSession: { id: "session-1", farmId: "farm-1" } as never,
    };
    await enqueueManualJobSessionStart("farm-1", payload);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-1", type: "job_session_start", payload }),
    );
  });

  it("enqueues a lifecycle patch with a freshly generated id each time", async () => {
    await enqueueJobSessionLifecyclePatch("farm-1", "session-1", { status: "paused" });
    await enqueueJobSessionLifecyclePatch("farm-1", "session-1", { status: "active" });
    const firstId = mockEnqueue.mock.calls[0][0].id;
    const secondId = mockEnqueue.mock.calls[1][0].id;
    expect(firstId).not.toBe(secondId);
    expect(mockEnqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: "job_session_lifecycle", payload: { jobSessionId: "session-1", patch: { status: "paused" } } }),
    );
  });

  it("enqueues a job Actual confirmation keyed by the input's own id", async () => {
    const input = { id: "actual-1", farmId: "farm-1" } as never;
    await enqueueJobActualConfirmation("farm-1", input);
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ id: "actual-1", type: "job_actual_confirmation", payload: input }));
  });
});

describe("flushJobSessionOutbox / syncJobSessionOutboxItem dispatch", () => {
  it("dispatches each item type to its real sync call", async () => {
    mockFlush.mockImplementation(async (_farmId, syncFn) => {
      await syncFn({ id: "1", type: "telemetry_event", farmId: "farm-1", payload: { a: 1 }, enqueuedAt: "", syncState: "syncing", attempts: 1 });
      await syncFn({ id: "2", type: "job_session_gps_observation", farmId: "farm-1", payload: { b: 2 }, enqueuedAt: "", syncState: "syncing", attempts: 1 });
      await syncFn({ id: "3", type: "job_session_start", farmId: "farm-1", payload: { c: 3 }, enqueuedAt: "", syncState: "syncing", attempts: 1 });
      await syncFn({ id: "4", type: "job_session_lifecycle", farmId: "farm-1", payload: { jobSessionId: "s", patch: { status: "paused" } }, enqueuedAt: "", syncState: "syncing", attempts: 1 });
      await syncFn({ id: "5", type: "job_actual_confirmation", farmId: "farm-1", payload: { d: 5 }, enqueuedAt: "", syncState: "syncing", attempts: 1 });
      return { synced: [], failed: [] };
    });

    await flushJobSessionOutbox("farm-1");

    expect(mockInsertTelemetryEventAction).toHaveBeenCalledTimes(2);
    expect(mockApplyQueuedManualJobSessionStartAction).toHaveBeenCalledWith({ c: 3 });
    expect(mockApplyQueuedJobSessionPatchAction).toHaveBeenCalledWith("s", { status: "paused" });
    expect(mockApplyQueuedJobActualConfirmationAction).toHaveBeenCalledWith({ d: 5 });
  });

  it("propagates a real sync failure rather than swallowing it silently", async () => {
    mockFlush.mockImplementation(async (_farmId, syncFn) => {
      await expect(
        syncFn({ id: "1", type: "job_session_start", farmId: "farm-1", payload: {}, enqueuedAt: "", syncState: "syncing", attempts: 1 }),
      ).rejects.toThrow("boom");
      return { synced: [], failed: [{ id: "1", error: "boom" }] };
    });
    mockApplyQueuedManualJobSessionStartAction.mockRejectedValueOnce(new Error("boom"));

    const result = await flushJobSessionOutbox("farm-1");
    expect(result.failed).toEqual([{ id: "1", error: "boom" }]);
  });
});
