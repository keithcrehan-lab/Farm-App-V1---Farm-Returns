/**
 * Scientific engine V3 — Phase D: real statutory livestock excretion
 * (S.I. 119/2026 Table 7) and the real statutory Grassland Stocking Rate
 * (GSR) it feeds.
 *
 * `SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md` §2.3 / §3 conflict #1: the
 * figure that has been gating every field's NAP N/P ceiling in
 * `nutrients.ts` is `calculateGrasslandStockingRateKgHa` — a Green Book
 * Table 12-3 agronomic N-requirement-by-livestock-unit-density curve, NOT
 * the statutory GSR spec Section D1/G actually requires ("total N
 * produced by grazing livestock before exports / entire eligible
 * grassland area", using the real Table 7 excretion rate per animal
 * category/age/sex band — `GRASSLAND_STOCKING_RATE`,
 * `calculation_contracts.csv`). This module is that real calculation.
 * `nutrients.ts`'s existing Table 12-3 curve is NOT deleted — it remains
 * a legitimate, separately-sourced AGRONOMIC figure (the grazing N
 * fertiliser requirement for a given stocking density); the two are
 * wired together correctly in the phase that fixes `checkNapCompliance`
 * to consume THIS module's output for the statutory ceiling band, not the
 * agronomic curve's.
 */

import { blockedInsufficientEvidence, ok, type EngineOutcome } from "./evidence";
import type { LivestockGroup } from "./types";

export const STATUTORY_EXCRETION_VERSION = "statutory_excretion_v1.0.0";

// ---------------------------------------------------------------------------
// S.I. 119/2026 Table 7 — rules_statutory/livestock_excretion_rates_2026.csv,
// copied verbatim (32 rows). Only the cattle rows are consumed by
// resolveStatutoryExcretionCategory below (this app's LivestockCategory is
// cattle-only today), but the full table is kept as real, sourced data for
// any future sheep/horse/deer/pig/poultry enterprise, rather than a
// partial extract that would need re-verifying later.
// ---------------------------------------------------------------------------

export type StatutoryLivestockCategory =
  | "dairy_cow_band_1"
  | "dairy_cow_band_2"
  | "dairy_cow_band_3"
  | "suckler_cow"
  | "calf_0_90_days"
  | "cattle_91_days_to_end_year1"
  | "cattle_female_1_2_years"
  | "cattle_male_1_2_years"
  | "cattle_over_2_years"
  | "upland_ewe_and_lambs"
  | "lowland_ewe_and_lambs"
  | "upland_hogget"
  | "lowland_hogget"
  | "goat"
  | "horse_over_3_years"
  | "horse_2_3_years"
  | "horse_1_2_years"
  | "horse_foal_under_1_year"
  | "donkey_or_small_pony"
  | "deer_red_6m_2y"
  | "deer_red_over_2y"
  | "deer_fallow_6m_2y"
  | "deer_fallow_over_2y"
  | "deer_sika_6m_2y"
  | "deer_sika_over_2y"
  | "breeding_pig_unit_sow_place"
  | "integrated_pig_unit"
  | "finishing_pig_place"
  | "laying_hen"
  | "broiler"
  | "turkey";

export type StatutoryExcretionBasis = "animal_year" | "90_day_period" | "remainder_first_year" | "place_year" | "bird_place_year";

export interface StatutoryExcretionRow {
  category: StatutoryLivestockCategory;
  basis: StatutoryExcretionBasis;
  totalNKg: number;
  totalPKg: number;
  notes?: string;
}

