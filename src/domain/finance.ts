/**
 * Finance aggregation — Phase 4 ("silage/livestock/finance",
 * `docs/product-requirements.md` § Delivery phases). Exit gate:
 * "whole-farm forecast updates when field/livestock data changes."
 *
 * First pass, deliberately narrow: the whole-farm totals that can be
 * computed for real from data this app already holds or has a versioned
 * engine for — fertiliser spend (src/domain/nutrients.ts) and livestock
 * portfolio value (the farm store).
 *
 * Second pass: whole-farm concentrate feed cost, once src/domain/
 * livestock.ts had real per-group concentrate models to sum (see
 * calculateFarmConcentrateFeedCostEur below).
 *
 * Third pass: grass and silage cost, once src/domain/feed-cost.ts had real
 * Teagasc €/t DM benchmarks (see calculateFarmGrassAndSilageCostEur
 * below). Still Phase 1 mock: `docs/finance-engine.md`'s remaining
 * feed-cost driver (minerals/bedding-housing) and sales revenue/cashflow
 * forecasting need real supplier-cost and CSO/Bord Bia price *series* data
 * (not just current spot prices) this session doesn't have in hand — see
 * the README's "known gap" note. Those stay Phase 1 mock figures
 * (`@/data/mock-farm`) rather than being guessed.
 *
 * Fourth pass: Phase 6's Input Planner "forecast demand" line
 * (`withRealInputRequirements`, near the bottom of this file) — real
 * fertiliser and concentrate feed *tonnage*, not just €, from the same two
 * real engines above, replacing two of the screen's five mock rows. Lime,
 * bale wrap and "other" stay mock; the buying-group/supplier-quote half of
 * Phase 6 stays fully blocked (README: "Do not populate from invented
 * examples" — no live commercial source exists to build it from).
 */

import type { FeedCostBasis } from "./feed-cost";
import {
  calculateGrazedGrassCostEur,
  calculateSilageCostEur,
  calculateSucklerCowMineralCostEur,
  FEED_COST_ENGINE_VERSION,
  SUCKLER_DRY_COW_MINERAL_BENCHMARK,
} from "./feed-cost";
import {
  calculateFinishingBudget,
  calculateWeanlingConcentrateStrategies,
  sucklerCowConcentrateKgPerDay,
  FINISHING_OPTIONS,
  WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE,
  WEANLING_STRATEGY_TARGET_WEIGHT_KG,
} from "./livestock";
import { calculateNutrientPlan } from "./nutrients";
import { tracked } from "./types";
import type {
  BuyingOpportunity,
  Field,
  Housing,
  InputRequirement,
  LivestockGroup,
  SilagePlan,
  SlurryAllocation,
  TrackedValue,
} from "./types";

export const FINANCE_ENGINE_VERSION = "finance_engine_v1.0.0";

/** This farm's weanling and suckler-cow groups, by id (mock-farm.ts) —
 * used only to route each group to the right real concentrate model
 * below, the same way FINISHING_OPTIONS routes finishing groups. */
const WEANLING_GROUP_ID = "lg-weanlings";
const SUCKLER_COW_GROUP_ID = "lg-suckler-cows";

export interface FarmFertiliserCostInput {
  fields: Field[];
  livestockGroups: LivestockGroup[];
  slurryAllocations: SlurryAllocation[];
  /** Silage plans (still a static mock-farm.ts export — the domain-engine
   * output for *what* to cut/yield is a separate, not-yet-built concern
   * from the nutrient cost this function computes for whatever plan is
   * given). Fields with no matching plan are costed as grazing. */
  silagePlans: SilagePlan[];
}

export interface FarmFertiliserProductRequirement {
  name: string;
  npkAnalysis: string;
  totalTonnes: number;
  costEur: number;
}

export interface FarmFertiliserRequirement {
  /** Every purchased product any field needs, summed across all fields and
   * merged by product name — e.g. two fields both needing Protected Urea
   * become one "Protected Urea" line, not two. Real per-field tonnage
   * (`calculateNutrientPlan().purchasedProducts`), not a single opaque
   * total — the Input Planner needs "how much of what", not just "€X". */
  byProduct: FarmFertiliserProductRequirement[];
  totalTonnes: number;
  totalCostEur: number;
}

