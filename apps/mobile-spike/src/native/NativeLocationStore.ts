/**
 * Farm Return Next — Native Mobile / Background GPS Feasibility Phase,
 * §8/§12 (local durable location store + sync bridge design).
 *
 * A real SQLite-backed durable store for GPS observations captured by
 * `NativeLocationTrackingProvider`'s background-service path — the
 * native equivalent of `src/lib/offline/outbox.ts`'s own IndexedDB
 * queue, built against `@capacitor-community/sqlite`'s real, verified
 * API (`SQLiteConnection`/`SQLiteDBConnection`, confirmed against its
 * installed `definitions.d.ts`, not assumed).
 *
 * **Why a second store, not a straight reuse of `outbox.ts`**: that
 * module is explicitly `assertIndexedDbAvailable()`-gated — it throws
 * outside a real browser IndexedDB context. A background-geolocation
 * watcher's own native callback can fire while the WebView itself is
 * suspended in some configurations (that is the entire point of the
 * background-service path — see `NativeLocationTrackingProvider.ts`'s
 * own header comment) — writing to IndexedDB from that context is not a
 * verified-safe operation on either platform (unverified without a real
 * device test, `docs/native/PHYSICAL_DEVICE_TEST_PLAN.md`). SQLite,
 * accessed through Capacitor's own native bridge, is the platform-
 * appropriate store for this specific write path; the outbox's own
 * higher-level enqueue/flush/idempotency *contract* is preserved
 * exactly (see `docs/native/NATIVE_MOBILE_FEASIBILITY.md` §12's "mobile
 * sync coordinator" section for how the two stores connect to the one
 * real outbox-consuming sync path, `job-session-sync.ts`, unchanged).
 *
 * **Schema — one row per real GPS observation**, per this phase's own
 * required minimum field list:
 * - `client_observation_id` (primary key) — client-generated, the same
 *   idempotency-key discipline `outbox.ts`'s own `OutboxItem.id` and
 *   `telemetry_events.id` already use; never server-generated.
 * - `job_session_id` — which real Job Session this observation belongs
 *   to (never orphaned/global).
 * - `latitude`/`longitude` — real device coordinates, never fabricated.
 * - `accuracy_meters` — nullable; never defaulted to a fabricated value
 *   when the platform doesn't report one (same rule
 *   `LocationPosition.accuracyMeters` already states).
 * - `recorded_at` — the real native device-clock timestamp of the fix
 *   itself, never server receipt time (same rule
 *   `LocationPosition.recordedAt` already states).
 * - `sequence` — monotonic per-session ordering, independent of
 *   `recorded_at` (a device clock can be adjusted mid-session; insertion
 *   order is a separate, always-monotonic fact worth keeping).
 * - `sync_state` — `'pending' | 'synced' | 'failed'`, mirroring
 *   `outbox.ts`'s own `OutboxSyncState` vocabulary (minus `'syncing'` —
 *   see this file's own `claimPending`, which does the claim/complete
 *   dance in one local transaction rather than needing a distinct
 *   in-flight state, since this store has no cross-tab/cross-process
 *   concurrent-claimant scenario `outbox.ts` was built for).
 * - `platform`/`source` — `'ios_native' | 'android_native'`, and always
 *   `'phone_gps'` today (§11's own real `telemetry_events.source`
 *   constraint — this store's own `source` column exists so a future
 *   non-phone source, e.g. Farm Return Drive BLE, can reuse this exact
 *   table without a schema change, the same forward-compatible pattern
 *   §11 already establishes for `telemetry_events`).
 *
 * **Idempotent inserts**: `INSERT OR IGNORE` on the primary key — a
 * retried native callback (or a duplicate delivery some platform/plugin
 * combination might produce) for the same `client_observation_id` is a
 * safe no-op, never a duplicate row or a thrown unique-constraint error.
 */
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { LocationPosition } from "../../../../src/lib/location/location-tracking-provider";

const DB_NAME = "farm_return_native_location";
const DB_VERSION = 1;

export type NativeObservationSyncState = "pending" | "synced" | "failed";

