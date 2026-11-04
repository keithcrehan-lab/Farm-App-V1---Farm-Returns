import Decimal from "decimal.js";

export type CattleFeedingSituation = "housed_grass_silage" | "at_grass" | "other_diet";
export type SilageQualityBasis = "lab_analysis" | "planning_scenario";

export interface CattleGroupProductionPlan {
  groupId: string;
  farmId: string;
  targetWeightKg?: number;
  targetDate?: string;
  dietLabel?: string;
  concentrateKgHeadDay?: number;
  concentratePriceEurT?: number;
  forageCostEurHeadDay?: number;
  housingCostEurHeadDay?: number;
  notes?: string;
  /** Goal-first nutrition context (`cattle-nutrition-plan.ts`). */
  feedingSituation?: CattleFeedingSituation;
  silageQualityBasis?: SilageQualityBasis;
  silageDmdPct?: number;
  silageCpPct?: number;
  silageAnalysisDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type GroupPlanMetric =
  | { status: "known"; value: number }
  | { status: "unknown"; reason: string };

export interface CattleGroupProductionPlanMetrics {
  currentWeightKg: GroupPlanMetric;
  remainingDays: GroupPlanMetric;
  requiredGainKg: GroupPlanMetric;
  requiredAdgKgDay: GroupPlanMetric;
  feedCostEurHeadDay: GroupPlanMetric;
  feedCostEurGroupDay: GroupPlanMetric;
  feedCostPerKgTargetGain: GroupPlanMetric;
}

const unknown = (reason: string): GroupPlanMetric => ({ status: "unknown", reason });
const known = (value: number): GroupPlanMetric => ({ status: "known", value });

function validPositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validNonNegative(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function calendarDays(fromDate: string, toDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return null;
  const from = Date.parse(`${fromDate}T00:00:00.000Z`);
  const to = Date.parse(`${toDate}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

export function deriveCattleGroupProductionPlanMetrics(input: {
  plan?: CattleGroupProductionPlan;
  currentWeightKg?: number;
  headCount?: number;
  asOfDate: string;
}): CattleGroupProductionPlanMetrics {
  const plan = input.plan;
  const currentWeight = validPositive(input.currentWeightKg) ? known(input.currentWeightKg) : unknown("CURRENT_GROUP_WEIGHT_REQUIRED");

  let remainingDays: GroupPlanMetric = unknown("TARGET_DATE_REQUIRED");
  if (plan?.targetDate) {
    const days = calendarDays(input.asOfDate, plan.targetDate);
    remainingDays = days !== null && days > 0 ? known(days) : unknown(days === null ? "TARGET_DATE_INVALID" : "TARGET_DATE_NOT_IN_FUTURE");
  }

  let requiredGain: GroupPlanMetric = unknown("TARGET_WEIGHT_AND_CURRENT_WEIGHT_REQUIRED");
  if (validPositive(plan?.targetWeightKg) && currentWeight.status === "known") {
    const gain = plan.targetWeightKg - currentWeight.value;
    requiredGain = gain > 0 ? known(gain) : unknown("TARGET_WEIGHT_NOT_ABOVE_CURRENT_WEIGHT");
  }

  const requiredAdg =
    requiredGain.status === "known" && remainingDays.status === "known"
      ? known(requiredGain.value / remainingDays.value)
      : unknown("TARGET_WEIGHT_DATE_AND_CURRENT_WEIGHT_REQUIRED");

  const concentrateCost =
    validNonNegative(plan?.concentrateKgHeadDay) && validNonNegative(plan?.concentratePriceEurT)
      ? new Decimal(plan?.concentrateKgHeadDay ?? 0).times(plan?.concentratePriceEurT ?? 0).dividedBy(1000)
      : null;
  const forage = validNonNegative(plan?.forageCostEurHeadDay) ? new Decimal(plan?.forageCostEurHeadDay ?? 0) : null;
  const housing = validNonNegative(plan?.housingCostEurHeadDay) ? new Decimal(plan?.housingCostEurHeadDay ?? 0) : new Decimal(0);
  const feedCost =
    concentrateCost !== null && forage !== null
      ? known(concentrateCost.plus(forage).plus(housing).toNumber())
      : unknown("DIET_COST_INPUTS_REQUIRED");

  const groupDaily =
    feedCost.status === "known" && validPositive(input.headCount)
      ? known(new Decimal(feedCost.value).times(input.headCount).toNumber())
      : unknown(feedCost.status === "unknown" ? feedCost.reason : "HEADCOUNT_REQUIRED");

  const costPerKg =
    feedCost.status === "known" && requiredAdg.status === "known" && requiredAdg.value > 0
      ? known(new Decimal(feedCost.value).dividedBy(requiredAdg.value).toNumber())
      : unknown(feedCost.status === "unknown" ? feedCost.reason : "TARGET_ADG_REQUIRED");

  return {
    currentWeightKg: currentWeight,
    remainingDays,
    requiredGainKg: requiredGain,
    requiredAdgKgDay: requiredAdg,
    feedCostEurHeadDay: feedCost,
    feedCostEurGroupDay: groupDaily,
    feedCostPerKgTargetGain: costPerKg,
  };
}
