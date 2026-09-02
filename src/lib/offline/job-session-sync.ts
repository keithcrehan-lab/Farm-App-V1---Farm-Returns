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
import { enqueue, flush, type FlushResult, type OutboxItem } from "./outbox";
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