/**
 * Whole-farm chemical fertiliser requirement: runs `calculateNutrientPlan`
 * (nutrient_engine_v1.0.0) for every field and merges each field's real
 * `purchasedProducts` breakdown into one farm-wide by-product total. The
 * lower-level real figure `calculateFarmFertiliserCostEur` (below) and the
 * Input Planner's real Fertiliser row (`withRealInputRequirements`) both
 * build on this one aggregation rather than each re-summing fields
 * separately.
 */
export function calculateFarmFertiliserRequirement(input: FarmFertiliserCostInput): FarmFertiliserRequirement {
  const farmGrasslandAreaHa = input.fields.reduce((sum, f) => sum + f.areaHa, 0);
  const byProductMap = new Map<string, { npkAnalysis: string; totalKg: number; costEur: number }>();

  for (const field of input.fields) {
    const silagePlan = input.silagePlans.find((p) => p.fieldId === field.id);
    const slurryAllocation = input.slurryAllocations.find((a) => a.fieldId === field.id);
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa,
      livestockGroups: input.livestockGroups,
      slurryAllocation,
      silage: silagePlan
        ? { cutNumber: silagePlan.cutNumber, expectedYieldTDMha: silagePlan.expectedYieldTDMha.value }
        : undefined,
    });
    for (const product of plan.purchasedProducts) {
      const existing = byProductMap.get(product.name) ?? { npkAnalysis: product.npkAnalysis, totalKg: 0, costEur: 0 };
      existing.totalKg += product.totalKg;
      existing.costEur += product.costEur;
      byProductMap.set(product.name, existing);
    }
  }

  const byProduct = Array.from(byProductMap.entries()).map(([name, v]) => ({
    name,
    npkAnalysis: v.npkAnalysis,
    totalTonnes: Math.round((v.totalKg / 1000) * 100) / 100,
    costEur: Math.round(v.costEur),
  }));
  return {
    byProduct,
    totalTonnes: Math.round(byProduct.reduce((sum, p) => sum + p.totalTonnes, 0) * 100) / 100,
    totalCostEur: Math.round(byProduct.reduce((sum, p) => sum + p.costEur, 0)),
  };
}

/**
 * Whole-farm chemical fertiliser spend: the same real per-field nutrient-
 * engine cost `calculateFarmFertiliserRequirement` sums, as a single
 * `TrackedValue`. The first genuinely live-recomputed whole-farm total in
 * the app — change a field's P/K index, add a field, or change the herd
 * (which shifts the grazing stocking rate every field's N requirement
 * depends on) and this number changes with it, not just the one field's
 * own Fertiliser Plan screen.
 */
export function calculateFarmFertiliserCostEur(input: FarmFertiliserCostInput): TrackedValue<number> {
  const total = calculateFarmFertiliserRequirement(input).totalCostEur;
  return tracked(Math.round(total), "estimated", "Farm Return nutrient engine", {
    calculationVersion: FINANCE_ENGINE_VERSION,
  });
}

/**
 * Whole-farm slurry nutrient replacement value — the gap this file's own
 * Finance screen has flagged since it first shipped ("Slurry's cash-
 * equivalent value isn't computed yet"). No new evidence needed: for every
 * field with a real, applicable slurry allocation (`priority !==
 * "not_suitable"`, `volumeM3 > 0`), this runs `calculateNutrientPlan`
 * *twice* — once with that field's real slurry allocation, once with none
 * — and takes the difference in `estimatedFieldCostEur`. That difference
 * is exactly "how much less chemical fertiliser this field needed to buy
 * because slurry supplied part of its real N/P/K requirement", using the
 * same real Green Book/NAP tables and product prices `calculateNutrientPlan`
 * already relies on for every other real figure in this app — not a
 * separate €/kg-nutrient rate invented for this one purpose.
 *
 * Deliberately distinct from — and doesn't need — the still-mock slurry
 * *volume* estimate on the Housing screen (`Housing.slurryEstimate`,
 * `slurry_engine_v1.0.0 (mock)`): that one is "how much slurry will this
 * shed produce" (needs a real excretion-rate coefficient this session
 * doesn't have in hand); this is "given the volume already allocated to a
 * field, what did applying it there save" — a fully separate, already-
 * answerable question.
 */
