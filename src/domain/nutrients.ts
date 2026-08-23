/**
 * Nutrient requirement engine — Phase 3 ("soil/nutrient MVP",
 * `docs/product-requirements.md` § Delivery phases; design contract in
 * `docs/agronomy-engine.md`).
 *
 * Every numeric constant in this file is taken directly from a named,
 * numbered table in:
 *
 *   Teagasc — Major & Micro Nutrient Advice for Productive Agricultural
 *   Crops (5th Edition, 2020) — the "Green Book". See
 *   `docs/evidence-register.md` for the full table-by-table citation list.
 *
 * CLAUDE.md's core rule: "Never let a model invent a production
 * scientific, regulatory or financial number." Every constant below is
 * annotated with its source table. Where the source table itself is
 * ambiguous (merged-cell PDF extraction) or where a downstream regulation
 * has superseded the table's own citation, that is called out explicitly
 * rather than silently resolved — see the NAP ceiling section.
 *
 * Scope (Phase 3 MVP, suckler beef / drystock grassland only — this farm's
 * only enterprise, per `mockFarm.primaryEnterprises`): P and K index-based
 * build-up/maintenance for grazing and silage, suckler-system N advice,
 * cattle-slurry organic offset, and the two NAP nutrient ceilings. Dairy
 * system columns exist in the source tables and are captured in the
 * constants for completeness, but `calculateNutrientPlan` always resolves
 * `system: "drystock"` until a dairy enterprise exists in the data model.
 */

import type { Field, FertiliserProduct, Housing, LivestockCategory, LivestockGroup, NapComplianceCheck, NutrientPlan, SlurryAllocation } from "./types";
import { tracked } from "./types";

export const NUTRIENT_ENGINE_VERSION = "nutrient_engine_v1.0.0";

// ---------------------------------------------------------------------------
// Soil P/K Index classification — Green Book Table 6-4 / 13-1 (P, grassland
// column) and Table 6-5 (K). Units: mg/l (Morgan's solution extraction).
// ---------------------------------------------------------------------------

export type SoilIndex = 1 | 2 | 3 | 4;

/**
 * Table 6-4 / 13-1, "Grassland crops" column (Green Book), confirmed
 * against the current statutory boundary — S.I. 588/2025 Table 12,
 * "Statutory Soil Phosphorus Index Ranges" (grassland column), which
 * publishes the same bands to two decimal places: Index 1 0-3.04, Index 2
 * 3.05-5.04, Index 3 5.05-8.00, Index 4 >8.00 mg/l. The Green Book's
 * rounder 3.0/5.0/8.0 breakpoints and the statutory 3.04/5.04/8.00 ones
 * agree everywhere except the narrow 3.00-3.04 and 5.00-5.04 mg/l slivers,
 * where the statutory table governs since P Index also gates the NAP
 * ceiling functions below. Grassland column only — this app's only
 * enterprise (see file header); the statutory "other crops" column has
 * different Index 2/3 boundaries and isn't implemented.
 */
export function pIndexFromMgL(mgL: number): SoilIndex {
  if (mgL <= 3.04) return 1;
  if (mgL <= 5.04) return 2;
  if (mgL <= 8.0) return 3;
  return 4;
}

/** Table 6-5. mg/l Morgan's K. */
export function kIndexFromMgL(mgL: number): SoilIndex {
  if (mgL <= 50) return 1;
  if (mgL <= 100) return 2;
  if (mgL <= 150) return 3;
  return 4;
}

// ---------------------------------------------------------------------------
// Phosphorus (P) — Tables 13-2, 13-3, 13-4.
// ---------------------------------------------------------------------------

export type GrasslandSystem = "dairy" | "drystock";

/** Table 13-2: available P (kg/ha) for build-up on mineral soils, by index. */
const P_BUILDUP_KG_HA: Record<SoilIndex, number> = { 1: 20, 2: 10, 3: 0, 4: 0 };

export function pBuildUpKgHa(index: SoilIndex): number {
  return P_BUILDUP_KG_HA[index];
}

/**
 * Table 13-3: grazing maintenance P (kg/ha) to replace offtakes, by
 * grassland stocking rate (kg/ha of organic N) and system. The source
 * presents five discrete reference rows (≤100, 130, 170, 210, ≥210) rather
 * than a formula — treated here as banded steps (nearest-lower breakpoint),
 * matching the banding style the same document uses elsewhere (e.g. Table
 * 12-9's NAP ceiling), rather than linearly interpolated, since the source
 * table gives no interpolation instruction and its own README flags that
 * merged-cell PDF tables can flatten imperfectly — banding is the more
 * conservative reading than assuming smooth interpolation between points.
 */