export interface NativeGpsObservation {
  clientObservationId: string;
  jobSessionId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
  sequence: number;
  syncState: NativeObservationSyncState;
  platform: "ios_native" | "android_native";
  source: "phone_gps";
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS native_gps_observations (
  client_observation_id TEXT PRIMARY KEY NOT NULL,
  job_session_id TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy_meters REAL,
  recorded_at TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'pending',
  platform TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'phone_gps',
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS native_gps_observations_job_session_idx ON native_gps_observations (job_session_id);
CREATE INDEX IF NOT EXISTS native_gps_observations_sync_state_idx ON native_gps_observations (sync_state);
`;

export class NativeLocationStore {
  private readonly connectionApi: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;
  private sequenceCounter = 0;

  constructor() {
    this.connectionApi = new SQLiteConnection(CapacitorSQLite);
  }

  /** Opens (creating if needed) the real on-device SQLite database and
   * ensures the schema exists. Idempotent — safe to call more than once
   * (e.g. once per app launch); a second call reuses the retrieved
   * connection rather than creating a duplicate. */
  async open(): Promise<void> {
    if (this.db) return;
    const isConn = await this.connectionApi.isConnection(DB_NAME, false);
    this.db = isConn.result
      ? await this.connectionApi.retrieveConnection(DB_NAME, false)
      : await this.connectionApi.createConnection(DB_NAME, false, "no-encryption", DB_VERSION, false);
    await this.db.open();
    await this.db.execute(CREATE_TABLE_SQL);
  }

  private requireDb(): SQLiteDBConnection {
    if (!this.db) {
      throw new Error("[NativeLocationStore] open() must be awaited before any other call.");
    }
    return this.db;
  }

  /**
   * Persists one real GPS observation locally — called from
   * `NativeLocationTrackingProvider`'s own background-watcher callback,
   * BEFORE any network/sync attempt (this phase's own required
   * ordering: "receive real GPS point -> persist locally -> ... ->
   * idempotent sync"). `INSERT OR IGNORE` makes a retried/duplicate
   * delivery of the same `clientObservationId` a safe no-op.
   */
  async insertObservation(
    jobSessionId: string,
    position: LocationPosition,
    platform: "ios_native" | "android_native",
    clientObservationId: string,
  ): Promise<void> {
    const db = this.requireDb();
    this.sequenceCounter += 1;
    await db.run(
      `INSERT OR IGNORE INTO native_gps_observations
       (client_observation_id, job_session_id, latitude, longitude, accuracy_meters, recorded_at, sequence, sync_state, platform, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'phone_gps')`,
      [
        clientObservationId,
        jobSessionId,
        position.lat,
        position.lng,
        position.accuracyMeters ?? null,
        position.recordedAt,
        this.sequenceCounter,
        platform,
      ],
      false,
    );
  }

  /** Every observation for `jobSessionId` still needing sync, oldest
   * (by real capture sequence) first — the natural retry order for a
   * queue, same convention `outbox.ts`'s own `getPending` uses. */
  async getPending(jobSessionId: string): Promise<NativeGpsObservation[]> {
    const db = this.requireDb();
    const result = await db.query(
      `SELECT * FROM native_gps_observations
       WHERE job_session_id = ? AND sync_state IN ('pending', 'failed')
       ORDER BY sequence ASC`,
      [jobSessionId],
    );
    return (result.values ?? []).map(rowToObservation);
  }

  /** Marks one observation's real sync outcome — `'synced'` once the
   * mobile sync coordinator has confirmed the server accepted it (see
   * `docs/native/NATIVE_MOBILE_FEASIBILITY.md` §12), `'failed'` with the
   * real error otherwise (retryable — mirrors `outbox.ts`'s own
   * `"failed"` semantics, never terminal). */
  async markSynced(clientObservationId: string): Promise<void> {
    const db = this.requireDb();
    await db.run(`UPDATE native_gps_observations SET sync_state = 'synced' WHERE client_observation_id = ?`, [clientObservationId], false);
  }

  async markFailed(clientObservationId: string, error: string): Promise<void> {
    const db = this.requireDb();
    await db.run(
      `UPDATE native_gps_observations SET sync_state = 'failed', last_error = ?, attempts = attempts + 1 WHERE client_observation_id = ?`,
      [error, clientObservationId],
      false,
    );
  }

  /** Diagnostics/UI only — every observation for a session regardless of
   * sync state (e.g. a future "N points recorded, M synced" indicator). */
  async getAllForSession(jobSessionId: string): Promise<NativeGpsObservation[]> {
    const db = this.requireDb();
    const result = await db.query(`SELECT * FROM native_gps_observations WHERE job_session_id = ? ORDER BY sequence ASC`, [jobSessionId]);
    return (result.values ?? []).map(rowToObservation);
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.connectionApi.closeConnection(DB_NAME, false);
      this.db = null;
    }
  }
}

function rowToObservation(row: Record<string, unknown>): NativeGpsObservation {
  return {
    clientObservationId: String(row.client_observation_id),
    jobSessionId: String(row.job_session_id),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracyMeters: row.accuracy_meters === null || row.accuracy_meters === undefined ? null : Number(row.accuracy_meters),
    recordedAt: String(row.recorded_at),
    sequence: Number(row.sequence),
    syncState: row.sync_state as NativeObservationSyncState,
    platform: row.platform as "ios_native" | "android_native",
    source: "phone_gps",
  };
}
