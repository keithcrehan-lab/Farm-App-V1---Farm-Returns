/**
 * Job Session orchestration — the real Start/Pause/Resume/Finish/Confirm
 * workflow (`docs/product/farm-return-next-v1.1/
 * GPS_JOB_SESSION_ACTUAL_CONTRACT.md`). Same layering discipline as
 * `src/orchestration/act/index.ts`: this module calls existing
 * `src/domain/*.ts` pure functions and `src/lib/farm-data/*.ts`
 * persistence, never duplicating either.
 *
 * **Every real Job Session is authorised by a real `decisions` row** —
 * the same invariant `act/index.ts`'s own header comment documents for
 * `jobs`. A Prompt/Plan-originated start calls the existing
 * `decideAsFarmer` unchanged; a manual start (no Prompt at all) uses
 * `constructManualJobStartDecision` below, a synthetic Decision this
 * module builds specifically so a manual start still goes through the
 * same authorisation path rather than bypassing it. See that function's
 * own doc comment for a disclosed judgment call this synthetic
 * construction requires.
 */
import "server-only";
import { decideAsFarmer, type Decision } from "@/orchestration/decide";
import type { Prompt } from "@/orchestration/prompt";
import type { EngineOutcome } from "@/domain/evidence";
import { insertDecision } from "@/lib/farm-data/decisions";
import {
  getJobSessionById,
  insertJobSession,
  updateJobSessionStatus,
  type FieldSegmentInput,
} from "@/lib/farm-data/job-sessions";
import { confirmJobSessionActual, getCurrentActualForJobSession, type ConfirmJobActualResult } from "@/lib/farm-data/job-actuals";
import type { JobSessionRecord } from "@/lib/farm-data/mappers";
import {
  cancelJobSession as cancelLifecycle,
  finishJobSession as finishLifecycle,
  pauseJobSession as pauseLifecycle,
  recordInterruptionGap as recordInterruptionGapLifecycle,
  resumeJobSession as resumeLifecycle,
  startJobSession as startLifecycle,
  type InterruptionGap,
  type JobSessionLifecycleState,
} from "@/domain/job-session-lifecycle";
import { validateJobActualInput, type ActivityType, type FieldAreaContext, type RawJobActualInput } from "@/domain/job-actual";

/**
 * Builds a synthetic Decision authorising a manual (no-Prompt) Job Session
 * start. `decisions.decisions_estimate_snapshot_ok_shape`
 * (`20260829000000_orchestration_foundation.sql`) requires any
 * `"accepted"` decision's `estimate_snapshot` to have `status: "OK"`, a
 * `value` key, and a real `evidenceState` — a shape designed for a
 * genuine scientific/regulatory Estimate, which a bare "farmer tapped
 * Start Job with no Prompt behind it" action is not.
 *
 * **Disclosed judgment call, not a silent workaround**: this constructs
 * `evidenceState: "MEASURED"` — the strongest tier, meaning "a direct
 * fact, not a model output" (`src/domain/evidence.ts`'s own priority
 * ordering: MEASURED = 1, the tier a real lab test or a farmer's own
 * direct entry already uses elsewhere in this app) — reasoned as the
 * closest existing fit for "the farmer's own direct action is the entire
 * fact here; there is no weaker/stronger model estimate to classify".
 * `value` carries a small, honest marker object (`{ manual: true,
 * activityType }`), never a fabricated number. This interpretation is
 * recorded here, in `GPS_JOB_SESSION_ACTUAL_CONTRACT.md`, and in
 * `BLOCKERS.md` as an open item for review, rather than assumed to be
 * obviously correct — the `EngineOutcome`/`EvidenceState` vocabulary was
 * designed for `src/domain/*.ts` Estimates, and this is its first real
 * use for a case with no Estimate at all.
 */
