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
import { confirmJobSessionActual, type ConfirmJobActualResult } from "@/lib/farm-data/job-actuals";
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
import { DEFAULT_GPS_ACTIVITY_DETECTION_CONFIG } from "@/domain/gps-activity-detection";
import { isValidIsoUtcDateTime } from "@/domain/iso-datetime";

/**
 * A future edit to `constructManualJobStartDecision`'s own `value` object
 * must never add any of these keys — see that function's own doc comment
 * for the resolved decision this enforces. Any real agricultural-outcome
 * fact (a quantity, an area, a completion state) belongs on a real
 * `job_actuals` row from a real Confirm Actual submission, never on the
 * synthetic authorisation Decision a manual Start Job creates.
 */
export const MANUAL_JOB_START_RESERVED_OUTCOME_KEYS = [
  "quantity",
  "quantityUnit",
  "areaHa",
  "harvestedAreaHa",
  "completionType",
  "bales",
  "tonnes",
  "product",
] as const;

/** The only two keys `constructManualJobStartDecision`'s own `value`
 * object is ever allowed to carry — extracted as its own, directly
 * testable function (Codex audit LOW, round 1 of this phase's own
 * Dev-validation audit: a check against a hardcoded literal that always
 * passes is not real test coverage of the *throwing* branch). An
 * allowlist, not a denylist against `MANUAL_JOB_START_RESERVED_OUTCOME_KEYS`
 * alone — any key beyond these two throws, named on that list or not. */
export function assertManualJobStartValueHasNoOutcomeKeys(value: Record<string, unknown>): void {
  const allowedKeys = new Set<string>(["manual", "activityType"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `constructManualJobStartDecision: value must never carry any key beyond {manual, activityType} — found "${key}". A manual Start authorises the activity, it does not report its outcome; every one of ${JSON.stringify(MANUAL_JOB_START_RESERVED_OUTCOME_KEYS)} (and any other agricultural-outcome fact) belongs on a real job_actuals row from a real Confirm Actual submission instead.`,
      );
    }
  }
}

/**
 * Builds a synthetic Decision authorising a manual (no-Prompt) Job Session
 * start. `decisions.decisions_estimate_snapshot_ok_shape`
 * (`20260829000000_orchestration_foundation.sql`) requires any
 * `"accepted"` decision's `estimate_snapshot` to have `status: "OK"`, a
 * `value` key, and a real `evidenceState` — a shape designed for a
 * genuine scientific/regulatory Estimate, which a bare "farmer tapped
 * Start Job with no Prompt behind it" action is not.
 *
 * **Resolved decision (this phase — was previously a disclosed, open
 * judgment call in `BLOCKERS.md` and the paragraph below's own earlier
 * text).** The question that matters is not "is a farmer's own direct
 * action strong evidence" (it is — `src/domain/input-gates.ts`'s own
 * `evidenceStateForDirectAssertion` already establishes the precedent
 * that a farmer's direct confirmation/entry of a value is `MEASURED`-tier
 * for exactly this reason). The question is *what, exactly, is being
 * classified as `MEASURED` here* — and the two must not be conflated:
 *
 * - **Device-observed / measured**: a fact the device or a real
 *   instrument genuinely captured (a GPS fix, a device timestamp, a lab/
 *   scale/sensor/vet reading). Not what this function's `basis` is about
 *   — a manual Start has no device evidence at all.
 * - **Farmer-confirmed / Farmer Actual**: a fact the farmer supplied or
 *   explicitly confirmed (`FARM_RETURN_NEXT_SPEC_v1_1.md` §13's own
 *   "Farmer Actual" evidence class) — a quantity applied, a completion
 *   outcome, a corrected value. **This is what a manual Start is not
 *   either** — at Start time, nothing about the underlying agricultural
 *   activity (how much, what area, whether it succeeds) is known yet;
 *   that only exists once a real Confirm Actual is submitted.
 * - **System-derived estimate**: inferred from other inputs, never
 *   directly observed or confirmed. Not this either.
 *
 * What genuinely *is* `MEASURED`-tier here, with total certainty and zero
 * inference, is a narrower fact than any of the above: **the authorisation
 * event itself** — "the farmer tapped Start Job, for this `activityType`,
 * at this timestamp." That is a direct, unambiguous, already-happened
 * fact (matching `src/domain/evidence.ts`'s own definition: "a direct
 * fact, not a model output"), not a claim about the job's eventual
 * outcome. `value` is deliberately scoped to exactly that fact
 * (`{ manual: true, activityType }` — no quantity, no area, no
 * completion state) and `MANUAL_JOB_START_RESERVED_OUTCOME_KEYS` above
 * exists so a future edit cannot silently widen it to claim more than
 * this, tested directly
 * (`job-session-index.test.ts`'s "manual job start" tests). A real
 * Confirm Actual's own `job_actuals.payload` remains the only place any
 * outcome fact is ever recorded, evidenced, and provenance-tracked
 * (`src/domain/job-session-provenance.ts`) — nothing here is ever read as
 * if it described the activity's own evidence quality.
 */
