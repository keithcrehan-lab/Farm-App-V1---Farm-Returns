/**
 * Farm Return Next — Supports Intelligence, Farm Strategy engine.
 *
 * `SUPPORTS_STRATEGY_CONTRACT.md` §7-10. A pure, explainable financial
 * calculator — no black-box score, every output traceable back to the
 * explicit `StrategyScenarioInput` a caller supplied. This module never
 * reads live farm P&L data itself (V1's `/finance` page is still mostly
 * mock — `docs/overnight/IMPLEMENTATION_MATRIX.md` — so there is no real
 * whole-farm baseline income/cost figure to read yet); a caller
 * (`support-opportunity.ts`, or a future UI form) supplies real,
 * individually-sourced cost/support/saving assumptions, each carrying its
 * own status (`"estimated" | "quoted" | "actual" | "approved"`), and this
 * module does the arithmetic honestly — it invents no default for a
 * figure the caller didn't supply.
 *
 * §8's baseline: "Continue the current farm operation" is modelled as a
 * genuine, real zero — no new capital, no change to current income/cost —
 * not a fabricated comparison figure. §9's cash-requirement/return split:
 * `peakCashRequirementEur` is always the full gross capital cost, never
 * reduced by expected/approved support (grant aid is reimbursement in
 * every Irish scheme this app's own registry currently models —
 * `scheme-registry.ts` — the farmer funds the work first); support only
 * reduces `netEventualCapitalCostEur` (once `"approved"`/`"actual"`) and
 * the year-by-year `cumulativeDifferenceVsBaselineEur` (once its own
 * `expectedYear` is known). §9 also forbids silently assuming inflation,
 * a discount rate, financing cost, energy-price escalation, residual
 * value or maintenance — this engine applies none of those; every
 * assumption it does rely on is named in `assumptionsDisclosed`, always
 * populated, never empty.
 */

export type StrategyHorizonYears = 1 | 3 | 5 | 10;
export const STRATEGY_HORIZONS: StrategyHorizonYears[] = [1, 3, 5, 10];

export const FARM_STRATEGY_ENGINE_VERSION = "farm-strategy-v1";

export interface StrategySupportAssumption {
  amountEur: number;
  /** "estimated" — Farm Return's/farmer's own guess, not yet applied for.
   * "approved" — DAFM (or the relevant scheme) has approved this amount.
   * "actual" — the money has actually been received. Only "approved"/
   * "actual" ever reduce `netEventualCapitalCostEur` or count toward
   * `cumulativeDifferenceVsBaselineEur` — an "estimated" figure is shown
   * separately (`supportEstimatedNotApprovedEur`), never silently treated
   * as real money (§9/§10 case 4). */
  status: "estimated" | "approved" | "actual";
  /** 1-based year within the horizon this support is/was expected to
   * land. Absent means genuinely unknown timing — `undefined` is never
   * treated as "year 1" (§9/§10 case 5: exposed, not guessed). */
  expectedYear?: number;
  source: string;
}

export interface StrategyInvestmentAssumption {
  label: string;
  /** Full cost before any support — always deployed in year 1 of the
   * scenario (a real, disclosed simplification for this first version;
   * see `assumptionsDisclosed`) — multi-year phased capital spend is not
   * yet modelled. */
  grossCostEur: number;
  costStatus: "estimated" | "quoted" | "actual";
  support?: StrategySupportAssumption;
}

export interface StrategyAnnualEffectAssumption {
  label: string;
  /** Positive = benefit (saving/revenue) vs baseline; negative = ongoing
   * cost vs baseline. A real euro/year figure, never a percentage. */
  amountEurPerYear: number;
  status: "estimated" | "actual";
  source: string;
  /** 1-based first year this effect applies; defaults to 1. */
  startsYear?: number;
  /** 1-based last year this effect applies (inclusive); defaults to
   * running through the end of the horizon. Lets a scenario model a
   * genuinely time-limited effect (e.g. a transition-period cost that
   * ends once a new system is established) rather than every effect
   * necessarily running forever once it starts. */
  endsYear?: number;
}

