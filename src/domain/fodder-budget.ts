/**
 * Scientific engine V3 — Phase H1: `BASIC_FODDER_DEMAND_FRESH_WEIGHT`.
 *
 * Spec §I1: "Teagasc guidance published 26 August 2026 gives current
 * planning coefficients in tonnes fresh pit silage per animal per month
 * ... This is a planning model, not an individual energy/protein
 * equation." A clean, additive build — these coefficients are new to
 * this codebase (nothing here conflicts with an existing calculation),
 * and directly replace the mock `ForageInventory.requiredWinterForageDmTonnes`
 * (`src/data/mock-farm.ts`'s `mockForageInventory`) that
 * `WholeFarmFeedBalanceCard` currently renders — though wiring that
 * replacement in is real follow-up UI work, not done this phase (see
 * "Known limitations" in the build log).
 *
 * Grounded exactly in `GFT091`-`GFT100`.
 */

import { blockedInsufficientEvidence, ok, type EngineOutcome } from "./evidence";
import type { LivestockGroup } from "./types";

export const FODDER_BUDGET_VERSION = "fodder_budget_v1.0.0";

export type FodderAnimalClass = "dairy_cow" | "suckler_cow" | "cattle_0_1" | "cattle_1_2" | "cattle_2plus" | "ewe";

/** `advisory_teagasc/fodder_budget_current_2026_08_26.csv` — t fresh pit
 * silage per animal per month, verbatim. Sheep (`ewe`) has no reachable
 * path from this app's `LivestockCategory` today (no sheep enterprise is
 * modelled — matches the original audit's "fail closed by omission, not
 * a bug" note) but the coefficient is kept as real, sourced data ready
 * for when one is. */
export const FODDER_COEFFICIENT_T_PER_HEAD_MONTH: Record<FodderAnimalClass, number> = {
  dairy_cow: 1.6,
  suckler_cow: 1.4,
  cattle_0_1: 0.7,
  cattle_1_2: 1.3,
  cattle_2plus: 1.3,
  ewe: 0.15,
};

const CATTLE_0_1_UPPER_BOUND_MONTHS = 12;
const CATTLE_1_2_UPPER_BOUND_MONTHS = 24;

/**
 * Maps a `LivestockGroup` to its real fodder-budget class. `dairy_cow`/
 * `suckler_cow` resolve directly (age-independent, same as
 * `statutory-excretion.ts`'s `resolveStatutoryExcretionCategory` for the
 * same two categories); every other category needs `avgAgeMonths` to
 * bucket into the 0-1/1-2/2+ year bands this table publishes (a coarser
 * 3-band split than Table 7's excretion bands — no sex distinction here
 * at all, since the fodder table doesn't publish one).
 *
 * Every one of this app's 8 `LivestockCategory` values resolves to a real
 * fodder class given an age — there is no reachable `BLOCK_UNSUPPORTED_CLASS`
 * case within this app's own category union today (`GFT098`'s literal
 * "alpaca" scenario has no equivalent here, since `LivestockCategory` is a
 * closed TypeScript union that cannot represent an unmodelled species at
 * all — a stronger, compile-time form of the same fail-closed guarantee).
 */
export function resolveFodderAnimalClass(
  group: Pick<LivestockGroup, "category" | "avgAgeMonths">,
): EngineOutcome<FodderAnimalClass> {
  if (group.category === "dairy_cow") return ok("dairy_cow", "IRISH_DEFAULT");
  if (group.category === "suckler_cow") return ok("suckler_cow", "IRISH_DEFAULT");
  if (group.avgAgeMonths === undefined) {
    return blockedInsufficientEvidence("MISSING_LIVESTOCK_AGE", ["avgAgeMonths"]);
  }
  if (group.avgAgeMonths < CATTLE_0_1_UPPER_BOUND_MONTHS) return ok("cattle_0_1", "IRISH_DEFAULT");
  if (group.avgAgeMonths < CATTLE_1_2_UPPER_BOUND_MONTHS) return ok("cattle_1_2", "IRISH_DEFAULT");
  return ok("cattle_2plus", "IRISH_DEFAULT");
}

export interface FodderDemandInput {
  animalClass: FodderAnimalClass;
  headcount: number;
  /** Farmer-entered planned winter months — `undefined` blocks (`GFT100`);
   * never defaulted to a guessed winter length ("hard-coded winter
   * length" is explicitly the failure mode `GFT099` exists to catch —
   * the farmer's own entered period must be used, not a fallback). */
  plannedMonths: number | undefined;
}

/**
 * `GFT091`-`GFT096`/`GFT099`/`GFT100`. `headcount x plannedMonths x
 * coefficient`, per spec §I1's own formula, verbatim.
 */
export function calculateBasicFodderDemandFreshWeightT(input: FodderDemandInput): EngineOutcome<number> {
  if (input.plannedMonths === undefined) {
    return blockedInsufficientEvidence("BLOCK_MISSING_PERIOD", ["plannedMonths"]);
  }
  const coefficient = FODDER_COEFFICIENT_T_PER_HEAD_MONTH[input.animalClass];
  return ok(input.headcount * input.plannedMonths * coefficient, "IRISH_DEFAULT");
}

export interface WholeFarmFodderDemandGroupInput {
  group: Pick<LivestockGroup, "id" | "label" | "category" | "avgAgeMonths"> & { count: { value: number } };
  plannedMonths: number | undefined;
}

export interface WholeFarmFodderDemandResult {
  totalFreshWeightT: number;
  byGroup: { groupId: string; label: string; animalClass: FodderAnimalClass; freshWeightT: number }[];
}

/**
 * `GFT097`: whole-herd total across every supported group. Fails closed
 * for the WHOLE calculation if any single group can't be resolved (same
 * "a partial undercount is not a safe substitute for the real total"
 * principle `calculateStatutoryGrasslandStockingRateKgHa` already
 * applies) — a farmer needs the real total winter fodder requirement, not
 * a total silently missing one group's contribution.
 */
export function calculateWholeFarmFodderDemand(
  inputs: WholeFarmFodderDemandGroupInput[],
): EngineOutcome<WholeFarmFodderDemandResult> {
  const byGroup: WholeFarmFodderDemandResult["byGroup"] = [];
  const missingFor: string[] = [];

  for (const { group, plannedMonths } of inputs) {
    const classOutcome = resolveFodderAnimalClass(group);
    if (classOutcome.status !== "OK") {
      missingFor.push(`${group.label} (${group.id}): ${classOutcome.reasonCode}`);
      continue;
    }
    const demandOutcome = calculateBasicFodderDemandFreshWeightT({
      animalClass: classOutcome.value,
      headcount: group.count.value,
      plannedMonths,
    });
    if (demandOutcome.status !== "OK") {
      missingFor.push(`${group.label} (${group.id}): ${demandOutcome.reasonCode}`);
      continue;
    }
    byGroup.push({ groupId: group.id, label: group.label, animalClass: classOutcome.value, freshWeightT: demandOutcome.value });
  }

  if (missingFor.length > 0) {
    return blockedInsufficientEvidence("MISSING_FODDER_CATEGORISATION", missingFor);
  }

  return ok(
    { totalFreshWeightT: byGroup.reduce((sum, g) => sum + g.freshWeightT, 0), byGroup },
    "IRISH_DEFAULT",
  );
}
