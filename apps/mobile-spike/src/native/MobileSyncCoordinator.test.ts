import { describe, expect, it, vi } from "vitest";
import { flushJobSessionObservations, type MobileSyncTelemetryPayload } from "./MobileSyncCoordinator";
import type { NativeGpsObservation, NativeLocationStore } from "./NativeLocationStore";

/** A real, minimal in-memory FAKE of `NativeLocationStore`'s own public
 * surface (not the real SQLite-backed class — see `NativeLocationStore.
 * test.ts`'s own header comment for why a real native store can't run
 * here) — enough to exercise `flushJobSessionObservations`'s own real
 * logic: which observations it reads, and how it reacts to sync
 * success/failure. */
function fakeStore(observations: NativeGpsObservation[]): NativeLocationStore {
  const synced: string[] = [];
  const failed: { id: string; error: string }[] = [];
  return {
    getPending: vi.fn(async () => observations),
    markSynced: vi.fn(async (id: string) => {
      synced.push(id);
    }),
    markFailed: vi.fn(async (id: string, error: string) => {
      failed.push({ id, error });
    }),
    // Exposed only for these tests' own assertions, not part of the real interface.
    __synced: synced,
    __failed: failed,
  } as unknown as NativeLocationStore & { __synced: string[]; __failed: { id: string; error: string }[] };
}

function observation(overrides: Partial<NativeGpsObservation> = {}): NativeGpsObservation {
  return {
    clientObservationId: "obs-1",
    jobSessionId: "session-1",
    latitude: 51.9,
    longitude: -8.48,
    accuracyMeters: 10,
    recordedAt: "2026-09-04T09:00:00.000Z",
    sequence: 1,
    syncState: "pending",
    platform: "ios_native",
    source: "phone_gps",
    ...overrides,
  };
}

describe("flushJobSessionObservations", () => {
  it("maps a native observation to the exact existing TelemetryEventInput-shaped payload, preserving real values", async () => {
    const store = fakeStore([observation()]);
    const received: MobileSyncTelemetryPayload[] = [];
    await flushJobSessionObservations(store, "farm-1", "session-1", async (payload) => {
      received.push(payload);
    });
    expect(received).toEqual([
      {
        id: "obs-1",
        farmId: "farm-1",
        source: "phone_gps",
        recordedAt: "2026-09-04T09:00:00.000Z",
        payload: { lat: 51.9, lng: -8.48, accuracyM: 10 },
        jobSessionId: "session-1",
      },
    ]);
  });

  it("preserves a null accuracy through to the synced payload, never substituting a fabricated number", async () => {
    const store = fakeStore([observation({ accuracyMeters: null })]);
    const received: MobileSyncTelemetryPayload[] = [];
    await flushJobSessionObservations(store, "farm-1", "session-1", async (payload) => {
      received.push(payload);
    });
    expect(received[0].payload.accuracyM).toBeNull();
  });

  it("marks a successfully synced observation synced, not left pending", async () => {
    const store = fakeStore([observation()]) as NativeLocationStore & { __synced: string[] };
    await flushJobSessionObservations(store, "farm-1", "session-1", async () => {});
    expect(store.__synced).toEqual(["obs-1"]);
  });

  it("marks a failed sync failed with the real error — never silently dropped, never retried forever within one flush call", async () => {
    const store = fakeStore([observation()]) as NativeLocationStore & { __failed: { id: string; error: string }[] };
    const result = await flushJobSessionObservations(store, "farm-1", "session-1", async () => {
      throw new Error("network unreachable");
    });
    expect(store.__failed).toEqual([{ id: "obs-1", error: "network unreachable" }]);
    expect(result.failed).toEqual([{ clientObservationId: "obs-1", error: "network unreachable" }]);
  });

  it("one observation's failure does not block the rest — partial-failure recovery, same as the existing outbox", async () => {
    const store = fakeStore([observation({ clientObservationId: "obs-1" }), observation({ clientObservationId: "obs-2" })]) as NativeLocationStore & {
      __synced: string[];
      __failed: { id: string; error: string }[];
    };
    await flushJobSessionObservations(store, "farm-1", "session-1", async (payload) => {
      if (payload.id === "obs-1") throw new Error("boom");
    });
    expect(store.__failed.map((f) => f.id)).toEqual(["obs-1"]);
    expect(store.__synced).toEqual(["obs-2"]);
  });

  it("this coordinator never touches Job Actual / Confirm Actual — it only ever moves Observed GPS evidence, per this contract's own Observed/Actual boundary", async () => {
    // Structural guarantee, not a runtime check: flushJobSessionObservations's
    // own real signature only accepts a syncFn typed for
    // MobileSyncTelemetryPayload (a GPS observation), never a job_actuals
    // confirmation payload — there is no code path in this module that
    // could reach a Confirm Actual call even if a caller tried to misuse it.
    const store = fakeStore([observation()]);
    const receivedKeys: string[][] = [];
    await flushJobSessionObservations(store, "farm-1", "session-1", async (payload) => {
      receivedKeys.push(Object.keys(payload).sort());
    });
    expect(receivedKeys).toEqual([["farmId", "id", "jobSessionId", "payload", "recordedAt", "source"]]);
  });
});
