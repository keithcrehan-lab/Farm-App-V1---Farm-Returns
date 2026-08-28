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

import type { Field, FertiliserProduct, FieldUse, Housing, LivestockCategory, LivestockGroup, NapComplianceCheck, NutrientPlan, SlurryAllocation } from "./types";
import { tracked } from "./types";
import { ambiguous, blockedInsufficientEvidence, notApplicable, ok, type EngineOutcome } from "./evidence";
import { calculateStatutoryGrasslandStockingRateKgHa } from "./statutory-excretion";
import { statutoryManureNutrientValuePerHa } from "./statutory-manure-value";
import { evaluatePBuildUpEligibility } from "./p-build-up-eligibility";
import { checkFertiliserProductAdmissibility, FERTILISER_ADMISSIBILITY_GATE_VERSION, type FertiliserFormulation } from "./fertiliser-admissibility-gate";
import { checkLessMethodGate, type LessMethodGateOk } from "./less-method-gate";
import { requireCommonageStatus, requireSlurryApplicationMethod } from "./input-gates";
import { checkCommonageFertiliserGate } from "./commonage-gate";
import { checkLocalBufferOverride, checkNationalBufferDistance, type BufferFeature } from "./buffer-gate";
import { resolveLocalWaterBufferOverrideStatus } from "./input-gates";
import { checkSoilTestAgeValidity, type SoilTestAgeStatus } from "./soil-test-validity";

export const NUTRIENT_ENGINE_VERSION = "nutrient_engine_v1.0.0";

// ---------------------------------------------------------------------------
// Soil P/K Index classification — Green Book Table 6-4 / 13-1 (P, grassland
// column) and Table 6-5 (K). Units: mg/l (Morgan's solution extraction).
//
// V3 FIX (SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md §2.1, conflict #3):
// `pIndexFromMgL` used to silently classify the entire (8.00, 8.01] literal
// statutory micro-gap as Index 4, and had no `other_crop` crop-group
// column at all (grassland only). Per V3 Spec B1 / `GFT005`-`GFT010` /
// `rules_statutory/soil_phosphorus_index_2026.csv`, that micro-gap must
// surface as `AMBIGUOUS_STATUTORY_BOUNDARY` (a guarded, non-fabricated
// state — the conservative Index-4 allowance treatment is applied only by
// an explicit caller opt-in via `resolvePIndexConservatively`, never
// silently inside the classifier itself), and `other_crop` (Index 2
// 3.05-6.04, Index 3 6.05-10.00, ambiguous gap (10.00, 10.01]) is now
// implemented alongside `grassland`.
// ---------------------------------------------------------------------------

export type SoilIndex = 1 | 2 | 3 | 4;
export type CropGroup = "grassland" | "other_crop";

/**
 * This app has no explicit "crop group" field — `rules_statutory/
 * soil_phosphorus_index_2026.csv`'s two columns map directly onto the
 * existing `FieldUse` distinction already captured on every field:
 * `"tillage"` is the only non-grassland use this data model has, so it
 * maps to `other_crop`; every grazing/silage/mixed/other use maps to
 * `grassland` (this farm's actual enterprise — see file header).
 */
export function cropGroupForFieldUse(use: FieldUse): CropGroup {
  return use === "tillage" ? "other_crop" : "grassland";
}

interface PIndexBounds {
  index1Max: number;
  index2Max: number;
  index3Max: number;
  /** Literal statutory Index 4 threshold (`>ambiguousMax`) — the gap
   * between `index3Max` and this value is the source's own unresolved
   * micro-gap. */
  ambiguousMax: number;
}

const P_INDEX_BOUNDS: Record<CropGroup, PIndexBounds> = {
  grassland: { index1Max: 3.04, index2Max: 5.04, index3Max: 8.0, ambiguousMax: 8.01 },
  other_crop: { index1Max: 3.04, index2Max: 6.04, index3Max: 10.0, ambiguousMax: 10.01 },
};

/**
 * `rules_statutory/soil_phosphorus_index_2026.csv` — CONFIRMED current
 * statutory P Index ranges, both crop groups. Preserves raw lab
 * precision (spec B1: "do not round raw lab values just to force a
 * class"): the literal `(index3Max, ambiguousMax]` micro-gap returns
 * `AMBIGUOUS`, never a silently-forced Index 3 or 4.
 */
export function pIndexFromMgL(mgL: number, cropGroup: CropGroup = "grassland"): EngineOutcome<SoilIndex> {
  const bounds = P_INDEX_BOUNDS[cropGroup];
  if (mgL <= bounds.index1Max) return ok(1, "DERIVED");
  if (mgL <= bounds.index2Max) return ok(2, "DERIVED");
  if (mgL <= bounds.index3Max) return ok(3, "DERIVED");
  if (mgL <= bounds.ambiguousMax) {
    return ambiguous(
      "AMBIGUOUS_STATUTORY_BOUNDARY",
      `Morgan P ${mgL} mg/L (${cropGroup}) falls in the literal statutory micro-gap between Index 3's upper bound (${bounds.index3Max}) and Index 4's literal '>${bounds.ambiguousMax}' — S.I. 588/2025's published ranges leave (${bounds.index3Max}, ${bounds.ambiguousMax}] undefined.`,
    );
  }
  return ok(4, "DERIVED");
}

/**
 * Spec B1's explicit, opt-in conservative handling: "the engine may apply
 * the conservative P4 allowance treatment while explicitly recording that
 * this is a conservative handling of source ambiguity, not a fabricated
 * literal classification." Callers that need a concrete `SoilIndex` today
 * (e.g. `SoilFertility.pIndex: TrackedValue<SoilIndex>`, which has no
 * fifth "ambiguous" state) use this — never by silently coercing the
 * `AMBIGUOUS` outcome themselves — and MUST propagate
 * `conservativeTreatment` into that value's provenance (see
 * `farm-store.tsx`'s `addSoilTest`), never storing it indistinguishably
 * from a literal Index 4 classification.
 */
