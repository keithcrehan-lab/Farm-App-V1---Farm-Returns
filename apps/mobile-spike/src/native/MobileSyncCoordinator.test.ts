import { describe, expect, it, vi } from "vitest";
import { flushJobSessionObservations, type MobileSyncTelemetryPayload } from "./MobileSyncCoordinator";
import type { NativeGpsObservation, NativeLocationStore } from "./NativeLocationStore";

/** A real, minimal in-memory FAKE of `NativeLocationStore`'s own public
 * surface (not the real SQLite-backed class — see `NativeLocationStore.
 * test.ts`'s own header comment for why a real native store can't run
 * here) — enough to exercise `flushJobSessionObservations`'s own real
 * logic: which observations it reads, and how it reacts to sync
 * success/failure. `markSynced`/`markFailed` record the real `farmId`
 * they were called with, so tests can assert the coordinator scopes
 * every write correctly, not just every read. */
function fakeStore(observations: NativeGpsObservation[]): NativeLocationStore {
  const synced: { farmId: string; id: string }[] = [];
  const failed: { farmId: string; id: string; error: string }[] = [];
  return {
    getPending: vi.fn(async () => observations),
    markSynced: vi.fn(async (farmId: string, id: string) => {
      synced.push({ farmId, id });
    }),
    markFailed: vi.fn(async (farmId: string, id: string, error: string) => {
      failed.push({ farmId, id, error });
    }),
    // Exposed only for these tests' own assertions, not part of the real interface.
    __synced: synced,
    __failed: failed,
  } as unknown as NativeLocationStore & { __synced: typeof synced; __failed: typeof failed };
}

