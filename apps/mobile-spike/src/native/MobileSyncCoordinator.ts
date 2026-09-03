/**
 * Farm Return Next — Native Mobile / Background GPS Feasibility Phase,
 * §12 (network/sync bridge). Connects `NativeLocationStore` (the native
 * SQLite durable queue) to the EXISTING Farm Return cloud contract
 * (`insertTelemetryEventAction`/`TelemetryEventInput`,
 * `src/app/actions/telemetry.ts` in the main repo) without duplicating
 * that contract's own shape or its server-side idempotency guarantee
 * (`outbox.ts`'s own doc comment: "`insertTelemetryEvent` already
 * satisfies [retry-safety] by construction (its own `23505`-retry-safety
 * pattern)" — this coordinator relies on that exact same guarantee,
 * never re-implementing it).
 *
 * ```text
 * Native location store (SQLite)
 *         |
 *         v
 * MobileSyncCoordinator.flush()   <- this file
 *         |
 *         v
 * syncFn (caller-supplied — see below)
 *         |
 *         v
 * Existing Farm Return cloud contract (insertTelemetryEventAction) -> Supabase
 * ```
 *
 * **`syncFn` is caller-supplied, not hardcoded, mirroring `outbox.ts`'s
 * own design** ("`syncFn` is supplied by the caller... so this module
 * stays agnostic of any specific... real sync call"). This is the one
 * place this phase's own real, open packaging question
 * (`docs/native/NATIVE_MOBILE_FEASIBILITY.md` §5) has to be resolved by
 * whichever concrete `syncFn` a real native build wires in — two real
 * candidates, not a third invented one:
 *
 * 1. **A plain `fetch()` call to a deployed Next.js API route** that
 *    wraps `insertTelemetryEventAction` — the packaging answer if Option
 *    A/A-with-shell (`NATIVE_MOBILE_FEASIBILITY.md` §3) keeps a live,
 *    reachable Next.js server as the real write path (Server Actions
 *    cannot run inside a statically-bundled native shell with no
 *    server — confirmed in `NATIVE_GPS_ARCHITECTURE_DECISION.md` §1/§3).
 * 2. **A direct `@supabase/supabase-js` client call** (the same
 *    library `@supabase/ssr`'s own browser client already wraps),
 *    re-implementing `insertTelemetryEvent`'s own real insert (not its
 *    Server Action wrapper) — the packaging answer if the mobile shell
 *    ships as a genuinely offline-capable static bundle instead.
 *
 * This coordinator does not choose between them — see the feasibility
 * report's own §5/§12 sections for why that choice needs real
 * investigation this environment's own missing native tooling
 * (`BLOCKED_EXTERNAL`) prevented finishing this phase.
 *
 * **Idempotent, not exactly-once — same posture as `outbox.ts`.** A
 * `syncFn` call that throws leaves the observation `'failed'`
 * (retryable on the next `flush()`); one that succeeds twice for the
 * same `clientObservationId` (a real risk under at-least-once delivery,
 * e.g. this process being killed after the network call succeeds but
 * before `markSynced` runs) is safe because `insertTelemetryEvent`'s own
 * real server-side retry-safety (keyed on the same client-generated
 * `id`) already makes a duplicate call a no-op, not a duplicate row.
 *
 * **Farm-scoped, with equality validation — Final Codex audit round 2,
 * CRITICAL.** The first version of this file built every sync payload
 * from a `farmId` parameter, applied uniformly to every observation
 * `store.getPending` returned for a session — "after logout/account
 * switching, retained GPS data can therefore be submitted under the
 * next signed-in farm." `NativeLocationStore.getPending` is now itself
 * farm-scoped (its own header comment), and this file goes one step
 * further: the sync payload's own `farmId` always comes from the
 * observation's own *stored* value, and if it ever disagreed with the
 * `farmId` this flush call was invoked for (which should be structurally
 * impossible given the scoped read, but is checked anyway — the same
 * defense-in-depth discipline `outbox.ts` applies throughout), that
 * observation is failed closed rather than silently synced under
 * either farm's id.
 */
import type { NativeGpsObservation, NativeLocationStore } from "./NativeLocationStore";
// Final Codex audit round 1 (Native Mobile / Background GPS Feasibility
// Phase, HIGH): this file used to redefine its own parallel
// `MobileSyncTelemetryPayload` shape instead of importing the real,
// frozen `TelemetryEventInput` contract — "precisely the parallel
// contract duplication DOMAIN_CONTRACTS.md prohibits and can silently
// drift from src/lib/farm-data/telemetry.ts." A `import type`-only
// import is fully erased at compile time (no runtime module load at
// all, confirmed via this file's own `npx tsc --noEmit`/esbuild output)
// — safe even though `telemetry.ts` itself starts with `import
// "server-only"`, since this file never actually imports the *module*,
// only its type shape.
import type { TelemetryEventInput } from "../../../../src/lib/farm-data/telemetry";

export type MobileSyncTelemetryPayload = TelemetryEventInput;

