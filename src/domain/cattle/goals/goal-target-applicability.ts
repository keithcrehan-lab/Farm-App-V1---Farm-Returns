/**
 * Cattle C6 — which C5 performance targets apply to an animal's active
 * goal(s), by EXPLICIT goal ref only.
 *
 * Input is the canonical C5 output (`PerformanceEvaluation`), never raw C5 /
 * C4 records (CAT-INV-014/023): it is re-verified with C5
 * `verifyPerformanceFingerprint` and must be evaluated at exactly the query's
 * `effectiveAt` / `knowledgeCutoff` (one viewpoint). Each target version is
 * validated by C5's own `materialisePerformanceTarget` (C5 owns the target
 * schema and provenance rules; C6 keeps no copy of them) and fails closed
 * when C5 rejects it; only its id, version and `applicability.goalRef` are
 * used for matching.
 *
 * A target's `goalRef` matches an active goal when it equals, exactly, the
 * goal's `goalId` (`matchedBy: "GOAL_ID"`) or `goalTypeRef(goalType)`
 * (`matchedBy: "GOAL_TYPE"`). Nothing else is matched: no fuzzy, case-folded
 * or inferred match. This helper decides goal applicability only; a target's
 * validity period, animal set, other applicability fields and review state
 * stay C5's comparison.
 *
 * Per-target precedence (first match wins). REQUIRED: a resolved C5 target
 * definition and, for a goal-specific target, a resolved goal projection.
 *   TARGET_EVIDENCE_CONFLICT  the C5 target's versions are in conflict;
 *   NOT_GOAL_SPECIFIC         the target names no goal (`goalRef: null`);
 *   GOAL_INVALID              the goal projection is INVALID;
 *   GOAL_INTENT_CONFLICT      the goal projection is INTENT_CONFLICT;
 *   APPLICABLE                the goal ref matches an ACTIVE goal;
 *   NOT_APPLICABLE            ACTIVE without a match, or NONE (no declared
 *                             goal — never a default goal).
 * Unresolved goal evidence therefore never yields APPLICABLE or
 * NOT_APPLICABLE (CAT-INV-009).
 */

import { canonicalizeValue, type AssessmentFingerprint } from "../../assessment-integrity";
import { compareInstants, deepFreezeAnimalValue, isOpaqueRef, isValidAnimalInstant } from "../animal-ledger";
import { compareStrings, type CattleHash } from "../integrity";
import { toCanonicalPlainData } from "../regulatory/canonical-input";
import { fingerprintOf, isRecord } from "../health/health-input";
import { CATTLE_PERFORMANCE_PAYLOAD_VERSION, verifyPerformanceFingerprint, type PerformanceEvaluation } from "../performance";
import { materialisePerformanceTarget } from "../performance/performance-definitions";
import { compareGoalVersionRefs, goalTypeRef, goalVersionRef, type GoalVersionRef } from "./goal-declaration";
import { CATTLE_GOAL_PAYLOAD_VERSION, computeGoalFingerprint } from "./goal-integrity";
import { projectCanonicalGoals, readGoalRequest, type GoalProjectionStatus, type GoalQuery, type GoalRequestIssue, type GoalSnapshotRef } from "./goal-projection";

export interface GoalTargetApplicabilityRequest {
  declarations: readonly unknown[];
  /** The subject must be an animal. */
  query: GoalQuery;
  /** A C5 evaluation projected at the same `effectiveAt` / `knowledgeCutoff`. */
  performance: PerformanceEvaluation;
}

export type GoalTargetApplicabilityState =
  | "APPLICABLE"
  | "NOT_APPLICABLE"
  | "NOT_GOAL_SPECIFIC"
  | "TARGET_EVIDENCE_CONFLICT"
  | "GOAL_INTENT_CONFLICT"
  | "GOAL_INVALID";

export type GoalTargetApplicabilityReasonCode =
  | "CATTLE_GOAL_TARGET_MATCHED_ACTIVE_GOAL"
  | "CATTLE_GOAL_TARGET_NO_MATCHING_ACTIVE_GOAL"
  | "CATTLE_GOAL_TARGET_NO_DECLARED_GOAL"
  | "CATTLE_GOAL_TARGET_NO_GOAL_REF"
  | "CATTLE_GOAL_TARGET_VERSIONS_IN_CONFLICT"
  | "CATTLE_GOAL_TARGET_GOAL_INTENT_CONFLICT"
  | "CATTLE_GOAL_TARGET_GOAL_LEDGER_INVALID";

export interface TargetGoalApplicability {
  targetId: string;
  /** The C5 target versions relied on, with the goal ref each names (sorted by version). */
  targetVersions: { version: string; goalRef: string | null }[];
  state: GoalTargetApplicabilityState;
  reasonCode: GoalTargetApplicabilityReasonCode;
  /** Active goals the goal ref matched (APPLICABLE only; sorted). */
  matchedGoals: { goal: GoalVersionRef; matchedBy: "GOAL_ID" | "GOAL_TYPE" }[];
}