export interface StrategyScenarioInput {
  id: string;
  label: string;
  investments: StrategyInvestmentAssumption[];
  annualEffects: StrategyAnnualEffectAssumption[];
}

export interface StrategyCashFlowPoint {
  year: number;
  grossCapitalDeployedEur: number; // cumulative
  supportReceivedEur: number; // cumulative, approved/actual only, only once expectedYear is reached
  peakCashRequirementEur: number; // cumulative gross capital deployed — never reduced by support, see header comment
  cumulativeOperatingBenefitEur: number;
  cumulativeOperatingCostEur: number;
  cumulativeDifferenceVsBaselineEur: number;
}

export type StrategyOutcome =
  | {
      status: "OK";
      horizonYears: StrategyHorizonYears;
      scenarioLabel: string;
      grossCapitalDeployedEur: number;
      supportApprovedOrActualEur: number;
      supportEstimatedNotApprovedEur: number;
      supportTimingUnknown: boolean;
      netEventualCapitalCostEur: number;
      peakCashRequirementEur: number;
      cumulativeOperatingBenefitEur: number;
      cumulativeOperatingCostEur: number;
      cumulativeDifferenceVsBaselineEur: number;
      /** First year (within the horizon) cumulative difference vs
       * baseline reaches zero or above — `null` when that never happens
       * within `horizonYears`. Never extrapolated past the requested
       * horizon (§10: "no unsupported payback"). */
      paybackYear: number | null;
      timeline: StrategyCashFlowPoint[];
      assumptionsDisclosed: string[];
    }
  | { status: "INSUFFICIENT_EVIDENCE"; reasonCode: string; missing: string[] };

export interface StrategyComparison {
  horizonYears: StrategyHorizonYears;
  baselineLabel: string;
  scenario: StrategyOutcome;
}

function buildAssumptionsDisclosed(scenario: StrategyScenarioInput): string[] {
  const disclosed = [
    "No inflation, discount rate, financing cost, energy-price escalation, residual value or maintenance cost is assumed unless explicitly listed as one of this scenario's own annual effects.",
    "Every investment's full gross cost is treated as deployed in year 1 — phased multi-year capital spend is not modelled.",
    "Peak cash requirement is always the full gross capital cost — support is reimbursement after spend, never assumed to reduce the amount the farmer must fund upfront.",
  ];
  const unapproved = scenario.investments.filter((i) => i.support && i.support.status === "estimated");
  if (unapproved.length > 0) {
    disclosed.push(`${unapproved.length} investment(s) carry an estimated (not yet approved) support figure — excluded from net capital cost and from the year-by-year cash-flow benefit until approved.`);
  }
  const unknownTiming = scenario.investments.filter((i) => i.support && (i.support.status === "approved" || i.support.status === "actual") && i.support.expectedYear === undefined);
  if (unknownTiming.length > 0) {
    disclosed.push(`${unknownTiming.length} approved/actual support payment(s) have no known timing — counted in the eventual net capital cost, but not in any specific year's cash-flow position.`);
  }
  return disclosed;
}

/**
 * Codex audit HIGH (round 1, 2026-09-04): this engine previously
 * validated only that *some* assumption existed — a negative/non-finite
 * capital cost, support exceeding its own investment's cost, an
 * `expectedYear`/`startsYear`/`endsYear` outside the requested horizon,
 * or a non-finite annual-effect amount could all reach `status: "OK"`
 * and silently produce a nonsensical (negative capital requirement,
 * overstated support, `NaN`-tainted) result. Every problem found is
 * collected (not just the first) so a caller can show the farmer
 * everything wrong with what they entered in one pass, matching this
 * engine's own `assumptionsDisclosed` "never partial, never silent"
 * posture applied to invalid input specifically.
 */
