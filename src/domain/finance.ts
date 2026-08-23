/**
 * Finance aggregation — Phase 4 ("silage/livestock/finance",
 * `docs/product-requirements.md` § Delivery phases). Exit gate:
 * "whole-farm forecast updates when field/livestock data changes."
 *
 * Scope for this pass, deliberately narrow: the whole-farm totals that can
 * be computed for real from data this app already holds or has a versioned
 * engine for — fertiliser spend (src/domain/nutrients.ts) and livestock
 * portfolio value (the farm store). Everything else `docs/finance-engine.md`
 * describes (feed cost, livestock economics/ADG, sales revenue, cashflow
 * forecasting) needs real Teagasc finishing-beef and CSO/Bord Bia data this
 * session doesn't have in hand — see the README's "known gap" note. Those
 * stay Phase 1 mock figures (`@/data/mock-farm`) rather than being guessed.
 */

import { calculateNutrientPlan } from "./nutrients";
import { tracked } from "./types";
import type { Field, LivestockGroup, SilagePlan, SlurryAllocation, TrackedValue } from "./types";

export const FINANCE_ENGINE_VERSION = "finance_engine_v1.0.0";

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