export interface GoalTargetApplicability {
  goalPayloadVersion: typeof CATTLE_GOAL_PAYLOAD_VERSION;
  animalId: string;
  effectiveAt: string;
  knowledgeCutoff: string;
  snapshot: GoalSnapshotRef;
  goalStatus: GoalProjectionStatus;
  performanceFingerprint: AssessmentFingerprint;
  /** One per C5 target id (sorted). */
  targets: TargetGoalApplicability[];
  fingerprint: AssessmentFingerprint;
}

export type GoalTargetIssueCode =
  | GoalRequestIssue["code"]
  | "CATTLE_GOAL_TARGET_SUBJECT_NOT_ANIMAL"
  | "CATTLE_GOAL_TARGET_PERFORMANCE_INVALID"
  | "CATTLE_GOAL_TARGET_PERFORMANCE_TIME_MISMATCH";

export interface GoalTargetIssue {
  code: GoalTargetIssueCode;
  ref: string | null;
}

export type GoalTargetApplicabilityResult = { ok: true; applicability: GoalTargetApplicability } | { ok: false; issues: GoalTargetIssue[] };

interface TargetDefinitionView {
  targetId: string;
  state: "RESOLVED" | "EVIDENCE_CONFLICT";
  versions: { version: string; goalRef: string | null }[];
}

/**
 * Reads one C5 target version. C5 owns target validation (CAT-INV-014/023/024):
 * the version must pass C5 `materialisePerformanceTarget` unchanged — every
 * schema, provenance (`sourceRef`, `ruleRef`, `receivedAt`, `actor`) and
 * content rule is C5's, never a C6 copy — and must already be in C5's
 * materialised form (a fixed point of that materialisation). C6 then applies
 * only what it owns: the version belongs to `targetId`, and its knowledge time
 * is no later than the evaluation's cutoff. A fingerprint is change
 * detection, not validation, so anything C5 rejects fails closed here.
 */
function targetVersionOf(raw: unknown, targetId: string, knowledgeCutoff: string): { version: string; goalRef: string | null } | null {
  const materialised = materialisePerformanceTarget(raw);
  if (!materialised.ok) return null;
  const { record } = materialised;
  if (canonicalizeValue(record) !== canonicalizeValue(raw)) return null;
  if (record.targetId !== targetId || compareInstants(record.provenance.receivedAt, knowledgeCutoff) > 0) return null;
  return { version: record.version, goalRef: record.applicability.goalRef };
}

/** Verifies the C5 evaluation and reads only what goal matching needs (`null` = fail closed). */
function readPerformance(raw: unknown, hash: CattleHash): { effectiveAt: string; knowledgeCutoff: string; fingerprint: AssessmentFingerprint; targets: TargetDefinitionView[] } | null {
  if (!isRecord(raw) || raw.performancePayloadVersion !== CATTLE_PERFORMANCE_PAYLOAD_VERSION) return null;
  const fingerprint = fingerprintOf(raw.fingerprint);
  if (fingerprint === null) return null;
  const content = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "fingerprint"));
  try {
    if (!verifyPerformanceFingerprint("CATTLE_PERFORMANCE_RESULT", content, fingerprint, hash).valid) return null;
  } catch {
    return null; // content outside the fingerprintable space
  }
  if (!isValidAnimalInstant(raw.effectiveAt) || !isValidAnimalInstant(raw.knowledgeCutoff) || !Array.isArray(raw.targetDefinitions)) return null;
  const targets: TargetDefinitionView[] = [];
  for (const d of raw.targetDefinitions) {
    if (!isRecord(d) || !isOpaqueRef(d.targetId) || (d.state !== "RESOLVED" && d.state !== "EVIDENCE_CONFLICT") || !Array.isArray(d.versions) || d.versions.length === 0) return null;
    const versions: TargetDefinitionView["versions"] = [];
    for (const v of d.versions) {
      const read = targetVersionOf(v, d.targetId, raw.knowledgeCutoff);
      if (read === null) return null;
      versions.push(read);
    }
    if (new Set(versions.map((v) => v.version)).size !== versions.length) return null;
    if (d.state === "RESOLVED" && versions.length !== 1) return null;
    targets.push({ targetId: d.targetId, state: d.state, versions: versions.sort((a, b) => compareStrings(a.version, b.version)) });
  }
  if (new Set(targets.map((t) => t.targetId)).size !== targets.length) return null;
  return { effectiveAt: raw.effectiveAt, knowledgeCutoff: raw.knowledgeCutoff, fingerprint, targets: targets.sort((a, b) => compareStrings(a.targetId, b.targetId)) };
}