export function calculateFarmSlurryNutrientValueEur(input: FarmFertiliserCostInput): TrackedValue<number> {
  const farmGrasslandAreaHa = input.fields.reduce((sum, f) => sum + f.areaHa, 0);
  let total = 0;

  for (const field of input.fields) {
    const slurryAllocation = input.slurryAllocations.find((a) => a.fieldId === field.id);
    if (!slurryAllocation || slurryAllocation.priority === "not_suitable" || slurryAllocation.volumeM3 <= 0) continue;

    const silagePlan = input.silagePlans.find((p) => p.fieldId === field.id);
    const silage = silagePlan
      ? { cutNumber: silagePlan.cutNumber, expectedYieldTDMha: silagePlan.expectedYieldTDMha.value }
      : undefined;

    const withSlurry = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa,
      livestockGroups: input.livestockGroups,
      slurryAllocation,
      silage,
    });
    const withoutSlurry = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa,
      livestockGroups: input.livestockGroups,
      slurryAllocation: undefined,
      silage,
    });
    total += withoutSlurry.estimatedFieldCostEur - withSlurry.estimatedFieldCostEur;
  }

  return tracked(Math.round(total), "estimated", "Farm Return nutrient engine (slurry offset)", {
    calculationVersion: FINANCE_ENGINE_VERSION,
  });
}

/**
 * Whole-farm livestock portfolio value: sums each group's own tracked
 * value (farmer-confirmed headcount x an estimated per-head value — see
 * src/store/farm-store.tsx's addLivestockGroup). A thin, versioned wrapper
 * rather than inline arithmetic in a component (CLAUDE.md: "never place
 * ...formulas inside React components"), even though the sum itself is
 * simple — so Finance-facing consumers share one definition of "portfolio
 * value" with the rest of the domain layer, not a second copy of the sum.
 */
export function calculateLivestockPortfolioValueEur(livestockGroups: LivestockGroup[]): TrackedValue<number> {
  const total = livestockGroups.reduce((sum, g) => sum + g.value.value, 0);
  return tracked(Math.round(total), "estimated", "Farm Return livestock valuation", {
    calculationVersion: FINANCE_ENGINE_VERSION,
  });
}

/**
 * Whole-farm concentrate feed cost — sums the real, sourced concentrate
 * budget for every livestock group this app has a model for:
 * - Finishing groups in `FINISHING_OPTIONS` (currently Continental
 *   Steers): the full concentrate budget to reach their target weight
 *   (`calculateFinishingBudget`).
 * - The weanling group: the "Balanced" strategy's full winter concentrate
 *   budget (`calculateWeanlingConcentrateStrategies`) — the same midpoint
 *   the Feed Optimiser screen marks "Recommended".
 * - The suckler cow group: the real "Dry spring-calving cows" winter rule
 *   (`SUCKLER_COW_WINTER_RULES`) — this farm's suckler herd is a spring-
 *   calving calf-to-beef system, the same system `nutrients.ts` already
 *   assumes for its N-timing table, which the source data gives zero
 *   concentrate for on moderate-quality silage. A real, sourced zero, not
 *   an omission.
 *
 * Deliberately partial: groups with no real concentrate model (calves,
 * replacement heifers) are left out of the total rather than filled with
 * a guess — this is a floor on real concentrate spend, not the whole
 * farm's feed bill (README's "known gap": silage/grass/minerals cost
 * drivers still aren't real). Each group's figure is a cost-to-complete
 * (to target weight for steers/weanlings; the standing winter rate for
 * suckler cows), not a same-period run-rate — the same estimate-not-
 * bookkeeping nature as `calculateFarmFertiliserCostEur` above.
 */
/**
 * Real Mode Completion Phase 15 — "How was this calculated?" drill-down:
 * a feed-cost total must be "traceable to livestock numbers; requirement;
 * quantity; unit price; source/assumption; formula... driven by the same
 * data used to create the number" (brief), not a hard-coded explanation.
 * `byGroup` is exactly the per-group contribution this function already
 * computed internally — surfaced, not recomputed separately, so the
 * drill-down can never drift from the total it explains.
 */
export interface FarmConcentrateFeedCostBreakdown {
  total: TrackedValue<number>;
  byGroup: { groupId: string; label: string; costEur: number }[];
}

