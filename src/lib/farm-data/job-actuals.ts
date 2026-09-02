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
 *
 * **`"whole"`-completion area is always server-reconciled here, never
 * trusted from the caller's `payload` — Codex audit HIGH, round 1
 * (docs/overnight/audits/gps-job-session-actual-contract-codex-audit-round1.md).**
 * `src/domain/job-actual.ts`'s own validators only ever compute a
 * `"whole"` area from real mapped `Field.areaHa` data — but the *online*
 * server action (`confirmJobSessionActualAction`) previously accepted a
 * client-supplied `FieldAreaContext[]` and trusted its `areaHa` numbers
 * verbatim, and the *offline* path queues an already-computed payload
 * with no server-side check at all — either path let an authenticated
 * client submit a fabricated "whole field" area, defeating this whole
 * contract's own §11 ("GPS must not claim worked area without
 * evidence"). Reconciled once, here, at the one real choke point every
 * confirmation (online or offline-synced) passes through — never trusts
 * the caller's own `areaHa`/`harvestedAreaHa` for `"whole"`, always
 * recomputes it from a fresh, farm-scoped `listFieldsForFarm` read.
 * `fieldIds` are de-duplicated before summing (Codex audit HIGH, round 2:
 * the same real `fieldId` listed twice previously summed its area
 * twice, fabricating a larger "whole" figure from otherwise-real data).
 * `livestockGroupId`/`animalId` get the identical same-farm verification
 * (round-2 HIGH — round 1 had left this as a disclosed, lower-priority
 * gap; closed now the same way `fieldIds` already was).
 *
 * **`activityType` is bound to the parent session here, not only at the
 * orchestration layer — Codex audit HIGH, round 2.** Round 1 added this
 * check only in `src/orchestration/job-session/index.ts`'s
 * `confirmJobSessionActualAction` — the *online* path. The *offline-sync*
 * passthrough (`applyQueuedJobActualConfirmationAction`,
 * `src/app/actions/job-sessions.ts`) calls this function directly and
 * never went through that check at all. Enforced here instead, the one
 * real choke point both paths share.
 *
 * **The session's own current status decides whether to attempt the
 * `confirmed_actual` status move — never a `revision === 1` proxy for it
 * — Codex audit HIGH, round 2.** Round 1's `revision === 1` shortcut
 * silently broke exactly the retry scenario it was meant to fix: a
 * farmer whose first confirmation's *Actual* insert succeeded but whose
 * *status* move failed, retrying with a fresh `id` (a new button press),
 * would compute `currentMaxRevision + 1` = revision 2 for what is really
 * still an unconfirmed session's *first* real confirmation — and
 * revision 2 never attempts the status move at all, permanently
 * stranding the session at `"completed_estimated"` while reporting
 * success. Fixed by reading the session's own real, current status
 * (`getJobSessionById`) instead of inferring intent from a revision
 * number: the status move is now attempted after *every* successful (or
 * id-matched) write, relying on `job_sessions_check_valid_transition`'s
 * own same-status no-op branch to make this a harmless no-op for a
 * genuine edit of an already-`"confirmed_actual"` session.
 *
 * **The id-first retry comparison ignores the server-derived area key
 * for `"whole"` completions — Codex audit MEDIUM, round 2.** Reconciling
 * *before* comparing against an existing row (round 1's own order) meant
 * a real mapped-field-area change between a first attempt and its retry
 * (e.g. the farmer edits a field boundary in another tab) would recompute
 * a *different* area than what is already stored, and reject an
 * otherwise-legitimate retry as "different content". The comparison now
 * excludes `areaHa`/`harvestedAreaHa` for `"whole"` payloads specifically
 * (the one case where that value is server-derived and can legitimately
 * drift with real-world data, not farmer-asserted) — every other field,
 * and the whole payload for `"partial"`/`"did_not_happen"` (where an
 * area, when present, *is* farmer-asserted and must still be compared),
 * is still compared exactly as before.
 */
import { createClient } from "@/lib/supabase/server";
import { rowToJobActual, type JobActualRecord } from "./mappers";
import type { JobActualRow } from "./row-types";
import { jsonValuesEqual } from "./json-equal";
import { getJobSessionById, updateJobSessionStatus } from "./job-sessions";
import { listFieldsForFarm } from "./fields";
import { listLivestockGroupsForFarm } from "./livestock";
import { listIndividualAnimalsForFarm } from "./individual-animals";

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
  /**
   * The revision the caller's edit was genuinely based on — e.g. the
   * revision a real "Edit record" screen had loaded and displayed to the
   * farmer before they started typing. `undefined` for a session's
   * first-ever confirmation (nothing to conflict with) **and, honestly,
   * for every real caller today** — no shipped screen in this phase
   * offers editing an already-`"confirmed_actual"` session
   * (`GPS_JOB_SESSION_ACTUAL_CONTRACT.md`/`BLOCKERS.md`'s own disclosed
   * gap), so nothing has real "what I saw when I opened this" state to
   * supply here yet.
   *
   * **Correctness note (Codex audit HIGH, round 1, then correctly
   * challenged as insufficient by round 2 — both audits at
   * `docs/overnight/audits/gps-job-session-actual-contract-codex-audit-round{1,2}.md`):**
   * this check only ever protects a caller that supplies a value it
   * genuinely observed *before* this call, independently of whatever
   * this function itself would read as "current" — round 1's first
   * attempt had the *orchestration* layer re-derive this value fresh,
   * immediately before every call, which round 2 correctly pointed out
   * can never actually disagree with what this function reads as
   * current (both reads happen back-to-back, with no real time or
   * caller-observed state in between) — a vacuous check that could never
   * fire, not real protection. That auto-derivation has been removed
   * (`src/orchestration/job-session/index.ts` no longer supplies this
   * field) rather than left in place implying a guarantee it didn't
   * provide. The check itself, and the database's own gapless-revision
   * trigger (`job_actuals_valid_revision`,
   * `20260902010000_job_actuals.sql`), remain real and correct — ready
   * for a future edit UI to supply a genuine value.
   */
  basedOnRevision?: number;
}

