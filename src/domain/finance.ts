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
import type { Field, Housing, LivestockGroup, SilagePlan, SlurryAllocation, TrackedValue } from "./types";

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

/**
 * Whole-farm chemical fertiliser spend: sums
 * `calculateNutrientPlan().estimatedFieldCostEur` (nutrient_engine_v1.0.0)
 * across every field. The first genuinely live-recomputed whole-farm total
 * in the app — change a field's P/K index, add a field, or change the herd
 * (which shifts the grazing stocking rate every field's N requirement
 * depends on) and this number changes with it, not just the one field's
 * own Fertiliser Plan screen.
 */
export function calculateFarmFertiliserCostEur(input: FarmFertiliserCostInput): TrackedValue<number> {
  const farmGrasslandAreaHa = input.fields.reduce((sum, f) => sum + f.areaHa, 0);
  const total = input.fields.reduce((sum, field) => {
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
    return sum + plan.estimatedFieldCostEur;
  }, 0);
  return tracked(Math.round(total), "estimated", "Farm Return nutrient engine", {
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
export function calculateFarmConcentrateFeedCostEur(livestockGroups: LivestockGroup[]): TrackedValue<number> {
  let total = 0;
  const sourceGroupLabels: string[] = [];

  for (const group of livestockGroups) {
    const finishingOptions = FINISHING_OPTIONS[group.id];
    if (finishingOptions && group.avgWeightKg) {
      const budget = calculateFinishingBudget({
        animalType: finishingOptions.animalType,
        currentWeightKg: group.avgWeightKg.value,
        targetWeightKg: finishingOptions.targetWeightKg,
        silageDMD: finishingOptions.silageDMD,
        concentratePriceEurPerTonne: finishingOptions.concentratePriceEurPerTonne,
      });
      total += budget.feedCostPerHeadEur * group.count.value;
      sourceGroupLabels.push(group.label);
      continue;
    }

    if (group.id === WEANLING_GROUP_ID && group.avgWeightKg) {
      const strategies = calculateWeanlingConcentrateStrategies({
        currentWeightKg: group.avgWeightKg.value,
        targetWeightKg: WEANLING_STRATEGY_TARGET_WEIGHT_KG,
        concentratePriceEurPerTonne: WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE,
      });
      const balanced = strategies.find((s) => s.id === "balanced");
      if (balanced) {
        total += balanced.totalCostPerHeadEur * group.count.value;
        sourceGroupLabels.push(group.label);
      }
      continue;
    }

    if (group.id === SUCKLER_COW_GROUP_ID) {
      // Same €350/t concentrate benchmark used throughout this workbook's
      // examples — dimensionally correct even though the rate itself (0
      // kg/day for a dry spring-calving cow) makes the contribution 0.
      const concentrateKgDay = sucklerCowConcentrateKgPerDay("dry_spring_calving_cow");
      const feedCostPerHeadEur = (concentrateKgDay / 1000) * WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE;
      total += feedCostPerHeadEur * group.count.value;
      sourceGroupLabels.push(group.label);
      continue;
    }
  }

  return tracked(
    Math.round(total),
    "estimated",
    `Farm Return feed cost engine (${sourceGroupLabels.join(", ")})`,
    { calculationVersion: FINANCE_ENGINE_VERSION },
  );
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