/**
 * Real Mode Completion Phase 20/21 follow-up — `priceOverride` closes the
 * gap `BUILD_LOG.md` Phase 14/20 both flagged and deliberately deferred:
 * "financial assumptions are real and farmer-editable but not yet
 * consumed by the cost calculations." Every branch below already threaded
 * `concentratePriceEurPerTonne` as an explicit parameter into
 * `livestock.ts`'s real per-group functions — the "hardcoded" part was
 * only ever *this* function always supplying the same code-constant
 * price. Purely additive: `priceOverride` is optional and every existing
 * call site (all of them, until this change) gets the exact same
 * behaviour as before by simply not passing it — confirmed by the
 * existing 40 `finance.test.ts` assertions for this function passing
 * unmodified.
 */
export function calculateFarmConcentrateFeedCostBreakdown(
  livestockGroups: LivestockGroup[],
  priceOverride?: { valueEurPerTonne: number; source: string },
): FarmConcentrateFeedCostBreakdown {
  let total = 0;
  const sourceGroupLabels: string[] = [];
  const byGroup: FarmConcentrateFeedCostBreakdown["byGroup"] = [];
  const weanlingPrice = priceOverride?.valueEurPerTonne ?? WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE;

  for (const group of livestockGroups) {
    // WEANLING_GROUP_ID is checked below, before the generic FINISHING_OPTIONS
    // branch, on purpose: FINISHING_OPTIONS now also carries a weanling entry
    // (for the Livestock Economics screen's sell-now-vs-finish, a distinct
    // concern from this whole-farm feed-cost total), and that entry's
    // fixed-ADG DMD budget must never silently override the weanling group's
    // own dedicated real variable-ADG model here — see the branch below.
    if (group.id === WEANLING_GROUP_ID && group.avgWeightKg) {
      const strategies = calculateWeanlingConcentrateStrategies({
        currentWeightKg: group.avgWeightKg.value,
        targetWeightKg: WEANLING_STRATEGY_TARGET_WEIGHT_KG,
        concentratePriceEurPerTonne: weanlingPrice,
      });
      const balanced = strategies.find((s) => s.id === "balanced");
      if (balanced) {
        const costEur = balanced.totalCostPerHeadEur * group.count.value;
        total += costEur;
        sourceGroupLabels.push(group.label);
        byGroup.push({ groupId: group.id, label: group.label, costEur: Math.round(costEur) });
      }
      continue;
    }

    const finishingOptions = FINISHING_OPTIONS[group.id];
    if (finishingOptions && group.avgWeightKg) {
      const budgetOutcome = calculateFinishingBudget({
        animalType: finishingOptions.animalType,
        currentWeightKg: group.avgWeightKg.value,
        targetWeightKg: finishingOptions.targetWeightKg,
        silageDMD: finishingOptions.silageDMD,
        concentratePriceEurPerTonne: priceOverride?.valueEurPerTonne ?? finishingOptions.concentratePriceEurPerTonne,
      });
      // V3 fix (audit conflict #2): calculateFinishingBudget now fails
      // closed when silageDMD isn't an exact published DMD-table row —
      // that group is left out of the whole-farm total rather than
      // silently contributing a budget computed from an interpolated
      // concentrate rate. Matches this function's own existing
      // "deliberately partial... not filled with a guess" convention for
      // groups with no real model at all.
      if (budgetOutcome.status === "OK") {
        const costEur = budgetOutcome.value.feedCostPerHeadEur * group.count.value;
        total += costEur;
        sourceGroupLabels.push(group.label);
        byGroup.push({ groupId: group.id, label: group.label, costEur: Math.round(costEur) });
      }
      continue;
    }

    if (group.id === SUCKLER_COW_GROUP_ID) {
      // Same €350/t concentrate benchmark used throughout this workbook's
      // examples (or the farmer's own real price, if provided) —
      // dimensionally correct even though the rate itself (0 kg/day for a
      // dry spring-calving cow) makes the contribution 0.
      const concentrateKgDay = sucklerCowConcentrateKgPerDay("dry_spring_calving_cow");
      const feedCostPerHeadEur = (concentrateKgDay / 1000) * weanlingPrice;
      const costEur = feedCostPerHeadEur * group.count.value;
      total += costEur;
      sourceGroupLabels.push(group.label);
      byGroup.push({ groupId: group.id, label: group.label, costEur: Math.round(costEur) });
      continue;
    }
  }

  return {
    total: tracked(
      Math.round(total),
      priceOverride ? "farmer_adjusted" : "estimated",
      priceOverride
        ? `${priceOverride.source} (${sourceGroupLabels.join(", ")})`
        : `Farm Return feed cost engine (${sourceGroupLabels.join(", ")})`,
      { calculationVersion: FINANCE_ENGINE_VERSION },
    ),
    byGroup,
  };
}