export class StaleJobActualRevisionError extends Error {
  constructor(jobSessionId: string, expected: number, actual: number) {
    super(
      `confirmJobSessionActual: session ${jobSessionId} was edited by someone else since this Confirm Actual was opened (expected revision ${expected}, current revision is ${actual}) — refresh and try again`,
    );
    this.name = "StaleJobActualRevisionError";
  }
}

export interface ConfirmJobActualResult {
  actual: JobActualRecord;
  /** See this file's own header comment — present only when the Actual
   * itself was recorded but the session's status could not be moved to
   * `"confirmed_actual"` afterward. */
  sessionStatusUpdateError?: string;
}

const DERIVED_AREA_KEYS = ["areaHa", "harvestedAreaHa"] as const;

/** Strips the server-derived area key from a `"whole"`-completion payload
 * before comparing two submissions for equality — see this file's own
 * header comment ("the id-first retry comparison ignores the
 * server-derived area key"). A no-op for `"partial"`/`"did_not_happen"`,
 * where an area, when present, is farmer-asserted and must still compare
 * exactly. */
function payloadForComparison(completionType: ConfirmJobActualInput["completionType"], payload: Record<string, unknown>) {
  if (completionType !== "whole") return payload;
  const stripped = { ...payload };
  for (const key of DERIVED_AREA_KEYS) delete stripped[key];
  return stripped;
}

function toComparableInput(input: ConfirmJobActualInput, revision: number) {
  return {
    farmId: input.farmId,
    jobSessionId: input.jobSessionId,
    revision,
    activityType: input.activityType,
    completionType: input.completionType,
    payload: payloadForComparison(input.completionType, input.payload),
    note: input.note ?? null,
    confirmedAt: new Date(input.confirmedAt).toISOString(),
  };
}

function toComparableRow(row: JobActualRow) {
  const completionType = row.completion_type;
  return {
    farmId: row.farm_id,
    jobSessionId: row.job_session_id,
    revision: row.revision,
    activityType: row.activity_type,
    completionType,
    payload: payloadForComparison(completionType, row.payload),
    note: row.note,
    confirmedAt: new Date(row.confirmed_at).toISOString(),
  };
}

/**
 * Recomputes a `"whole"`-completion payload's area from real, freshly
 * fetched `Field.areaHa` data — never trusts whatever `areaHa`/
 * `harvestedAreaHa` the caller's payload already carries — and verifies
 * every `fieldId`/`livestockGroupId`/`animalId` the payload references
 * belongs to this farm, regardless of completion type. Returns a new
 * payload object (never mutates the input).
 *
 * `fieldIds` are de-duplicated before summing (Codex audit HIGH, round
 * 2) — the same real field listed twice must not double its area.
 *
 * Fails closed (throws) on any reference this farm's real data doesn't
 * include — same reasoning as every other same-farm check in this
 * schema: a fabricated or cross-farm reference must never silently
 * resolve to a plausible-looking value. This includes a malformed
 * identifier's *type*: a non-string `fieldIds` entry, or a non-string
 * `livestockGroupId`/`animalId` when that key is present at all, throws
 * rather than being silently filtered/skipped (Codex audit HIGH, round
 * 3, finding 2) — a filter or a `typeof === "string"` guard alone would
 * let a malformed identifier bypass ownership verification entirely
 * instead of being rejected.
 */