export function resolvePIndexConservatively(outcome: EngineOutcome<SoilIndex>): {
  index: SoilIndex;
  conservativeTreatment: boolean;
} {
  if (outcome.status === "OK") return { index: outcome.value, conservativeTreatment: false };
  // pIndexFromMgL only ever returns "OK" or "AMBIGUOUS".
  return { index: 4, conservativeTreatment: true };
}

// ---------------------------------------------------------------------------
// V3 FIX (SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md §2.1): `kIndexFromMgL`
// used to apply the mineral-soil bands to every soil unconditionally.
// `advisory_teagasc/soil_K_index_current.csv` defines separate peat-soil
// bands (0-100/101-175/176-250/>250 vs mineral's 0-50/51-100/101-150/>150)
// — `MappedSoil.organicCarbonStatus` already exists on `Field` to make this
// distinction; K Index is advisory only (not a statutory gate), so no
// EngineOutcome/ambiguity handling is needed here, only the material branch.
// ---------------------------------------------------------------------------

export type SoilMaterial = "mineral" | "peat";

/** `MappedSoil.organicCarbonStatus` already distinguishes peat from
 * mineral soils; `"high_organic"` and unset both default to `"mineral"`
 * — `advisory_teagasc/soil_K_index_current.csv` only publishes `mineral`/
 * `peat` bands, no separate high-organic-matter K Index table exists to
 * consult instead. */
export function soilMaterialForOrganicCarbonStatus(status: "mineral" | "peat" | "high_organic" | undefined): SoilMaterial {
  return status === "peat" ? "peat" : "mineral";
}