/**
 * Resolves, for one animal at the query's times, which C5 targets apply to
 * its active goal(s). The complete request must be canonical plain data; a
 * malformed request, a non-animal subject, an unverifiable C5 evaluation or
 * a time mismatch fails closed (`ok: false`). Detached and deep-frozen.
 */
export function resolveGoalTargetApplicability(request: GoalTargetApplicabilityRequest, hash: CattleHash): GoalTargetApplicabilityResult {
  const canonical = toCanonicalPlainData(request);
  if (!canonical.ok) return deepFreezeAnimalValue({ ok: false, issues: [{ code: "CATTLE_GOAL_NON_CANONICAL_INPUT", ref: canonical.path }] });
  const read = readGoalRequest(canonical.value, ["performance"]);
  if (!read.ok) return deepFreezeAnimalValue({ ok: false, issues: read.issues });
  const { subject, effectiveAt, knowledgeCutoff } = read.query;
  if (subject.kind !== "ANIMAL") return deepFreezeAnimalValue({ ok: false, issues: [{ code: "CATTLE_GOAL_TARGET_SUBJECT_NOT_ANIMAL", ref: null }] });
  const performance = readPerformance(read.req.performance, hash);
  if (performance === null) return deepFreezeAnimalValue({ ok: false, issues: [{ code: "CATTLE_GOAL_TARGET_PERFORMANCE_INVALID", ref: null }] });
  if (compareInstants(performance.effectiveAt, effectiveAt) !== 0 || compareInstants(performance.knowledgeCutoff, knowledgeCutoff) !== 0) {
    return deepFreezeAnimalValue({ ok: false, issues: [{ code: "CATTLE_GOAL_TARGET_PERFORMANCE_TIME_MISMATCH", ref: null }] });
  }

  const projection = projectCanonicalGoals(read.declarations, read.query, hash);
  const active = projection.activeGoals.map((g) => g.declaration);
  const targets: TargetGoalApplicability[] = performance.targets.map((t) => {
    const base = { targetId: t.targetId, targetVersions: t.versions };
    const none = (state: GoalTargetApplicabilityState, reasonCode: GoalTargetApplicabilityReasonCode): TargetGoalApplicability => ({ ...base, state, reasonCode, matchedGoals: [] });
    if (t.state === "EVIDENCE_CONFLICT") return none("TARGET_EVIDENCE_CONFLICT", "CATTLE_GOAL_TARGET_VERSIONS_IN_CONFLICT");
    const goalRef = t.versions[0].goalRef;
    if (goalRef === null) return none("NOT_GOAL_SPECIFIC", "CATTLE_GOAL_TARGET_NO_GOAL_REF");
    if (projection.status === "INVALID") return none("GOAL_INVALID", "CATTLE_GOAL_TARGET_GOAL_LEDGER_INVALID");
    if (projection.status === "INTENT_CONFLICT") return none("GOAL_INTENT_CONFLICT", "CATTLE_GOAL_TARGET_GOAL_INTENT_CONFLICT");
    if (projection.status === "NONE") return none("NOT_APPLICABLE", "CATTLE_GOAL_TARGET_NO_DECLARED_GOAL");
    const matchedGoals: TargetGoalApplicability["matchedGoals"] = [];
    for (const g of active) {
      if (goalRef === g.goalId) matchedGoals.push({ goal: goalVersionRef(g), matchedBy: "GOAL_ID" });
      else if (goalRef === goalTypeRef(g.goalType)) matchedGoals.push({ goal: goalVersionRef(g), matchedBy: "GOAL_TYPE" });
    }
    if (matchedGoals.length === 0) return none("NOT_APPLICABLE", "CATTLE_GOAL_TARGET_NO_MATCHING_ACTIVE_GOAL");
    matchedGoals.sort((a, b) => compareGoalVersionRefs(a.goal, b.goal));
    return { ...base, state: "APPLICABLE", reasonCode: "CATTLE_GOAL_TARGET_MATCHED_ACTIVE_GOAL", matchedGoals };
  });

  const content: Omit<GoalTargetApplicability, "fingerprint"> = {
    goalPayloadVersion: CATTLE_GOAL_PAYLOAD_VERSION,
    animalId: subject.animalId,
    effectiveAt,
    knowledgeCutoff,
    snapshot: projection.snapshot,
    goalStatus: projection.status,
    performanceFingerprint: performance.fingerprint,
    targets,
  };
  const applicability: GoalTargetApplicability = { ...content, fingerprint: computeGoalFingerprint("CATTLE_GOAL_TARGET_APPLICABILITY", content, hash) };
  return deepFreezeAnimalValue({ ok: true, applicability: structuredClone(applicability) });
}
