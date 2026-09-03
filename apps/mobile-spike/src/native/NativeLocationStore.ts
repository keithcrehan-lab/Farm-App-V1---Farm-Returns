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
 * **Every read/mutation is farm-scoped, by required `farmId` parameter
 * — Final Codex audit round 2, CRITICAL.** The first version of this
 * module stored only `job_session_id`, never `farm_id`, and
 * `MobileSyncCoordinator` accepted a separately-supplied `farmId`
 * applied to every row matched by session id alone — "after logout/
 * account switching, retained GPS data can therefore be submitted under
 * the next signed-in farm." This is the exact same class of bug
 * `outbox.ts`'s own header comment already documents fixing for
 * IndexedDB ("IndexedDB is origin-wide, not per-user... a real
 * cross-tenant data-exposure bug") — fixed here the identical way:
 * `farm_id` is now a real, required, persisted column on every row,
 * every read takes `farmId` as a required parameter and filters by it,
 * and `MobileSyncCoordinator` now builds each sync payload from the
 * observation's own *stored* `farmId`, never a caller-supplied one that
 * could silently mismatch.
 *
 * **Schema — one row per real GPS observation**, per this phase's own
 * required minimum field list:
 * - `client_observation_id` (primary key) — client-generated, the same
 *   idempotency-key discipline `outbox.ts`'s own `OutboxItem.id` and
 *   `telemetry_events.id` already use; never server-generated.
 * - `farm_id` — the real farm this observation belongs to, captured at
 *   the moment of insert (never inferred later at sync time — see
 *   above).
 * - `job_session_id` — which real Job Session this observation belongs
 *   to (never orphaned/global).
 * - `latitude`/`longitude` — real device coordinates, never fabricated.
 * - `accuracy_meters` — nullable; never defaulted to a fabricated value
 *   when the platform doesn't report one (same rule
 *   `LocationPosition.accuracyMeters` already states).
 * - `recorded_at` — the real native device-clock timestamp of the fix
 *   itself, never server receipt time (same rule
 *   `LocationPosition.recordedAt` already states — see
 *   `NativeLocationTrackingProvider.ts`'s own header comment for the
 *   real Codex finding this rule caught: a missing native `time` field
 *   must never be silently replaced with `Date.now()`).
 * - `sync_state` — `'pending' | 'synced' | 'failed'`, mirroring
 *   `outbox.ts`'s own `OutboxSyncState` vocabulary (minus `'syncing'` —
 *   see this file's own "Concurrency" note below).
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
 *
 * **Ordering — SQLite's own real `rowid`, not an in-memory counter.**
 * Final Codex audit round 1 (MEDIUM): the first version of this module
 * kept a `sequenceCounter` field in memory, reset to 0 on every process
 * launch — "new observations can therefore reuse lower sequence values
 * after an app restart, contradicting the documented monotonic
 * per-session ordering." Every SQLite table not declared `WITHOUT
 * ROWID` (this one isn't) already has a real, DB-generated, monotonic
 * `rowid` column for free — genuinely durable across restarts, with no
 * separate column or counter for this module to keep in sync itself.
 * `NativeGpsObservation.sequence` below is that real `rowid`, exposed
 * under this module's own vocabulary rather than SQLite's internal
 * name.
 *
 * **Concurrency — no atomic claim, unlike `outbox.ts`'s own
 * `tryClaimItem`/`completeClaim`.** Final Codex audit round 1 (LOW): an
 * earlier draft of this comment described a `claimPending` method that
 * was never actually implemented — `getPending` below is a plain
 * `SELECT`, so two concurrent `flush` calls (unlikely in this spike's
 * own single-watcher design, but not structurally prevented) could both
 * read and attempt to sync the same row. This is disclosed, not
 * silently assumed safe: the real mitigation is server-side, not local
 * — `insertTelemetryEvent`'s own retry-safety (keyed on the same
 * client-generated id, `outbox.ts`'s own documented guarantee) makes a
 * duplicate sync attempt for the same observation a no-op server-side,
 * the same posture `outbox.ts` itself takes for its own at-least-once
 * delivery model. A future increment could add the same claim-token
 * pattern `outbox.ts` uses if concurrent flush ever becomes a real path
 * in this store's own caller (it is not, in this spike).
 */
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { LocationPosition } from "../../../../src/lib/location/location-tracking-provider";

const DB_NAME = "farm_return_native_location";
const DB_VERSION = 2;

export type NativeObservationSyncState = "pending" | "synced" | "failed";

export interface NativeGpsObservation {
  clientObservationId: string;
  farmId: string;
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

// Deliberately no separate `sequence`/id column — `client_observation_id`
// is TEXT, so this table is NOT declared `WITHOUT ROWID`, which means
// SQLite already maintains a real, monotonic, DB-persisted `rowid` for
// every row for free (see this file's own header comment, "Ordering").
//
// Final Codex audit round 4 (HIGH): this used to be one single
// `CREATE TABLE IF NOT EXISTS` (already including `farm_id`) run
// unconditionally after `open()`, alongside a *separate* `toVersion: 2`
// upgrade statement that unconditionally ran `ALTER TABLE ... ADD COLUMN
// farm_id`. "The plugin opens a new database at version 0 and executes
// every registered upgrade through version 2 before `CREATE_TABLE_SQL`
// runs. The version-2 upgrade immediately executes `ALTER TABLE
// native_gps_observations`, but that table does not exist on a fresh
// device, so `open()` fails and GPS capture never starts." The real,
// versioned migration path below is now the *only* thing that creates
// this schema — split into the two real steps that ever happened to it:
// `toVersion: 1` is the original schema (as it always was, before
// `farm_id` existed), and `toVersion: 2` is round 2's own real `farm_id`
// addition. A genuinely fresh install (stored version 0) runs BOTH
// steps in order — version 0->1 creates the table, then 1->2 adds
// `farm_id` — the same "no version is ever skipped" guarantee this
// repo's own real Supabase migrations already rely on. A device that
// somehow already has a real version-1 database (this table has never
// shipped to one — see the header comment above) runs only the 1->2
// step, unchanged from round 3's own intent.
const CREATE_TABLE_SQL_V1 = `
CREATE TABLE IF NOT EXISTS native_gps_observations (
  client_observation_id TEXT PRIMARY KEY NOT NULL,
  job_session_id TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy_meters REAL,
  recorded_at TEXT NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'pending',
  platform TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'phone_gps',
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS native_gps_observations_sync_state_idx ON native_gps_observations (sync_state);
`;

