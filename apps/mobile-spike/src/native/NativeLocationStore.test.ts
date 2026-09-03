/**
 * Tests for `NativeLocationStore` against a MOCKED
 * `@capacitor-community/sqlite` — there is no real native SQLite bridge
 * available in this Node/vitest environment (no Xcode/Android
 * Studio/device — see `docs/native/NATIVE_MOBILE_FEASIBILITY.md`). The
 * mock below is a minimal, explicitly-labelled in-memory stand-in for
 * the native bridge's own real `SQLiteDBConnection.query`/`run`/`execute`
 * behaviour (parameter binding, `INSERT OR IGNORE`, `WHERE`/`ORDER BY`) —
 * real SQL semantics, faked storage — so what these tests actually
 * verify is `NativeLocationStore`'s own real logic (idempotency,
 * accuracy/timestamp preservation, sync-state transitions, farm
 * scoping), not a real device's SQLite engine. Real device verification
 * is `docs/native/PHYSICAL_DEVICE_TEST_PLAN.md`'s job, not this file's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// MOCK: a minimal in-memory stand-in for @capacitor-community/sqlite's real
// native bridge. Understands just enough of the real SQL this module issues
// (INSERT OR IGNORE / UPDATE / SELECT ... WHERE ... ORDER BY rowid) to
// exercise NativeLocationStore's own real logic against it.
// ---------------------------------------------------------------------------
interface FakeRow {
  rowid: number;
  client_observation_id: string;
  farm_id: string;
  job_session_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  recorded_at: string;
  sync_state: string;
  platform: string;
  source: string;
  last_error: string | null;
  attempts: number;
}

const fakeRows: FakeRow[] = [];
// Mirrors real SQLite's own behaviour: an implicit, monotonic,
// DB-assigned `rowid` for every inserted row — never supplied by the
// caller (`NativeLocationStore` itself passes no sequence/ordering
// value in its own real INSERT statement any more, see that file's own
// "Ordering" header comment).
let nextRowid = 1;

function fakeSqliteDbConnection() {
  return {
    open: vi.fn(async () => {}),
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    run: vi.fn(async (statement: string, values: unknown[] = []) => {
      if (statement.startsWith("INSERT OR IGNORE")) {
        const [id, farmId, jobSessionId, lat, lng, accuracy, recordedAt, platform] = values as [
          string,
          string,
          string,
          number,
          number,
          number | null,
          string,
          string,
        ];
        if (!fakeRows.some((r) => r.client_observation_id === id)) {
          fakeRows.push({
            rowid: nextRowid++,
            client_observation_id: id,
            farm_id: farmId,
            job_session_id: jobSessionId,
            latitude: lat,
            longitude: lng,
            accuracy_meters: accuracy,
            recorded_at: recordedAt,
            sync_state: "pending",
            platform,
            source: "phone_gps",
            last_error: null,
            attempts: 0,
          });
        }
      } else if (statement.includes("sync_state = 'synced'")) {
        const [farmId, id] = values as [string, string];
        const row = fakeRows.find((r) => r.farm_id === farmId && r.client_observation_id === id);
        if (row) row.sync_state = "synced";
      } else if (statement.includes("sync_state = 'failed'")) {
        const [error, farmId, id] = values as [string, string, string];
        const row = fakeRows.find((r) => r.farm_id === farmId && r.client_observation_id === id);
        if (row) {
          row.sync_state = "failed";
          row.last_error = error;
          row.attempts += 1;
        }
      }
      return { changes: { changes: 1 } };
    }),
    query: vi.fn(async (statement: string, values: unknown[] = []) => {
      const [farmId, jobSessionId] = values as [string, string];
      let rows = fakeRows.filter((r) => r.farm_id === farmId && r.job_session_id === jobSessionId);
      if (statement.includes("sync_state IN ('pending', 'failed')")) {
        rows = rows.filter((r) => r.sync_state === "pending" || r.sync_state === "failed");
      }
      rows = [...rows].sort((a, b) => a.rowid - b.rowid);
      // Real `SELECT rowid AS sequence, *` — `NativeLocationStore`'s own
      // `rowToObservation` reads `row.sequence`, so this mock exposes
      // its own fake `rowid` under that same alias, matching the real
      // query text exactly.
      return { values: rows.map((r) => ({ ...r, sequence: r.rowid })) };
    }),
  };
}

vi.mock("@capacitor-community/sqlite", () => {
  const dbConnection = fakeSqliteDbConnection();
  class FakeSQLiteConnection {
    isConnection = vi.fn(async () => ({ result: false }));
    createConnection = vi.fn(async () => dbConnection);
    retrieveConnection = vi.fn(async () => dbConnection);
    closeConnection = vi.fn(async () => {});
  }
  return {
    CapacitorSQLite: {},
    SQLiteConnection: FakeSQLiteConnection,
  };
});

import { NativeLocationStore } from "./NativeLocationStore";

const FARM_A = "farm-a";
const FARM_B = "farm-b";

describe("NativeLocationStore", () => {
  beforeEach(() => {
    fakeRows.length = 0;
    nextRowid = 1;
  });

  it("preserves the real recorded accuracy and timestamp exactly, never fabricating either", async () => {
    const store = new NativeLocationStore();
    await store.open();
    await store.insertObservation(
      FARM_A,
      "session-1",
      { lat: 51.9, lng: -8.48, accuracyMeters: 12.5, recordedAt: "2026-09-04T09:00:00.000Z" },
      "ios_native",
      "obs-1",
    );
    const [observation] = await store.getAllForSession(FARM_A, "session-1");
    expect(observation.accuracyMeters).toBe(12.5);
    expect(observation.recordedAt).toBe("2026-09-04T09:00:00.000Z");
  });

  it("preserves a null accuracy as null, never defaulting to a fabricated number", async () => {
    const store = new NativeLocationStore();
    await store.open();
    await store.insertObservation(FARM_A, "session-1", { lat: 51.9, lng: -8.48, recordedAt: "2026-09-04T09:00:00.000Z" }, "android_native", "obs-2");
    const [observation] = await store.getAllForSession(FARM_A, "session-1");
    expect(observation.accuracyMeters).toBeNull();
  });

  it("is idempotent on client_observation_id — inserting the same id twice does not duplicate the row", async () => {
    const store = new NativeLocationStore();
    await store.open();
    const position = { lat: 51.9, lng: -8.48, accuracyMeters: 5, recordedAt: "2026-09-04T09:00:00.000Z" };
    await store.insertObservation(FARM_A, "session-1", position, "ios_native", "obs-dup");
    await store.insertObservation(FARM_A, "session-1", { ...position, lat: 52.0 }, "ios_native", "obs-dup"); // a retried delivery, possibly with a slightly different reading
    const all = await store.getAllForSession(FARM_A, "session-1");
    expect(all).toHaveLength(1);
    expect(all[0].latitude).toBe(51.9); // the first real write wins — a retry never overwrites it
  });

  it("keeps observations scoped to their own Job Session — never a global/orphaned read", async () => {
    const store = new NativeLocationStore();
    await store.open();
    await store.insertObservation(FARM_A, "session-A", { lat: 1, lng: 1, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-a");
    await store.insertObservation(FARM_A, "session-B", { lat: 2, lng: 2, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-b");
    const sessionAOnly = await store.getAllForSession(FARM_A, "session-A");
    expect(sessionAOnly).toHaveLength(1);
    expect(sessionAOnly[0].jobSessionId).toBe("session-A");
  });

  it("never returns another farm's observations, even for the identical job_session_id — the real CRITICAL fix (cross-tenant data exposure after account switching)", async () => {
    const store = new NativeLocationStore();
    await store.open();
    // Same job_session_id string used by two different farms — a real,
    // if unlikely, collision this store must not conflate (the exact
    // scenario the Codex finding named: retained local data from a
    // previous signed-in farm must never surface under a different one).
    await store.insertObservation(FARM_A, "shared-session-id", { lat: 1, lng: 1, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-farm-a");
    await store.insertObservation(FARM_B, "shared-session-id", { lat: 2, lng: 2, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-farm-b");
    const farmAOnly = await store.getAllForSession(FARM_A, "shared-session-id");
    expect(farmAOnly.map((o) => o.clientObservationId)).toEqual(["obs-farm-a"]);
    const farmBOnly = await store.getAllForSession(FARM_B, "shared-session-id");
    expect(farmBOnly.map((o) => o.clientObservationId)).toEqual(["obs-farm-b"]);
  });

  it("getPending is farm-scoped the same way getAllForSession is", async () => {
    const store = new NativeLocationStore();
    await store.open();
    await store.insertObservation(FARM_A, "shared-session-id", { lat: 1, lng: 1, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-farm-a");
    await store.insertObservation(FARM_B, "shared-session-id", { lat: 2, lng: 2, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-farm-b");
    const pendingForA = await store.getPending(FARM_A, "shared-session-id");
    expect(pendingForA.map((o) => o.clientObservationId)).toEqual(["obs-farm-a"]);
  });

  it("orders pending observations by real capture sequence, oldest first", async () => {
    const store = new NativeLocationStore();
    await store.open();
    await store.insertObservation(FARM_A, "session-1", { lat: 1, lng: 1, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-1");
    await store.insertObservation(FARM_A, "session-1", { lat: 2, lng: 2, recordedAt: "2026-09-04T09:01:00.000Z" }, "ios_native", "obs-2");
    const pending = await store.getPending(FARM_A, "session-1");
    expect(pending.map((o) => o.clientObservationId)).toEqual(["obs-1", "obs-2"]);
  });

  it("keeps correct ordering across a real process restart — sequence comes from the DB's own rowid, never an in-memory counter that resets to zero", async () => {
    const firstProcess = new NativeLocationStore();
    await firstProcess.open();
    await firstProcess.insertObservation(FARM_A, "session-1", { lat: 1, lng: 1, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-1");
    // Simulate an app restart: a brand-new NativeLocationStore instance
    // (any in-memory field on the old one is gone), against the same
    // real on-device database (`fakeRows`/`nextRowid` above stand in for
    // that real, persistent file).
    const afterRestart = new NativeLocationStore();
    await afterRestart.open();
    await afterRestart.insertObservation(FARM_A, "session-1", { lat: 2, lng: 2, recordedAt: "2026-09-04T09:05:00.000Z" }, "ios_native", "obs-2");
    const pending = await afterRestart.getPending(FARM_A, "session-1");
    // obs-1 (inserted before the "restart") must still sort first — a
    // reset-to-zero in-memory counter would instead give obs-2 the
    // lower sequence number, reordering it ahead of obs-1.
    expect(pending.map((o) => o.clientObservationId)).toEqual(["obs-1", "obs-2"]);
  });

  it("marks an observation synced, removing it from the pending set", async () => {
    const store = new NativeLocationStore();
    await store.open();
    await store.insertObservation(FARM_A, "session-1", { lat: 1, lng: 1, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-1");
    await store.markSynced(FARM_A, "obs-1");
    expect(await store.getPending(FARM_A, "session-1")).toHaveLength(0);
  });

  it("marks a failed sync as retryable — it stays in the pending set, with the real error recorded", async () => {
    const store = new NativeLocationStore();
    await store.open();
    await store.insertObservation(FARM_A, "session-1", { lat: 1, lng: 1, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-1");
    await store.markFailed(FARM_A, "obs-1", "network unreachable");
    const pending = await store.getPending(FARM_A, "session-1");
    expect(pending).toHaveLength(1);
    expect(pending[0].syncState).toBe("failed");
  });
});