async function reconcileAndVerifyPayload(
  farmId: string,
  completionType: "whole" | "partial" | "did_not_happen",
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let result = payload;

  if (Array.isArray(payload.fieldIds)) {
    for (const id of payload.fieldIds as unknown[]) {
      if (typeof id !== "string") {
        throw new Error(`confirmJobSessionActual: fieldIds must contain only string ids, found ${JSON.stringify(id)}`);
      }
    }
  }
  const rawFieldIds = Array.isArray(payload.fieldIds) ? (payload.fieldIds as string[]) : [];
  if (rawFieldIds.length > 0) {
    const fieldIds = Array.from(new Set(rawFieldIds));
    const realFields = await listFieldsForFarm(farmId);
    const realFieldsById = new Map(realFields.map((f) => [f.id, f.areaHa]));
    let realAreaSum = 0;
    for (const fieldId of fieldIds) {
      const areaHa = realFieldsById.get(fieldId);
      if (areaHa === undefined) {
        throw new Error(`confirmJobSessionActual: field ${fieldId} does not belong to farm ${farmId} — refusing to confirm an Actual against it`);
      }
      realAreaSum += areaHa;
    }
    if (completionType === "whole") {
      const areaKey = "areaHa" in payload ? "areaHa" : "harvestedAreaHa" in payload ? "harvestedAreaHa" : null;
      if (areaKey !== null) result = { ...result, [areaKey]: realAreaSum };
    }
  }

  // Codex audit HIGH (round 2): livestockGroupId/animalId get the same
  // same-farm verification fieldIds already had — round 1 had left this
  // as a disclosed, lower-priority gap; closed now. Round 3: a present
  // key with a non-string value now throws instead of silently skipping
  // verification (see this function's own header comment).
  if ("livestockGroupId" in payload) {
    if (typeof payload.livestockGroupId !== "string") {
      throw new Error(`confirmJobSessionActual: livestockGroupId must be a string, found ${JSON.stringify(payload.livestockGroupId)}`);
    }
    const realGroups = await listLivestockGroupsForFarm(farmId);
    if (!realGroups.some((g) => g.id === payload.livestockGroupId)) {
      throw new Error(`confirmJobSessionActual: livestock group ${payload.livestockGroupId} does not belong to farm ${farmId}`);
    }
  }
  if ("animalId" in payload) {
    if (typeof payload.animalId !== "string") {
      throw new Error(`confirmJobSessionActual: animalId must be a string, found ${JSON.stringify(payload.animalId)}`);
    }
    const realAnimals = await listIndividualAnimalsForFarm(farmId);
    if (!realAnimals.some((a) => a.id === payload.animalId)) {
      throw new Error(`confirmJobSessionActual: animal ${payload.animalId} does not belong to farm ${farmId}`);
    }
  }

  return result;
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

  // Fetched once, real, and used for two independent checks below — see
  // this file's own header comment on both ("activityType is bound to
  // the parent session here" and "the session's own current status
  // decides whether to attempt the confirmed_actual status move").
  const session = await getJobSessionById(input.farmId, input.jobSessionId);
  if (!session) {
    throw new Error(`confirmJobSessionActual: no job_sessions row ${input.jobSessionId} found for farm ${input.farmId}`);
  }
  if (input.activityType !== session.activityType) {
    throw new Error(
      `confirmJobSessionActual: activityType "${input.activityType}" does not match session ${input.jobSessionId}'s real activityType "${session.activityType}"`,
    );
  }

  // Retry-safety FIRST, by client id — before any revision number is ever
  // computed, and before reconciliation runs at all (see this file's own
  // header comment on the id-first comparison ignoring the
  // server-derived area key — reconciling here too would defeat that: a
  // real-world field-area change between attempts must not turn a
  // legitimate retry into a rejected "different content" error).
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
    // Always attempted, regardless of revision number — see this file's
    // own header comment on why a revision === 1 proxy for "should I
    // attempt the status move" was itself the round-2 HIGH bug. Safe
    // either way: job_sessions_check_valid_transition's same-status
    // no-op branch makes re-sending confirmed_actual to an
    // already-confirmed_actual session harmless.
    return applyConfirmedSessionStatus(input.farmId, input.jobSessionId, actual);
  }

  // A genuinely new submission — reconcile/verify the payload against
  // real farm data, then compute the next real revision.
  const reconciledPayload = await reconcileAndVerifyPayload(input.farmId, input.completionType, input.payload);

  const { data: latestRows, error: latestError } = await supabase
    .from("job_actuals")
    .select("revision")
    .eq("job_session_id", input.jobSessionId)
    .order("revision", { ascending: false })
    .limit(1);
  if (latestError) throw latestError;
  const currentMaxRevision = latestRows && latestRows.length > 0 ? (latestRows[0] as { revision: number }).revision : 0;

  if (input.basedOnRevision !== undefined && input.basedOnRevision !== currentMaxRevision) {
    throw new StaleJobActualRevisionError(input.jobSessionId, input.basedOnRevision, currentMaxRevision);
  }

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
      payload: reconciledPayload,
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

  // Always attempted, regardless of revision number — see this file's
  // own header comment and the id-matched branch above for why.
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