export function constructManualJobStartDecision(input: {
  farmId: string;
  activityType: string;
  fieldId?: string;
  decidedAt: string;
}): Decision {
  const basis: EngineOutcome<{ manual: true; activityType: string }> = {
    status: "OK",
    value: { manual: true, activityType: input.activityType },
    evidenceState: "MEASURED",
  };
  return decideAsFarmer(
    {
      id: `manual:${input.activityType}:${input.decidedAt}`,
      farmId: input.farmId,
      kind: "manual_job_start",
      basis,
      fieldId: input.fieldId,
    },
    "accepted",
    input.decidedAt,
  );
}

export interface StartJobSessionResult {
  decision: Decision;
  jobSession: JobSessionRecord;
}

async function createJobSessionFromDecision(input: {
  jobSessionId: string;
  decision: Decision;
  activityType: string;
  origin: "prompt" | "plan" | "manual" | "detected";
  primaryFieldId?: string;
  fieldSegments?: FieldSegmentInput[];
  decidedAt: string;
}): Promise<JobSessionRecord> {
  const started = startLifecycle({ status: "ready", activeIntervals: [], interruptionGaps: [] }, input.decidedAt);
  if (!started.ok) throw new Error(started.error); // unreachable from a fresh state, but never swallowed
  return insertJobSession({
    id: input.jobSessionId,
    farmId: input.decision.farmId,
    decisionId: input.decision.id,
    activityType: input.activityType,
    origin: input.origin,
    status: "active",
    primaryFieldId: input.primaryFieldId ?? input.decision.fieldId,
    fieldSegments: input.fieldSegments,
    activeIntervals: started.state.activeIntervals,
  });
}

/** Starts a Job Session from a real Prompt — Today/Plan's "Start job"
 * action. `origin` is `"prompt"` or `"plan"` depending on which real
 * screen the farmer tapped from (both surface the same real Prompts —
 * `src/orchestration/prompt/build-all.ts` — so this module doesn't
 * re-derive which one; the caller already knows). */
export async function startJobSessionFromPrompt(input: {
  prompt: Pick<Prompt, "id" | "farmId" | "kind" | "basis" | "fieldId" | "calculationVersion" | "inputsSnapshot">;
  activityType: ActivityType | string;
  jobSessionId: string;
  decidedAt: string;
  origin: "prompt" | "plan";
  primaryFieldId?: string;
  fieldSegments?: FieldSegmentInput[];
}): Promise<StartJobSessionResult> {
  const decision = decideAsFarmer(input.prompt, "accepted", input.decidedAt);
  // `decideAsFarmer`/`constructManualJobStartDecision` both return the
  // wider `Decision.decidedBy: "farmer" | "auto_rule"` (no reviewed
  // auto-rule exists yet, so this call site's own construction always
  // produces "farmer" — see `decideAsFarmer`'s own doc comment) —
  // re-asserted here as the real, construction-guaranteed literal
  // `DecisionInput.decidedBy` requires, the same honest narrowing
  // `src/app/actions/decisions.ts`'s own `submitPromptDecisionAction`
  // already establishes, not a blind cast.
  await insertDecision({ ...decision, decidedBy: "farmer" });
  const jobSession = await createJobSessionFromDecision({
    jobSessionId: input.jobSessionId,
    decision,
    activityType: input.activityType,
    origin: input.origin,
    primaryFieldId: input.primaryFieldId,
    fieldSegments: input.fieldSegments,
    decidedAt: input.decidedAt,
  });
  return { decision, jobSession };
}

/** Starts a Job Session with no originating Prompt at all — Farm/Field's
 * "Start job" for an activity with no live Prompt behind it, or a
 * deliberate manual override. See `constructManualJobStartDecision`'s own
 * doc comment for the disclosed judgment call this makes. */
