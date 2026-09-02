import "server-only";

/**
 * Farm Return Next — real persistence for the confirmed Actual
 * (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
 * §5/§6/§14). Requires `supabase/migrations/20260902010000_job_actuals.sql`
 * applied — same disclosed-until-applied posture as this contract's other
 * two migrations.
 *
 * **Two-step write, not one atomic transaction — the same documented
 * pattern `act/index.ts`'s `actRecordWeightObservation`/
 * `persistRecordWeightObservationAuditTrail` already established.** A
 * Confirm Actual submission inserts the real `job_actuals` row (the
 * source of truth — this always happens first, and is what actually
 * matters) and then, only for a session's very first confirmation
 * (`revision === 1`), attempts to move the parent `job_sessions.status`
 * to `"confirmed_actual"`. If that second step fails after the first
 * genuinely succeeded, `ConfirmJobActualResult.sessionStatusUpdateError`
 * is set — the farmer's confirmed fact is safely recorded either way; the
 * caller's own recovery path is retrying the status move alone (safe:
 * `job_sessions_check_valid_transition`'s same-status no-op branch means
 * re-sending `status: "confirmed_actual"` to an already-`"confirmed_actual"`
 * session is a harmless no-op, so this retry needs no separate idempotency
 * tracking of its own). A single cross-table RPC was considered and
 * rejected for the same reasons `decisions.ts`'s own header comment gives
 * for rejecting a privileged/RPC-gated write path here: it would need to
 * either bypass RLS (a `security definer` function, the exact regression
 * that file's header documents choosing not to repeat) or add this
 * schema's first plain multi-statement RPC with no real precedent to
 * follow.
 *
 * **Retry-safety keyed on `id`, checked *before* any revision number is
 * computed — not on the (job_session_id, revision) pair alone.** A
 * revision-only retry check has a real bug under the offline outbox's
 * at-least-once delivery model (`src/lib/offline/outbox.ts`'s own header
 * comment: "every `syncFn` MUST be idempotent"): a retried call that
 * re-reads "current max revision" fresh would see its *own* prior
 * successful insert already reflected and mint a *new*, duplicate
 * revision for the same logical submission — silently fabricating a
 * second, unwanted "edit" the farmer never made. `id` is client-generated
 * (`ConfirmJobActualInput.id`, the same offline-first idempotency-key
 * pattern `telemetry.ts`/`job-sessions.ts` already establish) precisely
 * so a genuine retry is recognised and short-circuited before it ever
 * reaches the revision-computation step.
 */
import { createClient } from "@/lib/supabase/server";
import { rowToJobActual, type JobActualRecord } from "./mappers";
import type { JobActualRow } from "./row-types";
import { jsonValuesEqual } from "./json-equal";
import { updateJobSessionStatus } from "./job-sessions";

export interface ConfirmJobActualInput {
  /** Client-generated once, at Confirm Actual submission time — never
   * generated here. See this file's own header comment on why this is
   * the retry-safety key, not `(jobSessionId, revision)` alone. */
  id: string;
  farmId: string;
  jobSessionId: string;
  activityType: string;
  completionType: "whole" | "partial" | "did_not_happen";
  /** The validated `JobActualPayload` from `src/domain/job-actual.ts`'s
   * `validateJobActualInput` — this module does not re-validate it, the
   * same "farm-data trusts its caller's already-validated shape, backed
   * by an independent database CHECK either way" split
   * `job-sessions.ts`'s own header comment documents. */
  payload: Record<string, unknown>;
  note?: string;
  confirmedAt: string;
}

export interface ConfirmJobActualResult {
  actual: JobActualRecord;
  /** See this file's own header comment — present only when the Actual
   * itself was recorded but the session's status could not be moved to
   * `"confirmed_actual"` afterward. */
  sessionStatusUpdateError?: string;
}

function toComparableInput(input: ConfirmJobActualInput, revision: number) {
  return {
    farmId: input.farmId,
    jobSessionId: input.jobSessionId,
    revision,
    activityType: input.activityType,
    completionType: input.completionType,
    payload: input.payload,
    note: input.note ?? null,
    confirmedAt: new Date(input.confirmedAt).toISOString(),
  };
}

function toComparableRow(row: JobActualRow) {
  return {
    farmId: row.farm_id,
    jobSessionId: row.job_session_id,
    revision: row.revision,
    activityType: row.activity_type,
    completionType: row.completion_type,
    payload: row.payload,
    note: row.note,
    confirmedAt: new Date(row.confirmed_at).toISOString(),
  };
}

async function applyConfirmedSessionStatus(
  farmId: string,
  jobSessionId: string,
  actual: JobActualRecord,
): Promise<ConfirmJobActualResult> {
  try {
    await updateJobSessionStatus(farmId, jobSessionId, { status: "confirmed_actual" });
    return { actual };
  } catch (statusError) {
    const message = statusError instanceof Error ? statusError.message : String(statusError);
    console.error(
      `[job-actuals] Actual ${actual.id} recorded for session ${jobSessionId}, but updating job_sessions.status to confirmed_actual failed:`,
      statusError,
    );
    return { actual, sessionStatusUpdateError: message };
  }
}