/** Unchanged signature/behaviour — every existing caller/test keeps
 * working exactly as before; the breakdown above is additive, computed
 * once and shared, not a second calculation that could drift from this
 * one. */
export function calculateFarmConcentrateFeedCostEur(livestockGroups: LivestockGroup[]): TrackedValue<number> {
  return calculateFarmConcentrateFeedCostBreakdown(livestockGroups).total;
}

export interface FarmConcentrateFeedRequirement {
  totalTonnes: number;
  totalCostEur: number;
  sourceGroupLabels: string[];
}

/**
 * Whole-farm concentrate feed *requirement* (tonnes, not just €) — the same
 * three real per-group models `calculateFarmConcentrateFeedCostEur` sums,
 * kept as a separate function rather than a refactor of it: each branch
 * gets its total kg from a different real field on that model's own output
 * (`totalConcentrateKgPerHead` for finishing groups, `ingredientsKgDay` x
 * `daysToFinish` for the weanling Balanced strategy — `FeedStrategy` has no
 * total-kg field of its own), not a single shared shape worth forcing
 * through one loop. Same deliberately-partial scope as the cost-only
 * version: only groups with a real concentrate model are counted.
 */
export function calculateFarmConcentrateFeedRequirement(livestockGroups: LivestockGroup[]): FarmConcentrateFeedRequirement {
  let totalKg = 0;
  let totalCostEur = 0;
  const sourceGroupLabels: string[] = [];

  for (const group of livestockGroups) {
    // Same ordering fix as calculateFarmConcentrateFeedCostEur above, and
    // for the same reason: FINISHING_OPTIONS now also carries a weanling
    // entry for the Livestock Economics screen, which must never override
    // the weanling group's own dedicated real variable-ADG model here.
    if (group.id === WEANLING_GROUP_ID && group.avgWeightKg) {
      const strategies = calculateWeanlingConcentrateStrategies({
        currentWeightKg: group.avgWeightKg.value,
        targetWeightKg: WEANLING_STRATEGY_TARGET_WEIGHT_KG,
        concentratePriceEurPerTonne: WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE,
      });
      const balanced = strategies.find((s) => s.id === "balanced");
      if (balanced) {
        const kgPerHeadDay = balanced.ingredientsKgDay.reduce((sum, i) => sum + i.kgDay, 0);
        totalKg += kgPerHeadDay * balanced.daysToFinish * group.count.value;
        totalCostEur += balanced.totalCostPerHeadEur * group.count.value;
        sourceGroupLabels.push(group.label);
      }
      continue;
    }

    const finishingOptions = FINISHING_OPTIONS[group.id];
    if (finishingOptions && group.avgWeightKg) {
      const budgetOutcome = calculateFinishingBudget({
        animalType: finishingOptions.animalType,
        currentWeightKg: group.avgWeightKg.value,
        targetWeightKg: finishingOptions.targetWeightKg,
        silageDMD: finishingOptions.silageDMD,
        concentratePriceEurPerTonne: finishingOptions.concentratePriceEurPerTonne,
      });
      // Same V3 fix as calculateFarmConcentrateFeedCostEur above.
      if (budgetOutcome.status === "OK") {
        totalKg += budgetOutcome.value.totalConcentrateKgPerHead * group.count.value;
        totalCostEur += budgetOutcome.value.feedCostPerHeadEur * group.count.value;
        sourceGroupLabels.push(group.label);
      }
      continue;
    }

    if (group.id === SUCKLER_COW_GROUP_ID) {
      // Same real sourced zero as calculateFarmConcentrateFeedCostEur (dry
      // spring-calving cows) — carried through here too so the two
      // functions never disagree on which groups contributed.
      const concentrateKgDay = sucklerCowConcentrateKgPerDay("dry_spring_calving_cow");
      totalKg += concentrateKgDay * group.count.value;
      totalCostEur += (concentrateKgDay / 1000) * WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE * group.count.value;
      sourceGroupLabels.push(group.label);
      continue;
    }
  }

  return {
    totalTonnes: Math.round((totalKg / 1000) * 100) / 100,
    totalCostEur: Math.round(totalCostEur),
    sourceGroupLabels,
  };
}