export async function startManualJobSession(input: {
  farmId: string;
  activityType: string;
  jobSessionId: string;
  decidedAt: string;
  primaryFieldId?: string;
  fieldSegments?: FieldSegmentInput[];
}): Promise<StartJobSessionResult> {
  const decision = constructManualJobStartDecision({
    farmId: input.farmId,
    activityType: input.activityType,
    fieldId: input.primaryFieldId,
    decidedAt: input.decidedAt,
  });
  // `decideAsFarmer`/`constructManualJobStartDecision` both return the
  // wider `Decision.decidedBy: "farmer" | "auto_rule"` (no reviewed
  // auto-rule exists yet, so this call site's own construction always
  // produces "farmer" — see `decideAsFarmer`'s own doc comment) —
  // re-asserted here as the real, construction-guaranteed literal
  // `DecisionInput.decidedBy` requires, the same honest narrowing
  // `src/app/actions/decisions.ts`'s own `submitPromptDecisionAction`
  // already establishes, not a blind cast.
  await insertDecision({ ...decision, decidedBy: "farmer" });
  const jobSession = await createJobSessionFromDecision({
    jobSessionId: input.jobSessionId,
    decision,
    activityType: input.activityType,
    origin: "manual",
    primaryFieldId: input.primaryFieldId,
    fieldSegments: input.fieldSegments,
    decidedAt: input.decidedAt,
  });
  return { decision, jobSession };
}

async function requireJobSession(farmId: string, jobSessionId: string): Promise<JobSessionRecord> {
  const session = await getJobSessionById(farmId, jobSessionId);
  if (!session) throw new Error(`job-session: no session ${jobSessionId} found for farm ${farmId}`);
  return session;
}

function toLifecycleState(session: JobSessionRecord): JobSessionLifecycleState {
  return {
    status: session.status,
    activeIntervals: session.activeIntervals,
    interruptionGaps: session.interruptionGaps,
    cancelledReason: session.cancelledReason,
  };
}

export async function pauseJobSessionAction(farmId: string, jobSessionId: string, nowIso: string): Promise<JobSessionRecord> {
  const session = await requireJobSession(farmId, jobSessionId);
  const result = pauseLifecycle(toLifecycleState(session), nowIso);
  if (!result.ok) throw new Error(result.error);
  return updateJobSessionStatus(farmId, jobSessionId, {
    status: result.state.status,
    activeIntervals: result.state.activeIntervals,
  });
}

export async function resumeJobSessionAction(farmId: string, jobSessionId: string, nowIso: string): Promise<JobSessionRecord> {
  const session = await requireJobSession(farmId, jobSessionId);
  const result = resumeLifecycle(toLifecycleState(session), nowIso);
  if (!result.ok) throw new Error(result.error);
  return updateJobSessionStatus(farmId, jobSessionId, {
    status: result.state.status,
    activeIntervals: result.state.activeIntervals,
  });
}

/** **The critical rule, at the orchestration boundary**: this transitions
 * to `"completed_estimated"` only — never `"confirmed_actual"`. See
 * `src/domain/job-session-lifecycle.ts`'s `finishJobSession` for the one
 * place that invariant is actually enforced. */
export async function finishJobSessionAction(farmId: string, jobSessionId: string, nowIso: string): Promise<JobSessionRecord> {
  const session = await requireJobSession(farmId, jobSessionId);
  const result = finishLifecycle(toLifecycleState(session), nowIso);
  if (!result.ok) throw new Error(result.error);
  return updateJobSessionStatus(farmId, jobSessionId, {
    status: result.state.status,
    activeIntervals: result.state.activeIntervals,
  });
}

export async function cancelJobSessionAction(
  farmId: string,
  jobSessionId: string,
  nowIso: string,
  reason?: string,
): Promise<JobSessionRecord> {
  const session = await requireJobSession(farmId, jobSessionId);
  const result = cancelLifecycle(toLifecycleState(session), nowIso, reason);
  if (!result.ok) throw new Error(result.error);
  return updateJobSessionStatus(farmId, jobSessionId, {
    status: result.state.status,
    activeIntervals: result.state.activeIntervals,
    cancelledReason: result.state.cancelledReason,
  });
}