/**
 * Confirms an Actual — the one sanctioned way a `job_actuals` row is ever
 * created. Always inserts the next revision for this session (1 for the
 * first confirmation, `currentMax + 1` for an edit) — never updates or
 * deletes an existing row (`job_actuals` grants `select, insert` only;
 * see that migration's own header comment).
 */
export async function confirmJobSessionActual(input: ConfirmJobActualInput): Promise<ConfirmJobActualResult> {
  const supabase = await createClient();

  const { data: ownedFarm, error: ownershipError } = await supabase
    .from("farms")
    .select("id")
    .eq("id", input.farmId)
    .maybeSingle();
  if (ownershipError) throw ownershipError;
  if (!ownedFarm) {
    throw new Error(`confirmJobSessionActual: farm ${input.farmId} does not belong to the current session`);
  }

  // Retry-safety FIRST, by client id — before any revision number is ever
  // computed. See this file's own header comment for why checking by
  // (job_session_id, revision) alone is unsafe here.
  const { data: existingById, error: existingByIdError } = await supabase
    .from("job_actuals")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (existingByIdError) throw existingByIdError;
  if (existingById) {
    const existingRow = existingById as JobActualRow;
    if (!jsonValuesEqual(toComparableInput(input, existingRow.revision), toComparableRow(existingRow))) {
      throw new Error(
        `confirmJobSessionActual: a job_actuals row with id ${input.id} already exists with different content — refusing to silently return stale/mismatched data`,
      );
    }
    const actual = rowToJobActual(existingRow);
    if (existingRow.revision !== 1) return { actual };
    // A retried first-confirmation: the status move may or may not have
    // landed last time — safe to attempt again either way (see this
    // file's own header comment on the same-status no-op branch).
    return applyConfirmedSessionStatus(input.farmId, input.jobSessionId, actual);
  }

  // A genuinely new submission — compute the next real revision.
  const { data: latestRows, error: latestError } = await supabase
    .from("job_actuals")
    .select("revision")
    .eq("job_session_id", input.jobSessionId)
    .order("revision", { ascending: false })
    .limit(1);
  if (latestError) throw latestError;
  const currentMaxRevision = latestRows && latestRows.length > 0 ? (latestRows[0] as { revision: number }).revision : 0;
  const revision = currentMaxRevision + 1;

  const { data, error } = await supabase
    .from("job_actuals")
    .insert({
      id: input.id,
      farm_id: input.farmId,
      job_session_id: input.jobSessionId,
      revision,
      supersedes_revision: currentMaxRevision > 0 ? currentMaxRevision : null,
      activity_type: input.activityType,
      completion_type: input.completionType,
      payload: input.payload,
      note: input.note ?? null,
      confirmed_by: "farmer",
      confirmed_at: input.confirmedAt,
    })
    .select("*")
    .single();

  let actualRow: JobActualRow;
  if (error) {
    // A real race: a concurrent submission (this same id, or a genuinely
    // different one that won the (job_session_id, revision) slot this
    // call also computed) landed between the id-check above and this
    // insert. Fail closed with a clear error rather than silently
    // returning whichever row happens to be there — the caller's own
    // retry will re-run the id-check first and either short-circuit
    // cleanly (if it was this same id) or surface a real conflict to the
    // farmer (if a genuinely different edit was submitted concurrently).
    throw new Error(
      `confirmJobSessionActual: could not insert job_actuals row (id ${input.id}, session ${input.jobSessionId}, revision ${revision}) — ${error.message}`,
    );
  } else {
    actualRow = data as JobActualRow;
  }

  const actual = rowToJobActual(actualRow);

  if (revision !== 1) {
    // An edit to an already-confirmed session — job_sessions.status is
    // already "confirmed_actual" and stays there; no status write needed.
    return { actual };
  }

  return applyConfirmedSessionStatus(input.farmId, input.jobSessionId, actual);
}

export interface JobActualHistoryResult {
  actuals: JobActualRecord[];
  truncated: boolean;
}

/** A session realistically has a handful of revisions at most — this cap
 * exists for the same disclosed-honesty reason every other cap in this
 * schema does, not because volume is expected here. */
export const MAX_JOB_ACTUAL_REVISIONS = 200;

/** Every revision for one session, newest first — the real, complete
 * revision history `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §14 requires stay
 * inspectable (`[0]` is always the current Actual). */
export async function listActualsForJobSession(farmId: string, jobSessionId: string): Promise<JobActualHistoryResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_actuals")
    .select("*")
    .eq("farm_id", farmId)
    .eq("job_session_id", jobSessionId)
    .order("revision", { ascending: false })
    .limit(MAX_JOB_ACTUAL_REVISIONS + 1);
  if (error) throw error;

  const rows = data as JobActualRow[];
  const truncated = rows.length > MAX_JOB_ACTUAL_REVISIONS;
  const actuals = rows.slice(0, MAX_JOB_ACTUAL_REVISIONS).map(rowToJobActual);
  return { actuals, truncated };
}

/** The current (highest-revision) Actual for a session, or `null` if none
 * has ever been confirmed. */
export async function getCurrentActualForJobSession(farmId: string, jobSessionId: string): Promise<JobActualRecord | null> {
  const { actuals } = await listActualsForJobSession(farmId, jobSessionId);
  return actuals[0] ?? null;
}
