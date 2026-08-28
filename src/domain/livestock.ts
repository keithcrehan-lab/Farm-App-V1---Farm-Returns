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
import { blockedInsufficientEvidence, ok, type EngineOutcome } from "./evidence";

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

/**
 * V3 FIX (SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md §2.7, conflict #2 —
 * the highest-confidence, most concretely-tested conflict in the whole
 * audit): this used to linearly interpolate between the table's published
 * DMD breakpoints (66/68/70/72/74/76) and clamp at the range's ends for
 * anything outside it. `calculation_contracts.csv`'s own
 * `DMD_CONCENTRATE_GUIDANCE` row is explicit: "exact lookup only in
 * validated Teagasc DMD table... No interpolation... without validated
 * evidence" — and `FARM_RETURN_SCIENTIFIC_CALCULATION_SPEC.md` §I5 names
 * this exact scenario: "DMD 73 does not automatically get interpolated
 * between 72 and 74 in production." `GFT115` requires
 * `DMD:73 -> BLOCK_EXACT_LOOKUP`. Only an exact match to a published row
 * now returns a value — no interpolation, no boundary clamp/extrapolation
 * either (a DMD below 66 or above 76 is equally absent from the table, not
 * a defensible "nearest row" substitute).
 *
 * `GFT116` ("wrong animal class rejected") is not a runtime test here:
 * `FinishingAnimalType` is a closed 3-value union
 * ("weanling" | "finishing_steer" | "finishing_heifer"), so GFT116's
 * literal `"suckler_cow"` scenario cannot type-check at all — the same
 * compile-time guarantee `fodder-budget.ts` documents for `GFT098`'s
 * "alpaca" scenario.
 */
