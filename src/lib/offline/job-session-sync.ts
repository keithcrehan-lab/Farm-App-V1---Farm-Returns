/**
 * Farm Return Next — client-side syncFn wiring for the offline outbox's
 * Job Session item types
 * (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
 * §8). Isomorphic-safe, like `outbox.ts` itself — no server-only import
 * here; every real write goes through a Server Action
 * (`src/app/actions/{job-sessions,telemetry}.ts`), never a direct
 * `server-only` farm-data import from this module.
 *
 * This is the one place `OutboxItemType`'s Job Session values are wired
 * to their real sync calls — `outbox.ts` itself stays agnostic (its own
 * header comment: "wiring... is the caller's job, not this module's").
 */
import { enqueue, flush, pruneSynced, reclaimStale, type FlushResult, type OutboxItem } from "./outbox";
import { insertTelemetryEventAction } from "@/app/actions/telemetry";
import {
  applyQueuedJobActualConfirmationAction,
  applyQueuedJobSessionPatchAction,
  applyQueuedManualJobSessionStartAction,
} from "@/app/actions/job-sessions";
import type { TelemetryEventInput } from "@/lib/farm-data/telemetry";
import type { DecisionInput } from "@/lib/farm-data/decisions";
import type { JobSessionStatusPatch, NewJobSessionInput } from "@/lib/farm-data/job-sessions";
import type { ConfirmJobActualInput } from "@/lib/farm-data/job-actuals";

export interface JobSessionStartPayload {
  decision: DecisionInput;
  jobSession: NewJobSessionInput;
}

export interface JobSessionLifecyclePayload {
  jobSessionId: string;
  patch: JobSessionStatusPatch;
}

async function syncJobSessionOutboxItem(item: OutboxItem): Promise<void> {
  switch (item.type) {
    case "telemetry_event":
    case "job_session_gps_observation":
      await insertTelemetryEventAction(item.payload as TelemetryEventInput);
      return;
    case "job_session_start":
      await applyQueuedManualJobSessionStartAction(item.payload as JobSessionStartPayload);
      return;
    case "job_session_lifecycle": {
      const payload = item.payload as JobSessionLifecyclePayload;
      await applyQueuedJobSessionPatchAction(payload.jobSessionId, payload.patch);
      return;
    }
    case "job_actual_confirmation":
      await applyQueuedJobActualConfirmationAction(item.payload as ConfirmJobActualInput);
      return;
    default: {
      const exhaustive: never = item.type;
      throw new Error(`syncJobSessionOutboxItem: unrecognised outbox item type ${String(exhaustive)}`);
    }
  }
}

/** The one real `flush()` call this contract's UI uses — wires every Job
 * Session item type to its real sync call in one place. Call this
 * whenever connectivity is available (app start, a `online` event, a
 * manual "sync now" affordance) — never automatically inside a render. */
export async function flushJobSessionOutbox(farmId: string): Promise<FlushResult> {
  return flush(farmId, syncJobSessionOutboxItem);
}

/**
 * Thin wrapper around `outbox.ts`'s own `reclaimStale` — kept here so
 * every real caller of this contract's outbox (`ActiveJobSessionView.tsx`)
 * imports from this one module, matching `flushJobSessionOutbox`'s own
 * pattern, rather than reaching into `outbox.ts` directly for some calls
 * and this module for others. See `reclaimStale`'s own doc comment
 * (`outbox.ts`) for the full reasoning and default threshold; this
 * wrapper adds none of its own.
 */
export async function reclaimStaleOutboxItems(farmId: string): Promise<number> {
  return reclaimStale(farmId);
}