export interface FarmGrassAndSilageCostInput {
  fields: Field[];
  silagePlans: SilagePlan[];
}

export interface FarmGrassAndSilageCost {
  grassCostEur: TrackedValue<number>;
  silageCostEur: TrackedValue<number>;
}

/**
 * Whole-farm grazed-grass and silage cost, on the chosen cost basis
 * (src/domain/feed-cost.ts's "economic"/incl-land vs "cash"/excl-land —
 * the source workbook's own "Use economic vs cash-cost toggle in
 * Finance" instruction, never silently picked for the caller).
 *
 * Grazing hectares = every field whose real, current `plannedUse` is
 * `"grazing"` (not a separate mock total). Silage DM tonnage = summed
 * from each real `SilagePlan`'s own `expectedYieldTDMha` x its field's
 * real area — the same per-field pattern `calculateFarmFertiliserCostEur`
 * above already uses, rather than a separate whole-farm mock figure.
 */
export function calculateFarmGrassAndSilageCostEur(
  input: FarmGrassAndSilageCostInput,
  basis: FeedCostBasis,
): FarmGrassAndSilageCost {
  const grazingAreaHa = input.fields
    .filter((f) => f.plannedUse.value === "grazing")
    .reduce((sum, f) => sum + f.areaHa, 0);

  const silageDmTonnes = input.silagePlans.reduce((sum, plan) => {
    const field = input.fields.find((f) => f.id === plan.fieldId);
    return field ? sum + plan.expectedYieldTDMha.value * field.areaHa : sum;
  }, 0);

  const source = `Teagasc Spring 2026 Feed Cost Benchmarks (${basis})`;
  return {
    grassCostEur: tracked(Math.round(calculateGrazedGrassCostEur(grazingAreaHa, basis)), "estimated", source, {
      calculationVersion: FEED_COST_ENGINE_VERSION,
    }),
    silageCostEur: tracked(Math.round(calculateSilageCostEur(silageDmTonnes, basis)), "estimated", source, {
      calculationVersion: FEED_COST_ENGINE_VERSION,
    }),
  };
}

export interface FarmMineralCostInput {
  livestockGroups: LivestockGroup[];
  housingList: Housing[];
}

/** Number of whole days between two ISO date strings, inclusive of the
 * start day (a farmer housing cows "1 Nov to 15 Mar" is buying minerals
 * for every one of those days, including the first). */
function daysBetweenInclusive(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.max(0, Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1);
}

/**
 * Whole-farm mineral cost — currently just the suckler cow group, using
 * the real Teagasc mineral benchmark (`SUCKLER_DRY_COW_MINERAL_BENCHMARK`)
 * over the real number of days its linked housing shed's winter period
 * covers (`Housing.housingPeriod`) — not a guessed "365 days" or a mock
 * total. Deliberately partial: this app has no real mineral benchmark for
 * weanlings, steers, or heifers yet, so this is a floor on real mineral
 * spend, not the whole farm's mineral bill — same honest-partial pattern
 * as `calculateFarmConcentrateFeedCostEur`. Returns 0 (not an error) if
 * this farm has no suckler cow group or no matching housing record.
 */
export function calculateFarmMineralCostEur(input: FarmMineralCostInput): TrackedValue<number> {
  const sucklerGroup = input.livestockGroups.find((g) => g.id === SUCKLER_COW_GROUP_ID);
  if (!sucklerGroup) {
    return tracked(0, "estimated", "Farm Return mineral cost model (no suckler cow group)", {
      calculationVersion: FEED_COST_ENGINE_VERSION,
    });
  }

  const housing = input.housingList.find((h) => h.linkedGroupIds.includes(sucklerGroup.id));
  const housingDays = housing ? daysBetweenInclusive(housing.housingPeriod.start, housing.housingPeriod.end) : 0;
  const total = calculateSucklerCowMineralCostEur(sucklerGroup.count.value, housingDays);

  return tracked(
    Math.round(total),
    "estimated",
    `Teagasc mineral cost benchmark (${SUCKLER_DRY_COW_MINERAL_BENCHMARK.costId})`,
    { calculationVersion: FEED_COST_ENGINE_VERSION },
  );
}

