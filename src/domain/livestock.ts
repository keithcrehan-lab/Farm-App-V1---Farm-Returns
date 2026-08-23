/**
 * Livestock feed-cost & sell-now-vs-finish economics — Phase 4 "free
 * livestock feed-cost layer" (docs/feed-engine.md). Every numeric constant
 * here traces to a named sheet/row in the "Farm Return Teagasc Animal
 * Nutrition Database" the user supplied (a Teagasc-sourced workbook — see
 * docs/evidence-register.md for the specific article per table).
 *
 * First pass (v2 workbook): the finishing concentrate budget
 * (DMD-Concentrate sheet) and the sell-now-vs-finish comparison
 * docs/feed-engine.md specifies as a standalone pure function ("current
 * market value now vs forecast sale value at target date minus remaining
 * cost to finish").
 *
 * Second pass (v3 workbook): the three-strategy optimiser's real blocker
 * was that no published table varied ADG by concentrate level — every DMD
 * table fixes a target ADG and varies concentrate by silage quality
 * instead. The v3 workbook's `Optimiser_ADG_Evidence` sheet closes that
 * specific gap for weanlings with three real trial observations (0, 1.5,
 * 3 kg/head/day concentrate -> 0.176, 0.664, 0.859 kg/day ADG, a 122-day
 * Teagasc research trial — evidence class B, "empirical response
 * evidence, not universal recommendation", so used only within its
 * observed 0-3kg concentrate range, never extrapolated past it).
 *
 * Third pass (same v3 workbook, sheet `Suckler_Cow_Rules`): real winter
 * feeding rules for suckler cows by calving system/stock class, sourced to
 * a Teagasc Future Beef demonstration farm update — see
 * `SUCKLER_COW_WINTER_RULES`. Also this pass: `FINISHING_OPTIONS` and the
 * weanling strategy target/price now live here rather than in the two view
 * files that first defined them, so `src/domain/finance.ts`'s whole-farm
 * concentrate feed-cost aggregation can reuse the exact same per-farm
 * assumptions instead of re-declaring them a third time.
 *
 * Still not built — no equivalent variable-ADG evidence exists for
 * finishing steers/heifers, so their strategy comparison stays Phase 1
 * mock: silage/minerals/bedding cost drivers and sales revenue/cashflow
 * forecasting also remain unbuilt for lack of a real source.
 */

