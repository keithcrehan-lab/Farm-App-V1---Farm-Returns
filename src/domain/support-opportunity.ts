/**
 * Farm Return Next — Supports Intelligence, Support Opportunity engine.
 *
 * `SUPPORTS_STRATEGY_CONTRACT.md` §6: links a real `EligibilityAssessment`
 * (`scheme-eligibility.ts`) to a candidate action/investment and, only
 * when the farmer has actually supplied one, a real `StrategyComparison`
 * (`farm-strategy.ts`) — and keeps two genuinely different questions
 * separate rather than collapsing them into one verdict: "this support
 * may apply to you" (an eligibility fact) is never the same claim as
 * "doing this appears financially sensible for your farm" (a strategy
 * fact). Farm Return never recommends spending purely because grant aid
 * exists — `financiallySensible` is only ever computed from a real
 * `StrategyComparison`, never inferred from eligibility state alone.
 */
import type { EligibilityAssessment } from "./scheme-eligibility";
import type { SchemeVersion } from "./scheme-registry";
import type { StrategyComparison } from "./farm-strategy";

export const SUPPORT_OPPORTUNITY_ENGINE_VERSION = "support-opportunity-v1";

export type FinancialSensibilityVerdict = "not_assessed" | "insufficient_evidence" | "sensible_within_horizon" | "not_sensible_within_horizon";

export interface SupportOpportunity {
  farmId: string;
  schemeId: string;
  schemeName: string;
  eligibility: EligibilityAssessment;
  /** Present only once the farmer (or a future supplier quote) has
   * supplied a real candidate investment/cost — never fabricated to fill
   * this in. */
  strategyComparison?: StrategyComparison;
  financiallySensible: FinancialSensibilityVerdict;
}

/**
 * Reads a scheme's own confirmed `grantRatePct`/`ceilingEur` rules (never
 * a hand-typed percentage) to estimate the support a given gross
 * investment cost could receive. Returns `undefined` — not a guess —
 * whenever the scheme doesn't carry both rules with real numeric values,
 * which is deliberately the case for every scheme in this registry that
 * isn't a capital grant (ANC, BISS, National Reserve's own entitlement
 * top-up).
 */
export function estimateGrantSupportEur(schemeVersion: SchemeVersion, grossCostEur: number): { amountEur: number; grantRatePct: number; ceilingEur: number } | undefined {
  if (schemeVersion.verificationStatus !== "CONFIRMED") return undefined;
  const rateRule = schemeVersion.rules.find((r) => r.id.endsWith("grant-rate-pct"));
  const ceilingRule = schemeVersion.rules.find((r) => r.id.endsWith("investment-ceiling-eur"));
  if (!rateRule || !ceilingRule) return undefined;
  const grantRatePct = (rateRule.value as { grantRatePct?: number }).grantRatePct;
  const ceilingEur = (ceilingRule.value as { ceilingEur?: number }).ceilingEur;
  if (typeof grantRatePct !== "number" || typeof ceilingEur !== "number") return undefined;
  const uncapped = grossCostEur * (grantRatePct / 100);
  return { amountEur: Math.min(uncapped, ceilingEur), grantRatePct, ceilingEur };
}

function deriveFinancialSensibility(strategyComparison: StrategyComparison | undefined): FinancialSensibilityVerdict {
  if (!strategyComparison) return "not_assessed";
  if (strategyComparison.scenario.status === "INSUFFICIENT_EVIDENCE") return "insufficient_evidence";
  return strategyComparison.scenario.paybackYear !== null || strategyComparison.scenario.cumulativeDifferenceVsBaselineEur > 0 ? "sensible_within_horizon" : "not_sensible_within_horizon";
}

export function buildSupportOpportunity(schemeVersion: SchemeVersion, eligibility: EligibilityAssessment, strategyComparison?: StrategyComparison): SupportOpportunity {
  return {
    farmId: eligibility.farmId,
    schemeId: schemeVersion.schemeId,
    schemeName: schemeVersion.name,
    eligibility,
    strategyComparison,
    financiallySensible: deriveFinancialSensibility(strategyComparison),
  };
}