const P_GRAZING_MAINTENANCE_BANDS: { maxOrgNKgHa: number; dairy: number; drystock: number }[] = [
  { maxOrgNKgHa: 100, dairy: 6, drystock: 4 },
  { maxOrgNKgHa: 130, dairy: 10, drystock: 7 },
  { maxOrgNKgHa: 170, dairy: 14, drystock: 10 },
  { maxOrgNKgHa: 210, dairy: 19, drystock: 13 },
  { maxOrgNKgHa: Infinity, dairy: 23, drystock: 16 },
];

/** Grazing area only (Table 13-3 note 3) — not the whole farm's P need. */
export function pMaintenanceGrazingKgHa(orgNStockingRateKgHa: number, system: GrasslandSystem): number {
  const band = P_GRAZING_MAINTENANCE_BANDS.find((b) => orgNStockingRateKgHa <= b.maxOrgNKgHa)!;
  return band[system];
}

/**
 * Table 13-4: silage/hay P maintenance (kg/ha) to replace offtakes, at a
 * 5 t DM/ha baseline yield, ±4 kg/t DM per t/ha away from that baseline
 * (table footnote 2). Index 4: no chemical P advised.
 */
const SILAGE_YIELD_BASELINE_T_DM_HA = 5;
const P_SILAGE_YIELD_ADJUST_KG_PER_T = 4;

export function pMaintenanceSilageKgHa(
  cutNumber: 1 | 2 | 3,
  index: SoilIndex,
  expectedYieldTDMha: number = SILAGE_YIELD_BASELINE_T_DM_HA,
): number {
  if (index === 4) return 0;
  const base = cutNumber === 1 ? 20 : 10; // index 1-3, first cut vs 2nd/subsequent
  const yieldDelta = expectedYieldTDMha - SILAGE_YIELD_BASELINE_T_DM_HA;
  return Math.max(0, base + yieldDelta * P_SILAGE_YIELD_ADJUST_KG_PER_T);
}

// ---------------------------------------------------------------------------
// Potassium (K) — Tables 14-1, 14-2.
// ---------------------------------------------------------------------------

/** Table 14-1: available K (kg/ha) for grazing at a 2 LU/ha (≈170 kg/ha
 * organic N — the table's own stated equivalence) stocking rate, by index
 * and system. Footnotes 1/2: ±5 kg/ha per 40 kg/ha of organic N away from
 * that 170 kg/ha baseline — an explicit linear-step formula from the
 * source, not an interpolation assumption of ours. */
const K_GRAZING_BASE_ORG_N_KG_HA = 170;
const K_GRAZING_STEP_KG_PER_40_ORG_N = 5;
const K_GRAZING_BASE_KG_HA: Record<SoilIndex, Record<GrasslandSystem, number>> = {
  1: { dairy: 90, drystock: 75 },
  2: { dairy: 60, drystock: 45 },
  3: { dairy: 30, drystock: 15 },
  4: { dairy: 0, drystock: 0 },
};

export function kGrazingKgHa(index: SoilIndex, system: GrasslandSystem, orgNStockingRateKgHa: number): number {
  if (index === 4) return 0;
  const base = K_GRAZING_BASE_KG_HA[index][system];
  const steps = (orgNStockingRateKgHa - K_GRAZING_BASE_ORG_N_KG_HA) / 40;
  return Math.max(0, base + steps * K_GRAZING_STEP_KG_PER_40_ORG_N);
}

/**
 * Table 14-2: available K (kg/ha) for silage/hay, at a 5 t DM/ha (1st cut)
 * or 3 t DM/ha (2nd+ cut) baseline yield, ±25 kg/ha per extra t/ha DM
 * (footnote 1). Index 4: none required in the sampled year.
 */
const K_SILAGE_CUT1_YIELD_BASELINE_T_DM_HA = 5;
const K_SILAGE_CUT2_YIELD_BASELINE_T_DM_HA = 3;
const K_SILAGE_YIELD_ADJUST_KG_PER_T = 25;
const K_SILAGE_BASE_KG_HA: Record<SoilIndex, { cut1: number; cut2Plus: number }> = {
  1: { cut1: 185, cut2Plus: 75 },
  2: { cut1: 155, cut2Plus: 75 },
  3: { cut1: 125, cut2Plus: 75 },
  4: { cut1: 0, cut2Plus: 0 },
};

export function kSilageKgHa(cutNumber: 1 | 2 | 3, index: SoilIndex, expectedYieldTDMha?: number): number {
  if (index === 4) return 0;
  const isFirstCut = cutNumber === 1;
  const base = isFirstCut ? K_SILAGE_BASE_KG_HA[index].cut1 : K_SILAGE_BASE_KG_HA[index].cut2Plus;
  const baselineYield = isFirstCut ? K_SILAGE_CUT1_YIELD_BASELINE_T_DM_HA : K_SILAGE_CUT2_YIELD_BASELINE_T_DM_HA;
  const yieldDelta = (expectedYieldTDMha ?? baselineYield) - baselineYield;
  return Math.max(0, base + yieldDelta * K_SILAGE_YIELD_ADJUST_KG_PER_T);
}

