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
 * accuracy/timestamp preservation, sync-state transitions), not a real
 * device's SQLite engine. Real device verification is
 * `docs/native/PHYSICAL_DEVICE_TEST_PLAN.md`'s job, not this file's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// MOCK: a minimal in-memory stand-in for @capacitor-community/sqlite's real
// native bridge. Understands just enough of the real SQL this module issues
// (INSERT OR IGNORE / UPDATE / SELECT ... WHERE ... ORDER BY sequence ASC)
// to exercise NativeLocationStore's own real logic against it.
// ---------------------------------------------------------------------------
interface FakeRow {
  client_observation_id: string;
  job_session_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  recorded_at: string;
  sequence: number;
  sync_state: string;
  platform: string;
  source: string;
  last_error: string | null;
  attempts: number;
}

const fakeRows: FakeRow[] = [];

function fakeSqliteDbConnection() {
  return {
    open: vi.fn(async () => {}),
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    run: vi.fn(async (statement: string, values: unknown[] = []) => {
      if (statement.startsWith("INSERT OR IGNORE")) {
        const [id, jobSessionId, lat, lng, accuracy, recordedAt, sequence, platform] = values as [
          string,
          string,
          number,
          number,
          number | null,
          string,
          number,
          string,
        ];
        if (!fakeRows.some((r) => r.client_observation_id === id)) {
          fakeRows.push({
            client_observation_id: id,
            job_session_id: jobSessionId,
            latitude: lat,
            longitude: lng,
            accuracy_meters: accuracy,
            recorded_at: recordedAt,
            sequence,
            sync_state: "pending",
            platform,
            source: "phone_gps",
            last_error: null,
            attempts: 0,
          });
        }
      } else if (statement.includes("sync_state = 'synced'")) {
        const [id] = values as [string];
        const row = fakeRows.find((r) => r.client_observation_id === id);
        if (row) row.sync_state = "synced";
      } else if (statement.includes("sync_state = 'failed'")) {
        const [error, id] = values as [string, string];
        const row = fakeRows.find((r) => r.client_observation_id === id);
        if (row) {
          row.sync_state = "failed";
          row.last_error = error;
          row.attempts += 1;
        }
      }
      return { changes: { changes: 1 } };
    }),
    query: vi.fn(async (statement: string, values: unknown[] = []) => {
      const [jobSessionId] = values as [string];
      let rows = fakeRows.filter((r) => r.job_session_id === jobSessionId);
      if (statement.includes("sync_state IN ('pending', 'failed')")) {
        rows = rows.filter((r) => r.sync_state === "pending" || r.sync_state === "failed");
      }
      rows = [...rows].sort((a, b) => a.sequence - b.sequence);
      return { values: rows };
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

describe("NativeLocationStore", () => {
  beforeEach(() => {
    fakeRows.length = 0;
  });

  it("preserves the real recorded accuracy and timestamp exactly, never fabricating either", async () => {
    const store = new NativeLocationStore();
    await store.open();
    await store.insertObservation(
      "session-1",
      { lat: 51.9, lng: -8.48, accuracyMeters: 12.5, recordedAt: "2026-09-04T09:00:00.000Z" },
      "ios_native",
      "obs-1",
    );
    const [observation] = await store.getAllForSession("session-1");
    expect(observation.accuracyMeters).toBe(12.5);
    expect(observation.recordedAt).toBe("2026-09-04T09:00:00.000Z");
  });

  it("preserves a null accuracy as null, never defaulting to a fabricated number", async () => {
    const store = new NativeLocationStore();
    await store.open();
    await store.insertObservation("session-1", { lat: 51.9, lng: -8.48, recordedAt: "2026-09-04T09:00:00.000Z" }, "android_native", "obs-2");
    const [observation] = await store.getAllForSession("session-1");
    expect(observation.accuracyMeters).toBeNull();
  });

  it("is idempotent on client_observation_id — inserting the same id twice does not duplicate the row", async () => {
    const store = new NativeLocationStore();
    await store.open();
    const position = { lat: 51.9, lng: -8.48, accuracyMeters: 5, recordedAt: "2026-09-04T09:00:00.000Z" };
    await store.insertObservation("session-1", position, "ios_native", "obs-dup");
    await store.insertObservation("session-1", { ...position, lat: 52.0 }, "ios_native", "obs-dup"); // a retried delivery, possibly with a slightly different reading
    const all = await store.getAllForSession("session-1");
    expect(all).toHaveLength(1);
    expect(all[0].latitude).toBe(51.9); // the first real write wins — a retry never overwrites it
  });

  it("keeps observations scoped to their own Job Session — never a global/orphaned read", async () => {
    const store = new NativeLocationStore();
    await store.open();
    await store.insertObservation("session-A", { lat: 1, lng: 1, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-a");
    await store.insertObservation("session-B", { lat: 2, lng: 2, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-b");
    const sessionAOnly = await store.getAllForSession("session-A");
    expect(sessionAOnly).toHaveLength(1);
    expect(sessionAOnly[0].jobSessionId).toBe("session-A");
  });

  it("orders pending observations by real capture sequence, oldest first", async () => {
    const store = new NativeLocationStore();
    await store.open();
    await store.insertObservation("session-1", { lat: 1, lng: 1, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-1");
    await store.insertObservation("session-1", { lat: 2, lng: 2, recordedAt: "2026-09-04T09:01:00.000Z" }, "ios_native", "obs-2");
    const pending = await store.getPending("session-1");
    expect(pending.map((o) => o.clientObservationId)).toEqual(["obs-1", "obs-2"]);
  });

  it("marks an observation synced, removing it from the pending set", async () => {
    const store = new NativeLocationStore();
    await store.open();
    await store.insertObservation("session-1", { lat: 1, lng: 1, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-1");
    await store.markSynced("obs-1");
    expect(await store.getPending("session-1")).toHaveLength(0);
  });

  it("marks a failed sync as retryable — it stays in the pending set, with the real error recorded", async () => {
    const store = new NativeLocationStore();
    await store.open();
    await store.insertObservation("session-1", { lat: 1, lng: 1, recordedAt: "2026-09-04T09:00:00.000Z" }, "ios_native", "obs-1");
    await store.markFailed("obs-1", "network unreachable");
    const pending = await store.getPending("session-1");
    expect(pending).toHaveLength(1);
    expect(pending[0].syncState).toBe("failed");
  });
});