function validateScenario(scenario: StrategyScenarioInput, horizonYears: StrategyHorizonYears): string[] {
  const problems: string[] = [];
  scenario.investments.forEach((investment, i) => {
    const label = investment.label || `Investment ${i + 1}`;
    if (!Number.isFinite(investment.grossCostEur) || investment.grossCostEur < 0) {
      problems.push(`${label}: gross cost must be a real, non-negative amount.`);
    }
    const support = investment.support;
    if (support) {
      if (!Number.isFinite(support.amountEur) || support.amountEur < 0) {
        problems.push(`${label}: support amount must be a real, non-negative amount.`);
      } else if (Number.isFinite(investment.grossCostEur) && support.amountEur > investment.grossCostEur) {
        problems.push(`${label}: support amount (€${support.amountEur}) can't exceed the investment's own gross cost (€${investment.grossCostEur}).`);
      }
      if (support.expectedYear !== undefined && (!Number.isInteger(support.expectedYear) || support.expectedYear < 1 || support.expectedYear > horizonYears)) {
        problems.push(`${label}: support expected year must be a whole number between 1 and ${horizonYears} (the requested horizon).`);
      }
    }
  });
  scenario.annualEffects.forEach((effect, i) => {
    const label = effect.label || `Annual effect ${i + 1}`;
    if (!Number.isFinite(effect.amountEurPerYear)) {
      problems.push(`${label}: annual amount must be a real number.`);
    }
    const startsYear = effect.startsYear ?? 1;
    if (!Number.isInteger(startsYear) || startsYear < 1) {
      problems.push(`${label}: starts-year must be a whole number of at least 1.`);
    }
    if (effect.endsYear !== undefined && (!Number.isInteger(effect.endsYear) || effect.endsYear < startsYear)) {
      problems.push(`${label}: ends-year must be a whole number no earlier than its own starts-year.`);
    }
  });
  return problems;
}