export const TABLE_7_LIVESTOCK_EXCRETION: Record<StatutoryLivestockCategory, StatutoryExcretionRow> = {
  dairy_cow_band_1: { category: "dairy_cow_band_1", basis: "animal_year", totalNKg: 80, totalPKg: 12, notes: "<4500 kg milk yield; banding footnotes apply" },
  dairy_cow_band_2: { category: "dairy_cow_band_2", basis: "animal_year", totalNKg: 92, totalPKg: 13.6, notes: "4500-6500 kg milk yield; banding footnotes apply" },
  dairy_cow_band_3: { category: "dairy_cow_band_3", basis: "animal_year", totalNKg: 106, totalPKg: 15.8, notes: ">6500 kg milk yield; banding footnotes apply" },
  suckler_cow: { category: "suckler_cow", basis: "animal_year", totalNKg: 65, totalPKg: 10 },
  calf_0_90_days: { category: "calf_0_90_days", basis: "90_day_period", totalNKg: 1, totalPKg: 0.1, notes: "total applicable for 90-day period" },
  cattle_91_days_to_end_year1: { category: "cattle_91_days_to_end_year1", basis: "remainder_first_year", totalNKg: 20, totalPKg: 2.8, notes: "from 91 days of age onwards" },
  cattle_female_1_2_years: { category: "cattle_female_1_2_years", basis: "animal_year", totalNKg: 55, totalPKg: 8 },
  cattle_male_1_2_years: { category: "cattle_male_1_2_years", basis: "animal_year", totalNKg: 61, totalPKg: 9 },
  cattle_over_2_years: { category: "cattle_over_2_years", basis: "animal_year", totalNKg: 65, totalPKg: 10 },
  upland_ewe_and_lambs: { category: "upland_ewe_and_lambs", basis: "animal_year", totalNKg: 7, totalPKg: 1 },
  lowland_ewe_and_lambs: { category: "lowland_ewe_and_lambs", basis: "animal_year", totalNKg: 13, totalPKg: 2 },
  upland_hogget: { category: "upland_hogget", basis: "animal_year", totalNKg: 4, totalPKg: 0.6 },
  lowland_hogget: { category: "lowland_hogget", basis: "animal_year", totalNKg: 6, totalPKg: 1 },
  goat: { category: "goat", basis: "animal_year", totalNKg: 9, totalPKg: 1 },
  horse_over_3_years: { category: "horse_over_3_years", basis: "animal_year", totalNKg: 50, totalPKg: 9 },
  horse_2_3_years: { category: "horse_2_3_years", basis: "animal_year", totalNKg: 44, totalPKg: 8 },
  horse_1_2_years: { category: "horse_1_2_years", basis: "animal_year", totalNKg: 36, totalPKg: 6 },
  horse_foal_under_1_year: { category: "horse_foal_under_1_year", basis: "animal_year", totalNKg: 25, totalPKg: 3 },
  donkey_or_small_pony: { category: "donkey_or_small_pony", basis: "animal_year", totalNKg: 30, totalPKg: 5 },
  deer_red_6m_2y: { category: "deer_red_6m_2y", basis: "animal_year", totalNKg: 13, totalPKg: 2 },
  deer_red_over_2y: { category: "deer_red_over_2y", basis: "animal_year", totalNKg: 25, totalPKg: 4 },
  deer_fallow_6m_2y: { category: "deer_fallow_6m_2y", basis: "animal_year", totalNKg: 7, totalPKg: 1 },
  deer_fallow_over_2y: { category: "deer_fallow_over_2y", basis: "animal_year", totalNKg: 13, totalPKg: 2 },
  deer_sika_6m_2y: { category: "deer_sika_6m_2y", basis: "animal_year", totalNKg: 6, totalPKg: 1 },
  deer_sika_over_2y: { category: "deer_sika_over_2y", basis: "animal_year", totalNKg: 10, totalPKg: 2 },
  breeding_pig_unit_sow_place: { category: "breeding_pig_unit_sow_place", basis: "place_year", totalNKg: 35, totalPKg: 8 },
  integrated_pig_unit: { category: "integrated_pig_unit", basis: "place_year", totalNKg: 87, totalPKg: 17 },
  finishing_pig_place: { category: "finishing_pig_place", basis: "place_year", totalNKg: 9.2, totalPKg: 1.7 },
  laying_hen: { category: "laying_hen", basis: "bird_place_year", totalNKg: 0.56, totalPKg: 0.12 },
  broiler: { category: "broiler", basis: "bird_place_year", totalNKg: 0.24, totalPKg: 0.09 },
  turkey: { category: "turkey", basis: "bird_place_year", totalNKg: 1, totalPKg: 0.4 },
};