// ---------------------------------------------------------------------------
// Nitrogen (N) — Tables 12-3 (suckler calf-to-beef grazing) and 12-7
// (cut swards). This farm's system (steers finished ~24mo, heifers ~20mo)
// matches Table 12-3's own title, not Table 12-2 (calf-to-weaning only).
// ---------------------------------------------------------------------------

/**
 * Table 12-3, "Total N" column — annual available N (kg/ha) by grazing
 * stocking rate (LU/ha). Unlike the P/K bands above, these rows increase
 * smoothly in fixed 0.25 LU/ha steps with no merged-cell anomaly, so
 * linear interpolation between adjacent published rows is used — a
 * defensible reading a farmer would make manually with a ruler on the
 * printed table, not a fabricated curve.
 */
const N_GRAZING_SUCKLER_TO_BEEF_TABLE: { stockingRateLUHa: number; totalNKgHa: number }[] = [
  { stockingRateLUHa: 1.0, totalNKgHa: 35 },
  { stockingRateLUHa: 1.25, totalNKgHa: 53 },
  { stockingRateLUHa: 1.5, totalNKgHa: 75 },
  { stockingRateLUHa: 1.75, totalNKgHa: 103 },
  { stockingRateLUHa: 2.0, totalNKgHa: 132 },
  { stockingRateLUHa: 2.25, totalNKgHa: 162 },
  { stockingRateLUHa: 2.5, totalNKgHa: 193 },
  { stockingRateLUHa: 2.75, totalNKgHa: 215 },
  { stockingRateLUHa: 3.0, totalNKgHa: 241 },
];

export function nGrazingSucklerToBeefKgHa(stockingRateLUHa: number): number {
  const table = N_GRAZING_SUCKLER_TO_BEEF_TABLE;
  if (stockingRateLUHa <= table[0].stockingRateLUHa) return table[0].totalNKgHa;
  const last = table[table.length - 1];
  if (stockingRateLUHa >= last.stockingRateLUHa) return last.totalNKgHa;
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (stockingRateLUHa >= a.stockingRateLUHa && stockingRateLUHa <= b.stockingRateLUHa) {
      const t = (stockingRateLUHa - a.stockingRateLUHa) / (b.stockingRateLUHa - a.stockingRateLUHa);
      return a.totalNKgHa + t * (b.totalNKgHa - a.totalNKgHa);
    }
  }
  return last.totalNKgHa;
}

/**
 * Table 12-3 footnote 2 — standard Livestock Unit (LU) definitions used to
 * convert a headcount into a grazing stocking rate. Sourced, not invented:
 * suckler cow 0.9 LU, calf (0-12mo) 0.3 LU, yearling (13-24mo) 0.7 LU,
 * adult (>24mo) 1.0 LU. Our `LivestockGroup` doesn't reliably carry
 * `avgAgeMonths` yet (Phase 1 mock data leaves it mostly unset), so each
 * `LivestockCategory` is mapped to its most representative age band for a
 * calf-to-beef system (steers/heifers assumed yearling-band, matching this
 * farm's "finished at 20-24 months" system) — documented here, not derived
 * per-animal, until per-animal age is tracked.
 */
export const LIVESTOCK_UNITS_PER_HEAD: Record<LivestockCategory, number> = {
  suckler_cow: 0.9,
  dairy_cow: 1.0, // not a calf-to-beef category; included for type completeness only
  bull: 1.0,
  calf: 0.3,
  weanling: 0.3,
  store: 0.7,
  steer: 0.7,
  heifer: 0.7,
};

export function totalLivestockUnits(groups: LivestockGroup[]): number {
  return groups.reduce((sum, g) => sum + g.count.value * LIVESTOCK_UNITS_PER_HEAD[g.category], 0);
}

/**
 * Table 12-7: N application rate (kg/ha) for cut swards. The "grazed
 * rather than cut in the previous year" variant (footnote 4) uses lower
 * rates because residual soil N from grazing offsets some of the need.
 */
export function nSilageKgHa(cutNumber: 1 | 2 | 3, wasGrazedPreviousYear: boolean): number {
  const isFirstCut = cutNumber === 1;
  if (wasGrazedPreviousYear) return isFirstCut ? 100 : 85;
  return isFirstCut ? 125 : 100;
}

// ---------------------------------------------------------------------------
// Cattle slurry organic offset — Table 9-8 (typical available N/P/K by
// slurry dry-matter % and application rate), adjusted per its own
// footnote 3 for low soil index (P Index 1/2 → 50% P availability, K
// Index 1/2 → 90% K availability vs. the table's Index-3/4 baseline).
// ---------------------------------------------------------------------------