/** Table 6-5 (mineral) / `soil_K_index_current.csv` (peat). mg/l Morgan's K. */
export function kIndexFromMgL(mgL: number, soilMaterial: SoilMaterial = "mineral"): SoilIndex {
  if (soilMaterial === "peat") {
    if (mgL <= 100) return 1;
    if (mgL <= 175) return 2;
    if (mgL <= 250) return 3;
    return 4;
  }
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
// V3 closure pass, Priority 9 (GFT047): `advisory_teagasc/
// cattle_slurry_available_npk_spring_LESS.csv` — a newer, MORE SPECIFIC
// Teagasc source than Table 9-8 above (spring application, LESS method
// specifically), flagged as an unreconciled source conflict in the
// original audit (§2.5) and left open through the first unattended pass.
// `slurryAvailableKgHa` above is UNCHANGED — this is a genuinely separate,
// additive function for the narrower spring+LESS scenario it actually
// covers, not a replacement. Only 4 DM% points are published (2/4/6/7%),
// each already at spring/LESS conditions with no rate-breakpoint
// dimension to interpolate across (unlike Table 9-8's 5 rate points) — an
// EXACT DM% match is required, matching this codebase's established
// "no interpolation without validated evidence" discipline
// (`concentrateKgPerDay`'s own DMD exact-lookup fix).
// ---------------------------------------------------------------------------

interface SpringLessSlurryPoint {
  dmPct: number;
  nPerM3: number;
  pPerM3: number;
  kPerM3: number;
}

const SPRING_LESS_SLURRY_TABLE: SpringLessSlurryPoint[] = [
  { dmPct: 2, nPerM3: 0.4, pPerM3: 0.21, kPerM3: 1.4 },
  { dmPct: 4, nPerM3: 0.7, pPerM3: 0.35, kPerM3: 2.1 },
  { dmPct: 6, nPerM3: 1.0, pPerM3: 0.5, kPerM3: 3.5 },
  { dmPct: 7, nPerM3: 1.1, pPerM3: 0.6, kPerM3: 4.0 },
];

/**
 * `GFT047`. Real, additive, NOT wired into `calculateNutrientPlan` this
 * session (the same bounded-scope decision as every other new gate this
 * pass makes when a live wiring decision needs its own dedicated
 * reconciliation of `slurryAvailableKgHa`'s existing callers) — available
 * for that reconciliation once undertaken. `BLOCK_NO_INTERPOLATION` for
 * any DM% not one of the table's own 4 published points.
 */
export function slurryAvailableSpringLessKgHa(rateM3ha: number, dmPct: number): EngineOutcome<{ n: number; p: number; k: number }> {
  const point = SPRING_LESS_SLURRY_TABLE.find((p) => p.dmPct === dmPct);
  if (point === undefined) {
    return {
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "BLOCK_NO_INTERPOLATION",
      missingInputs: [`slurry DM% matching a published spring/LESS table row (${SPRING_LESS_SLURRY_TABLE.map((p) => p.dmPct).join(", ")})`],
    };
  }
  return ok(
    { n: point.nPerM3 * rateM3ha, p: point.pPerM3 * rateM3ha, k: point.kPerM3 * rateM3ha },
    "MEASURED",
  );
}

// ---------------------------------------------------------------------------
// NAP statutory ceilings.
//
// UPDATED against real extracts of the current regulation, in two passes.
// The "Farm Return Core Data v4" workbook gave S.I. 588/2025's Table 13
// (N, grazing/general grassland) and Table 15a/15b (P) — superseding the
// Green Book's Tables 12-9/13-6, which the 2020-edition source document
// itself cites to "NAP, S.I. 605 of 2017", an older regulation. The "Farm
// Return Gap Closure Data v5" workbook then supplied Table 16 (N) and
// Table 17 (P), the cut-only grassland ceilings that were still
// unconfirmed — every NAP ceiling this app implements is now confirmed
// current, `regulatory: "compliance_value"` throughout. See
// docs/evidence-register.md.
//
// Every regulatory N/P ceiling function below (grazing/general and
// cut-only alike) keys off the SAME organic-N stocking-rate bands (≤85 /
// 86-130 / 131-170 / 171-210 / >210 kg N/ha) —
// `calculateGrasslandStockingRateKgHa` below computes that shared input.
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

// ---------------------------------------------------------------------------
// SECOND-PASS FIX (V3 closure pass, Priority 1 — AF011, HIGH):
// `napMaxAvailableNGrazingKgHa` above grants the elevated 241/214 kg N/ha
// bands to ANY GSR in the 171-210/>210 ranges unconditionally — exactly
// the failure mode AF011 names ("GSR>170 alone does not entitle holding
// to higher N/P rates... Over-application"). `GFT023`/`GFT024`
// (`validation/golden_farm_tests.csv`, required-reading V3 evidence per
// this pack's own reading order) are the only source in this pack that
// states the missing eligibility criterion explicitly: >=5% non-grass
// eligible area. Absent that evidence, the holding falls back to the
// 131-170 band's own rate (185 kg/ha) — not an invented number, since no
// separate "standard" row is published for the elevated bands the way
// the P table (`grassland_available_p_max_2026.csv`) publishes a
// "standard" vs "increased_build_up_CONDITIONAL" pair for the same GSR
// range.
//
// Spec Section E3 is explicit that `derogation` status must NOT be
// treated as a simple eligibility toggle ("Do not create a simple
// 'derogation = on' toggle... the engine remains fail-closed to the
// ordinary ceiling" until a full derogation module is verified) — so
// this gate deliberately has no `derogation` parameter at all, only the
// non-grass-area criterion.
//
// `napMaxAvailableNGrazingKgHa` above is UNCHANGED and still exported —
// it is the raw table lookup other callers may legitimately need (e.g.
// to display "what the table says" versus "what this holding may
// actually use"); `checkNapCompliance` below now calls the
// eligibility-gated version instead, closing the live gap.
// ---------------------------------------------------------------------------

/** `GFT024`'s own evidence: 5% non-grass eligible area is the threshold
 * that unlocks the elevated 171-210/>210 kg N/ha rates. */
export const HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT = 5;

/** The GSR band above which elevated-rate eligibility even becomes
 * relevant — below this, `napMaxAvailableNGrazingKgHa`'s own bands
 * already give the correct ceiling with no eligibility question. */
const ELEVATED_RATE_GSR_THRESHOLD_KG_HA = 170;

/** `GFT023`/`GFT024`. Never grants the elevated rate from GSR alone —
 * `nonGrassPct` must be explicitly ≥5% (evidence the caller must supply;
 * this function does not default it to 0 or assume ineligibility means
 * "definitely wrong", only "not entitled to the elevated rate"). */
export function isEligibleForElevatedNRate(orgNStockingRateKgHa: number, nonGrassPct: number): boolean {
  if (orgNStockingRateKgHa <= ELEVATED_RATE_GSR_THRESHOLD_KG_HA) return true;
  return nonGrassPct >= HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT;
}

/** The real, eligibility-gated ceiling — falls back to the 131-170
 * band's own rate (185 kg/ha) for any GSR >170 that hasn't proven ≥5%
 * non-grass eligible area, rather than silently returning the table's
 * raw 241/214 figures. This is what `checkNapCompliance` now calls. */
export function napMaxAvailableNGrazingKgHaEligibilityGated(orgNStockingRateKgHa: number, nonGrassPct: number): number {
  if (isEligibleForElevatedNRate(orgNStockingRateKgHa, nonGrassPct)) {
    return napMaxAvailableNGrazingKgHa(orgNStockingRateKgHa);
  }
  return napMaxAvailableNGrazingKgHa(ELEVATED_RATE_GSR_THRESHOLD_KG_HA);
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
 * S.I. 588/2025 Table 16, "Cut-Only Grassland Nitrogen Ceilings" —
 * CONFIRMED, replaces the Green Book's Table 12-10 estimate (125/100 kg/ha
 * for cuts 1/2, no cut-3 or hay breakdown) with the real 3-cut schedule
 * (85/70/30). Hay isn't a separate row in the current regulation — Table
 * 16 itself labels its second row "Second cut silage OR hay", so hay maps
 * to the cut-2 ceiling here, not a fourth category.
 *
 * IMPORTANT — this table has a narrow statutory eligibility this function
 * does NOT check on its own: it only applies where the cut silage/hay is
 * sold with written evidence of sale, AND the holding either has no
 * grazing livestock or a previous-year organic-N stocking rate ≤85 kg/ha.
 * `checkNapCompliance` below is where that eligibility is actually
 * evaluated — a field that doesn't qualify falls back to the general
 * Table 13 "grassland" ceiling instead, never silently to this one.
 */
export function napMaxAvailableNCutOnlyKgHa(cutNumber: 1 | 2 | 3): number {
  if (cutNumber === 1) return 85;
  if (cutNumber === 2) return 70;
  return 30;
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

// ---------------------------------------------------------------------------
// V3 closure pass, Priority 9 (GFT025): the STANDARD Table 15a P ceiling
// has the exact same AF011-shaped gap the N ceiling had — Table 15a's
// own 171-210/>210 bands (26/29 kg P/ha at Index 2) are not automatically
// available just because the GSR is that high. `GFT025`'s own evidence
// (GSR 184, Index 2, no derogation, 0% non-grass -> the FALLBACK 23,
// the 131-170 band's own rate, not the raw table's 26) is read the same
// way GFT023/GFT024 were for N: this is a SEPARATE eligibility question
// from `P_BUILD_UP_ELIGIBILITY`/Table 15b (enhanced build-up, gated in
// `checkNapCompliance` via `pBuildUpEligible` above) — this is whether
// the STANDARD table's own high bands apply at all, reusing the exact
// same non-grass-area evidence and 170 kg N/ha threshold the N-side fix
// already established, since this pack publishes no separate P-specific
// threshold.
/**
 * `GFT025`. Never grants the 171-210/>210 Table 15a bands from GSR
 * alone — falls back to the 131-170 band's own rate, mirroring
 * `napMaxAvailableNGrazingKgHaEligibilityGated`'s exact logic.
 */
export function napMaxAvailablePGrazingKgHaEligibilityGated(orgNStockingRateKgHa: number, pIndex: SoilIndex, nonGrassPct: number): number {
  if (isEligibleForElevatedNRate(orgNStockingRateKgHa, nonGrassPct)) {
    return napMaxAvailablePGrazingKgHa(orgNStockingRateKgHa, pIndex);
  }
  return napMaxAvailablePGrazingKgHa(ELEVATED_RATE_GSR_THRESHOLD_KG_HA, pIndex);
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
 * S.I. 588/2025 Table 17, "Cut-Only Grassland Phosphorus Ceilings" —
 * CONFIRMED. Resolves the ambiguity flagged in an earlier pass (whether
 * the 2025 regulation folded grazing/cut-only P into one table, or this
 * extract simply hadn't covered cut-only yet): it's a genuinely separate
 * table, and its values turn out identical to the Green Book's own
 * Table 13-7 (40/30/20/0 first cut, 10/10/10/0 subsequent cuts) — another
 * independent cross-check, not just a citation update. Same eligibility
 * caveat as Table 16 (N) above applies — see `checkNapCompliance`.
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
 * Both tables this now selects between are CONFIRMED (`regulatory:
 * "compliance_value"`) — but which one applies to a cut field isn't just
 * "is it cut", per Table 16/17's own published eligibility text: the
 * higher cut-only ceiling only applies where the silage/hay is sold with
 * WRITTEN EVIDENCE OF SALE, and the holding either has no grazing
 * livestock or a previous-year organic-N stocking rate ≤85 kg/ha. A cut
 * field that doesn't meet both conditions — the ordinary case for a mixed
 * grazing/silage farm feeding its own stock, like this one — falls back
 * to the SAME general Table 13/15a "grassland" ceiling grazing land uses.
 * This resolves the ambiguity an earlier pass flagged (whether Table 15a's
 * "...on Grassland" title implied a single unified table): it doesn't
 * unify them outright, but it does mean Table 13/15a is the correct
 * default for any grassland field, cut or grazed, that Table 16/17
 * doesn't specifically carve out — a reasoned application of the
 * eligibility text, not a number invented to fill a gap.
 *
 * "No grazing livestock" is simplified here to `orgNStockingRateKgHa <=
 * 85` (covers the zero-livestock case and the low-stocking case with one
 * check, since both are ≤85 by definition) — this app doesn't separately
 * track "livestock present but never grazed".
 *
 * V3 FIX (SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md §2.4, conflict #5):
 * `cutIntendedForSale` alone used to be sufficient to grant the higher
 * Tables 16/17 ceiling — Table 16/17's own eligibility text additionally
 * requires WRITTEN EVIDENCE OF SALE (`rules_statutory/
 * silage_for_sale_n_limits_2026.csv`/`..._p_limits_2026.csv`,
 * `required_input_fields.csv`'s `SILAGE_SALE_EVIDENCE` row), which had no
 * gate at all (`GFT103`: same GSR/eligibility, `written_evidence:false`
 * -> must NOT use the sale table). `hasWrittenSaleEvidence` is now a
 * required condition alongside the existing ones, defaulting to `false`
 * — the safe default, matching `cutIntendedForSale`'s own existing
 * "never grant the higher ceiling without being told" convention.
 */
/**
 * V3 closure pass, Priority 1 (AF011): `nonGrassPct` is a NEW parameter,
 * safe-defaulted to `0` — the same "never grant the higher
 * treatment without being told" convention `cutIntendedForSale`/
 * `hasWrittenSaleEvidence` already use. A `0` default means "not proven
 * eligible", never "proven ineligible" — the eligibility gate
 * (`isEligibleForElevatedNRate`) treats it identically to an explicit
 * `false`, which is the correct, conservative reading of missing
 * evidence.
 */
export function checkNapCompliance(
  landUse: "grazing" | "cut_only",
  requirement: { n: number; p: number },
  orgNStockingRateKgHa: number,
  pIndex: SoilIndex,
  cutNumber: 1 | 2 | 3 = 1,
  cutIntendedForSale = false,
  hasWrittenSaleEvidence = false,
  nonGrassPct = 0,
  pBuildUpEligible = false,
): NapComplianceCheck {
  const saleEvidenceRequired = landUse === "cut_only" && cutIntendedForSale;
  const eligibleForCutOnlyCeiling =
    saleEvidenceRequired && hasWrittenSaleEvidence && orgNStockingRateKgHa <= 85;
  const highRateEligibilityApplicable = orgNStockingRateKgHa > ELEVATED_RATE_GSR_THRESHOLD_KG_HA;
  const highRateEligibilityConfirmed = isEligibleForElevatedNRate(orgNStockingRateKgHa, nonGrassPct);

  const nCeilingKgHa = eligibleForCutOnlyCeiling
    ? napMaxAvailableNCutOnlyKgHa(cutNumber)
    : napMaxAvailableNGrazingKgHaEligibilityGated(orgNStockingRateKgHa, nonGrassPct);

  // V3 closure pass, Priority 3 (P_BUILD_UP_ELIGIBILITY): Table 15b's
  // enhanced build-up figure is only consulted at all when a caller has
  // asserted `pBuildUpEligible` — the actual Article 17(6) gate
  // (`p-build-up-eligibility.ts`) lives outside this function, matching
  // how `nonGrassPct` above is evidence the CALLER supplies, not derived
  // here. `napEnhancedPBuildUpKgHa` returns `undefined` below the 131
  // kg/ha band (nothing published there), so even an eligible field at a
  // low stocking rate correctly falls back to the standard ceiling.
  const pBuildUpEligibilityApplicable = !eligibleForCutOnlyCeiling && napEnhancedPBuildUpKgHa(orgNStockingRateKgHa, pIndex) !== undefined;
  const enhancedPCeiling =
    !eligibleForCutOnlyCeiling && pBuildUpEligible ? napEnhancedPBuildUpKgHa(orgNStockingRateKgHa, pIndex) : undefined;
  // V3 closure pass, Priority 9 (GFT025): the standard Table 15a ceiling
  // itself needs the same non-grass-area eligibility gate the N ceiling
  // has (AF011's exact shape) — see the module-level comment on
  // `napMaxAvailablePGrazingKgHaEligibilityGated` above.
  const pCeilingKgHa = eligibleForCutOnlyCeiling
    ? napMaxAvailablePCutOnlyKgHa(cutNumber, pIndex)
    : (enhancedPCeiling ?? napMaxAvailablePGrazingKgHaEligibilityGated(orgNStockingRateKgHa, pIndex, nonGrassPct));

  return {
    landUse,
    orgNStockingRateKgHa,
    nRequiredKgHa: requirement.n,
    nCeilingKgHa,
    nWithinCeiling: requirement.n <= nCeilingKgHa,
    pRequiredKgHa: requirement.p,
    pCeilingKgHa,
    pWithinCeiling: requirement.p <= pCeilingKgHa,
    regulatory: "compliance_value",
    legislation: eligibleForCutOnlyCeiling
      ? "S.I. No. 588/2025, Tables 16 & 17"
      : enhancedPCeiling !== undefined
        ? "S.I. No. 588/2025, Tables 13 & 15b"
        : "S.I. No. 588/2025, Tables 13 & 15a",
    saleEvidenceRequired,
    saleEvidenceConfirmed: hasWrittenSaleEvidence,
    highRateEligibilityApplicable,
    highRateEligibilityConfirmed,
    pBuildUpEligibilityApplicable,
    pBuildUpEligibilityConfirmed: enhancedPCeiling !== undefined,
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
  /** V3 closure pass, Priority 4 (`FERTILISER_PRODUCT_ADMISSIBILITY`,
   * audit conflict #7): real, sourced formulation metadata about THIS
   * SPECIFIC catalogue product — never derived from `product.name` by
   * string-matching at runtime (the exact anti-pattern AF009 names). A
   * blend with no urea content genuinely has 0% ureic N — that is a fact
   * about the product's real composition, the same kind of hardcoded,
   * sourced fact `nPct`/`pPct`/`kPct` already are, not an inferred
   * default. "Protected Urea" is inhibited because DAFM-approved
   * protected/inhibited urea products are, by regulatory definition, urea
   * treated with a urease/nitrification inhibitor — that is what the
   * product category IS, not a guess drawn from its label text. */
  formulation: FertiliserFormulation;
}

/** Prices from `mockMarketPrices` (Fertiliser category) — Phase 1 mock
 * market data pending the real Finance/Market Prices integration; kept in
 * sync manually until that module exposes a shared price lookup. */
const PRODUCTS: { zeroSevenThirty: ProductAnalysis; blend181612: ProductAnalysis; protectedUrea: ProductAnalysis } = {
  zeroSevenThirty: {
    name: "0-7-30",
    npkAnalysis: "0-7-30",
    nPct: 0,
    pPct: 0.07,
    kPct: 0.3,
    pricePerTonneEur: 480,
    formulation: { physicalForm: "solid", ureicNPercent: 0, inhibitorStatus: "inhibited" },
  },
  blend181612: {
    name: "18-6-12",
    npkAnalysis: "18-6-12",
    nPct: 0.18,
    pPct: 0.06,
    kPct: 0.12,
    pricePerTonneEur: 620,
    formulation: { physicalForm: "solid", ureicNPercent: 0, inhibitorStatus: "inhibited" },
  },
  protectedUrea: {
    name: "Protected Urea",
    npkAnalysis: "46-0-0",
    nPct: 0.46,
    pPct: 0,
    kPct: 0,
    pricePerTonneEur: 555,
    formulation: { physicalForm: "solid", ureicNPercent: 46, inhibitorStatus: "inhibited" },
  },
};

/**
 * `FERTILISER_PRODUCT_ADMISSIBILITY` is now genuinely consulted, not
 * assumed — returns `null` (never included in a recommended blend) for
 * any product the gate does not resolve as `"ADMISSIBLE"`. For today's
 * static catalogue every line passes (all three are inhibited/solid or
 * carry no urea), so this is inert in practice; it stops being inert the
 * moment a future product's real formulation data says otherwise.
 */
function productLine(product: ProductAnalysis, rateKgHa: number, areaHa: number): FertiliserProduct | null {
  const admissibility = checkFertiliserProductAdmissibility(ok(product.formulation, "MEASURED"));
  if (admissibility.status !== "OK") return null;

  const totalKg = rateKgHa * areaHa;
  return {
    name: product.name,
    npkAnalysis: product.npkAnalysis,
    rateKgHa: Math.round(rateKgHa * 10) / 10,
    totalKg: Math.round(totalKg * 10) / 10,
    costEur: Math.round((totalKg / 1000) * product.pricePerTonneEur),
    formulation: tracked(product.formulation, "verified", "Product catalogue — known formulation", { calculationVersion: FERTILISER_ADMISSIBILITY_GATE_VERSION }),
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
    /** SilagePlan.intendedUse — gates NAP Table 16/17 eligibility
     * (`checkNapCompliance`): only "sale" or "both" can ever qualify.
     * Defaults to "own_livestock" (never eligible) when omitted, the
     * safer default — never grants the higher cut-only ceiling without
     * being told the silage is actually sold. */
    intendedUse?: "own_livestock" | "sale" | "both";
    /** SilagePlan.saleEvidence — V3 fix (audit conflict #5): Table 16/17
     * eligibility additionally requires written evidence of sale, not
     * `intendedUse` alone. Omitted/`hasWrittenEvidence: false` is the
     * safe default — never grants the higher ceiling without confirmed
     * evidence. */
    saleEvidence?: { hasWrittenEvidence: boolean };
  };
  slurryTiming?: "spring" | "summer";
  slurryMethod?: "splashplate" | "trailing_shoe";
  /** V3 closure-pass fix (AF011) — real evidence of this holding's
   * non-grass eligible area, as a percentage of total farm area. Feeds
   * `checkNapCompliance`'s high-rate-N eligibility gate
   * (`isEligibleForElevatedNRate`). Omitted defaults to `0` (not proven
   * eligible) — the safe default, never grants the elevated 241/214 kg
   * N/ha rate without being told the holding qualifies. */
  nonGrassPct?: number;
  /** V3 closure pass, Priority 3 — occupier-level Article 17(6)
   * conditions (`Farm.pBuildUpCompliance`). Omitted defaults to "not
   * proven" for every condition — the safe default, never grants the
   * enhanced Table 15b P ceiling without being told the holding
   * qualifies. See `p-build-up-eligibility.ts`. */
  pBuildUpCompliance?: {
    adviserEngaged: boolean;
    nmpSubmitted: boolean;
    trainingCompleted: boolean;
  };
  /** V3 closure pass, Priority 5 (`SOIL_TEST_VALIDITY`) — ISO date this
   * plan is calculated as of; defaults to the real current date. Follows
   * the same explicit-date-parameter convention as `livestock.ts`'s
   * `options.today`/`provenance.ts`'s `today` — never read internally via
   * `Date.now()` inside a pure calculation without being an explicit,
   * overridable input. */
  asOfDate?: string;
}

/** ISO date difference in whole-ish years (V3's own age-validity rules
 * only ever compare against integer-year thresholds — 4 years, 12 years
 * — so day-level precision is unneeded). */
function yearsBetweenIsoDates(fromIso: string, toIso: string): number {
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / msPerYear;
}

/**
 * AGRONOMIC ledger only (Green Book Table 12-3's LU-based N-requirement
 * curve) — feeds the grazing N/P/K *requirement* below (`grossN` etc.),
 * never the statutory compliance ceiling. V3 FIX (audit conflict #1): this
 * function used to ALSO be passed to `checkNapCompliance` as the
 * statutory "stocking rate" that selects the NAP N/P ceiling band — it
 * is not that figure (it's an agronomic N-fertiliser-requirement-by-LU-
 * density curve, not S.I. 119/2026 Table 7's per-animal-category
 * excretion total) and never should have been. The real statutory GSR
 * (`calculateStatutoryGrasslandStockingRateKgHa`,
 * `src/domain/statutory-excretion.ts`) is now what `calculateNutrientPlan`
 * passes to `checkNapCompliance` instead — this function's role is now
 * exactly, and only, the agronomic grazing-N-requirement curve.
 */
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

/**
 * `NutrientPlan.napCompliance` is now `EngineOutcome<NapComplianceCheck>`,
 * not a bare `NapComplianceCheck` — V3 fix (audit conflict #1). The
 * compliance ceiling can only be determined once the REAL statutory GSR
 * (`calculateStatutoryGrasslandStockingRateKgHa`) resolves for every
 * group in the herd; for this app's real herd today (no `avgAgeMonths`/
 * `sex` captured on any group), it does not, so this correctly returns
 * `BLOCKED_INSUFFICIENT_EVIDENCE` rather than a compliance check computed
 * from the wrong (agronomic) stocking-rate figure — fail closed, not a
 * regression. The agronomic ledger (`requirement`/`purchasedProducts`
 * below) is unaffected: it still uses the Green Book curve
 * (`calculateGrasslandStockingRateKgHa`), a legitimate, separately-
 * sourced agronomic figure, and continues to produce a real recommendation
 * even when the compliance ledger cannot be verified — the two ledgers
 * must never gate each other (spec Section A2).
 */
export function calculateNutrientPlan(input: CalculateNutrientPlanInput): NutrientPlan {
  const { field, farmGrasslandAreaHa, livestockGroups, slurryAllocation, silage } = input;
  const system: GrasslandSystem = "drystock"; // only enterprise this data model supports today
  const pIndex = field.fertility.pIndex.value;
  const kIndex = field.fertility.kIndex.value;
  const agronomicStockingRateKgHa = calculateGrasslandStockingRateKgHa(livestockGroups, farmGrasslandAreaHa);

  // V3 closure pass, Priority 5 (`SOIL_TEST_VALIDITY`, a "major gap" per
  // the original audit — nothing anywhere evaluated soil-test age before
  // this). SURFACED, not yet enforced: this is a real, computed status —
  // not the full "BLOCK regulated nutrient recommendation" behaviour the
  // V3 contract specifies, which would require `calculateNutrientPlan`
  // itself to become fail-closed-capable (a bigger, riskier return-type
  // change deliberately deferred rather than rushed). Only meaningful
  // when a real lab test exists (`verifiedTest`) — an estimated/farmer-
  // adjusted P-Index was never a "soil test" to begin with, so this is
  // `NOT_APPLICABLE` otherwise, not a false disregard.
  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const soilTestAgeValidity: EngineOutcome<SoilTestAgeStatus> =
    field.fertility.verifiedTest === undefined
      ? notApplicable("NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE")
      : checkSoilTestAgeValidity({
          ageYears: yearsBetweenIsoDates(field.fertility.verifiedTest.sampleDate, asOfDate),
          pIndex,
        });

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
    // AGRONOMIC stocking rate that the P/K tables key off are the same
    // number in this source — both are read off the same table/row. This
    // is deliberately the Green Book figure, not the statutory GSR — see
    // this function's own doc comment.
    grossN = agronomicStockingRateKgHa;
    grossP = pBuildUpKgHa(pIndex) + pMaintenanceGrazingKgHa(agronomicStockingRateKgHa, system);
    grossK = kGrazingKgHa(kIndex, system, agronomicStockingRateKgHa);
  }

  const rateM3ha = slurryAllocation && slurryAllocation.priority !== "not_suitable" ? slurryAllocation.volumeM3 / field.areaHa : 0;
  const totalM3 = rateM3ha * field.areaHa;
  const dmPct = NATIONAL_AVG_SLURRY_DM_PCT;
  const offset = rateM3ha > 0 ? slurryAvailableKgHa(rateM3ha, dmPct, pIndex, kIndex) : { n: 0, p: 0, k: 0 };

  const remainingN = Math.max(0, grossN - offset.n);
  const remainingP = Math.max(0, grossP - offset.p);
  const remainingK = Math.max(0, grossK - offset.k);

  // V3 closure pass, Priority 4 (`COMMONAGE_FERTILISER_GATE`, AF003
  // CRITICAL): real, wired — chemical fertiliser is a hard statutory
  // prohibition on commonage land, so a commonage field's purchased-
  // product blend is genuinely suppressed here, not merely reported
  // alongside a recommendation the farmer must not act on.
  // `field.commonageStatus` undefined/`"unknown"` fails closed to
  // `BLOCKED_INSUFFICIENT_EVIDENCE`, which this app's real fields (no
  // `commonageStatus` ever captured yet) correctly hit today — inert in
  // practice, real the moment a field's commonage status is captured.
  const commonageGateOutcome = checkCommonageFertiliserGate(requireCommonageStatus(field), "chemical_fertiliser");
  const chemicalFertiliserProhibitedByCommonage = commonageGateOutcome.status === "LEGAL_PROHIBITION";

  // V3 closure pass, Priority 4 (local buffer override layer, AF010) —
  // real, wired from `field.waterBufferContext`, exactly the input
  // `resolveLocalWaterBufferOverrideStatus` was built (Phase C) to feed.
  // `localOverrideDistanceM` (second closure pass, additive) now flows
  // through for real once a farmer records one — previously this data
  // model had nowhere to capture it, so the "authoritative_rule" branch
  // was permanently unreachable regardless of what a farmer entered.
  const localBufferOverrideStatus = checkLocalBufferOverride({
    actualDistanceM: field.waterBufferContext?.value.distanceM ?? 0,
    localOverrideStatus: resolveLocalWaterBufferOverrideStatus(field),
    localOverrideDistanceM: field.waterBufferContext?.value.localOverrideDistanceM,
  });

  // Provisional blend, before any buffer suppression — `allocatePurchasedProducts`
  // has no knowledge of buffer distance, and the national buffer check
  // below needs to know whether a chemical-fertiliser purchase would even
  // be proposed before it can pick the right material context (chemical
  // fertiliser's 3m minimum vs organic/soiled-water's 5-10m).
  const { products: allocatedProducts, totalCostEur: allocatedCostEur } = allocatePurchasedProducts(
    remainingN,
    remainingP,
    remainingK,
    field.areaHa,
  );

  // V3 closure pass — Priority 11 (AF010, national buffer half) built the
  // real `checkNationalBufferDistance` call, wired from
  // `field.waterBufferContext.featureType`, but the second closure pass's
  // own independent verification found its `LEGAL_PROHIBITION` result was
  // never actually consulted anywhere — computed into `NutrientPlan` and
  // then silently discarded, exactly like commonage would have been
  // before Priority 4 wired its suppression. Fixed here: a
  // `LEGAL_PROHIBITION` for the chemical-fertiliser material context
  // suppresses the purchased-product blend the same way commonage does;
  // an organic/soiled-water prohibition does not (this function does not
  // decide whether slurry is spread — `rateM3ha` is a pre-existing
  // farmer/allocation input, not a recommendation this function makes).
  const bufferMaterial = allocatedProducts.length > 0 ? "chemical_fertiliser" : rateM3ha > 0 ? "organic_fertiliser_or_soiled_water" : undefined;
  const nationalBufferDistanceStatus: EngineOutcome<"BOUNDARY_MET_SUBJECT_TO_OTHER_RULES"> =
    bufferMaterial === undefined
      ? notApplicable("NATIONAL_BUFFER_GATE_NOT_APPLICABLE")
      : field.waterBufferContext?.value.featureType === undefined || field.waterBufferContext.value.distanceM === undefined
        ? blockedInsufficientEvidence("MISSING_NATIONAL_BUFFER_ASSESSMENT", ["waterBufferContext.featureType", "waterBufferContext.distanceM"])
        : checkNationalBufferDistance({
            material: bufferMaterial,
            feature: field.waterBufferContext.value.featureType as BufferFeature,
            distanceM: field.waterBufferContext.value.distanceM,
          });

  const chemicalFertiliserProhibitedByBuffer =
    bufferMaterial === "chemical_fertiliser" &&
    (nationalBufferDistanceStatus.status === "LEGAL_PROHIBITION" || localBufferOverrideStatus.status === "LEGAL_PROHIBITION");
  const chemicalFertiliserProhibited = chemicalFertiliserProhibitedByCommonage || chemicalFertiliserProhibitedByBuffer;

  const products = chemicalFertiliserProhibited ? [] : allocatedProducts;
  const totalCostEur = chemicalFertiliserProhibited ? 0 : allocatedCostEur;

  const cutIntendedForSale = silage?.intendedUse === "sale" || silage?.intendedUse === "both";
  const hasWrittenSaleEvidence = silage?.saleEvidence?.hasWrittenEvidence ?? false;

  const statutoryGsrOutcome = calculateStatutoryGrasslandStockingRateKgHa(livestockGroups, farmGrasslandAreaHa);

  // V3 closure pass, Priority 4 (`LESS_METHOD_GATE`, AF004 HIGH): real,
  // wired from the field's own real slurry allocation
  // (`SlurryAllocation.applicationMethod`, already captured by Phase C's
  // `requireSlurryApplicationMethod` — no new UI capture needed). Closes
  // audit conflict #6 (the dead `slurryMethod`/`slurryTiming` parameters
  // are a separate, narrower cosmetic issue — this is the real gate they
  // should have fed).
  const lessMethodCompliance: EngineOutcome<LessMethodGateOk> =
    rateM3ha <= 0 || slurryAllocation === undefined
      ? notApplicable("LESS_GATE_NOT_APPLICABLE")
      : (() => {
          const methodOutcome = requireSlurryApplicationMethod(slurryAllocation);
          if (methodOutcome.status !== "OK") return methodOutcome;
          return checkLessMethodGate({
            material: "cattle_slurry",
            gsrKgNHa: statutoryGsrOutcome.status === "OK" ? statutoryGsrOutcome.value.gsrKgNHa : undefined,
            landUse: field.plannedUse.value === "tillage" ? "arable" : "grass",
            method: methodOutcome.value,
          });
        })();
  // V3 closure pass, Priority 3 (P_BUILD_UP_ELIGIBILITY): evaluated here,
  // once the real statutory GSR is known, so `checkNapCompliance` never
  // has to re-derive it — `hasCurrentVerifiedSoilPTest`/`organicMatterPct`
  // come straight from this field's own real fertility record (enter-
  // once), never a separate farmer question.
  const pBuildUpEligibility =
    statutoryGsrOutcome.status === "OK"
      ? evaluatePBuildUpEligibility({
          hasCurrentVerifiedSoilPTest: field.fertility.verifiedTest !== undefined,
          organicMatterPct: field.fertility.verifiedTest?.organicMatterPct,
          adviserEngaged: input.pBuildUpCompliance?.adviserEngaged,
          nmpSubmitted: input.pBuildUpCompliance?.nmpSubmitted,
          trainingCompleted: input.pBuildUpCompliance?.trainingCompleted,
          orgNStockingRateKgHa: statutoryGsrOutcome.value.gsrKgNHa,
          nonGrassPct: input.nonGrassPct ?? 0,
        })
      : undefined;
  // V3 closure pass (second pass, `SOIL_TEST_VALIDITY` enforcement) — the
  // independent verification found `soilTestAgeValidity` above was
  // computed and returned on `NutrientPlan` but never actually consulted
  // by `checkNapCompliance`, so a legally DISREGARDED soil test (4+ years
  // old, not P-Index 4) still backed a "compliance_value" statutory P
  // ceiling exactly as if it were current. `checkNapCompliance` itself
  // stays a pure P-Index-in function (its own signature/contract is
  // unchanged, matching every other gate's separation-of-concerns) — the
  // downgrade is applied here, once, to the result it returns.
  const rawNapCompliance = checkNapCompliance(
    silage ? "cut_only" : "grazing",
    { n: Math.round(grossN), p: Math.round(grossP) },
    statutoryGsrOutcome.status === "OK" ? statutoryGsrOutcome.value.gsrKgNHa : 0,
    pIndex,
    silage?.cutNumber,
    cutIntendedForSale,
    hasWrittenSaleEvidence,
    input.nonGrassPct ?? 0,
    pBuildUpEligibility?.status === "OK" && pBuildUpEligibility.value.eligible,
  );
  const soilTestDisregarded = soilTestAgeValidity.status === "OK" && soilTestAgeValidity.value === "DISREGARD";
  const napCompliance: EngineOutcome<NapComplianceCheck> =
    statutoryGsrOutcome.status === "OK"
      ? ok(
          soilTestDisregarded
            ? {
                ...rawNapCompliance,
                regulatory: "planning_advice",
                soilTestDisregardedReason:
                  "This field's soil P Index comes from a lab test that is now legally disregarded (4+ years old, S.I. 588/2025) — the P ceiling above is planning advice, not a confirmed statutory value, until a current soil test is recorded.",
              }
            : rawNapCompliance,
          "DERIVED",
        )
      : statutoryGsrOutcome;

  // V3 closure pass, Priority 2 (COMPLIANCE_MANURE_NP): the real statutory
  // manure N/P ledger value, computed entirely separately from
  // `offset`/`slurryAvailableKgHa` above (the Teagasc agronomic figure) —
  // see statutory-manure-value.ts's own header comment for why these two
  // numbers must never be conflated. "cattle_slurry" is the only manure
  // type this data model captures — this app's livestock model is
  // cattle-only (drystock) with no pig/poultry/sheep enterprise, so it is
  // not a guessed default, it is the only type any field on this farm
  // could actually produce.
  const statutoryManureValue = statutoryManureNutrientValuePerHa("cattle_slurry", totalM3, field.areaHa, pIndex);

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
    statutoryManureValue,
    commonageFertiliserGate: commonageGateOutcome,
    lessMethodCompliance,
    localBufferOverrideStatus,
    nationalBufferDistanceStatus,
    soilTestAgeValidity,
    estimatedFieldCostEur: totalCostEur,
    calculationVersion: NUTRIENT_ENGINE_VERSION,
  };
}