// ---------------------------------------------------------------------------
// Categorisation — LivestockGroup (this app's coarse 8-value
// LivestockCategory + optional avgAgeMonths/sex) -> the real Table 7
// category. Fails closed whenever the real table needs a distinction this
// app's captured data doesn't have.
// ---------------------------------------------------------------------------

const CALF_UPPER_BOUND_MONTHS = 3; // 90 days ~ 3 months
const FIRST_YEAR_UPPER_BOUND_MONTHS = 12;
const SECOND_YEAR_UPPER_BOUND_MONTHS = 24;

/** `rules_statutory/livestock_excretion_rates_2026.csv`'s own Table 7a
 * band thresholds: <4500 kg -> band 1, 4500-6500 kg -> band 2, >6500 kg
 * -> band 3 milk yield. */
const DAIRY_BAND_1_UPPER_LIMIT_KG = 4500;
const DAIRY_BAND_2_UPPER_LIMIT_KG = 6500;

/**
 * Resolves one `LivestockGroup` to its real Table 7 category. `suckler_cow`
 * is age/sex-independent (direct match). `dairy_cow` requires a milk-yield
 * band (`avgMilkYieldKgPerYear`, V3 closure pass Priority 5 — AF012) —
 * absent still fails closed, since this app models no real dairy
 * enterprise today and inventing a yield would be exactly the kind of
 * guess V3 exists to prevent. `calf`/`weanling`/`store`/`steer`/`heifer`/
 * `bull` need `avgAgeMonths`; the 1-2 year band additionally needs `sex`
 * (Table 7 only splits by sex in that one band — 0-90 days, 91 days-1 year
 * and 2+ years are sex-independent).
 */
export function resolveStatutoryExcretionCategory(
  group: Pick<LivestockGroup, "category" | "avgAgeMonths" | "sex" | "avgMilkYieldKgPerYear">,
): EngineOutcome<StatutoryLivestockCategory> {
  if (group.category === "suckler_cow") {
    return ok("suckler_cow", "DERIVED");
  }

  if (group.category === "dairy_cow") {
    if (group.avgMilkYieldKgPerYear === undefined) {
      return blockedInsufficientEvidence("MISSING_DAIRY_MILK_YIELD_BAND", ["dairy milk-yield band (Table 7 bands 1-3)"]);
    }
    const kgPerYear = group.avgMilkYieldKgPerYear.value;
    if (kgPerYear < DAIRY_BAND_1_UPPER_LIMIT_KG) return ok("dairy_cow_band_1", "DERIVED");
    if (kgPerYear <= DAIRY_BAND_2_UPPER_LIMIT_KG) return ok("dairy_cow_band_2", "DERIVED");
    return ok("dairy_cow_band_3", "DERIVED");
  }

  // Every remaining category (calf, weanling, store, steer, heifer, bull)
  // needs a real age to select the correct Table 7 row — this app's
  // category NAME alone (e.g. "weanling") is not evidence of an animal's
  // actual age, and inventing an age from the category name would be
  // exactly the kind of guess V3 exists to prevent.
  if (group.avgAgeMonths === undefined) {
    return blockedInsufficientEvidence("MISSING_LIVESTOCK_AGE", ["avgAgeMonths"]);
  }

  if (group.avgAgeMonths < CALF_UPPER_BOUND_MONTHS) {
    return ok("calf_0_90_days", "DERIVED");
  }
  if (group.avgAgeMonths < FIRST_YEAR_UPPER_BOUND_MONTHS) {
    return ok("cattle_91_days_to_end_year1", "DERIVED");
  }
  if (group.avgAgeMonths < SECOND_YEAR_UPPER_BOUND_MONTHS) {
    // Only the 1-2 year band splits by sex.
    if (group.sex === undefined || group.sex === "mixed") {
      return blockedInsufficientEvidence("MISSING_LIVESTOCK_SEX_FOR_1_2Y_BAND", ["sex"]);
    }
    return ok(group.sex === "female" ? "cattle_female_1_2_years" : "cattle_male_1_2_years", "DERIVED");
  }
  return ok("cattle_over_2_years", "DERIVED");
}