interface SlurryGridPoint {
  rateTHa: number;
  n4: number; p4: number; k4: number; // 4% DM
  n6: number; p6: number; k6: number; // 6% DM
  n8: number; p8: number; k8: number; // 8% DM
  n10: number; p10: number; k10: number; // 10% DM
}

/** Table 9-8, spring/splashplate column (30% NFRV per Table 9-2) — the
 * table's own default basis. P/K here are at Index 3/4 (100% availability,
 * per footnote 3); Index 1/2 fields get the 50%/90% adjustment applied on
 * top in `slurryAvailableKgHa` below. 1 tonne slurry = 1 m³ (footnote 4). */
const SLURRY_TABLE_9_8: SlurryGridPoint[] = [
  { rateTHa: 11, n4: 5, p4: 4, k4: 23, n6: 8, p6: 5, k6: 32, n8: 10, p8: 7, k8: 40, n10: 12, p10: 8, k10: 49 },
  { rateTHa: 22, n4: 11, p4: 7, k4: 47, n6: 15, p6: 10, k6: 64, n8: 20, p8: 13, k8: 80, n10: 24, p10: 16, k10: 97 },
  { rateTHa: 33, n4: 16, p4: 11, k4: 70, n6: 23, p6: 15, k6: 95, n8: 30, p8: 20, k8: 121, n10: 37, p10: 25, k10: 146 },
  { rateTHa: 44, n4: 21, p4: 15, k4: 93, n6: 31, p6: 21, k6: 127, n8: 40, p8: 27, k8: 161, n10: 49, p10: 33, k10: 195 },
  { rateTHa: 55, n4: 27, p4: 18, k4: 116, n6: 38, p6: 26, k6: 159, n8: 50, p8: 33, k8: 201, n10: 61, p10: 41, k10: 244 },
];

const SLURRY_DM_COLUMNS = [4, 6, 8, 10] as const;

function slurryGridValue(point: SlurryGridPoint, nutrient: "n" | "p" | "k", dmPct: number): number {
  const key = (`${nutrient}${dmPct}` as const) as keyof SlurryGridPoint;
  return point[key] as number;
}

function nearestDmColumn(dmPct: number): (typeof SLURRY_DM_COLUMNS)[number] {
  return SLURRY_DM_COLUMNS.reduce((closest, col) =>
    Math.abs(col - dmPct) < Math.abs(closest - dmPct) ? col : closest,
  );
}

/**
 * Linear interpolation across Table 9-8's rate breakpoints (11/22/33/44/55
 * t/ha), at the nearest published DM% column — a farmer's actual slurry DM%
 * rarely lands exactly on 4/6/8/10%, but the table only publishes those
 * four columns, so the nearest is used rather than interpolating a second
 * dimension the source doesn't provide enough points to interpolate safely.
 */
function slurryAvailableAtIndex34(rateTHa: number, dmPct: number): { n: number; p: number; k: number } {
  const col = nearestDmColumn(dmPct);
  const table = SLURRY_TABLE_9_8;
  const clampedRate = Math.max(table[0].rateTHa, Math.min(rateTHa, table[table.length - 1].rateTHa));
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (clampedRate >= a.rateTHa && clampedRate <= b.rateTHa) {
      const t = (clampedRate - a.rateTHa) / (b.rateTHa - a.rateTHa);
      const interp = (nutrient: "n" | "p" | "k") =>
        slurryGridValue(a, nutrient, col) + t * (slurryGridValue(b, nutrient, col) - slurryGridValue(a, nutrient, col));
      return { n: interp("n"), p: interp("p"), k: interp("k") };
    }
  }
  const last = table[table.length - 1];
  return { n: slurryGridValue(last, "n", col), p: slurryGridValue(last, "p", col), k: slurryGridValue(last, "k", col) };
}

/** Table 9-8 footnote 3: P Index 1/2 → 50% P availability; K Index 1/2 →
 * 90% K availability, vs. the table's own Index 3/4 baseline (100%). */
const LOW_INDEX_P_AVAILABILITY_FACTOR = 0.5;
const LOW_INDEX_K_AVAILABILITY_FACTOR = 0.9;

export function slurryAvailableKgHa(
  rateM3ha: number,
  dmPct: number,
  pIndex: SoilIndex,
  kIndex: SoilIndex,
): { n: number; p: number; k: number } {
  const base = slurryAvailableAtIndex34(rateM3ha, dmPct); // 1 m³ = 1 t
  return {
    n: base.n,
    p: pIndex <= 2 ? base.p * LOW_INDEX_P_AVAILABILITY_FACTOR : base.p,
    k: kIndex <= 2 ? base.k * LOW_INDEX_K_AVAILABILITY_FACTOR : base.k,
  };
}

/** Table 9-1 average cattle slurry dry-matter %, used as the default when
 * a farm has no verified/farmer-adjusted slurry analysis of its own. */