export async function recordJobSessionInterruptionAction(
  farmId: string,
  jobSessionId: string,
  gap: InterruptionGap,
): Promise<JobSessionRecord> {
  const session = await requireJobSession(farmId, jobSessionId);
  const result = recordInterruptionGapLifecycle(toLifecycleState(session), gap);
  if (!result.ok) throw new Error(result.error);
  return updateJobSessionStatus(farmId, jobSessionId, {
    status: result.state.status,
    interruptionGaps: result.state.interruptionGaps,
  });
}

/**
 * Confirm Actual — validates the activity-specific payload
 * (`src/domain/job-actual.ts`) and, only for a session genuinely in
 * `"completed_estimated"`, persists it. Refuses outright for any other
 * status: **there is no path from `"active"`/`"paused"` straight to a
 * confirmed Actual** (`GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §2's critical
 * rule, enforced here at the one real entry point a farmer's Confirm
 * Actual submission reaches, in addition to the database's own
 * `job_sessions_check_valid_transition`).
 */
export async function confirmJobSessionActualAction(input: {
  /** Client-generated once, at the moment the farmer taps "Confirm
   * Actual" — the same offline-first idempotency-key pattern this whole
   * contract uses elsewhere. Generated by the UI regardless of whether
   * the device is online or offline at submission time, so both paths
   * share identical retry-safety (see `job-actuals.ts`'s own header
   * comment). */
  id: string;
  farmId: string;
  jobSessionId: string;
  activityType: ActivityType;
  raw: RawJobActualInput;
  fields: FieldAreaContext[];
  confirmedAt: string;
}): Promise<ConfirmJobActualResult> {
  const session = await requireJobSession(input.farmId, input.jobSessionId);
  const isRevision = session.status === "confirmed_actual";
  if (session.status !== "completed_estimated" && !isRevision) {
    throw new Error(
      `confirmJobSessionActualAction: session ${input.jobSessionId} is "${session.status}" — Confirm Actual requires "completed_estimated" (Finish Job first) or an existing "confirmed_actual" session being revised.`,
    );
  }

  // Codex audit HIGH (round 1, docs/overnight/audits/
  // gps-job-session-actual-contract-codex-audit-round1.md): the caller
  // could previously supply any `activityType`, never checked against
  // the session's own real `activityType` — a fertiliser session could
  // be confirmed with a livestock Actual, corrupting provenance and any
  // future Estimate-vs-Actual learning. `job_sessions.activity_type` is
  // immutable after insert (the same migration's own transition trigger)
  // — the session's own value is the one real source of truth here.
  if (input.activityType !== session.activityType) {
    throw new Error(
      `confirmJobSessionActualAction: activityType "${input.activityType}" does not match session ${input.jobSessionId}'s real activityType "${session.activityType}"`,
    );
  }

  const validation = validateJobActualInput(input.activityType, input.raw, input.fields);
  if (!validation.ok) {
    throw new Error(`confirmJobSessionActualAction: invalid Actual payload — ${validation.errors.join("; ")}`);
  }

  // Codex audit HIGH (round 1): a genuine concurrent-edit conflict must
  // be detected, not silently serialized as if it were an intentional
  // amendment — see ConfirmJobActualInput.basedOnRevision's own doc
  // comment (job-actuals.ts) for the full account. Derived here, not
  // asked of the caller, so no UI needs to know about revision numbers
  // at all: `undefined` for a session's first-ever confirmation (nothing
  // to conflict with), otherwise the real current revision this session
  // actually has right now.
  const basedOnRevision = isRevision ? (await getCurrentActualForJobSession(input.farmId, input.jobSessionId))?.revision : undefined;

  return confirmJobSessionActual({
    id: input.id,
    farmId: input.farmId,
    jobSessionId: input.jobSessionId,
    activityType: input.activityType,
    completionType: input.raw.completionType,
    payload: validation.payload as unknown as Record<string, unknown>,
    basedOnRevision,
    note: input.raw.note,
    confirmedAt: input.confirmedAt,
  });
}