export interface MobileSyncResult {
  synced: string[];
  failed: { clientObservationId: string; error: string }[];
  /**
   * Final Codex audit round 12 (MEDIUM): a real `markSynced`/`markFailed`
   * rejection (a local SQLite write itself failing) used to escape
   * `flushJobSessionObservations`'s own `try`/`catch`, aborting the
   * whole flush loop early — "contradicting the documented and tested
   * guarantee that one observation's failure never blocks later
   * observations." Every such local-state-transition failure is now
   * caught separately and recorded here, so the loop keeps processing
   * every remaining observation regardless, while still disclosing that
   * the local queue's own bookkeeping (not the sync itself) could not
   * be updated for these ids.
   */
  localStateUpdateFailed: { clientObservationId: string; error: string }[];
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function safeMarkSynced(store: NativeLocationStore, farmId: string, clientObservationId: string, result: MobileSyncResult): Promise<void> {
  try {
    await store.markSynced(farmId, clientObservationId);
  } catch (error) {
    result.localStateUpdateFailed.push({ clientObservationId, error: describeError(error) });
  }
}

async function safeMarkFailed(
  store: NativeLocationStore,
  farmId: string,
  clientObservationId: string,
  message: string,
  result: MobileSyncResult,
): Promise<void> {
  try {
    await store.markFailed(farmId, clientObservationId, message);
  } catch (error) {
    result.localStateUpdateFailed.push({ clientObservationId, error: describeError(error) });
  }
}

function toTelemetryPayload(observation: NativeGpsObservation): MobileSyncTelemetryPayload {
  return {
    // Final Codex audit round 12 (HIGH): `telemetry_events.id` is a real
    // PostgreSQL `uuid` column, but `clientObservationId` is a
    // deterministic, colon-delimited composite fingerprint (round 7/10's
    // own local duplicate-delivery idempotency key), never a UUID —
    // "every real sync attempt will fail UUID validation before
    // insertion." `syncId` is the real, randomly-generated UUID minted
    // once per genuinely new row for exactly this purpose (see
    // `NativeGpsObservation.syncId`'s own doc comment); `clientObservationId`
    // keeps its own, unrelated local-dedup job.
    id: observation.syncId,
    // Always the observation's own real, stored farm — never a
    // separately-supplied parameter (see this file's own header
    // comment, "Farm-scoped, with equality validation").
    farmId: observation.farmId,
    source: "phone_gps",
    recordedAt: observation.recordedAt,
    // TelemetryEventInput.payload.accuracyM is optional (undefined), not
    // nullable — the real shape's own convention differs slightly from
    // this native store's own `number | null` column; converted here,
    // at the one real boundary between the two, never left ambiguous.
    payload: { lat: observation.latitude, lng: observation.longitude, accuracyM: observation.accuracyMeters ?? undefined },
    jobSessionId: observation.jobSessionId,
  };
}

/**
 * Attempts to sync every pending/failed observation for one farm's Job
 * Session, sequentially (same "stable, inspectable order; never
 * overwhelm a just-reconnected connection" reasoning as `outbox.ts`'s
 * own `flush`). One observation's failure is recorded and never blocks
 * the rest. `farmId` scopes the store's own read
 * (`NativeLocationStore.getPending`); every observation returned is
 * additionally checked against it before syncing — see this file's own
 * header comment.
 */
export async function flushJobSessionObservations(
  store: NativeLocationStore,
  farmId: string,
  jobSessionId: string,
  syncFn: (payload: MobileSyncTelemetryPayload) => Promise<void>,
): Promise<MobileSyncResult> {
  const pending = await store.getPending(farmId, jobSessionId);
  const result: MobileSyncResult = { synced: [], failed: [], localStateUpdateFailed: [] };
  for (const observation of pending) {
    if (observation.farmId !== farmId) {
      // Structurally unreachable given `getPending`'s own farm-scoped
      // query above — checked anyway, and failed closed rather than
      // silently synced, the same defense-in-depth posture this whole
      // contract applies to every other real farm-ownership check.
      const message = `observation ${observation.clientObservationId} belongs to farm ${observation.farmId}, not the requested ${farmId} — refusing to sync`;
      await safeMarkFailed(store, farmId, observation.clientObservationId, message, result);
      result.failed.push({ clientObservationId: observation.clientObservationId, error: message });
      continue;
    }
    try {
      await syncFn(toTelemetryPayload(observation));
      // Final Codex audit round 12 (MEDIUM): a `markSynced` rejection
      // here used to escape this `try` block's own `catch` (there was
      // none inline) and propagate as if the *sync itself* had failed —
      // it had not; only the local bookkeeping did. `safeMarkSynced`
      // isolates that distinct failure mode instead of re-marking an
      // already-synced observation as failed.
      await safeMarkSynced(store, farmId, observation.clientObservationId, result);
      result.synced.push(observation.clientObservationId);
    } catch (error) {
      const message = describeError(error);
      await safeMarkFailed(store, farmId, observation.clientObservationId, message, result);
      result.failed.push({ clientObservationId: observation.clientObservationId, error: message });
    }
  }
  return result;
}