export const NATIONAL_AVG_SLURRY_DM_PCT = 6.3;

// ---------------------------------------------------------------------------
// NAP statutory ceilings.
//
// UPDATED against a real extract of the current regulation: the "Farm
// Return Core Data v4" workbook the user supplied contains S.I. 588/2025's
// own Table 13 (N) and Table 15a/15b (P) — see docs/evidence-register.md.
// This superseded the Green Book's Tables 12-9/12-10/13-6/13-7, which the
// 2020-edition source document itself cites to "NAP, S.I. 605 of 2017", an
// older regulation. Values below are now `regulatory: "compliance_value"`
// where the new extract confirms them; the two functions the extract
// doesn't cover stay `"planning_advice"`, explicitly noted at each one —
// per CLAUDE.md, ambiguity is called out, never silently resolved.
//
// Both regulatory grazing-N and grazing-P ceilings key off the SAME
// organic-N stocking-rate bands (≤85 / 86-130 / 131-170 / 171-210 / >210
// kg N/ha) — `calculateGrasslandStockingRateKgHa` below computes that
// shared input.
// ---------------------------------------------------------------------------

/**
 * S.I. 588/2025 Table 13, "Annual Maximum Available Nitrogen on
 * Grassland" — CONFIRMED, replaces the Green Book's Table 12-9 estimate
 * (206/282/250 kg/ha), which turned out wrong at every band once checked
 * against the actual regulation: this table's 5 bands (vs. the Green
 * Book's 3) and its non-monotonic 185 → 241 → 214 kg/ha shape for the top
 * three bands are exactly as published — not smoothed or "corrected",
 * since that shape is the real statutory schedule, not a data error.
 */
const NAP_N_GRAZING_BANDS: { maxOrgNKgHa: number; ceilingKgHa: number }[] = [
  { maxOrgNKgHa: 85, ceilingKgHa: 90 },
  { maxOrgNKgHa: 130, ceilingKgHa: 114 },
  { maxOrgNKgHa: 170, ceilingKgHa: 185 },
  { maxOrgNKgHa: 210, ceilingKgHa: 241 },
  { maxOrgNKgHa: Infinity, ceilingKgHa: 214 },
];

export function napMaxAvailableNGrazingKgHa(orgNStockingRateKgHa: number): number {
  const band = NAP_N_GRAZING_BANDS.find((b) => orgNStockingRateKgHa <= b.maxOrgNKgHa)!;
  return band.ceilingKgHa;
}

/**
 * S.I. 119/2026 amendment: reduced chemical-N allowances, effective 1
 * January 2028, for specified derogation holdings in named hydrological
 * catchments only — NOT applied by `napMaxAvailableNGrazingKgHa` above.
 * This app has no per-farm "derogation status" or "named catchment"
 * attribute yet to gate it correctly, and the effective date is still
 * future — exposed as real, dated, sourced data so a future
 * catchment/derogation feature can consult it without re-deriving these
 * numbers, rather than silently blended into the default ceiling now.
 */
export const NAP_N_CATCHMENT_AMENDMENT_2028 = {
  effectiveFrom: "2028-01-01",
  legislation: "S.I. 119/2026",
  bands: [
    { stockingRateBand: "171-210", ceilingKgHa: 229 },
    { stockingRateBand: ">210", ceilingKgHa: 203 },
  ],
} as const;

/**
 * Green Book Table 12-10, "max available N for cut-only grassland" —
 * STILL UNCONFIRMED. The new S.I. 588/2025 extract in hand only covers
 * grazing-land N (Table 13 above); it doesn't include a cut-only-specific
 * N ceiling, so this function's citation stays the Green Book's own
 * "NAP, S.I. 605 of 2017" reference, unverified against the 2025
 * regulation's current schedule — `regulatory: "planning_advice"` still
 * applies here specifically.
 */
export function napMaxAvailableNCutOnlyKgHa(cutNumber: 1 | 2 | 3 | "hay"): number {
  if (cutNumber === "hay") return 80;
  return cutNumber === 1 ? 125 : 100;
}

/**
 * S.I. 588/2025 Table 15a, "Annual Maximum Available Phosphorus on
 * Grassland" — CONFIRMED. These values are unchanged from what the Green
 * Book's Table 13-6 already had (a genuine independent cross-check: the
 * pre-existing figures turn out to match the current regulation exactly),
 * so only the citation/regulatory status changes here, not the numbers.
 * Caveats from the source table, not modelled (no field attribute for
 * them yet): organic matter >20% caps the applicable Index at 3; Index 4
 * has separate manure-surplus provisions; +15 kg P/ha may apply for grass
 * establishment on Index 1-3 (not added — no "field establishment status"
 * exists in the data model).
 */
