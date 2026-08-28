/**
 * Scientific engine V3 — second closure pass, Priority 9: GF19's
 * "reports/governance" structural-validity checks (`GFT159`, `GFT160`,
 * `GFT162`, `GFT163`) that `recordDecision` (`audit-trace.ts`) does not
 * itself enforce — it only guards `reasonCodes`/`sources` non-emptiness
 * at construction time; these are REPORT-level validity rules a caller
 * runs against an already-built `DecisionRecord`, matching the golden
 * tests' own framing ("Must satisfy Recommendation Audit Report Spec").
 *
 * Not wired into `nutrient-plan-trace.ts` or any live path this session
 * — every `DecisionRecord` this codebase actually builds already
 * satisfies these rules by construction (verified by the tests here
 * against real, live-built decisions), so there is no live violation to
 * catch; this module exists so a FUTURE decision builder has a real
 * function to validate against, rather than each one reinventing the
 * check.
 */

import type { ComplianceCheck, DecisionRecord, InputEvidence } from "./audit-trace";

export const REPORT_VALIDATOR_VERSION = "report_validator_v1.0.0";

export interface ReportValidityResult {
  valid: boolean;
  reasonCode?: string;
}

/** `GFT159`: a decision carrying a numeric `quantity` must cite at least
 * one source — `recordDecision` already enforces `sources.length > 0`
 * for EVERY decision, numeric or not, so this is a strictly narrower
 * restatement of that existing guarantee for the numeric case
 * specifically. */
export function validateNumericRecommendationHasSource(decision: Pick<DecisionRecord, "quantity" | "sources">): ReportValidityResult {
  if (decision.quantity === undefined) return { valid: true };
  if (decision.sources.length === 0) return { valid: false, reasonCode: "NUMERIC_RECOMMENDATION_MISSING_SOURCE" };
  return { valid: true };
}

/** `GFT160`: a decision carrying a numeric `quantity` must show at least
 * one calculation step — a bare numeric conclusion with no shown
 * working is not a reviewable trace. */
export function validateNumericRecommendationHasSteps(decision: Pick<DecisionRecord, "quantity" | "calculationSteps">): ReportValidityResult {
  if (decision.quantity === undefined) return { valid: true };
  if (decision.calculationSteps.length === 0) return { valid: false, reasonCode: "NUMERIC_RECOMMENDATION_MISSING_STEPS" };
  return { valid: true };
}

/** `GFT162`: a `LEGAL_PROHIBITION` decision must never also carry a
 * numeric `quantity` — that would be an actionable spread rate
 * coexisting with a legal stop, an internally contradictory report (a
 * prohibited action has no valid rate to show). Distinct from `GFT161`
 * (a `LEGAL_PROHIBITION` decision WITH a `FAIL` compliance check is
 * valid and expected — that is the check explaining WHY the prohibition
 * applies, not an actionable quantity). */
export function validateLegalStopNotActionable(decision: Pick<DecisionRecord, "decisionType" | "quantity">): ReportValidityResult {
  if (decision.decisionType === "LEGAL_PROHIBITION" && decision.quantity !== undefined) {
    return { valid: false, reasonCode: "LEGAL_STOP_PLUS_ACTIONABLE_QUANTITY" };
  }
  return { valid: true };
}

/** `GFT163`: an input whose real origin was an Irish planning default
 * must never be labelled `evidenceState: "MEASURED"` — the two most
 * distant points on `data_quality_states.csv`'s own priority ordering
 * (1 vs. 4) cannot both describe the same input. */
export function validateDefaultNotMislabeledMeasured(input: Pick<InputEvidence, "sourceKind" | "evidenceState">): ReportValidityResult {
  if (input.sourceKind === "IRISH_DEFAULT" && input.evidenceState === "MEASURED") {
    return { valid: false, reasonCode: "DEFAULT_MISLABELLED_MEASURED" };
  }
  return { valid: true };
}

/** `GFT168`: a compliance check whose `result` is `"UNKNOWN"` must be
 * reported exactly as `"UNKNOWN"` — never silently normalised to
 * `"PASS"` for display. A trivial, explicit identity check (the real
 * guarantee is that nothing in this codebase's report path ever
 * transforms a `ComplianceCheck`'s `result` field — see
 * `report-validator.test.ts` for the construction-level proof). */
export function unknownCheckResultIsPreserved(check: Pick<ComplianceCheck, "result">): "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE" {
  return check.result;
}

/** Convenience aggregate — runs every rule this module implements
 * against a single `DecisionRecord`, returning the first failure (if
 * any). A real caller wiring full report validation would run this
 * across every decision in a `CalculationRun`. */
export function validateDecisionRecord(decision: DecisionRecord): ReportValidityResult {
  const checks: ReportValidityResult[] = [
    validateNumericRecommendationHasSource(decision),
    validateNumericRecommendationHasSteps(decision),
    validateLegalStopNotActionable(decision),
  ];
  return checks.find((c) => !c.valid) ?? { valid: true };
}
