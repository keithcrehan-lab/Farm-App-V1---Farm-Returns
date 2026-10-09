/**
 * Cattle C0 — rule evaluation states and the deterministic evaluation record.
 *
 * Why not `EngineOutcome<T>`/`EvidenceState` (`evidence.ts`): those describe
 * the strength of a calculated value. They have no pass/fail of a rule, no
 * conflicting-evidence state (`AMBIGUOUS` is a different meaning), no
 * review-required state and no unsupported-rule state, and
 * `LEGAL_PROHIBITION` is legal-specific. Mapping onto them would lose
 * meaning, so cattle rules return their own vocabulary below; `evidence.ts`
 * is unchanged.
 *
 * Precedence, fail closed: UNSUPPORTED (invalid/not effective/unresolvable)
 * > REVIEW_REQUIRED (unapproved version, changed source) > applicability
 * (conflict > missing > not applicable) > required inputs (conflict >
 * missing) > the rule's own PASS/FAIL. The predicate is called only when
 * every required input is KNOWN — a missing value never reaches it as zero.
 * Every record lists all gaps found, not just the deciding one.
 */

import type { AssessmentFingerprint } from "../assessment-integrity";
import {
  compareInputItems,
  resolveInput,
  type CattleInputItem,
  type CattleInputScalar,
  type RejectedInput,
} from "./information";
import { compareStrings, sortedUnique, type CattleHash } from "./integrity";
import {
  computeRuleFingerprint,
  evaluateRuleReviews,
  isValidCalendarDate,
  resolveEffectiveRuleVersion,
  ruleVersionRef,
  validateRuleVersion,
  type CattleRuleClassification,
  type CattleRuleGateRole,
  type CattleRuleVersion,
  type ReviewDimensionState,
  type CattleReviewDimension,
  type RuleReviewRecord,
  type RuleVersionRef,
} from "./rule";
import { checkSourceBinding, compareSourceVersionRefs, type CattleEvidenceSource, type SourceBindingCheck } from "./source";
import { CATTLE_EVIDENCE_ARCHITECTURE_VERSION } from "./version";

export type CattleEvaluationState =
  | "PASS"
  | "FAIL"
  | "INSUFFICIENT_EVIDENCE"
  | "NOT_APPLICABLE"
  | "CONFLICTING_EVIDENCE"
  | "UNSUPPORTED"
  | "REVIEW_REQUIRED";

/** The rule's own deterministic logic, supplied by the rule's module. It
 * sees only KNOWN values. C0 uses synthetic predicates only. */
export type CattleRulePredicate = (values: Readonly<Record<string, CattleInputScalar>>) => "PASS" | "FAIL" | "UNSUPPORTED";

export interface ConflictingInputRecord {
  inputKey: string;
  items: CattleInputItem[];
}

export interface RuleEvaluationRecord {
  architectureVersion: string;
  requestedRuleId: string;
  /** `null` when no single effective version could be resolved. */
  rule: RuleVersionRef | null;
  ruleFingerprint: AssessmentFingerprint | null;
  classification: CattleRuleClassification | null;
  gateRole: CattleRuleGateRole | null;
  evaluationDate: string;
  state: CattleEvaluationState;
  reasonCodes: string[];
  usedInputs: CattleInputItem[];
  missingInputs: string[];
  conflictingInputs: ConflictingInputRecord[];
  rejectedInputs: RejectedInput[];
  sourceChecks: SourceBindingCheck[];
  reviews: { dimension: CattleReviewDimension; state: ReviewDimensionState }[];
}

export interface RuleEvaluationContext {
  evaluationDate: string;
  inputs: readonly CattleInputItem[];
  catalogue: readonly CattleEvidenceSource[];
  reviews: readonly RuleReviewRecord[];
}

function unresolvedRecord(ruleId: string, evaluationDate: string, reasonCode: string): RuleEvaluationRecord {
  return {
    architectureVersion: CATTLE_EVIDENCE_ARCHITECTURE_VERSION,
    requestedRuleId: ruleId,
    rule: null,
    ruleFingerprint: null,
    classification: null,
    gateRole: null,
    evaluationDate,
    state: "UNSUPPORTED",
    reasonCodes: [reasonCode],
    usedInputs: [],
    missingInputs: [],
    conflictingInputs: [],
    rejectedInputs: [],
    sourceChecks: [],
    reviews: [],
  };
}

/** Evaluates one specific rule version. Never mutates the rule, inputs,
 * catalogue or reviews. */