const NAP_P_GRAZING_BANDS: { maxOrgNKgHa: number; byIndex: Record<SoilIndex, number> }[] = [
  { maxOrgNKgHa: 85, byIndex: { 1: 27, 2: 17, 3: 7, 4: 0 } },
  { maxOrgNKgHa: 130, byIndex: { 1: 30, 2: 20, 3: 10, 4: 0 } },
  { maxOrgNKgHa: 170, byIndex: { 1: 33, 2: 23, 3: 13, 4: 0 } },
  { maxOrgNKgHa: 210, byIndex: { 1: 36, 2: 26, 3: 16, 4: 0 } },
  { maxOrgNKgHa: Infinity, byIndex: { 1: 39, 2: 29, 3: 19, 4: 0 } },
];

export function napMaxAvailablePGrazingKgHa(orgNStockingRateKgHa: number, pIndex: SoilIndex): number {
  const band = NAP_P_GRAZING_BANDS.find((b) => orgNStockingRateKgHa <= b.maxOrgNKgHa)!;
  return band.byIndex[pIndex];
}

/**
 * S.I. 588/2025 Table 15b, "enhanced P build-up" — a HIGHER ceiling than
 * Table 15a above, available only where Article 17(6) conditions are met
 * (soil P and organic-matter testing) — never a default allowance, so
 * this is a separate function a caller must explicitly opt into, never
 * silently substituted for the standard Table 15a ceiling. The published
 * table only starts at the 131-170 stocking-rate band (no enhanced
 * build-up offered below that), so this returns `undefined` — not a
 * guessed 0 — for lower stocking rates, where the table simply publishes
 * nothing.
 */
const NAP_P_ENHANCED_BUILDUP_BANDS: { maxOrgNKgHa: number; byIndex: Record<SoilIndex, number> }[] = [
  { maxOrgNKgHa: 170, byIndex: { 1: 63, 2: 43, 3: 13, 4: 0 } },
  { maxOrgNKgHa: 210, byIndex: { 1: 66, 2: 46, 3: 16, 4: 0 } },
  { maxOrgNKgHa: Infinity, byIndex: { 1: 69, 2: 49, 3: 19, 4: 0 } },
];

export function napEnhancedPBuildUpKgHa(orgNStockingRateKgHa: number, pIndex: SoilIndex): number | undefined {
  if (orgNStockingRateKgHa <= 130) return undefined;
  const band = NAP_P_ENHANCED_BUILDUP_BANDS.find((b) => orgNStockingRateKgHa <= b.maxOrgNKgHa)!;
  return band.byIndex[pIndex];
}

/**
 * Green Book Table 13-7, "max available P for cut-only grassland" —
 * STILL UNCONFIRMED, and genuinely ambiguous rather than simply missing:
 * the new S.I. 588/2025 extract's Table 15a is titled "...on Grassland"
 * generally (not "grazing land" specifically), which could mean the 2025
 * regulation folded the old grazing/cut-only P split into one unified
 * table — or the extract just didn't include a cut-only-specific
 * breakdown. Resolving that requires the regulation's actual article
 * text, not guessing from a table title, so this function's citation
 * stays the Green Book's own (unverified) reference and
 * `regulatory: "planning_advice"` still applies here specifically.
 */
const NAP_P_CUT_ONLY: { firstCut: Record<SoilIndex, number>; subsequentCuts: Record<SoilIndex, number> } = {
  firstCut: { 1: 40, 2: 30, 3: 20, 4: 0 },
  subsequentCuts: { 1: 10, 2: 10, 3: 10, 4: 0 },
};

export function napMaxAvailablePCutOnlyKgHa(cutNumber: 1 | 2 | 3, pIndex: SoilIndex): number {
  return cutNumber === 1 ? NAP_P_CUT_ONLY.firstCut[pIndex] : NAP_P_CUT_ONLY.subsequentCuts[pIndex];
}

/**
 * Checks a field's total planned N/P application (organic + chemical
 * combined — the same `requirement` figure `calculateNutrientPlan` below
 * returns, since that's the total the field receives, not just the
 * chemical top-up) against the statutory NAP ceiling for its land use.
 *
 * Grazing land uses the CONFIRMED S.I. 588/2025 ceilings above
 * (`regulatory: "compliance_value"`); cut-only grassland uses the Green
 * Book's still-unverified figures (`regulatory: "planning_advice"`) — see
 * each ceiling function's own doc comment. The distinction is carried on
 * the result so the UI never presents an unconfirmed cut-only check with
 * the same visual weight as a confirmed grazing one.
 */