function buildScenarioOutcome(scenario: StrategyScenarioInput, horizonYears: StrategyHorizonYears): StrategyOutcome {
  if (scenario.investments.length === 0 && scenario.annualEffects.length === 0) {
    return {
      status: "INSUFFICIENT_EVIDENCE",
      reasonCode: "NO_SCENARIO_ASSUMPTIONS_SUPPLIED",
      missing: ["At least one investment or annual effect assumption is required to compare a strategy against the baseline."],
    };
  }

  // Codex audit HIGH (round 6, 2026-09-04): the check above only catches
  // literally-empty arrays. A scenario carrying a real annual-effect
  // entry whose `amountEurPerYear` is exactly 0 (and no investment) still
  // passed it, then produced `grossCapitalDeployedEur = 0` and a
  // `cumulativeDifferenceVsBaselineEur` of 0 in every year — which the
  // payback check below treats as "reached zero-or-above", awarding
  // `paybackYear = 1` for a scenario that changed nothing at all.
  // `deriveFinancialSensibility` (`support-opportunity.ts`) then read
  // that non-null `paybackYear` as "sensible_within_horizon". Fixed by
  // failing closed here, before any of that arithmetic runs, whenever
  // every supplied assumption amounts to a real €0 — there is no
  // baseline-vs-scenario difference to assess, so this is neither a
  // "sensible" nor an "unsensible" strategy, just no strategy yet.
  const hasGenuineFinancialImpact = scenario.investments.some((i) => i.grossCostEur !== 0) || scenario.annualEffects.some((e) => e.amountEurPerYear !== 0);
  if (!hasGenuineFinancialImpact) {
    return {
      status: "INSUFFICIENT_EVIDENCE",
      reasonCode: "NO_GENUINE_FINANCIAL_IMPACT",
      missing: ["Every investment and annual effect supplied amounts to €0 — there is no real financial difference from continuing the current farm operation to assess."],
    };
  }

  const validationProblems = validateScenario(scenario, horizonYears);
  if (validationProblems.length > 0) {
    return { status: "INSUFFICIENT_EVIDENCE", reasonCode: "INVALID_SCENARIO_ASSUMPTIONS", missing: validationProblems };
  }

  const grossCapitalDeployedEur = scenario.investments.reduce((sum, i) => sum + i.grossCostEur, 0);
  const supportApprovedOrActualEur = scenario.investments.reduce((sum, i) => sum + (i.support && (i.support.status === "approved" || i.support.status === "actual") ? i.support.amountEur : 0), 0);
  const supportEstimatedNotApprovedEur = scenario.investments.reduce((sum, i) => sum + (i.support && i.support.status === "estimated" ? i.support.amountEur : 0), 0);
  const supportTimingUnknown = scenario.investments.some((i) => i.support && (i.support.status === "approved" || i.support.status === "actual") && i.support.expectedYear === undefined);
  const netEventualCapitalCostEur = grossCapitalDeployedEur - supportApprovedOrActualEur;

  const timeline: StrategyCashFlowPoint[] = [];
  let cumBenefit = 0;
  let cumCost = 0;
  let cumSupportReceived = 0;
  let paybackYear: number | null = null;

  for (let year = 1; year <= horizonYears; year += 1) {
    for (const effect of scenario.annualEffects) {
      const startsYear = effect.startsYear ?? 1;
      if (year < startsYear) continue;
      if (effect.endsYear !== undefined && year > effect.endsYear) continue;
      if (effect.amountEurPerYear >= 0) cumBenefit += effect.amountEurPerYear;
      else cumCost += Math.abs(effect.amountEurPerYear);
    }
    for (const investment of scenario.investments) {
      const support = investment.support;
      if (!support) continue;
      if (support.status === "estimated") continue;
      if (support.expectedYear === year) cumSupportReceived += support.amountEur;
    }

    const cumulativeDifferenceVsBaselineEur = cumBenefit - cumCost - grossCapitalDeployedEur + cumSupportReceived;
    // Codex audit HIGH (round 8, 2026-09-04): the round-6 fix above only
    // catches a scenario with no real activity *anywhere*. A scenario
    // whose only real effect starts after the requested horizon ends
    // (e.g. a real annual benefit starting year 3, assessed over a
    // 1-year horizon) passes that check — the effect is real, just not
    // *within this horizon* — then reaches this line with every
    // accumulator still at its untouched starting value, so
    // `cumulativeDifferenceVsBaselineEur` is trivially 0 and "payback"
    // fires on a year where literally nothing has happened yet. Fixed:
    // payback can only be recorded once some real activity (capital
    // deployed, a benefit/cost accrued, support received) has actually
    // occurred by this year — a scenario that never does anything within
    // the horizon correctly never gets a `paybackYear` at all.
    const hasOccurredByThisYear = grossCapitalDeployedEur > 0 || cumBenefit > 0 || cumCost > 0 || cumSupportReceived > 0;
    if (paybackYear === null && hasOccurredByThisYear && cumulativeDifferenceVsBaselineEur >= 0) paybackYear = year;

    timeline.push({
      year,
      grossCapitalDeployedEur,
      supportReceivedEur: cumSupportReceived,
      peakCashRequirementEur: grossCapitalDeployedEur,
      cumulativeOperatingBenefitEur: cumBenefit,
      cumulativeOperatingCostEur: cumCost,
      cumulativeDifferenceVsBaselineEur,
    });
  }

  const last = timeline[timeline.length - 1];
  return {
    status: "OK",
    horizonYears,
    scenarioLabel: scenario.label,
    grossCapitalDeployedEur,
    supportApprovedOrActualEur,
    supportEstimatedNotApprovedEur,
    supportTimingUnknown,
    netEventualCapitalCostEur,
    peakCashRequirementEur: grossCapitalDeployedEur,
    cumulativeOperatingBenefitEur: last.cumulativeOperatingBenefitEur,
    cumulativeOperatingCostEur: last.cumulativeOperatingCostEur,
    cumulativeDifferenceVsBaselineEur: last.cumulativeDifferenceVsBaselineEur,
    paybackYear,
    timeline,
    assumptionsDisclosed: buildAssumptionsDisclosed(scenario),
  };
}

/**
 * §8: compares a real, explicit `StrategyScenarioInput` against the one
 * legitimate baseline — continuing the current farm operation unchanged
 * (a real zero, not a fabricated figure: no capital, no change to
 * current income/cost). Returns `INSUFFICIENT_EVIDENCE` rather than a
 * fake comparison when the scenario itself carries no real assumptions.
 */
export function compareStrategyToBaseline(scenario: StrategyScenarioInput, horizonYears: StrategyHorizonYears): StrategyComparison {
  return {
    horizonYears,
    baselineLabel: "Continue current farm operation — no new investment, no change to current costs or income.",
    scenario: buildScenarioOutcome(scenario, horizonYears),
  };
}