export function evaluateCattleRule(
  rule: CattleRuleVersion,
  predicate: CattleRulePredicate,
  context: RuleEvaluationContext,
  hash: CattleHash,
): RuleEvaluationRecord {
  const reasons: string[] = [];

  const validation = validateRuleVersion(rule, context.catalogue);
  const validDate = isValidCalendarDate(context.evaluationDate);
  const executable = rule.productionState === "PRODUCTION" || rule.productionState === "SUPERSEDED";
  const effective =
    validDate && rule.effectiveFrom <= context.evaluationDate && (rule.effectiveTo === null || context.evaluationDate < rule.effectiveTo);
  if (!validation.valid) reasons.push("CATTLE_RULE_INVALID_DEFINITION", ...validation.issues);
  if (!validDate) reasons.push("CATTLE_EVALUATION_INVALID_DATE");
  else if (!effective) reasons.push("CATTLE_RULE_NOT_EFFECTIVE_ON_DATE");
  const unsupported = !validation.valid || !effective;

  const reviewStatus = evaluateRuleReviews(rule, context.reviews, hash);
  if (!executable) reasons.push(`CATTLE_RULE_NOT_IN_PRODUCTION:${rule.productionState}`);
  if (!reviewStatus.fullyApproved) reasons.push("CATTLE_RULE_VERSION_NOT_APPROVED");
  const sourceChecks = [...rule.sourceBindings]
    .sort(compareSourceVersionRefs)
    .map((ref) => checkSourceBinding(ref, context.catalogue));
  const changedSources = sourceChecks.filter((c) => c.status !== "CURRENT");
  for (const c of changedSources) reasons.push(`CATTLE_SOURCE_${c.status}:${c.bound.sourceId}`);
  const reviewRequired = !executable || !reviewStatus.fullyApproved || changedSources.length > 0;

  const usedInputs: CattleInputItem[] = [];
  const missing: string[] = [];
  const conflicting: ConflictingInputRecord[] = [];
  const rejected: RejectedInput[] = [];
  const values: Record<string, CattleInputScalar> = {};

  let applicabilityGap: "CONFLICTING" | "MISSING" | "NOT_APPLICABLE" | null = null;
  for (const condition of rule.applicability) {
    const { resolved, rejected: r } = resolveInput(condition.input, context.inputs);
    rejected.push(...r);
    if (resolved.status === "CONFLICTING") {
      conflicting.push({ inputKey: resolved.inputKey, items: resolved.items });
      applicabilityGap = "CONFLICTING";
    } else if (resolved.status === "MISSING") {
      missing.push(resolved.inputKey);
      if (applicabilityGap !== "CONFLICTING") applicabilityGap = "MISSING";
    } else {
      usedInputs.push(...resolved.items);
      if (resolved.value !== condition.equals && applicabilityGap === null) applicabilityGap = "NOT_APPLICABLE";
    }
  }
  for (const descriptor of rule.requiredInputs) {
    const { resolved, rejected: r } = resolveInput(descriptor, context.inputs);
    rejected.push(...r);
    if (resolved.status === "CONFLICTING") conflicting.push({ inputKey: resolved.inputKey, items: resolved.items });
    else if (resolved.status === "MISSING") missing.push(resolved.inputKey);
    else {
      usedInputs.push(...resolved.items);
      values[resolved.inputKey] = resolved.value;
    }
  }

  let state: CattleEvaluationState;
  if (unsupported) state = "UNSUPPORTED";
  else if (reviewRequired) state = "REVIEW_REQUIRED";
  else if (applicabilityGap === "CONFLICTING") state = rule.unknownPolicy.conflictingInput;
  else if (applicabilityGap === "MISSING") state = rule.unknownPolicy.missingRequiredInput;
  else if (applicabilityGap === "NOT_APPLICABLE") state = "NOT_APPLICABLE";
  else if (conflicting.length > 0) state = rule.unknownPolicy.conflictingInput;
  else if (missing.length > 0) state = rule.unknownPolicy.missingRequiredInput;
  else {
    state = predicate(Object.freeze({ ...values }));
    if (state === "UNSUPPORTED") reasons.push("CATTLE_RULE_PREDICATE_UNSUPPORTED_SCENARIO");
  }
  if (applicabilityGap === "NOT_APPLICABLE") reasons.push("CATTLE_RULE_NOT_APPLICABLE");
  if (conflicting.length > 0) reasons.push("CATTLE_INPUT_CONFLICTING");
  if (missing.length > 0) reasons.push("CATTLE_INPUT_MISSING");

  const dedupedUsed = usedInputs
    .sort(compareInputItems)
    .filter((item, i, arr) => i === 0 || compareInputItems(arr[i - 1], item) !== 0);

  return {
    architectureVersion: CATTLE_EVIDENCE_ARCHITECTURE_VERSION,
    requestedRuleId: rule.ruleId,
    rule: ruleVersionRef(rule),
    ruleFingerprint: computeRuleFingerprint(rule, hash),
    classification: rule.classification,
    gateRole: rule.gateRole,
    evaluationDate: context.evaluationDate,
    state,
    reasonCodes: sortedUnique(reasons),
    usedInputs: dedupedUsed,
    missingInputs: sortedUnique(missing),
    conflictingInputs: conflicting
      .sort((a, b) => compareStrings(a.inputKey, b.inputKey))
      .filter((c, i, arr) => i === 0 || arr[i - 1].inputKey !== c.inputKey),
    rejectedInputs: rejected.sort((a, b) => compareInputItems(a.item, b.item)),
    sourceChecks,
    reviews: reviewStatus.dimensions,
  };
}

/** Resolves the version effective on the evaluation date, then evaluates
 * it. No effective (or more than one) version fails closed as UNSUPPORTED. */
export function evaluateEffectiveCattleRule(
  versions: readonly CattleRuleVersion[],
  ruleId: string,
  predicate: CattleRulePredicate,
  context: RuleEvaluationContext,
  hash: CattleHash,
): RuleEvaluationRecord {
  const resolution = resolveEffectiveRuleVersion(versions, ruleId, context.evaluationDate);
  if (resolution.status === "RESOLVED") return evaluateCattleRule(resolution.rule, predicate, context, hash);
  const reason =
    resolution.status === "NO_EFFECTIVE_VERSION"
      ? "CATTLE_RULE_NO_EFFECTIVE_VERSION"
      : resolution.status === "AMBIGUOUS_EFFECTIVE_VERSIONS"
        ? "CATTLE_RULE_AMBIGUOUS_EFFECTIVE_VERSIONS"
        : "CATTLE_EVALUATION_INVALID_DATE";
  return unresolvedRecord(ruleId, context.evaluationDate, reason);
}