export function checkNapCompliance(
  landUse: "grazing" | "cut_only",
  requirement: { n: number; p: number },
  orgNStockingRateKgHa: number,
  pIndex: SoilIndex,
  cutNumber: 1 | 2 | 3 = 1,
): NapComplianceCheck {
  const nCeilingKgHa =
    landUse === "grazing" ? napMaxAvailableNGrazingKgHa(orgNStockingRateKgHa) : napMaxAvailableNCutOnlyKgHa(cutNumber);
  const pCeilingKgHa =
    landUse === "grazing" ? napMaxAvailablePGrazingKgHa(orgNStockingRateKgHa, pIndex) : napMaxAvailablePCutOnlyKgHa(cutNumber, pIndex);

  return {
    landUse,
    orgNStockingRateKgHa,
    nRequiredKgHa: requirement.n,
    nCeilingKgHa,
    nWithinCeiling: requirement.n <= nCeilingKgHa,
    pRequiredKgHa: requirement.p,
    pCeilingKgHa,
    pWithinCeiling: requirement.p <= pCeilingKgHa,
    regulatory: landUse === "grazing" ? "compliance_value" : "planning_advice",
    legislation:
      landUse === "grazing"
        ? "S.I. No. 588/2025, Tables 13 & 15a"
        : "Teagasc Green Book Tables 12-10/13-7 (unconfirmed against current NAP — see nutrients.ts)",
  };
}

// ---------------------------------------------------------------------------
// Purchased-product blend — turns a remaining (post-organic-offset) N/P/K
// requirement into quantities of three standard blends already used
// elsewhere in the product (Protected Urea 46-0-0, 18-6-12, 0-7-30 — see
// `mockMarketPrices`' Fertiliser category for current indicative prices).
// Deterministic three-step allocation, not a true least-cost optimiser
// (docs/agronomy-engine.md's "least-cost valid combination" is a Phase 3+
// refinement target, not this MVP's bar) — order chosen so 0-7-30 clears
// the K need first (its only nutrients besides K), then 18-6-12 clears
// remaining P (crediting its N and K contribution), then Protected Urea
// tops up any N shortfall. Every analysis percentage is the product's own
// declared N-P-K label, not a derived/estimated figure.
// ---------------------------------------------------------------------------

interface ProductAnalysis {
  name: string;
  npkAnalysis: string;
  nPct: number;
  pPct: number;
  kPct: number;
  pricePerTonneEur: number;
}

/** Prices from `mockMarketPrices` (Fertiliser category) — Phase 1 mock
 * market data pending the real Finance/Market Prices integration; kept in
 * sync manually until that module exposes a shared price lookup. */
const PRODUCTS: { zeroSevenThirty: ProductAnalysis; blend181612: ProductAnalysis; protectedUrea: ProductAnalysis } = {
  zeroSevenThirty: { name: "0-7-30", npkAnalysis: "0-7-30", nPct: 0, pPct: 0.07, kPct: 0.3, pricePerTonneEur: 480 },
  blend181612: { name: "18-6-12", npkAnalysis: "18-6-12", nPct: 0.18, pPct: 0.06, kPct: 0.12, pricePerTonneEur: 620 },
  protectedUrea: { name: "Protected Urea", npkAnalysis: "46-0-0", nPct: 0.46, pPct: 0, kPct: 0, pricePerTonneEur: 555 },
};

function productLine(product: ProductAnalysis, rateKgHa: number, areaHa: number): FertiliserProduct {
  const totalKg = rateKgHa * areaHa;
  return {
    name: product.name,
    npkAnalysis: product.npkAnalysis,
    rateKgHa: Math.round(rateKgHa * 10) / 10,
    totalKg: Math.round(totalKg * 10) / 10,
    costEur: Math.round((totalKg / 1000) * product.pricePerTonneEur),
  };
}