export class NativeLocationStore {
  private readonly connectionApi: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;

  constructor() {
    this.connectionApi = new SQLiteConnection(CapacitorSQLite);
  }

  /** Opens (creating if needed) the real on-device SQLite database and
   * ensures the schema exists. Idempotent — safe to call more than once
   * (e.g. once per app launch); a second call reuses the retrieved
   * connection rather than creating a duplicate.
   *
   * Final Codex audit round 4 (HIGH): round 3's own migration fix broke
   * a genuinely fresh install — "the plugin opens a new database at
   * version 0 and executes every registered upgrade through version 2
   * before `CREATE_TABLE_SQL` runs... that table does not exist on a
   * fresh device, so `open()` fails and GPS capture never starts."
   * Fixed by registering the REAL two real versions this schema has ever
   * had (see `CREATE_TABLE_SQL_V1`'s own header comment) rather than one
   * `ALTER TABLE` step assumed to run against an already-existing table
   * — a fresh install (stored version 0) now runs both the 0->1 create
   * and 1->2 `farm_id` upgrade in order, the same "no version skipped"
   * guarantee every other real migration in this repo already gives.
   * Registered BEFORE `createConnection` opens the database at the
   * target version, the same "register the upgrade path first" ordering
   * this migration API requires. */
  async open(): Promise<void> {
    if (this.db) return;
    await this.connectionApi.addUpgradeStatement(DB_NAME, [
      { toVersion: 1, statements: [CREATE_TABLE_SQL_V1] },
      {
        toVersion: DB_VERSION,
        statements: [
          "ALTER TABLE native_gps_observations ADD COLUMN farm_id TEXT NOT NULL DEFAULT ''",
          "CREATE INDEX IF NOT EXISTS native_gps_observations_farm_job_idx ON native_gps_observations (farm_id, job_session_id)",
        ],
      },
    ]);
    const isConn = await this.connectionApi.isConnection(DB_NAME, false);
    this.db = isConn.result
      ? await this.connectionApi.retrieveConnection(DB_NAME, false)
      : await this.connectionApi.createConnection(DB_NAME, false, "no-encryption", DB_VERSION, false);
    await this.db.open();
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
   * delivery of the same `clientObservationId` a safe no-op. `farmId`
   * is required and stored with the row — the one real fact that makes
   * every later read/sync farm-scoped (see this file's own header
   * comment).
   */
  async insertObservation(
    farmId: string,
    jobSessionId: string,
    position: LocationPosition,
    platform: "ios_native" | "android_native",
    clientObservationId: string,
  ): Promise<void> {
    const db = this.requireDb();
    await db.run(
      `INSERT OR IGNORE INTO native_gps_observations
       (client_observation_id, farm_id, job_session_id, latitude, longitude, accuracy_meters, recorded_at, sync_state, platform, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'phone_gps')`,
      [clientObservationId, farmId, jobSessionId, position.lat, position.lng, position.accuracyMeters ?? null, position.recordedAt, platform],
      false,
    );
  }

  /** Every observation for `farmId`+`jobSessionId` still needing sync,
   * oldest (by real, DB-persisted insertion order — `rowid`) first —
   * the natural retry order for a queue, same convention `outbox.ts`'s
   * own `getPending` uses. `farmId` is required, not optional — same
   * reasoning as `outbox.ts`'s own identical requirement (this file's
   * own header comment). */
  async getPending(farmId: string, jobSessionId: string): Promise<NativeGpsObservation[]> {
    const db = this.requireDb();
    const result = await db.query(
      `SELECT rowid AS sequence, * FROM native_gps_observations
       WHERE farm_id = ? AND job_session_id = ? AND sync_state IN ('pending', 'failed')
       ORDER BY rowid ASC`,
      [farmId, jobSessionId],
    );
    return (result.values ?? []).map(rowToObservation);
  }

  /** Marks one observation's real sync outcome — `'synced'` once the
   * mobile sync coordinator has confirmed the server accepted it (see
   * `docs/native/NATIVE_MOBILE_FEASIBILITY.md` §12), `'failed'` with the
   * real error otherwise (retryable — mirrors `outbox.ts`'s own
   * `"failed"` semantics, never terminal). Scoped by `farmId` too, so a
   * caller can never mark another farm's row by id collision alone
   * (client-generated ids are UUIDs — collision is not a realistic
   * concern, but the same defense-in-depth discipline `outbox.ts`
   * applies throughout is applied here too). */
  async markSynced(farmId: string, clientObservationId: string): Promise<void> {
    const db = this.requireDb();
    await db.run(
      `UPDATE native_gps_observations SET sync_state = 'synced' WHERE farm_id = ? AND client_observation_id = ?`,
      [farmId, clientObservationId],
      false,
    );
  }

  async markFailed(farmId: string, clientObservationId: string, error: string): Promise<void> {
    const db = this.requireDb();
    await db.run(
      `UPDATE native_gps_observations SET sync_state = 'failed', last_error = ?, attempts = attempts + 1 WHERE farm_id = ? AND client_observation_id = ?`,
      [error, farmId, clientObservationId],
      false,
    );
  }

  /** Diagnostics/UI only — every observation for a farm+session
   * regardless of sync state (e.g. a future "N points recorded, M
   * synced" indicator). */
  async getAllForSession(farmId: string, jobSessionId: string): Promise<NativeGpsObservation[]> {
    const db = this.requireDb();
    const result = await db.query(
      `SELECT rowid AS sequence, * FROM native_gps_observations WHERE farm_id = ? AND job_session_id = ? ORDER BY rowid ASC`,
      [farmId, jobSessionId],
    );
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
    farmId: String(row.farm_id),
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