/**
 * Best-effort sign-out cleanup — Phase B (native/background GPS
 * readiness, 2026-09-03) closes a real, disclosed gap
 * `outbox.ts`'s own header comment named: "`clearFarm`/`clearAll`...
 * whichever future caller adds real GPS capture must call [them] from
 * the app's own sign-out path" — a future caller (this module) now
 * exists, and was never wired to any sign-out path until this.
 *
 * **Deliberately does NOT call `clearFarm`/`clearAll`.** Those delete
 * every queued item regardless of `syncState` — including one still
 * genuinely `"pending"`/`"failed"` because the device is offline right
 * now, which would silently destroy the only copy anywhere of a real
 * farmer-recorded GPS observation, lifecycle transition, or Confirm
 * Actual. This codebase's own standing rule against ever fabricating or
 * losing a real Actual/observation applies just as much to *deleting*
 * one as to inventing one. Instead:
 *
 * 1. Attempt one real `flush()` — if the device has connectivity right
 *    now, this is the farmer's best chance to get everything genuinely
 *    synced before this session ends, not just a cleanup step.
 * 2. `pruneSynced(farmId, 0)` — remove every item that flush (this call
 *    or an earlier one) already confirmed `"synced"`, regardless of age
 *    (the default 24h grace period exists for a *running* session that
 *    might still want to inspect recent history; sign-out has no such
 *    need). A synced item's real data is already durably persisted
 *    server-side, so removing the local copy loses nothing.
 *
 * What this deliberately leaves behind: any item still `"pending"` or
 * `"failed"` after the flush attempt (genuinely offline, or a real sync
 * error) stays in the local outbox after sign-out — a real, disclosed,
 * narrow residual exposure on a shared device (a *different* farm's
 * signed-in session cannot read it either way, since every read in this
 * module is farm-scoped by required `farmId` — the CRITICAL cross-tenant
 * gap this module's own header comment already documents fixing), traded
 * deliberately against the much worse alternative of destroying a real
 * unsynced observation. It syncs automatically the next time any session
 * for this same farm calls `flushJobSessionOutbox` with connectivity.
 * Never throws — a flush/prune failure (e.g. genuinely offline) must
 * never block the sign-out it is running alongside.
 */
export async function flushAndCleanupOutboxOnSignOut(farmId: string): Promise<void> {
  try {
    await flushJobSessionOutbox(farmId);
  } catch {
    // Best-effort only — offline or a real sync error must not block
    // sign-out. Whatever didn't sync stays queued for next time.
  }
  try {
    await pruneSynced(farmId, 0);
  } catch {
    // Best-effort only, same reasoning.
  }
}

// ---------------------------------------------------------------------------
// Enqueue helpers — one real, documented way to queue each item type,
// rather than every call site constructing a raw OutboxItem shape by hand.
// ---------------------------------------------------------------------------

export async function enqueueJobSessionGpsObservation(farmId: string, event: TelemetryEventInput): Promise<void> {
  await enqueue({
    id: event.id,
    type: "job_session_gps_observation",
    farmId,
    payload: event,
    enqueuedAt: new Date().toISOString(),
  });
}

export async function enqueueManualJobSessionStart(farmId: string, payload: JobSessionStartPayload): Promise<void> {
  await enqueue({
    id: payload.jobSession.id,
    type: "job_session_start",
    farmId,
    payload,
    enqueuedAt: new Date().toISOString(),
  });
}

/** `id` is freshly generated per call — a lifecycle patch is a one-off
 * event (unlike telemetry/Actual confirmations, which carry their own
 * stable, caller-supplied idempotency key), so each enqueue is genuinely
 * a new outbox item, never re-enqueued under an existing id. */
export async function enqueueJobSessionLifecyclePatch(
  farmId: string,
  jobSessionId: string,
  patch: JobSessionStatusPatch,
): Promise<void> {
  await enqueue({
    id: crypto.randomUUID(),
    type: "job_session_lifecycle",
    farmId,
    payload: { jobSessionId, patch } satisfies JobSessionLifecyclePayload,
    enqueuedAt: new Date().toISOString(),
  });
}

export async function enqueueJobActualConfirmation(farmId: string, input: ConfirmJobActualInput): Promise<void> {
  await enqueue({
    id: input.id,
    type: "job_actual_confirmation",
    farmId,
    payload: input,
    enqueuedAt: new Date().toISOString(),
  });
}