// ---------------------------------------------------------------------------
// Input Planner (Phase 6) — real forecast *demand*, not the blocked bulk-
// buying piece. `docs/product-requirements.md`'s Phase 6 scope is "forecast
// demand, stock deduction, demand confirmation, buying-group workflow and
// saving ledger" — buying-group workflow needs a live commercial supplier
// source this app doesn't have (README: "Do not populate from invented
// examples"), but the demand forecast itself is buildable now from the real
// engines above. Only the "fertiliser" and "feed" mock rows have a real
// engine behind them; lime, bale wrap and "other" stay Phase 1 mock (no
// source in hand for those yet) — this overrides just the two it can.
// ---------------------------------------------------------------------------

/**
 * Replaces the mock "input-fertiliser" and "input-feed" rows'
 * `requiredQty`/`estCost` with real, live-computed `TrackedValue`s —
 * `purchaseQty` is recomputed from the new real `requiredQty` the same way
 * the original mock row already derived it (`requiredQty - stockOnHandQty`).
 * `stockOnHandQty` itself stays whatever the mock row already had: this app
 * has no real inventory-tracking data model (nothing captures "tonnes of
 * feed currently in the shed"), so it's a separate, still-unbuilt concern
 * left untouched rather than zeroed out or guessed. Every other row (lime,
 * bale wrap, other) and every other field on the two overridden rows
 * (`requiredByWindow`, `confidencePct`, `demandState`) pass through
 * unchanged — this app has no real seasonal-timing or confidence model
 * either, and inventing one would be exactly what CLAUDE.md's "never
 * invent a number" rule forbids.
 */
export function withRealInputRequirements(
  mockRequirements: InputRequirement[],
  fertiliserRequirement: FarmFertiliserRequirement,
  concentrateFeedRequirement: FarmConcentrateFeedRequirement,
): InputRequirement[] {
  return mockRequirements.map((req) => {
    if (req.id === "input-fertiliser") {
      const requiredQty = tracked(fertiliserRequirement.totalTonnes, "estimated", "Farm Return nutrient engine", {
        calculationVersion: FINANCE_ENGINE_VERSION,
      });
      return {
        ...req,
        requiredQty,
        purchaseQty: Math.max(0, requiredQty.value - req.stockOnHandQty),
        estCost: tracked(fertiliserRequirement.totalCostEur, "estimated", "Farm Return nutrient engine", {
          calculationVersion: FINANCE_ENGINE_VERSION,
        }),
      };
    }
    if (req.id === "input-feed") {
      const source = concentrateFeedRequirement.sourceGroupLabels.length > 0
        ? `Farm Return feed cost engine (${concentrateFeedRequirement.sourceGroupLabels.join(", ")})`
        : "Farm Return feed cost engine";
      const requiredQty = tracked(concentrateFeedRequirement.totalTonnes, "estimated", source, {
        calculationVersion: FINANCE_ENGINE_VERSION,
      });
      return {
        ...req,
        requiredQty,
        purchaseQty: Math.max(0, requiredQty.value - req.stockOnHandQty),
        estCost: tracked(concentrateFeedRequirement.totalCostEur, "estimated", source, {
          calculationVersion: FINANCE_ENGINE_VERSION,
        }),
      };
    }
    return req;
  });
}

/**
 * The "buy-fertiliser" bulk-buy opportunity's `userRequirementQty` is this
 * farm's own real demand — the same figure `withRealInputRequirements`
 * plugs into the Fertiliser row above it on the same screen, so both must
 * agree rather than silently drifting (one real, one still the Phase 1
 * mock 13.6t) the moment a field or the herd changes. Every other field on
 * every row (regional demand, current/target price, potential saving per
 * unit) stays mock — Phase 6's bulk-buying still needs a live commercial
 * supplier source this app doesn't have (README: "Do not populate from
 * invented examples").
 */
export function withRealBuyingOpportunityRequirement(
  mockOpportunities: BuyingOpportunity[],
  fertiliserRequirement: FarmFertiliserRequirement,
): BuyingOpportunity[] {
  return mockOpportunities.map((opp) =>
    opp.id === "buy-fertiliser" ? { ...opp, userRequirementQty: fertiliserRequirement.totalTonnes } : opp,
  );
}