/**
 * Real annual statutory N/P excretion per head for a resolved category.
 * `calf_0_90_days`/`cattle_91_days_to_end_year1` are NOT annual rates on
 * their own (`"90_day_period"`/`"remainder_first_year"` bases) — Table 7's
 * own structure is that these two rows together cover a full first year of
 * a calf's life (day 1-90, then day 91-365), so a group whose members are
 * present for a full year gets the COMBINED total
 * (1+20=21 kgN, 0.1+2.8=2.9 kgP) as its real annual per-head rate — the
 * same combination S.I. 119/2026's own Table 7 structure requires, not an
 * invented blending. A group known to be under 90 days old for the WHOLE
 * assessment period would need only the first row alone; this app's
 * `LivestockGroup` has no "days present this year" field to make that
 * distinction, so the full-first-year combined total is the correct
 * reading for an annual GSR calculation (the statutory ratio's own
 * numerator is an ANNUAL total).
 */
export function statutoryAnnualExcretionKgPerHead(category: StatutoryLivestockCategory): { n: number; p: number } {
  if (category === "calf_0_90_days" || category === "cattle_91_days_to_end_year1") {
    const calfPeriod = TABLE_7_LIVESTOCK_EXCRETION.calf_0_90_days;
    const restOfYear = TABLE_7_LIVESTOCK_EXCRETION.cattle_91_days_to_end_year1;
    return { n: calfPeriod.totalNKg + restOfYear.totalNKg, p: calfPeriod.totalPKg + restOfYear.totalPKg };
  }
  const row = TABLE_7_LIVESTOCK_EXCRETION[category];
  return { n: row.totalNKg, p: row.totalPKg };
}

// ---------------------------------------------------------------------------
// Real statutory Grassland Stocking Rate
// (GRASSLAND_STOCKING_RATE, calculation_contracts.csv)
// ---------------------------------------------------------------------------

export interface StatutoryGsrResult {
  gsrKgNHa: number;
  totalStatutoryNKg: number;
}

/**
 * `rules_statutory/grassland_stocking_rate_definition_2026.csv`: "total N
 * produced by grazing livestock on the holding before manure exports /
 * entire eligible grassland area of the holding" — never subtract exports
 * before this ratio (`GFT022`). If ANY group in the herd cannot be
 * categorised (missing age/sex/dairy band), the true total is unknowable
 * — this returns `BLOCKED_INSUFFICIENT_EVIDENCE` for the WHOLE
 * calculation rather than silently summing only the categorisable groups,
 * since a partial, undercounted total presented as the real GSR could
 * select the wrong statutory ceiling band in either direction (the NAP N
 * ceiling schedule is not monotonic — 185 -> 241 -> 214 kg/ha across the
 * top three bands — so an undercount is not conservatively "safe").
 */
export function calculateStatutoryGrasslandStockingRateKgHa(
  groups: LivestockGroup[],
  eligibleGrasslandAreaHa: number,
): EngineOutcome<StatutoryGsrResult> {
  if (eligibleGrasslandAreaHa <= 0) {
    return blockedInsufficientEvidence("MISSING_ELIGIBLE_GRASSLAND_AREA", ["eligibleGrasslandAreaHa"]);
  }

  let totalStatutoryNKg = 0;
  const missingFor: string[] = [];

  for (const group of groups) {
    const categoryOutcome = resolveStatutoryExcretionCategory(group);
    if (categoryOutcome.status !== "OK") {
      missingFor.push(`${group.label} (${group.id}): ${categoryOutcome.reasonCode}`);
      continue;
    }
    const perHead = statutoryAnnualExcretionKgPerHead(categoryOutcome.value);
    totalStatutoryNKg += perHead.n * group.count.value;
  }

  if (missingFor.length > 0) {
    return blockedInsufficientEvidence("MISSING_LIVESTOCK_CATEGORISATION_FOR_GSR", missingFor);
  }

  return ok(
    { gsrKgNHa: totalStatutoryNKg / eligibleGrasslandAreaHa, totalStatutoryNKg },
    "DERIVED",
  );
}