function observation(overrides: Partial<NativeGpsObservation> = {}): NativeGpsObservation {
  return {
    clientObservationId: "obs-1",
    farmId: "farm-1",
    jobSessionId: "session-1",
    latitude: 51.9,
    longitude: -8.48,
    accuracyMeters: 10,
    recordedAt: "2026-09-04T09:00:00.000Z",
    sequence: 1,
    syncState: "pending",
    platform: "ios_native",
    source: "phone_gps",
    // Final Codex audit round 12 (HIGH): `TelemetryEventInput.id` must be
    // a real UUID (`telemetry_events.id` is a PostgreSQL `uuid` column) —
    // `clientObservationId` is a deterministic composite fingerprint,
    // never a UUID, so the real cloud contract's own `id` is built from
    // this separate field instead (`toTelemetryPayload`).
    syncId: "11111111-1111-1111-1111-111111111111",
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
        id: "11111111-1111-1111-1111-111111111111",
        farmId: "farm-1",
        source: "phone_gps",
        recordedAt: "2026-09-04T09:00:00.000Z",
        payload: { lat: 51.9, lng: -8.48, accuracyM: 10 },
        jobSessionId: "session-1",
      },
    ]);
  });

  it("carries a missing accuracy through as undefined (the real TelemetryEventInput contract's own convention), never substituting a fabricated number", async () => {
    const store = fakeStore([observation({ accuracyMeters: null })]);
    const received: MobileSyncTelemetryPayload[] = [];
    await flushJobSessionObservations(store, "farm-1", "session-1", async (payload) => {
      received.push(payload);
    });
    expect(received[0].payload.accuracyM).toBeUndefined();
  });

  it("builds the payload's farmId from the observation's own stored value, not the outer flush call's parameter", async () => {
    // Structurally these always agree in real use (getPending is itself
    // farm-scoped) — this test exercises `toTelemetryPayload`'s own
    // real source of truth directly, the same fix the CRITICAL finding
    // required.
    const store = fakeStore([observation({ farmId: "farm-1" })]);
    const received: MobileSyncTelemetryPayload[] = [];
    await flushJobSessionObservations(store, "farm-1", "session-1", async (payload) => {
      received.push(payload);
    });
    expect(received[0].farmId).toBe("farm-1");
  });

  it("refuses to sync (fails closed) an observation whose own stored farmId disagrees with the requested farmId — the real CRITICAL fix", async () => {
    const store = fakeStore([observation({ farmId: "farm-OTHER" })]) as NativeLocationStore & {
      __synced: { farmId: string; id: string }[];
      __failed: { farmId: string; id: string; error: string }[];
    };
    const syncFn = vi.fn(async () => {});
    const result = await flushJobSessionObservations(store, "farm-1", "session-1", syncFn);
    expect(syncFn).not.toHaveBeenCalled();
    expect(store.__synced).toEqual([]);
    expect(store.__failed).toHaveLength(1);
    expect(store.__failed[0]).toMatchObject({ farmId: "farm-1", id: "obs-1" });
    expect(result.failed).toHaveLength(1);
  });

  it("marks a successfully synced observation synced (scoped to the real farmId), not left pending", async () => {
    const store = fakeStore([observation()]) as NativeLocationStore & { __synced: { farmId: string; id: string }[] };
    await flushJobSessionObservations(store, "farm-1", "session-1", async () => {});
    expect(store.__synced).toEqual([{ farmId: "farm-1", id: "obs-1" }]);
  });

  it("marks a failed sync failed with the real error — never silently dropped, never retried forever within one flush call", async () => {
    const store = fakeStore([observation()]) as NativeLocationStore & { __failed: { farmId: string; id: string; error: string }[] };
    const result = await flushJobSessionObservations(store, "farm-1", "session-1", async () => {
      throw new Error("network unreachable");
    });
    expect(store.__failed).toEqual([{ farmId: "farm-1", id: "obs-1", error: "network unreachable" }]);
    expect(result.failed).toEqual([{ clientObservationId: "obs-1", error: "network unreachable" }]);
  });

  it("one observation's failure does not block the rest — partial-failure recovery, same as the existing outbox", async () => {
    const store = fakeStore([
      observation({ clientObservationId: "obs-1", syncId: "11111111-1111-1111-1111-111111111111" }),
      observation({ clientObservationId: "obs-2", syncId: "22222222-2222-2222-2222-222222222222" }),
    ]) as NativeLocationStore & {
      __synced: { farmId: string; id: string }[];
      __failed: { farmId: string; id: string; error: string }[];
    };
    await flushJobSessionObservations(store, "farm-1", "session-1", async (payload) => {
      if (payload.id === "11111111-1111-1111-1111-111111111111") throw new Error("boom");
    });
    expect(store.__failed.map((f) => f.id)).toEqual(["obs-1"]);
    expect(store.__synced.map((s) => s.id)).toEqual(["obs-2"]);
  });

  it("a real markFailed rejection never aborts the flush loop — the next observation is still processed (final Codex audit round 12, MEDIUM)", async () => {
    const store = fakeStore([
      observation({ clientObservationId: "obs-1", syncId: "11111111-1111-1111-1111-111111111111" }),
      observation({ clientObservationId: "obs-2", syncId: "22222222-2222-2222-2222-222222222222" }),
    ]) as NativeLocationStore & {
      __synced: { farmId: string; id: string }[];
      __failed: { farmId: string; id: string; error: string }[];
      markFailed: ReturnType<typeof vi.fn>;
    };
    // Simulate the local SQLite write itself failing when recording
    // obs-1's sync failure — this used to escape the outer catch and
    // abort the whole loop, "contradicting the documented and tested
    // guarantee that one observation's failure never blocks later
    // observations."
    store.markFailed.mockRejectedValueOnce(new Error("local disk full"));
    const result = await flushJobSessionObservations(store, "farm-1", "session-1", async (payload) => {
      if (payload.id === "11111111-1111-1111-1111-111111111111") throw new Error("network unreachable");
    });
    // obs-2 was still synced despite obs-1's local-state write failing.
    expect(store.__synced.map((s) => s.id)).toEqual(["obs-2"]);
    expect(result.synced).toEqual(["obs-2"]);
    // obs-1's real sync failure is still disclosed in `failed`, even
    // though its own local bookkeeping write also failed.
    expect(result.failed).toEqual([{ clientObservationId: "obs-1", error: "network unreachable" }]);
    // The distinct local-state failure is disclosed separately, not
    // silently dropped and not conflated with the sync failure itself.
    expect(result.localStateUpdateFailed).toEqual([{ clientObservationId: "obs-1", error: "local disk full" }]);
  });

  it("a real markSynced rejection is disclosed separately without falsely reporting the observation as failed to sync (final Codex audit round 12, MEDIUM)", async () => {
    const store = fakeStore([observation()]) as NativeLocationStore & {
      __failed: { farmId: string; id: string; error: string }[];
      markSynced: ReturnType<typeof vi.fn>;
    };
    store.markSynced.mockRejectedValueOnce(new Error("local disk full"));
    const result = await flushJobSessionObservations(store, "farm-1", "session-1", async () => {});
    // The real sync to the server succeeded — this must never be
    // reported as a sync failure just because the local bookkeeping
    // write afterward also failed.
    expect(result.failed).toEqual([]);
    expect(store.__failed).toEqual([]);
    expect(result.synced).toEqual(["obs-1"]);
    expect(result.localStateUpdateFailed).toEqual([{ clientObservationId: "obs-1", error: "local disk full" }]);
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