function allocatePurchasedProducts(
  remainingNKgHa: number,
  remainingPKgHa: number,
  remainingKKgHa: number,
  areaHa: number,
): { products: FertiliserProduct[]; totalCostEur: number } {
  const { zeroSevenThirty, blend181612, protectedUrea } = PRODUCTS;

  const rate0730 = remainingKKgHa > 0 ? remainingKKgHa / zeroSevenThirty.kPct : 0;
  const pFrom0730 = rate0730 * zeroSevenThirty.pPct;

  const pStillNeeded = Math.max(0, remainingPKgHa - pFrom0730);
  const rate181612 = pStillNeeded > 0 ? pStillNeeded / blend181612.pPct : 0;
  const nFrom181612 = rate181612 * blend181612.nPct;

  const nStillNeeded = Math.max(0, remainingNKgHa - nFrom181612);
  const rateUrea = nStillNeeded > 0 ? nStillNeeded / protectedUrea.nPct : 0;

  const lines = [
    rate0730 > 0.5 ? productLine(zeroSevenThirty, rate0730, areaHa) : null,
    rate181612 > 0.5 ? productLine(blend181612, rate181612, areaHa) : null,
    rateUrea > 0.5 ? productLine(protectedUrea, rateUrea, areaHa) : null,
  ].filter((l): l is FertiliserProduct => l !== null);

  return { products: lines, totalCostEur: lines.reduce((sum, l) => sum + l.costEur, 0) };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface CalculateNutrientPlanInput {
  field: Field;
  /** Net grassland area (grazing + silage) across the farm, ha — the
   * denominator for organic-N stocking rate (Tables 12-3/13-3/14-1 note). */
  farmGrasslandAreaHa: number;
  livestockGroups: LivestockGroup[];
  /** This field's slurry allocation, if any (from `SlurryAllocation[]`). */
  slurryAllocation?: SlurryAllocation;
  housing?: Housing;
  /** Undefined = grazing field. Set for a silage cut. */
  silage?: {
    cutNumber: 1 | 2 | 3;
    expectedYieldTDMha: number;
    wasGrazedPreviousYear?: boolean;
  };
  slurryTiming?: "spring" | "summer";
  slurryMethod?: "splashplate" | "trailing_shoe";
}

export function calculateGrasslandStockingRateKgHa(
  livestockGroups: LivestockGroup[],
  farmGrasslandAreaHa: number,
): number {
  if (farmGrasslandAreaHa <= 0) return 0;
  const stockingRateLUHa = totalLivestockUnits(livestockGroups) / farmGrasslandAreaHa;
  // Table 12-3's own LU→kg N mapping doubles as the organic-N stocking
  // rate used by the P/K tables (same "grassland stocking rate" concept
  // throughout the document) — reusing it here rather than introducing a
  // second, undocumented N-per-LU conversion.
  return nGrazingSucklerToBeefKgHa(stockingRateLUHa);
}

export function calculateNutrientPlan(input: CalculateNutrientPlanInput): NutrientPlan {
  const { field, farmGrasslandAreaHa, livestockGroups, slurryAllocation, silage } = input;
  const system: GrasslandSystem = "drystock"; // only enterprise this data model supports today
  const pIndex = field.fertility.pIndex.value;
  const kIndex = field.fertility.kIndex.value;
  const orgNStockingRateKgHa = calculateGrasslandStockingRateKgHa(livestockGroups, farmGrasslandAreaHa);

  let grossN: number;
  let grossP: number;
  let grossK: number;

  if (silage) {
    const { cutNumber, expectedYieldTDMha, wasGrazedPreviousYear = false } = silage;
    grossN = nSilageKgHa(cutNumber, wasGrazedPreviousYear);
    grossP = pBuildUpKgHa(pIndex) + pMaintenanceSilageKgHa(cutNumber, pIndex, expectedYieldTDMha);
    grossK = kSilageKgHa(cutNumber, kIndex, expectedYieldTDMha);
  } else {
    // The grazing N requirement (Table 12-3's "Total N" column) and the
    // organic-N stocking rate that the P/K tables key off are the same
    // number in this source — both are read off the same table/row.
    grossN = orgNStockingRateKgHa;
    grossP = pBuildUpKgHa(pIndex) + pMaintenanceGrazingKgHa(orgNStockingRateKgHa, system);
    grossK = kGrazingKgHa(kIndex, system, orgNStockingRateKgHa);
  }

  const rateM3ha = slurryAllocation && slurryAllocation.priority !== "not_suitable" ? slurryAllocation.volumeM3 / field.areaHa : 0;
  const totalM3 = rateM3ha * field.areaHa;
  const dmPct = NATIONAL_AVG_SLURRY_DM_PCT;
  const offset = rateM3ha > 0 ? slurryAvailableKgHa(rateM3ha, dmPct, pIndex, kIndex) : { n: 0, p: 0, k: 0 };

  const remainingN = Math.max(0, grossN - offset.n);
  const remainingP = Math.max(0, grossP - offset.p);
  const remainingK = Math.max(0, grossK - offset.k);

  const { products, totalCostEur } = allocatePurchasedProducts(remainingN, remainingP, remainingK, field.areaHa);

  const napCompliance: NapComplianceCheck = checkNapCompliance(
    silage ? "cut_only" : "grazing",
    { n: Math.round(grossN), p: Math.round(grossP) },
    orgNStockingRateKgHa,
    pIndex,
    silage?.cutNumber,
  );

  return {
    fieldId: field.id,
    requirement: tracked(
      { n: Math.round(grossN), p: Math.round(grossP), k: Math.round(grossK) },
      "estimated",
      "Teagasc Green Book (5th Ed., 2020)",
      { calculationVersion: NUTRIENT_ENGINE_VERSION },
    ),
    organicApplication: {
      rateM3ha: Math.round(rateM3ha * 10) / 10,
      totalM3: Math.round(totalM3),
      offsetN: Math.round(offset.n),
      offsetP: Math.round(offset.p),
      offsetK: Math.round(offset.k),
    },
    purchasedProducts: products,
    napCompliance,
    estimatedFieldCostEur: totalCostEur,
    calculationVersion: NUTRIENT_ENGINE_VERSION,
  };
}