import { tracked } from "./types";
import type { CostBreakdownItem, FeedStrategy, LivestockEconomics, LivestockGroup } from "./types";

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
 * Finishing-budget assumptions per group — real, sourced values (Farm
 * Return Teagasc Animal Nutrition Database: DMD-Concentrate + the
 * workbook's own worked Feed-Calculator example), not fabricated. Only
 * groups this dataset covers a finishing concentrate table for get a real
 * economics view; the Livestock list (hasEconomics link gate), the Feed
 * Optimiser summary card, and `src/domain/finance.ts`'s whole-farm feed
 * cost total all share this one registry rather than each re-deciding
 * which groups have a model.
 */
export const FINISHING_OPTIONS: Record<string, Omit<LivestockEconomicsOptions, "cattlePriceEurPerKgCarcass">> = {
  "lg-continental-steers": {
    animalType: "finishing_steer",
    targetWeightKg: 650,
    silageDMD: 72,
    concentratePriceEurPerTonne: 350,
  },
};

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

// ---------------------------------------------------------------------------
// Weanling variable-ADG optimiser (v3 workbook, sheets "Optimiser_ADG_Evidence"
// and "Concentrate_Formulation")
// ---------------------------------------------------------------------------

/**
 * Sheet "Optimiser_ADG_Evidence": three real trial observations of weanling
 * concentrate level -> observed average daily gain, over a 122-day winter
 * feeding period on grass silage (Teagasc experimental comparison).
 * Evidence class B ("empirical response evidence, not universal
 * recommendation") — sourced to the Teagasc research repository, not a
 * current published advisory table like the DMD-Concentrate sheet above.
 * Source: https://t-stor.teagasc.ie/bitstreams/c45b906e-3c73-416e-b7d5-84ea54fd48eb/download
 */
export const WEANLING_ADG_EVIDENCE_WINDOW_DAYS = 122;
export const WEANLING_VARIABLE_ADG_POINTS: readonly [concentrateKgDay: number, observedADGKgDay: number][] = [
  [0, 0.176],
  [1.5, 0.664],
  [3, 0.859],
];

/**
 * Interpolates observed ADG for a concentrate level between the three
 * trial points, clamped at 0 and 3 kg/day — the evidence sheet is explicit
 * that these are single empirical response points, not to be extrapolated
 * beyond the observed range.
 */
export function weanlingADGForConcentrateKgDay(concentrateKgDay: number): number {
  const points = WEANLING_VARIABLE_ADG_POINTS;
  if (concentrateKgDay <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (concentrateKgDay >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i++) {
    const [kgA, adgA] = points[i];
    const [kgB, adgB] = points[i + 1];
    if (concentrateKgDay >= kgA && concentrateKgDay <= kgB) {
      const t = (concentrateKgDay - kgA) / (kgB - kgA);
      return adgA + t * (adgB - adgA);
    }
  }
  return last[1];
}

/**
 * Sheet "Concentrate_Formulation": "Teagasc Grange Standard Concentrate
 * Formulation" — g/kg fresh weight, published July 2026.
 */
export const CONCENTRATE_FORMULATION_PCT = {
  rolledBarley: 0.862,
  soyaBeanMeal: 0.06,
  molasses: 0.05,
  mineralsVitamins: 0.028,
} as const;

/** Splits a total concentrate kg/day into the standard ration's ingredients. */
export function concentrateIngredientsKgDay(totalKgDay: number): { label: string; kgDay: number }[] {
  return [
    { label: "Rolled Barley", kgDay: totalKgDay * CONCENTRATE_FORMULATION_PCT.rolledBarley },
    { label: "Soya Bean Meal", kgDay: totalKgDay * CONCENTRATE_FORMULATION_PCT.soyaBeanMeal },
    { label: "Molasses", kgDay: totalKgDay * CONCENTRATE_FORMULATION_PCT.molasses },
    { label: "Minerals & Vitamins", kgDay: totalKgDay * CONCENTRATE_FORMULATION_PCT.mineralsVitamins },
  ];
}

export interface WeanlingConcentrateStrategiesInput {
  currentWeightKg: number;
  targetWeightKg: number;
  concentratePriceEurPerTonne: number;
}

/**
 * The three real evidence points from `WEANLING_VARIABLE_ADG_POINTS` used
 * directly as the "Lowest cost / Balanced / Faster finish" strategy set —
 * no interpolation is needed since the evidence sheet already publishes
 * exactly three concentrate levels, spanning the observed range end to
 * end. `weanlingADGForConcentrateKgDay` above still exists for any
 * in-between concentrate level a future screen might let a farmer choose.
 */
const WEANLING_STRATEGY_POINTS: { id: FeedStrategy["id"]; label: string; concentrateKgDay: number }[] = [
  { id: "lowest_cost", label: "Lowest cost", concentrateKgDay: 0 },
  { id: "balanced", label: "Balanced", concentrateKgDay: 1.5 },
  { id: "faster_finish", label: "Faster finish", concentrateKgDay: 3 },
];

/**
 * Real, sourced targets for the weanling variable-ADG comparison — the
 * workbook's own "Optimiser_Calculator" worked example was built around
 * this exact farm's weanling starting weight (335kg, mock-farm.ts's
 * lg-weanlings), targeting 420kg over a winter; concentrate price
 * EUR350/t matches that same sheet. Shared by the Feed Optimiser screen
 * and `src/domain/finance.ts`'s whole-farm feed cost total.
 */
export const WEANLING_STRATEGY_TARGET_WEIGHT_KG = 420;
export const WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE = 350;

/**
 * Real three-strategy weanling feed comparison, built from the variable-ADG
 * evidence above rather than a fixed-ADG DMD table — the piece the v2
 * workbook's `CONCENTRATE_TABLE` couldn't provide (README's "known gap").
 * Days-to-target follows the same weight-gain / ADG convention as
 * `calculateFinishingBudget`, so faster strategies genuinely finish sooner
 * here rather than sharing one fixed day count across strategies. Note the
 * evidence caveat: ADG was observed over a 122-day winter window
 * (`WEANLING_ADG_EVIDENCE_WINDOW_DAYS`) — the "Lowest cost" strategy's
 * ~0.18kg/day rate projects to roughly four times that window to reach a
 * typical winter target weight, which is a real result worth surfacing to
 * a farmer (a near-zero-meal strategy isn't a realistic single-winter
 * plan), not a modelling error.
 */
export function calculateWeanlingConcentrateStrategies(input: WeanlingConcentrateStrategiesInput): FeedStrategy[] {
  const weightGainKg = Math.max(0, input.targetWeightKg - input.currentWeightKg);

  return WEANLING_STRATEGY_POINTS.map((point) => {
    const dailyGainKg = weanlingADGForConcentrateKgDay(point.concentrateKgDay);
    const daysToFinish = dailyGainKg > 0 ? Math.round(weightGainKg / dailyGainKg) : 0;
    const feedCostPerHeadDayEur = (point.concentrateKgDay / 1000) * input.concentratePriceEurPerTonne;
    const totalCostPerHeadEur = feedCostPerHeadDayEur * daysToFinish;

    return {
      id: point.id,
      label: point.label,
      recommended: point.id === "balanced",
      ingredientsKgDay: concentrateIngredientsKgDay(point.concentrateKgDay),
      dailyGainKg,
      daysToFinish,
      feedCostPerHeadDayEur: Math.round(feedCostPerHeadDayEur * 100) / 100,
      totalCostPerHeadEur: Math.round(totalCostPerHeadEur),
      note:
        point.id === "balanced"
          ? "Midpoint of the observed concentrate response range — lands almost exactly on Teagasc's own 130-day first-winter example for this weight range."
          : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Weanling first-winter DMD -> concentrate table (v3 workbook, sheet
// "Weanling_DMD_ADG") — a distinct, more current source from the DMD-based
// weanling row in CONCENTRATE_TABLE above: this one targets first-winter
// weanlings specifically, at a wider/coarser DMD scale (60-75, not 66-76),
// and is what the workbook's own "Optimiser_Calculator" sheet uses.
// ---------------------------------------------------------------------------

/**
 * Sheet "Weanling_DMD_ADG": target ADG 0.6 kg/day, concentrate min/max/
 * midpoint kg/day by silage DMD. Source: Teagasc "First winter nutrition:
 * silage digestibility and concentrate supplementation to maximise
 * compensatory growth", published July 2026 — the current, primary source
 * for first-winter weanling feeding (evidence class A).
 */
const WEANLING_FIRST_WINTER_MIDPOINT_TABLE: [dmd: number, midpointKgDay: number][] = [
  [60, 2.5],
  [65, 1.75],
  [70, 1.25],
  [75, 0.5],
];

/** Same clamp-at-range-ends interpolation convention as `concentrateKgPerDay`. */
export function weanlingFirstWinterConcentrateKgPerDay(silageDMD: number): number {
  const points = WEANLING_FIRST_WINTER_MIDPOINT_TABLE;
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

export interface WeanlingFirstWinterBudgetInput {
  currentWeightKg: number;
  targetWeightKg: number;
  /** Unlike `calculateFinishingBudget`, the workbook's own calculator
   * takes the winter length as a direct input and derives the required
   * ADG from it, rather than the other way around. */
  targetDays: number;
  silageDMD: number;
  concentratePriceEurPerTonne: number;
}

export interface WeanlingFirstWinterBudgetResult {
  requiredADGKgDay: number;
  concentrateKgPerHeadDay: number;
  totalConcentrateKgPerHead: number;
  totalConcentrateTonnesPerHead: number;
  feedCostPerHeadEur: number;
}

/**
 * Reproduces the workbook's own "Optimiser_Calculator" worked example
 * exactly (335kg -> 420kg weanling, 130-day winter, 70 DMD, EUR350/t
 * concentrate => required ADG 0.6538kg/day, 1.25kg/day concentrate
 * midpoint, 5.2t total for 32 head, EUR1,820 concentrate cost) — see
 * src/domain/livestock.test.ts.
 */
export function calculateWeanlingFirstWinterBudget(
  input: WeanlingFirstWinterBudgetInput,
): WeanlingFirstWinterBudgetResult {
  const weightGainKg = Math.max(0, input.targetWeightKg - input.currentWeightKg);
  const requiredADGKgDay = input.targetDays > 0 ? weightGainKg / input.targetDays : 0;
  const concentrateKgPerHeadDay = weanlingFirstWinterConcentrateKgPerDay(input.silageDMD);
  const totalConcentrateKgPerHead = concentrateKgPerHeadDay * input.targetDays;
  const feedCostPerHeadEur = (totalConcentrateKgPerHead / 1000) * input.concentratePriceEurPerTonne;
  return {
    requiredADGKgDay,
    concentrateKgPerHeadDay,
    totalConcentrateKgPerHead,
    totalConcentrateTonnesPerHead: totalConcentrateKgPerHead / 1000,
    feedCostPerHeadEur,
  };
}

// ---------------------------------------------------------------------------
// Suckler cow winter feeding rules (v3 workbook, sheet "Suckler_Cow_Rules")
// ---------------------------------------------------------------------------

/**
 * Sheet "Suckler_Cow_Rules": winter feeding rules by calving system/stock
 * class, sourced to a Teagasc Future Beef demonstration-farm update
 * (evidence class A, "current Teagasc demonstration guidance" — but
 * explicitly a demonstration-farm rule, context-specific rather than a
 * universal recommendation, per the sheet's own notes).
 */
export type SucklerCowWinterClass = "autumn_calving_cow" | "autumn_calving_calf" | "dry_spring_calving_cow";

export interface SucklerCowWinterRule {
  silageDMDTarget: string;
  concentrateKgDayMin: number;
  concentrateKgDayMax: number;
  concentrateCPPct: number | null;
  objective: string;
}

export const SUCKLER_COW_WINTER_RULES: Record<SucklerCowWinterClass, SucklerCowWinterRule> = {
  autumn_calving_cow: {
    silageDMDTarget: ">70",
    concentrateKgDayMin: 1.5,
    concentrateKgDayMax: 1.5,
    concentrateCPPct: 14,
    objective: "Support milk production and early cycling",
  },
  autumn_calving_calf: {
    silageDMDTarget: ">70 for dam",
    concentrateKgDayMin: 0.5,
    concentrateKgDayMax: 1.0,
    concentrateCPPct: 15,
    objective: "Support calf growth (creep feed)",
  },
  dry_spring_calving_cow: {
    silageDMDTarget: "67-68",
    concentrateKgDayMin: 0,
    concentrateKgDayMax: 0,
    concentrateCPPct: null,
    objective: "Maintain appropriate condition economically",
  },
};

/** Midpoint of the published min/max range — 0 for the dry spring-calving
 * class, which the sheet gives no concentrate rate for at all (moderate-
 * quality silage alone is the guidance). */
export function sucklerCowConcentrateKgPerDay(stockClass: SucklerCowWinterClass): number {
  const rule = SUCKLER_COW_WINTER_RULES[stockClass];
  return (rule.concentrateKgDayMin + rule.concentrateKgDayMax) / 2;
}