export function concentrateKgPerDay(animalType: FinishingAnimalType, silageDMD: number): EngineOutcome<number> {
  const points = CONCENTRATE_TABLE[animalType].byDMD;
  const exactMatch = points.find(([dmd]) => dmd === silageDMD);
  if (exactMatch === undefined) {
    return blockedInsufficientEvidence("BLOCK_EXACT_LOOKUP", [
      `silage DMD matching a published TEAGASC_DAIRYBEEF_DMD row for ${animalType} (${points.map(([dmd]) => dmd).join(", ")})`,
    ]);
  }
  return ok(exactMatch[1], "MEASURED");
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
 *
 * daysToFinish rounds UP (Math.ceil), not to nearest — confirmed by the v4
 * workbook's own "Steer_3_Strategy" worked calculator, whose three
 * days-to-target figures (187/127/111) only reproduce exactly with
 * ceiling, not rounding (weightGain/ADG lands a few hundredths under each
 * of those integers). Agronomically correct too: an animal hasn't reached
 * its target weight partway through a day, so a fractional day always
 * rounds up, never down.
 *
 * Returns `EngineOutcome<FinishingBudgetResult>`, not a bare result — V3
 * fix (audit conflict #2): `concentrateKgPerDay` now fails closed for a
 * `silageDMD` that isn't an exact published table row, and that failure
 * must propagate here rather than being silently absorbed into a
 * budget number computed from a guessed concentrate rate.
 */
export function calculateFinishingBudget(input: FinishingBudgetInput): EngineOutcome<FinishingBudgetResult> {
  const targetADGKgDay = input.targetADGKgDay ?? targetADGForAnimalType(input.animalType);
  const weightGainKg = Math.max(0, input.targetWeightKg - input.currentWeightKg);
  const daysToFinish = targetADGKgDay > 0 ? Math.ceil(weightGainKg / targetADGKgDay) : 0;
  const concentrateOutcome = concentrateKgPerDay(input.animalType, input.silageDMD);
  if (concentrateOutcome.status !== "OK") return concentrateOutcome;
  const concentrateKgPerHeadDay = concentrateOutcome.value;
  const totalConcentrateKgPerHead = concentrateKgPerHeadDay * daysToFinish;
  const feedCostPerHeadEur = (totalConcentrateKgPerHead / 1000) * input.concentratePriceEurPerTonne;
  return ok(
    { targetADGKgDay, daysToFinish, concentrateKgPerHeadDay, totalConcentrateKgPerHead, feedCostPerHeadEur },
    "DERIVED",
  );
}

/**
 * How a group's current/target weight becomes a real € value — two real,
 * distinct mechanisms, not one price applied everywhere:
 * - `per_kg_carcass`: `weightKg x killOutPct x €/kg carcass` — the Bord
 *   Bia-style abattoir price this app already used for finishing groups
 *   (kill-out yield applies because the animal is sold dead-weight).
 * - `mart_price_per_head`: a real CSO live-mart price for an animal in
 *   that weight band, already a whole-head € figure (`src/domain/market.ts`
 *   — no kill-out/weight multiplication, that conversion is already priced
 *   into what buyers actually paid at that band). Needed because CSO's
 *   real series report live-mart weight-band prices, not €/kg-carcass —
 *   the two aren't interchangeable, and multiplying a mart price by
 *   `killOutPct` a second time would double-count the yield the market
 *   price already reflects.
 */
export type LivestockEconomicsPricing =
  | { kind: "per_kg_carcass"; cattlePriceEurPerKgCarcass: number; killOutPct?: number }
  | { kind: "mart_price_per_head"; sellNowValueEurPerHead: number; forecastSaleValueEurPerHead: number };

export interface SellNowVsFinishInput {
  currentWeightKg: number;
  targetWeightKg: number;
  pricing: LivestockEconomicsPricing;
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
  let sellNowValueEurPerHead: number;
  let forecastSaleValueEurPerHead: number;
  if (input.pricing.kind === "per_kg_carcass") {
    const killOutPct = input.pricing.killOutPct ?? FINISHING_KILL_OUT_PCT;
    sellNowValueEurPerHead = input.currentWeightKg * killOutPct * input.pricing.cattlePriceEurPerKgCarcass;
    forecastSaleValueEurPerHead = input.targetWeightKg * killOutPct * input.pricing.cattlePriceEurPerKgCarcass;
  } else {
    sellNowValueEurPerHead = input.pricing.sellNowValueEurPerHead;
    forecastSaleValueEurPerHead = input.pricing.forecastSaleValueEurPerHead;
  }
  const finishNetValueEurPerHead = forecastSaleValueEurPerHead - input.remainingFeedCostToFinishEurPerHead;
  return { sellNowValueEurPerHead, finishNetValueEurPerHead, forecastSaleValueEurPerHead };
}

export interface LivestockEconomicsOptions {
  animalType: FinishingAnimalType;
  targetWeightKg: number;
  silageDMD: number;
  concentratePriceEurPerTonne: number;
  pricing: LivestockEconomicsPricing;
  /** Injectable for deterministic tests; defaults to the real clock. */
  today?: Date;
}

/**
 * Real, sourced targets for the weanling variable-ADG comparison — the
 * workbook's own "Optimiser_Calculator" worked example was built around
 * this exact farm's weanling starting weight (335kg, mock-farm.ts's
 * lg-weanlings), targeting 420kg over a winter; concentrate price
 * EUR350/t matches that same sheet. Shared by the Feed Optimiser screen,
 * `FINISHING_OPTIONS` below, and `src/domain/finance.ts`'s whole-farm feed
 * cost total. Declared here (ahead of `FINISHING_OPTIONS`, not down by the
 * strategy-comparison code that motivates them) purely because
 * `FINISHING_OPTIONS`'s own weanling entry now needs them at module-eval
 * time — a top-level `const` isn't hoisted the way a function is.
 */
export const WEANLING_STRATEGY_TARGET_WEIGHT_KG = 420;
export const WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE = 350;

/**
 * Finishing-budget assumptions per group — real, sourced values (Farm
 * Return Teagasc Animal Nutrition Database: DMD-Concentrate + the
 * workbook's own worked Feed-Calculator example), not fabricated. Only
 * groups this dataset covers a finishing concentrate table for get a real
 * economics view; the Livestock list (hasEconomics link gate), the Feed
 * Optimiser summary card, and `src/domain/finance.ts`'s whole-farm feed
 * cost total all share this one registry rather than each re-deciding
 * which groups have a model.
 *
 * `silageDMD: 72` for both groups is this app's one established farm-wide
 * silage-quality assumption (`SilagePlan` carries no per-field DMD of its
 * own yet) — reused here for consistency, not picked fresh per group.
 * Weanlings share the Continental Steers' 72 rather than introducing a
 * second unsourced number.
 */
/**
 * Codex remediation Priority 4 — re-keyed by `FinishingAnimalType`, not by
 * a fixed mock group id ("lg-continental-steers"/"lg-weanlings"). Any real
 * farm's own group whose category/goal classifies to one of these two
 * animal types (`classifyFinishingAnimalType` below) now gets a real
 * economics/strategy model — not just two specific demo groups. No entry
 * exists for "finishing_heifer": the underlying Teagasc workbook this
 * registry traces to (this file's own header) has no matching
 * targetWeightKg/concentratePriceEurPerTonne worked example for heifers,
 * so one is not invented — a heifer group correctly classifies (the ADG-
 * by-DMD curve in `CONCENTRATE_TABLE` above is real for heifers) but then
 * hits `finishingOptionsForGroup`'s own `BLOCKED_INSUFFICIENT_EVIDENCE`
 * for lack of a full budget.
 *
 * `targetWeightKg` remains this registry's one deliberately un-generalised
 * value: the Teagasc worked example these numbers trace to was built
 * around specific starting weights (this app's demo Steers/Weanlings
 * groups), not a universal "grow every weanling to 420kg" rule. A real
 * farm's own group with a materially different starting weight still gets
 * routed here today (documented, not silently patched) — a genuine
 * farmer-entered per-group target weight is real follow-up work, tracked
 * in `docs/codex-remediation/REMEDIATION_LOG.md` rather than guessed at
 * here.
 */
export const FINISHING_OPTIONS: Partial<Record<FinishingAnimalType, Omit<LivestockEconomicsOptions, "pricing">>> = {
  finishing_steer: {
    animalType: "finishing_steer",
    targetWeightKg: 650,
    silageDMD: 72,
    concentratePriceEurPerTonne: 350,
  },
  weanling: {
    animalType: "weanling",
    targetWeightKg: WEANLING_STRATEGY_TARGET_WEIGHT_KG,
    silageDMD: 72,
    concentratePriceEurPerTonne: WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE,
  },
};

/**
 * Codex remediation Priority 4 — real livestock-group routing. Replaces
 * fixed mock-id matching (`group.id === "lg-weanlings"`, etc.) everywhere
 * the app decides whether a group has a finishing/growing feed-cost model:
 * `feed-optimiser/page.tsx`, `LivestockEconomicsView.tsx`,
 * `LivestockPageClient.tsx`, `finance.ts`'s whole-farm feed-cost total.
 * Works identically for a real Supabase UUID-backed group and a mock one —
 * neither this function nor its callers ever inspect `group.id`.
 *
 * Eligibility is real livestock characteristics only (category + goal),
 * never inferred from a name/id. An unsupported category/goal combination
 * fails closed with the specific missing input named, not silently treated
 * as "zero cost"/"no group".
 */
export function classifyFinishingAnimalType(group: LivestockGroup): EngineOutcome<FinishingAnimalType> {
  if (group.category === "weanling") return ok("weanling", "DERIVED");
  if (group.category === "steer") {
    if (group.goal === "finish_slaughter") return ok("finishing_steer", "DERIVED");
    return blockedInsufficientEvidence("UNSUPPORTED_LIVESTOCK_CATEGORY_FOR_FEED_MODEL", ["goal (finish_slaughter)"]);
  }
  if (group.category === "heifer") {
    if (group.goal === "finish_slaughter") return ok("finishing_heifer", "DERIVED");
    return blockedInsufficientEvidence("UNSUPPORTED_LIVESTOCK_CATEGORY_FOR_FEED_MODEL", ["goal (finish_slaughter)"]);
  }
  return blockedInsufficientEvidence("UNSUPPORTED_LIVESTOCK_CATEGORY_FOR_FEED_MODEL", [
    "category (weanling, or steer/heifer with goal finish_slaughter)",
  ]);
}

/**
 * Composes `classifyFinishingAnimalType` with `FINISHING_OPTIONS` into the
 * one function every real call site uses — a group can fail closed at
 * either step (unsupported category/goal, or a supported animal type this
 * registry still has no full budget for, e.g. finishing_heifer today).
 */
export function finishingOptionsForGroup(group: LivestockGroup): EngineOutcome<Omit<LivestockEconomicsOptions, "pricing">> {
  const animalType = classifyFinishingAnimalType(group);
  if (animalType.status !== "OK") return animalType;
  const options = FINISHING_OPTIONS[animalType.value];
  if (!options) {
    return blockedInsufficientEvidence("UNSUPPORTED_LIVESTOCK_CATEGORY_FOR_FEED_MODEL", [
      `finishing budget for animal type "${animalType.value}"`,
    ]);
  }
  return ok(options, "IRISH_DEFAULT");
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
 * budget from (e.g. a newly-added group before it's been weighed), OR
 * (V3 fix, audit conflict #2) when `options.silageDMD` isn't an exact
 * published Teagasc DMD-table row — `calculateFinishingBudget` now fails
 * closed in that case rather than silently interpolating, and that must
 * not be absorbed into a plausible-looking economics card here. Both
 * cases collapse to the same `undefined` the screen already treats as
 * "nothing to show" — a distinct, farmer-visible "DMD not on the
 * validated table" message is a Reports/UI-surfacing follow-up, not
 * addressed in this phase (kept explicit in the audit trail rather than
 * silently improved on).
 */
export function calculateLivestockEconomics(
  group: LivestockGroup,
  options: LivestockEconomicsOptions,
): LivestockEconomics | undefined {
  const currentWeightKg = group.avgWeightKg?.value;
  if (currentWeightKg === undefined) return undefined;

  const headCount = group.count.value;

  const budgetOutcome = calculateFinishingBudget({
    animalType: options.animalType,
    currentWeightKg,
    targetWeightKg: options.targetWeightKg,
    silageDMD: options.silageDMD,
    concentratePriceEurPerTonne: options.concentratePriceEurPerTonne,
  });
  if (budgetOutcome.status !== "OK") return undefined;
  const budget = budgetOutcome.value;

  const sellNowVsFinish = calculateSellNowVsFinish({
    currentWeightKg,
    targetWeightKg: options.targetWeightKg,
    pricing: options.pricing,
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
    // Math.ceil, not round — see calculateFinishingBudget's doc comment
    // for why (confirmed by the v4 workbook's own worked calculator).
    const daysToFinish = dailyGainKg > 0 ? Math.ceil(weightGainKg / dailyGainKg) : 0;
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

// ---------------------------------------------------------------------------
// Continental steer variable-ADG optimiser (v4 workbook, sheets
// "Steer_Trial_Evidence" and "Steer_3_Strategy") — closes the last "still
// Phase 1 mock" strategy comparison this app had.
// ---------------------------------------------------------------------------

/**
 * Real Teagasc experimental evidence points, matching exactly the three
 * the workbook's own "Steer_3_Strategy" worked optimiser uses — not a
 * single smooth curve fitted across trials, but three specific published
 * arms from TWO different trials in the same source paper:
 *
 * - 0 kg/day -> 0.655 ADG: "Duration trial", silage-only arm, overall
 *   0-147 day period.
 * - 5 kg/day -> 0.968 ADG: "Pattern trial", FLAT arm (constant 5kg/day
 *   throughout), overall 0-126 day period.
 * - 6 kg/day -> 1.101 ADG: "Duration trial", silage + 6kg/day arm,
 *   overall 0-147 day period.
 *
 * Evidence class B-RESEARCH. Source: Teagasc, "Response in Beef Cattle to
 * Concentrate Feeding in Winter" (Mar 2001) — the workbook's own caveat,
 * carried into this comment and the UI: "the three strategies use genuine
 * Teagasc experimental response points but are not directly comparable
 * treatments from one single modern trial... label the outputs as
 * modelled scenarios, not Teagasc recommendations."
 */
export const STEER_VARIABLE_ADG_POINTS: readonly {
  concentrateKgDay: number;
  observedADGKgDay: number;
  trial: string;
}[] = [
  { concentrateKgDay: 0, observedADGKgDay: 0.655, trial: "Duration trial, silage-only arm (0-147 days)" },
  { concentrateKgDay: 5, observedADGKgDay: 0.968, trial: "Pattern trial, flat 5kg/day arm (0-126 days)" },
  { concentrateKgDay: 6, observedADGKgDay: 1.101, trial: "Duration trial, silage + 6kg/day arm (0-147 days)" },
];

/** Same interpolation/clamp convention as `weanlingADGForConcentrateKgDay`
 * — clamped at 0 and 6 kg/day, the observed range's ends. */
export function steerADGForConcentrateKgDay(concentrateKgDay: number): number {
  const points = STEER_VARIABLE_ADG_POINTS;
  if (concentrateKgDay <= points[0].concentrateKgDay) return points[0].observedADGKgDay;
  const last = points[points.length - 1];
  if (concentrateKgDay >= last.concentrateKgDay) return last.observedADGKgDay;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (concentrateKgDay >= a.concentrateKgDay && concentrateKgDay <= b.concentrateKgDay) {
      const t = (concentrateKgDay - a.concentrateKgDay) / (b.concentrateKgDay - a.concentrateKgDay);
      return a.observedADGKgDay + t * (b.observedADGKgDay - a.observedADGKgDay);
    }
  }
  return last.observedADGKgDay;
}

/** Same €350/t concentrate price used throughout this farm's steer
 * budgets (Steer_2026_Budget, Steer_3_Strategy, and the existing
 * FINISHING_OPTIONS entry above). */
export const STEER_CONCENTRATE_PRICE_EUR_PER_TONNE = 350;

const STEER_STRATEGY_POINTS: { id: FeedStrategy["id"]; label: string; concentrateKgDay: number }[] = [
  { id: "lowest_cost", label: "Lowest cost", concentrateKgDay: 0 },
  { id: "balanced", label: "Balanced", concentrateKgDay: 5 },
  { id: "faster_finish", label: "Faster finish", concentrateKgDay: 6 },
];

export interface SteerConcentrateStrategiesInput {
  currentWeightKg: number;
  targetWeightKg: number;
  concentratePriceEurPerTonne: number;
}

/**
 * Real three-strategy continental steer feed comparison — the piece that
 * kept this specific strategy card Phase 1 mock even after Weanlings went
 * real, for lack of any variable-ADG-by-concentrate evidence for finishing
 * cattle. Same convention as `calculateWeanlingConcentrateStrategies`:
 * days-to-target from real weight-gain / real ADG at each evidence point,
 * so strategies genuinely diverge rather than sharing one assumed
 * outcome. Reproduces the workbook's own "Steer_3_Strategy" worked
 * example exactly when given its own 590kg -> 712kg inputs (187/127/111
 * days) — see src/domain/livestock.test.ts.
 *
 * Only a single "Concentrate" ingredient line is shown (not a Silage +
 * Concentrate breakdown like the old mock had): the Duration trial (the
 * source for the Lowest-cost and Faster-finish points) doesn't report a
 * companion silage DM intake figure, so a full ration breakdown isn't
 * available consistently across all three strategies without inventing
 * the missing two.
 *
 * "Balanced" is marked recommended, not the highest-margin strategy: the
 * workbook's own margin figures for these three (all near-identical,
 * since revenue is the same target carcass weight regardless of strategy)
 * explicitly exclude silage cost, mortality, and overheads — its own
 * "Key caveat" text says so — so a naive margin comparison here would
 * favour Lowest-cost for reasons the source data itself warns aren't
 * fully modelled yet.
 */
export function calculateSteerConcentrateStrategies(input: SteerConcentrateStrategiesInput): FeedStrategy[] {
  const weightGainKg = Math.max(0, input.targetWeightKg - input.currentWeightKg);

  return STEER_STRATEGY_POINTS.map((point) => {
    const dailyGainKg = steerADGForConcentrateKgDay(point.concentrateKgDay);
    const daysToFinish = dailyGainKg > 0 ? Math.ceil(weightGainKg / dailyGainKg) : 0;
    const feedCostPerHeadDayEur = (point.concentrateKgDay / 1000) * input.concentratePriceEurPerTonne;
    const totalCostPerHeadEur = feedCostPerHeadDayEur * daysToFinish;

    return {
      id: point.id,
      label: point.label,
      recommended: point.id === "balanced",
      ingredientsKgDay: [{ label: "Concentrate", kgDay: point.concentrateKgDay }],
      dailyGainKg,
      daysToFinish,
      feedCostPerHeadDayEur: Math.round(feedCostPerHeadDayEur * 100) / 100,
      totalCostPerHeadEur: Math.round(totalCostPerHeadEur),
      note:
        point.id === "balanced"
          ? "Pattern trial's flat 5kg/day arm — real Teagasc experimental evidence, not a universal recommendation (evidence class B-RESEARCH)."
          : undefined,
    };
  });
}