export function constructManualJobStartDecision(input: {
  farmId: string;
  activityType: string;
  fieldId?: string;
  decidedAt: string;
}): Decision {
  const value = { manual: true as const, activityType: input.activityType };
  assertManualJobStartValueHasNoOutcomeKeys(value);
  const basis: EngineOutcome<typeof value> = {
    status: "OK",
    value,
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
  /** GPS Job Mode campaign, 2026-09-04: real, disclosed detection
   * evidence for a `"detected"`-origin session — confidence tier,
   * qualifying sample count, and the candidate field's own real entry
   * timestamp (`GpsDetectionDeviceMetadata` below; see
   * `src/domain/gps-activity-detection.ts`'s own `candidateFieldId`/
   * `candidateFieldSampleCount`/`candidateFieldEnteredAt` fields, its
   * real source). Codex audit LOW (round 13, 2026-09-04): this comment
   * previously also claimed "dwell seconds, inside-field ratio" —
   * neither is part of the actual persisted shape; corrected to name
   * only what's genuinely captured. Never present for any other origin.
   * `NewJobSessionInput.deviceMetadata` already existed on this table
   * for exactly this kind of disclosed, non-authoritative context; this
   * is its first real caller. */
  deviceMetadata?: Record<string, unknown>;
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
    deviceMetadata: input.deviceMetadata,
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

/**
 * Codex audit MEDIUM (round 1, 2026-09-04): `startManualJobSession`
 * previously persisted `origin`/`deviceMetadata` exactly as any caller
 * supplied them, with no server-side check that the two even agree —
 * an authenticated client could call the Server Action directly
 * (bypassing `GpsActivityCandidateCard.tsx` entirely) claiming
 * `origin: "detected"` with an internally *incoherent* `deviceMetadata`
 * (a shape the real detector could never itself produce — see round 2's
 * own tightening below). That specific gap is fixed here.
 *
 * **What this genuinely is, and is not** — corrected honestly (Codex
 * audit HIGH, round 4, 2026-09-04, after an earlier version of this
 * comment and this function's own error message overclaimed): this is
 * shape/coherence validation, not cryptographic proof of origin. It
 * rejects a claim that could not have come from a genuine detection (an
 * impossible `sampleCount`, an unreachable confidence tier, a malformed
 * timestamp, an undeclared key) — it cannot prove a *coherent-looking*
 * claim genuinely did. A farmer's own authenticated session calling this
 * action directly (not through the real UI) with a deliberately
 * fabricated but internally-consistent `deviceMetadata` is not caught by
 * this check, and no purely client-supplied signal ever could be without
 * moving candidate detection itself onto the server (a materially larger
 * architecture change than this field's own real stakes justify —
 * `deviceMetadata` is documented everywhere as non-authoritative,
 * disclosed context, never read by any financial, regulatory, or cross-
 * farm calculation). This is the same trust boundary `job-actuals.ts`'s
 * own Confirm Actual submissions already accept for a farmer's directly
 * asserted facts ("the farmer is the source of truth for what
 * happened") — extended here to a farmer's own claim about *how* their
 * job started, not what it accomplished. Database RLS/farm-ownership
 * (unaffected either way) still fully prevents this from ever becoming a
 * cross-*farm* leakage issue; only self-attestation about one's own farm
 * is in scope, and even then only for a non-authoritative UI label.
 */
export interface GpsDetectionDeviceMetadata {
  detectionSource: "gps_activity_candidate";
  confidence: "medium" | "high";
  sampleCount: number;
  firstObservedAt: string;
}

const GPS_DETECTION_DEVICE_METADATA_KEYS = new Set<keyof GpsDetectionDeviceMetadata>(["detectionSource", "confidence", "sampleCount", "firstObservedAt"]);

/**
 * Codex audit HIGH (round 2, 2026-09-04): round 1's own first version of
 * this validator checked each field's own *type* but not whether the
 * *whole shape* was actually reachable from a real detection —
 * `sampleCount: 0`, a `null`/malformed `firstObservedAt`, `"low"`
 * confidence (a value `advanceStartDetection` never actually returns at
 * the moment it fires `candidate_start` — see `computeStartConfidence`'s
 * own fallback, unreachable at a real confirmation), extra undeclared
 * properties, and no `primaryFieldId` at all (a real GPS candidate
 * always has one, by construction — `advanceStartDetection` never
 * reaches `candidate_start` without a `candidateFieldId`) all passed.
 * Tightened to require a shape that is actually internally coherent
 * with what the real detector can produce, not just individually
 * well-typed fields — reusing `DEFAULT_GPS_ACTIVITY_DETECTION_CONFIG`'s
 * own real minimums, not a second, invented number.
 */
function isValidGpsDetectionDeviceMetadata(value: unknown): value is GpsDetectionDeviceMetadata {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  if (keys.length !== GPS_DETECTION_DEVICE_METADATA_KEYS.size || !keys.every((k) => GPS_DETECTION_DEVICE_METADATA_KEYS.has(k as keyof GpsDetectionDeviceMetadata))) return false;
  if (v.detectionSource !== "gps_activity_candidate") return false;
  if (v.confidence !== "medium" && v.confidence !== "high") return false;
  if (typeof v.sampleCount !== "number" || !Number.isInteger(v.sampleCount) || v.sampleCount < DEFAULT_GPS_ACTIVITY_DETECTION_CONFIG.minSamplesForCandidateStart) return false;
  // "high" confidence requires materially more samples than the bare
  // minimum — matches `computeStartConfidence`'s own `strongSamples`
  // requirement (double the minimum) at the real moment it decides
  // "high" is warranted; a claimed "high" with only just-enough samples
  // is internally inconsistent, never something the real detector
  // itself would produce.
  if (v.confidence === "high" && v.sampleCount < DEFAULT_GPS_ACTIVITY_DETECTION_CONFIG.minSamplesForCandidateStart * 2) return false;
  // Codex audit HIGH (round 5, 2026-09-04): a bare `Number.isNaN(new
  // Date(value).getTime())` check is exactly the lenient-parser gap
  // `isValidIsoUtcDateTime`'s own doc comment warns about — `new
  // Date("2026-02-30")` silently normalises to a real date instead of
  // rejecting the impossible one, so it never fails this check. Reused
  // the frozen, calendar-exact validator instead of a second, weaker
  // one (`DOMAIN_CONTRACTS.md`'s "never duplicate a calculation" rule).
  if (typeof v.firstObservedAt !== "string" || !isValidIsoUtcDateTime(v.firstObservedAt)) return false;
  return true;
}

/** Starts a Job Session with no originating Prompt at all — Farm/Field's
 * "Start job" for an activity with no live Prompt behind it, a
 * deliberate manual override, or (GPS Job Mode campaign, 2026-09-04) a
 * farmer confirming a real GPS Activity Candidate
 * (`src/domain/gps-activity-detection.ts`). `origin` defaults to
 * `"manual"` — every existing caller's own behaviour is unchanged; a
 * confirmed GPS candidate is the one real caller that passes
 * `origin: "detected"` plus its own disclosed `deviceMetadata`
 * (confidence tier, qualifying sample count, candidate field entry
 * timestamp — never an authoritative fact, purely contextual),
 * server-validated against `isValidGpsDetectionDeviceMetadata` above. See
 * `constructManualJobStartDecision`'s own doc comment for the disclosed
 * judgment call authorising either kind of start the same way. */
export async function startManualJobSession(input: {
  farmId: string;
  activityType: string;
  jobSessionId: string;
  decidedAt: string;
  primaryFieldId?: string;
  fieldSegments?: FieldSegmentInput[];
  origin?: "manual" | "detected";
  deviceMetadata?: Record<string, unknown>;
}): Promise<StartJobSessionResult> {
  const origin = input.origin ?? "manual";
  let deviceMetadata: Record<string, unknown> | undefined;
  if (origin === "detected") {
    if (!isValidGpsDetectionDeviceMetadata(input.deviceMetadata)) {
      throw new Error(
        "startManualJobSession: origin \"detected\" requires deviceMetadata matching a shape the real detector could actually produce (detectionSource/confidence/sampleCount/firstObservedAt, internally coherent with each other) — refusing to persist an incoherent or malformed claim. This is a shape check, not proof of origin — see this function's own doc comment for the real, disclosed trust boundary.",
      );
    }
    // A real GPS candidate always has a field by construction —
    // `advanceStartDetection` never reaches `candidate_start` without a
    // `candidateFieldId` — so a "detected" origin with no field at all
    // could not have come from a genuine confirmation.
    if (!input.primaryFieldId) {
      throw new Error('startManualJobSession: origin "detected" requires a primaryFieldId — a real GPS candidate is never fieldless.');
    }
    deviceMetadata = input.deviceMetadata;
  }
  // Any other origin: deviceMetadata is silently dropped, never
  // persisted — a manual start can never carry detection-looking
  // evidence, whatever a caller supplied.

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
    origin,
    primaryFieldId: input.primaryFieldId,
    fieldSegments: input.fieldSegments,
    decidedAt: input.decidedAt,
    deviceMetadata,
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

  // Codex audit HIGH (round 1), then correctly challenged as an
  // ineffective fix by round 2 (both audits at docs/overnight/audits/
  // gps-job-session-actual-contract-codex-audit-round{1,2}.md):
  // round 1's version derived `basedOnRevision` fresh, immediately
  // before this same call, from the same data `confirmJobSessionActual`
  // itself re-reads a moment later — round 2 correctly pointed out the
  // two reads can never disagree, making that check vacuous (it could
  // never actually fire). Removed rather than left in place implying a
  // guarantee it didn't provide — see `ConfirmJobActualInput.basedOnRevision`'s
  // own doc comment (`job-actuals.ts`) for why real stale-edit detection
  // needs a value the *caller* observed earlier (e.g. a future "Edit
  // record" screen's own already-loaded revision), which no real caller
  // in this phase has yet, and for what the mechanism/database trigger
  // still correctly provide once one does.
  return confirmJobSessionActual({
    id: input.id,
    farmId: input.farmId,
    jobSessionId: input.jobSessionId,
    activityType: input.activityType,
    completionType: input.raw.completionType,
    payload: validation.payload as unknown as Record<string, unknown>,
    note: input.raw.note,
    confirmedAt: input.confirmedAt,
  });
}
