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
 */
import type { NativeGpsObservation, NativeLocationStore } from "./NativeLocationStore";

export interface MobileSyncTelemetryPayload {
  id: string;
  farmId: string;
  source: "phone_gps";
  recordedAt: string;
  payload: { lat: number; lng: number; accuracyM: number | null };
  jobSessionId: string;
}

export interface MobileSyncResult {
  synced: string[];
  failed: { clientObservationId: string; error: string }[];
}

function toTelemetryPayload(farmId: string, observation: NativeGpsObservation): MobileSyncTelemetryPayload {
  return {
    id: observation.clientObservationId,
    farmId,
    source: "phone_gps",
    recordedAt: observation.recordedAt,
    payload: { lat: observation.latitude, lng: observation.longitude, accuracyM: observation.accuracyMeters },
    jobSessionId: observation.jobSessionId,
  };
}

/**
 * Attempts to sync every pending/failed observation for one Job Session,
 * sequentially (same "stable, inspectable order; never overwhelm a
 * just-reconnected connection" reasoning as `outbox.ts`'s own `flush`).
 * One observation's failure is recorded and never blocks the rest.
 */
export async function flushJobSessionObservations(
  store: NativeLocationStore,
  farmId: string,
  jobSessionId: string,
  syncFn: (payload: MobileSyncTelemetryPayload) => Promise<void>,
): Promise<MobileSyncResult> {
  const pending = await store.getPending(jobSessionId);
  const result: MobileSyncResult = { synced: [], failed: [] };
  for (const observation of pending) {
    try {
      await syncFn(toTelemetryPayload(farmId, observation));
      await store.markSynced(observation.clientObservationId);
      result.synced.push(observation.clientObservationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.markFailed(observation.clientObservationId, message);
      result.failed.push({ clientObservationId: observation.clientObservationId, error: message });
    }
  }
  return result;
}
