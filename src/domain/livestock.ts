/**
 * Livestock feed-cost & sell-now-vs-finish economics — Phase 4 "free
 * livestock feed-cost layer" (docs/feed-engine.md). Every numeric constant
 * here traces to a named sheet/row in the "Farm Return Teagasc Animal
 * Nutrition Database" the user supplied (a Teagasc-sourced workbook — see
 * docs/evidence-register.md for the specific article per table).
 *
 * Scope for this pass: the finishing concentrate budget (DMD-Concentrate
 * sheet) and the sell-now-vs-finish comparison docs/feed-engine.md
 * specifies as a standalone pure function ("current market value now vs
 * forecast sale value at target date minus remaining cost to finish").
 * Not built here — flagged in README instead of guessed: the suckler-cow
 * and weanling winter feed budgets, silage/minerals/bedding cost drivers,
 * and the full three-strategy optimiser (Phase 7, needs a published
 * variable-ADG concentrate table this dataset doesn't contain — every row
 * available fixes ADG and varies DMD, not the reverse).
 */

import { tracked } from "./types";
import type { CostBreakdownItem, LivestockEconomics, LivestockGroup } from "./types";

export const LIVESTOCK_ENGINE_VERSION = "livestock_engine_v1.0.0";

export type FinishingAnimalType = "weanling" | "finishing_steer" | "finishing_heifer";

/**
 * Animal Nutrition Database, sheet "DMD-Concentrate" — concentrate
 * (kg/head/day) required to hit the sheet's own stated target ADG at each
 * silage DMD, sourced to Teagasc DairyBeef 500 "Silage quality and
 * concentrate supplementation". Cross-checked against "Manual-Finishing"
 * (Beef Manual Section 6) and "Teagasc-2026"/"Beef-2026-Rules"
 * (BEEF2026 finishing research) — all three give the same 5-6kg range at
 * 70 DMD for a continental steer targeting ~1kg/day gain.
 */
const CONCENTRATE_TABLE: Record<FinishingAnimalType, { targetADGKgDay: number; byDMD: [number, number][] }> = {
  weanling: {
    targetADGKgDay: 0.6,
    byDMD: [
      [66, 1.8],
      [68, 1.5],
      [70, 1.2],
      [72, 0.9],
      [74, 0.6],
      [76, 0.4],
    ],
  },
  finishing_steer: {
    targetADGKgDay: 1.0,
    byDMD: [
      [66, 7],
      [68, 6],
      [70, 5.5],
      [72, 5],
      [74, 4],
      [76, 4],
    ],
  },
  finishing_heifer: {
    targetADGKgDay: 0.9,
    byDMD: [
      [66, 7],
      [68, 6],
      [70, 5.5],
      [72, 5],
      [74, 4],
      [76, 4],
    ],
  },
};

export function targetADGForAnimalType(animalType: FinishingAnimalType): number {
  return CONCENTRATE_TABLE[animalType].targetADGKgDay;
}

/** Linear interpolation across the table's published DMD breakpoints —
 * silage rarely tests at exactly 66/68/70/72/74/76 DMD; clamped at the
 * published range's ends rather than extrapolated beyond it. */
