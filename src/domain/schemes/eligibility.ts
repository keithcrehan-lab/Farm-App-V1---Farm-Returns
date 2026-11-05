import type { StoredSchemeRule } from "./repository";
import type {
  SchemeRuleEvaluation,
  SchemeRuleEvaluationState,
} from "./rule-evaluation";

export type SchemeEligibilityState =
  | "ELIGIBLE_CONFIRMED"
  | "LIKELY_ELIGIBLE"
  | "POTENTIALLY_ELIGIBLE"
  | "MORE_INFORMATION_REQUIRED"
  | "PROBABLY_NOT_ELIGIBLE"
  | "NOT_RELEVANT"
  | "EXISTING_PARTICIPANT";

export interface SchemeEligibilityAssessment {
  state: SchemeEligibilityState;
  passedRuleIds: string[];
  failedRuleIds: string[];
  unresolvedRuleIds: string[];
  explanationCode:
    | "EXISTING_PARTICIPANT"
    | "NOT_RELEVANT"
    | "RELEVANCE_UNRESOLVED"
    | "HARD_GATE_FAILED"
    | "ELIGIBILITY_UNRESOLVED"
    | "ALL_TESTED_CONDITIONS_PASS_AUTHORITATIVE"
    | "ALL_TESTED_CONDITIONS_PASS_CONFIRMATION_REMAINS";
}

const UNRESOLVED = new Set<SchemeRuleEvaluationState>([
  "UNKNOWN",
  "EVIDENCE_CONFLICT",
  "INVALID_EVIDENCE",
  "UNSUPPORTED",
  "REVIEW_REQUIRED",
]);

function byRuleType(
  rules: StoredSchemeRule[],
  evaluations: SchemeRuleEvaluation[],
  types: StoredSchemeRule["ruleType"][],
): Array<{ rule: StoredSchemeRule; evaluation: SchemeRuleEvaluation }> {
  const evalById = new Map(evaluations.map((evaluation) => [evaluation.ruleId, evaluation]));
  return rules
    .filter((rule) => types.includes(rule.ruleType))
    .flatMap((rule) => {
      const evaluation = evalById.get(rule.id);
      return evaluation ? [{ rule, evaluation }] : [];
    });
}

/**
 * Rolls deterministic rule results into the farmer-facing eligibility
 * state. This is still not a DAFM decision: "confirmed" is permitted only
 * when the caller explicitly proves every tested condition came from
 * authoritative evidence.
 */
export function deriveSchemeEligibility(input: {
  rules: StoredSchemeRule[];
  evaluations: SchemeRuleEvaluation[];
  participationStatus: "unknown" | "interested" | "existing_participant" | "not_participating";
  authoritativeConditionsProven: boolean;
}): SchemeEligibilityAssessment {
  if (input.participationStatus === "existing_participant") {
    return {
      state: "EXISTING_PARTICIPANT",
      passedRuleIds: [],
      failedRuleIds: [],
      unresolvedRuleIds: [],
      explanationCode: "EXISTING_PARTICIPANT",
    };
  }

  const relevance = byRuleType(input.rules, input.evaluations, ["relevance"]);
  const relevantApplicable = relevance.filter(
    ({ evaluation }) => evaluation.state !== "NOT_APPLICABLE",
  );

  if (
    relevantApplicable.length > 0 &&
    relevantApplicable.every(({ evaluation }) => evaluation.state === "FAIL")
  ) {
    return {
      state: "NOT_RELEVANT",
      passedRuleIds: [],
      failedRuleIds: relevantApplicable.map(({ rule }) => rule.id),
      unresolvedRuleIds: [],
      explanationCode: "NOT_RELEVANT",
    };
  }

  const relevanceUnresolved = relevantApplicable.filter(({ evaluation }) =>
    UNRESOLVED.has(evaluation.state),
  );
  const relevancePasses = relevantApplicable.filter(
    ({ evaluation }) => evaluation.state === "PASS",
  );

  if (relevanceUnresolved.length > 0 && relevancePasses.length === 0) {
    return {
      state: "MORE_INFORMATION_REQUIRED",
      passedRuleIds: [],
      failedRuleIds: [],
      unresolvedRuleIds: relevanceUnresolved.map(({ rule }) => rule.id),
      explanationCode: "RELEVANCE_UNRESOLVED",
    };
  }

  const eligibility = byRuleType(input.rules, input.evaluations, [
    "eligibility",
    "exclusion",
    "compatibility",
  ]).filter(({ evaluation }) => evaluation.state !== "NOT_APPLICABLE");

  const hardGateFailures = eligibility.filter(
    ({ rule, evaluation }) => rule.hardGate && evaluation.state === "FAIL",
  );
  if (hardGateFailures.length > 0) {
    return {
      state: "PROBABLY_NOT_ELIGIBLE",
      passedRuleIds: eligibility
        .filter(({ evaluation }) => evaluation.state === "PASS")
        .map(({ rule }) => rule.id),
      failedRuleIds: hardGateFailures.map(({ rule }) => rule.id),
      unresolvedRuleIds: eligibility
        .filter(({ evaluation }) => UNRESOLVED.has(evaluation.state))
        .map(({ rule }) => rule.id),
      explanationCode: "HARD_GATE_FAILED",
    };
  }

  const unresolved = eligibility.filter(({ evaluation }) =>
    UNRESOLVED.has(evaluation.state),
  );
  const passed = eligibility.filter(
    ({ evaluation }) => evaluation.state === "PASS",
  );

  if (unresolved.length > 0) {
    return {
      state:
        passed.length > 0 || relevancePasses.length > 0
          ? "POTENTIALLY_ELIGIBLE"
          : "MORE_INFORMATION_REQUIRED",
      passedRuleIds: passed.map(({ rule }) => rule.id),
      failedRuleIds: eligibility
        .filter(({ evaluation }) => evaluation.state === "FAIL")
        .map(({ rule }) => rule.id),
      unresolvedRuleIds: unresolved.map(({ rule }) => rule.id),
      explanationCode: "ELIGIBILITY_UNRESOLVED",
    };
  }

  return {
    state: input.authoritativeConditionsProven
      ? "ELIGIBLE_CONFIRMED"
      : "LIKELY_ELIGIBLE",
    passedRuleIds: passed.map(({ rule }) => rule.id),
    failedRuleIds: eligibility
      .filter(({ evaluation }) => evaluation.state === "FAIL")
      .map(({ rule }) => rule.id),
    unresolvedRuleIds: [],
    explanationCode: input.authoritativeConditionsProven
      ? "ALL_TESTED_CONDITIONS_PASS_AUTHORITATIVE"
      : "ALL_TESTED_CONDITIONS_PASS_CONFIRMATION_REMAINS",
  };
}
