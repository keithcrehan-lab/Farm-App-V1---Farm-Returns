import type { SchemeDataState } from "../contracts";
import type { SchemeEligibilityState } from "../eligibility";
import type { SchemeRuleEvaluationState } from "../rule-evaluation";

/**
 * Closed state vocabulary for every scheme phase. This module adds no new
 * state: it enumerates the states the Schemes engine already owns and
 * publishes the precedence it already applies, so later phases extend one
 * vocabulary instead of creating a second one.
 */

const ELIGIBILITY_STATES: Record<SchemeEligibilityState, true> = {
  ELIGIBLE_CONFIRMED: true,
  LIKELY_ELIGIBLE: true,
  POTENTIALLY_ELIGIBLE: true,
  MORE_INFORMATION_REQUIRED: true,
  PROBABLY_NOT_ELIGIBLE: true,
  NOT_RELEVANT: true,
  EXISTING_PARTICIPANT: true,
};

export const SCHEME_ELIGIBILITY_STATES = Object.keys(
  ELIGIBILITY_STATES,
) as SchemeEligibilityState[];

/** Strongest first. When a rule reads several inputs, the first state in
 * this list that any input holds decides the rule's result. KNOWN is not
 * listed because it is the only state that lets an operator run. */
export const SCHEME_DATA_STATE_PRECEDENCE = [
  "CONFLICTING",
  "INVALID",
  "REVIEW_REQUIRED",
  "UNSUPPORTED",
  "MISSING",
  "NOT_APPLICABLE",
] as const satisfies readonly SchemeDataState[];

export type SchemeUnresolvedRuleState = Exclude<
  SchemeRuleEvaluationState,
  "PASS" | "FAIL" | "NOT_APPLICABLE"
>;

/** Strongest first; MISSING data evaluates to UNKNOWN. None of these is a
 * pass, a fail or a zero. */
export const SCHEME_UNRESOLVED_RULE_PRECEDENCE = [
  "EVIDENCE_CONFLICT",
  "INVALID_EVIDENCE",
  "REVIEW_REQUIRED",
  "UNSUPPORTED",
  "UNKNOWN",
] as const satisfies readonly SchemeUnresolvedRuleState[];

/**
 * The strongest unresolved reason across a scheme's rule results. It
 * explains an unresolved assessment and never changes the eligibility state
 * derived by deriveSchemeEligibility. Null when nothing is unresolved.
 */
export function dominantUnresolvedRuleState(
  states: readonly SchemeRuleEvaluationState[],
): SchemeUnresolvedRuleState | null {
  return (
    SCHEME_UNRESOLVED_RULE_PRECEDENCE.find((state) => states.includes(state)) ??
    null
  );
}
