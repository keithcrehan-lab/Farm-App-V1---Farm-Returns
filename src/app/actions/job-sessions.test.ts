import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Farm Return Next v1.1 — direct tests for `applyQueuedJobActualConfirmationAction`
 * itself, added in response to Codex audit HIGH (round 3, docs/overnight/
 * audits/gps-job-session-actual-contract-codex-audit-round3.md, finding
 * 2): this offline-sync action previously passed a client-supplied
 * `ConfirmJobActualInput.payload` straight to the farm-data layer's
 * `confirmJobSessionActual`, which explicitly trusts its caller already
 * ran `validateJobActualInput` — but nothing on this path ever had. The
 * online action (`confirmJobSessionActualAction`) already re-validates
 * against real, freshly fetched fields (see its own tests via
 * `job-actuals.test.ts` and `src/orchestration/job-session`); these tests
 * prove the offline-sync target now gets the identical treatment, using
 * the real `validateJobActualInput` (not mocked) against a mocked
 * `listFieldsForFarm`/`confirmJobSessionActual`.
 */
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/job-actuals", () => ({ confirmJobSessionActual: vi.fn() }));
vi.mock("@/lib/farm-data/job-sessions", () => ({
  insertJobSession: vi.fn(),
  updateJobSessionStatus: vi.fn(),
}));
vi.mock("@/lib/farm-data/decisions", () => ({ insertDecision: vi.fn() }));
vi.mock("@/orchestration/job-session", () => ({
  cancelJobSessionAction: vi.fn(),
  confirmJobSessionActualAction: vi.fn(),
  finishJobSessionAction: vi.fn(),
  pauseJobSessionAction: vi.fn(),
  resumeJobSessionAction: vi.fn(),
  startJobSessionFromPrompt: vi.fn(),
  startManualJobSession: vi.fn(),
}));
vi.mock("@/orchestration/prompt/recompute", () => ({ recomputePromptByKind: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { confirmJobSessionActual, type ConfirmJobActualInput } from "@/lib/farm-data/job-actuals";
import { startManualJobSession } from "@/orchestration/job-session";
import { applyQueuedJobActualConfirmationAction, startManualJobSessionAction } from "./job-sessions";
import type { Farm, Field } from "@/domain/types";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockConfirmJobSessionActual = vi.mocked(confirmJobSessionActual);
const mockStartManualJobSession = vi.mocked(startManualJobSession);

afterEach(() => {
  vi.clearAllMocks();
});

const farm: Farm = {
  id: "farm-1",
  name: "Green Acres",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: [],
  units: "metric",
  ownerName: "Keith",
};

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-7",
    farmId: "farm-1",
    name: "Field 7",
    areaHa: 6.8,
    centroid: [0, 0],
    fertility: {},
    ...overrides,
  } as Field;
}

const validInput: ConfirmJobActualInput = {
  id: "actual-1",
  farmId: "farm-1",
  jobSessionId: "session-1",
  activityType: "fertiliser_spreading",
  completionType: "whole",
  payload: {
    activityType: "fertiliser_spreading",
    completionType: "whole",
    fieldIds: ["field-7"],
    product: "CAN",
    quantity: 250,
    quantityUnit: "kg",
    areaHa: 6.8,
  },
  confirmedAt: "2026-09-02T11:00:00Z",
};

describe("applyQueuedJobActualConfirmationAction", () => {
  it("re-validates a queued payload against real, freshly fetched fields before ever calling confirmJobSessionActual", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockConfirmJobSessionActual.mockResolvedValue({
      actual: { id: "actual-1", revision: 1 } as never,
      sessionStatusUpdateError: undefined,
    });

    const result = await applyQueuedJobActualConfirmationAction(validInput);

    expect(mockListFields).toHaveBeenCalledWith("farm-1");
    expect(mockConfirmJobSessionActual).toHaveBeenCalledWith(
      expect.objectContaining({ id: "actual-1", farmId: "farm-1" }),
    );
    expect(result.actual.id).toBe("actual-1");
  });

  it("rejects a queued payload missing a required field (Codex audit HIGH, round 3) rather than silently forwarding it to confirmJobSessionActual", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);

    await expect(
      applyQueuedJobActualConfirmationAction({
        ...validInput,
        payload: { activityType: "fertiliser_spreading", completionType: "whole", fieldIds: [] },
      }),
    ).rejects.toThrow(/invalid queued Actual payload/);
    expect(mockConfirmJobSessionActual).not.toHaveBeenCalled();
  });

  it("reconstructs the raw input from the queued payload plus the top-level completionType/note, so re-validation runs against the real submitted values", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockConfirmJobSessionActual.mockResolvedValue({
      actual: { id: "actual-1", revision: 1 } as never,
      sessionStatusUpdateError: undefined,
    });

    await applyQueuedJobActualConfirmationAction({ ...validInput, note: "queued while offline" });

    expect(mockConfirmJobSessionActual).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ note: "queued while offline" }) }),
    );
  });
});

/**
 * Codex audit MEDIUM (round 10, GPS Job Mode campaign,
 * docs/farm-return-next/audit-logs/20260904T225928Z.md):
 * `startManualJobSession` inserts its Decision row *before* creating the
 * job session (the latter alone protected by the database's own
 * same-farm trigger) — a stale, deleted, or cross-farm `primaryFieldId`
 * previously let the Decision persist successfully while the job
 * session insert then failed, leaving an orphaned, misleading "accepted"
 * decision with no session behind it. `startManualJobSessionAction` now
 * validates the field against this farm's own real fields *before*
 * calling `startManualJobSession` at all — the same check
 * `startJobSessionFromPromptAction` already has.
 */
describe("startManualJobSessionAction — field validated before any row is persisted", () => {
  it("rejects a primaryFieldId that isn't a real field on the current farm, without ever calling startManualJobSession", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);

    await expect(
      startManualJobSessionAction({
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
        primaryFieldId: "field-does-not-exist",
      }),
    ).rejects.toThrow(/field field-does-not-exist not found/);
    expect(mockStartManualJobSession).not.toHaveBeenCalled();
  });

  it("proceeds when primaryFieldId is a real field on the current farm", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockStartManualJobSession.mockResolvedValue({
      decision: { id: "decision-1" } as never,
      jobSession: { id: "session-1" } as never,
    });

    const result = await startManualJobSessionAction({
      activityType: "fertiliser_spreading",
      jobSessionId: "session-1",
      primaryFieldId: "field-7",
    });

    expect(mockStartManualJobSession).toHaveBeenCalledWith(expect.objectContaining({ primaryFieldId: "field-7" }));
    expect(result.jobSession.id).toBe("session-1");
  });

  it("never looks up fields at all when no primaryFieldId is supplied — a fieldless manual start stays valid", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockStartManualJobSession.mockResolvedValue({
      decision: { id: "decision-1" } as never,
      jobSession: { id: "session-1" } as never,
    });

    await startManualJobSessionAction({ activityType: "fertiliser_spreading", jobSessionId: "session-1" });

    expect(mockListFields).not.toHaveBeenCalled();
    expect(mockStartManualJobSession).toHaveBeenCalled();
  });
});