export function concentrateKgPerDay(animalType: FinishingAnimalType, silageDMD: number): number {
  const points = CONCENTRATE_TABLE[animalType].byDMD;
  if (silageDMD <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (silageDMD >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i++) {
    const [dmdA, kgA] = points[i];
    const [dmdB, kgB] = points[i + 1];
    if (silageDMD >= dmdA && silageDMD <= dmdB) {
      const t = (silageDMD - dmdA) / (dmdB - dmdA);
      return kgA + t * (kgB - kgA);
    }
  }
  return last[1];
}

/** "System-Benchmarks" sheet: 712kg sale liveweight / 392kg carcass weight
 * = 55.06% kill-out, from the same BEEF2026 finishing budget the
 * concentrate table is sourced from. */
export const FINISHING_KILL_OUT_PCT = 0.55;

export interface FinishingBudgetInput {
  animalType: FinishingAnimalType;
  currentWeightKg: number;
  targetWeightKg: number;
  silageDMD: number;
  concentratePriceEurPerTonne: number;
  targetADGKgDay?: number;
}

export interface FinishingBudgetResult {
  targetADGKgDay: number;
  daysToFinish: number;
  concentrateKgPerHeadDay: number;
  totalConcentrateKgPerHead: number;
  feedCostPerHeadEur: number;
}

/**
 * Days-to-finish and concentrate budget for an animal moving from its
 * current weight to a target weight. Reproduces the source workbook's own
 * worked "Feed-Calculator" example exactly (a 520kg -> 650kg continental
 * steer at 72 DMD, EUR350/t concentrate => 130 days, 5kg/day, EUR227.50/head)
 * — see src/domain/livestock.test.ts.
 */
export function calculateFinishingBudget(input: FinishingBudgetInput): FinishingBudgetResult {
  const targetADGKgDay = input.targetADGKgDay ?? targetADGForAnimalType(input.animalType);
  const weightGainKg = Math.max(0, input.targetWeightKg - input.currentWeightKg);
  const daysToFinish = targetADGKgDay > 0 ? Math.round(weightGainKg / targetADGKgDay) : 0;
  const concentrateKgPerHeadDay = concentrateKgPerDay(input.animalType, input.silageDMD);
  const totalConcentrateKgPerHead = concentrateKgPerHeadDay * daysToFinish;
  const feedCostPerHeadEur = (totalConcentrateKgPerHead / 1000) * input.concentratePriceEurPerTonne;
  return { targetADGKgDay, daysToFinish, concentrateKgPerHeadDay, totalConcentrateKgPerHead, feedCostPerHeadEur };
}

export interface SellNowVsFinishInput {
  currentWeightKg: number;
  targetWeightKg: number;
  killOutPct: number;
  cattlePriceEurPerKgCarcass: number;
  /** The finishing budget's feedCostPerHeadEur — kept as an explicit
   * input rather than computed here, per docs/feed-engine.md: this
   * comparison must be "callable independently of running a full
   * optimisation pass". */
  remainingFeedCostToFinishEurPerHead: number;
}

export interface SellNowVsFinishResult {
  sellNowValueEurPerHead: number;
  finishNetValueEurPerHead: number;
  forecastSaleValueEurPerHead: number;
}

/**
 * docs/feed-engine.md "Sell-now vs finish scenario modelling": "current
 * market value now vs (forecast sale value at target date − remaining
 * cost to finish, using the selected feeding strategy)".
 */
export function calculateSellNowVsFinish(input: SellNowVsFinishInput): SellNowVsFinishResult {
  const sellNowValueEurPerHead = input.currentWeightKg * input.killOutPct * input.cattlePriceEurPerKgCarcass;
  const forecastSaleValueEurPerHead = input.targetWeightKg * input.killOutPct * input.cattlePriceEurPerKgCarcass;
  const finishNetValueEurPerHead = forecastSaleValueEurPerHead - input.remainingFeedCostToFinishEurPerHead;
  return { sellNowValueEurPerHead, finishNetValueEurPerHead, forecastSaleValueEurPerHead };
}

export interface LivestockEconomicsOptions {
  animalType: FinishingAnimalType;
  targetWeightKg: number;
  silageDMD: number;
  concentratePriceEurPerTonne: number;
  cattlePriceEurPerKgCarcass: number;
  killOutPct?: number;
  /** Injectable for deterministic tests; defaults to the real clock. */
  today?: Date;
}

/**
 * Composes the finishing budget and sell-now-vs-finish comparison into
 * the LivestockEconomics shape the Livestock Economics screen renders.
 * Only the "Concentrates" cost-breakdown driver is computed for real here
 * — silage/minerals/bedding-housing (docs/feed-engine.md's other required
 * drivers) aren't in this workbook and are left out rather than filled
 * with a stale placeholder next to a real number.
 *
 * Returns undefined when the group has no tracked average weight to
 * budget from (e.g. a newly-added group before it's been weighed).
 */
export function calculateLivestockEconomics(
  group: LivestockGroup,
  options: LivestockEconomicsOptions,
): LivestockEconomics | undefined {
  const currentWeightKg = group.avgWeightKg?.value;
  if (currentWeightKg === undefined) return undefined;

  const killOutPct = options.killOutPct ?? FINISHING_KILL_OUT_PCT;
  const headCount = group.count.value;

  const budget = calculateFinishingBudget({
    animalType: options.animalType,
    currentWeightKg,
    targetWeightKg: options.targetWeightKg,
    silageDMD: options.silageDMD,
    concentratePriceEurPerTonne: options.concentratePriceEurPerTonne,
  });

  const sellNowVsFinish = calculateSellNowVsFinish({
    currentWeightKg,
    targetWeightKg: options.targetWeightKg,
    killOutPct,
    cattlePriceEurPerKgCarcass: options.cattlePriceEurPerKgCarcass,
    remainingFeedCostToFinishEurPerHead: budget.feedCostPerHeadEur,
  });

  const today = options.today ?? new Date();
  const targetDate = new Date(today.getTime() + budget.daysToFinish * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const perHeadPerDayEur = (budget.concentrateKgPerHeadDay / 1000) * options.concentratePriceEurPerTonne;
  const finishIsBetter = sellNowVsFinish.finishNetValueEurPerHead > sellNowVsFinish.sellNowValueEurPerHead;

  const costBreakdown: CostBreakdownItem[] = [
    {
      label: "Concentrates",
      costPerHeadEur: Math.round(budget.feedCostPerHeadEur),
      totalGroupEur: Math.round(budget.feedCostPerHeadEur * headCount),
    },
  ];

  return {
    groupId: group.id,
    targetWeightKg: options.targetWeightKg,
    targetDate,
    currentValueEur: tracked(
      Math.round(sellNowVsFinish.sellNowValueEurPerHead),
      "estimated",
      "Farm Return livestock valuation",
      { calculationVersion: LIVESTOCK_ENGINE_VERSION },
    ),
    currentFeedCost: {
      perHeadPerDayEur: Math.round(perHeadPerDayEur * 100) / 100,
      totalGroupPerDayEur: Math.round(perHeadPerDayEur * headCount * 100) / 100,
      // No historical price/feed tracking exists yet — 0 ("no known
      // change") rather than a fabricated week-over-week delta.
      changeVsLastWeekEur: 0,
    },
    performanceForecast: {
      avgDailyGainKg: budget.targetADGKgDay,
      daysToFinish: budget.daysToFinish,
      forecastSaleValueEur: Math.round(sellNowVsFinish.forecastSaleValueEurPerHead),
    },
    costBreakdown,
    marginOutlook: {
      sellNowEur: Math.round(sellNowVsFinish.sellNowValueEurPerHead),
      finishEur: Math.round(sellNowVsFinish.finishNetValueEurPerHead),
    },
    recommendation: finishIsBetter
      ? {
          title: "Finishing is forecast to return more than selling now",
          description: `At current concentrate and cattle prices, finishing to ${options.targetWeightKg}kg is forecast to net more per head than selling today.`,
        }
      : {
          title: "Selling now is forecast to return more than finishing",
          description: `The forecast cost to finish to ${options.targetWeightKg}kg outweighs the extra sale value at current prices.`,
        },
  };
}
