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

import type { DataStatus, Field, FertiliserProduct, FieldNutrientRequirement, FieldNutrientRequirementArm, FieldUse, Housing, LivestockCategory, LivestockGroup, NapComplianceCheck, NutrientPlan, SlurryAllocation } from "./types";
import { tracked } from "./types";
import type { SlurryComposition, SlurryCompositionStatus } from "./slurry-composition";
import { ambiguous, blockedInsufficientEvidence, notApplicable, ok, weakestEvidenceState, type EngineOutcome, type EvidenceState } from "./evidence";
import { calculateStatutoryGrasslandStockingRateKgHa } from "./statutory-excretion";
import { statutoryManureNutrientValuePerHa } from "./statutory-manure-value";
import { evaluatePBuildUpEligibility } from "./p-build-up-eligibility";
import { checkFertiliserProductAdmissibility, FERTILISER_ADMISSIBILITY_GATE_VERSION, type FertiliserFormulation } from "./fertiliser-admissibility-gate";
import { checkLessMethodGate, type LessMethodGateOk, type SlurryApplicationMethod } from "./less-method-gate";
import { requireCommonageStatus, requireSlurryApplicationMethod } from "./input-gates";
import { classifySlurryTiming, SLURRY_TIMING_SOURCE, type SlurryTimingCategory } from "./slurry-timing";
import { checkCommonageFertiliserGate } from "./commonage-gate";
import { checkLocalBufferOverride, checkNationalBufferDistance, type BufferFeature } from "./buffer-gate";
import { resolveLocalWaterBufferOverrideStatus } from "./input-gates";
import { checkSoilTestAgeValidity, type SoilTestAgeStatus } from "./soil-test-validity";
import { laboratoryPIndexForSoilTestValidity, resolveFieldSoilIndexProvenance } from "./soil-index-provenance";
import { CSO_COMPOUND_0_7_30, CSO_COMPOUND_18_6_12, CSO_UREA_46N, latestPoint } from "./market";

// v1.1.0: CC-B2 / RISK-01 implementation correction — LESS P/K credit now
// applies the Index 1/2 availability reduction; v1.0.0 results omitted it.
// v1.2.0: CC-B4A implementation correction — a missing P or K Soil Index no
// longer yields an OK splashplate (Table 9-8) assessment built on the
// Index-1 placeholder; v1.1.0 results reported it as supported.
// v1.3.0: per-nutrient P/K Increment 2 — new production figure
// `organicApplication.availableNutrientByNutrient` (a known P or K slurry
// credit on a field whose other index is missing); every v1.2.0 output is
// otherwise unchanged (the internal Index-1 placeholder stays — CC-B5).
// v1.4.0: per-nutrient P/K Increment 3 — new production figures
// `requirementByNutrient` / `netRequirementByNutrient` (a known P or K gross
// and net requirement on a field whose other index is missing); every v1.3.0
// output is otherwise unchanged (the Index-1 placeholder stays — CC-B5).
export const NUTRIENT_ENGINE_VERSION = "nutrient_engine_v1.4.0";

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

/**
 * The real farm-wide grassland-area/non-grass-% aggregation every real
 * caller of `calculateNutrientPlan` across this app needs to compute its
 * own `farmGrasslandAreaHa`/`nonGrassPct` inputs — Table 12-3's own
 * "grassland stocking rate" concept, which by definition excludes
 * tillage ground (tillage grows a crop, it is not grazed). Fertiliser
 * Vertical campaign, Codex audit CRITICAL round 10, additive export: two
 * independent copies of this exact arithmetic already existed
 * (`src/orchestration/prompt/build-all.ts`'s `computeFarmGrasslandAggregates`,
 * itself fixed round 5 after a real, pre-existing tillage-inclusive bug;
 * `src/domain/finance.ts`'s own separate, still-buggy inline copy) —
 * this is now the one real, authoritative home for it at the correct
 * (lowest) layer, so any future caller — domain or orchestration — has
 * exactly one place to get it right, never a third independently-
 * drifting copy. Purely additive: `calculateNutrientPlan`/
 * `allocatePurchasedProducts` themselves are entirely unmodified.
 */
export function farmGrasslandAggregates(fields: readonly Pick<Field, "areaHa" | "plannedUse">[]): { farmGrasslandAreaHa: number; nonGrassPct: number } {
  const totalFarmAreaHa = fields.reduce((sum, f) => sum + f.areaHa, 0);
  const nonGrassAreaHa = fields.filter((f) => f.plannedUse?.value === "tillage").reduce((sum, f) => sum + f.areaHa, 0);
  const farmGrasslandAreaHa = totalFarmAreaHa - nonGrassAreaHa;
  const nonGrassPct = totalFarmAreaHa > 0 ? (nonGrassAreaHa / totalFarmAreaHa) * 100 : 0;
  return { farmGrasslandAreaHa, nonGrassPct };
}

/**
 * Codex audit CRITICAL (round 26) — the one real, authoritative check
 * for whether a field's own recorded `plannedUse` is a silage cut,
 * extracted (round 27) so `calculateNutrientPlan`'s own internal
 * `silageEvidenceOk` gate and every real caller that needs to know this
 * same fact (`src/lib/reports.ts`, `src/domain/real-alerts.ts`) share
 * one definition, never a second, independently-drifting copy of this
 * three-way `FieldUse` check. Lives here, not in
 * `fertiliser-recommendation.ts` alongside `isTillageField` — that
 * orchestration-layer module already imports from this one, so the
 * reverse import would be circular.
 */
export function isSilageCutPlannedUse(field: Pick<Field, "plannedUse">): boolean {
  return (
    field.plannedUse?.value === "silage_1st_cut" ||
    field.plannedUse?.value === "silage_2nd_cut" ||
    field.plannedUse?.value === "silage_3rd_cut"
  );
}

/**
 * Codex audit HIGH (round 31) — the real schema (`unique (field_id,
 * housing_id)`) genuinely permits more than one real slurry allocation
 * per field, one per housing source (a field draining slurry from two
 * separate sheds). `calculateNutrientPlan`'s own `slurryAllocation`
 * input has always been a single, optional object, and every one of
 * this vertical's real call sites picked the field's first matching row
 * with a bare `.find(...)`, silently discarding any second real
 * allocation and non-deterministically depending on database row order
 * — wrong for every downstream figure that reads it (organic offset,
 * purchased-product blend, NAP/manure trace, cost, reports, farm
 * demand). This is the one real, authoritative resolver: sums every
 * real, applicable (`priority !== "not_suitable"`) allocation's volume
 * for a field into a single combined input `calculateNutrientPlan`
 * already knows how to consume — no engine-level change needed, since
 * `volumeM3`/`priority`/`applicationMethod` are the only fields it
 * reads from this shape.
 *
 * `applicationMethod` is carried through only when every contributing
 * allocation shares the identical captured method — a genuine method
 * conflict (or any contributing allocation missing a captured method at
 * all) resolves to `undefined`, the same fail-closed "method not
 * captured" state `requireSlurryApplicationMethod` already enforces for
 * a single allocation; this app has no real basis to decide which
 * method governs a combined volume from two different real sources
 * spread differently, so it never guesses.
 *
 * Codex audit HIGH (round 32): "never captured" and "genuinely
 * conflicting real methods" both collapse to `applicationMethod:
 * undefined` above, but they are not the same evidence state — one
 * means the farmer hasn't recorded anything, the other means the farmer
 * recorded two real, disagreeing answers. `applicationMethodConflict`
 * carries that distinction through for `requireSlurryApplicationMethod`
 * to report correctly, without changing the fail-closed
 * `applicationMethod: undefined` behaviour itself (this app still never
 * guesses which method governs the combined volume).
 */
export interface ResolvedSlurryAllocation extends SlurryAllocation {
  applicationMethodConflict?: boolean;
}

export function resolveFieldSlurryAllocation(allocations: readonly SlurryAllocation[], fieldId: string): ResolvedSlurryAllocation | undefined {
  const applicable = allocations.filter((a) => a.fieldId === fieldId && a.priority !== "not_suitable");
  if (applicable.length === 0) return undefined;
  if (applicable.length === 1) return applicable[0];

  const totalVolumeM3 = applicable.reduce((sum, a) => sum + a.volumeM3, 0);
  const scores = applicable.map((a) => a.score).filter((s): s is number => s !== undefined);
  const firstMethod = applicable[0].applicationMethod?.value;
  const methodsAgree = firstMethod !== undefined && applicable.every((a) => a.applicationMethod?.value === firstMethod);
  // Distinct from `methodsAgree`: this counts only the real, captured
  // methods among the contributing allocations (ignoring any that never
  // captured one at all) — 2+ distinct values here means a genuine
  // conflict, not merely incomplete capture.
  const distinctCapturedMethods = new Set(
    applicable.map((a) => a.applicationMethod?.value).filter((v): v is NonNullable<typeof v> => v !== undefined),
  );

  return {
    fieldId,
    // Synthesised — never a real database row, and `calculateNutrientPlan`
    // itself never reads `housingId`/`score` from this input, so this
    // sentinel exists only to satisfy the shared `SlurryAllocation`
    // shape.
    housingId: "multiple",
    // Farmer-planned allocations carry no rank (`slurry-allocation-plan.ts`)
    // — only ranks that actually exist are combined, none is invented.
    ...(applicable.some((a) => a.priority === "high")
      ? { priority: "high" as const }
      : applicable.some((a) => a.priority === "medium")
        ? { priority: "medium" as const }
        : {}),
    volumeM3: totalVolumeM3,
    ...(scores.length > 0 ? { score: Math.max(...scores) } : {}),
    applicationMethod: methodsAgree ? applicable[0].applicationMethod : undefined,
    applicationMethodConflict: distinctCapturedMethods.size > 1,
  };
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

/** Applies the low P/K Soil Index availability factors above to an Index
 * 3/4-basis N/P/K figure. P depends only on P Index, K only on K Index; N
 * is never adjusted. Shared by the Table 9-8 path and (CC-B2 / RISK-01)
 * both LESS tables, whose own Teagasc note states the same Index 1/2
 * reduction (`CLM-OM-T2-NOTE`, agreeing with `CLM-GB-9-8-FN3`).
 * Per-nutrient P/K Increment 2: split into its P and K halves below so a
 * per-nutrient credit applies only its own index's factor. */
function applyLowSoilIndexAvailability(
  base: { n: number; p: number; k: number },
  pIndex: SoilIndex,
  kIndex: SoilIndex,
): { n: number; p: number; k: number } {
  return {
    n: base.n,
    p: lowIndexAvailableP(base.p, pIndex),
    k: lowIndexAvailableK(base.k, kIndex),
  };
}

function lowIndexAvailableP(p: number, pIndex: SoilIndex): number {
  return pIndex <= 2 ? p * LOW_INDEX_P_AVAILABILITY_FACTOR : p;
}

function lowIndexAvailableK(k: number, kIndex: SoilIndex): number {
  return kIndex <= 2 ? k * LOW_INDEX_K_AVAILABILITY_FACTOR : k;
}

export function slurryAvailableKgHa(
  rateM3ha: number,
  dmPct: number,
  pIndex: SoilIndex,
  kIndex: SoilIndex,
): { n: number; p: number; k: number } {
  return applyLowSoilIndexAvailability(slurryAvailableAtIndex34(rateM3ha, dmPct), pIndex, kIndex); // 1 m³ = 1 t
}

/** Table 9-1 average cattle slurry dry-matter %, used as the default when
 * a farm has no verified/farmer-adjusted slurry analysis of its own. */
export const NATIONAL_AVG_SLURRY_DM_PCT = 6.3;

/**
 * Slurry Evidence & Composition V1 — the real "which DM% does this
 * calculation actually use, and why" resolution, and the ONE place that
 * decision is made (never inside Today, Housing, or any other UI
 * component — see this campaign's own brief §6).
 *
 * Hierarchy (brief §6, verbatim): measured composition, if valid ↓
 * farmer-provided composition ↓ the canonical Teagasc assumption. In
 * practice this collapses to one check: `composition` (the shed/tank's
 * own current, effective record, already tier-and-recency-resolved by
 * `currentSlurryCompositionByHousing` — "verified" always outranks
 * "farmer_adjusted", see that function's own doc comment) is either
 * present, in which case its own `status`/`dmPct`/`sampleDate` are used
 * directly, or absent, in which case the unchanged national-average
 * fallback applies. There is no separate "is it valid" check beyond that
 * resolution — a `SlurryComposition` row's own DB/app-level validation
 * (`validateNewSlurryCompositionInput`) already guarantees a persisted
 * `dmPct` is a real, in-range figure.
 *
 * Only `dmPct` is used — `composition.nPerM3`/`pPerM3`/`kPerM3` are
 * deliberately NOT consumed here. See `src/domain/slurry-composition.ts`'s
 * own header for exactly why: Table 9-8 (`SLURRY_TABLE_9_8` above) has no
 * parameter for an arbitrary measured total N/P/K composition at all —
 * only DM% (picking one of 4 published columns) and application rate.
 * Converting a measured total composition into an available-nutrient
 * figure would require a genuinely new Teagasc-sourced rule this repo
 * does not have — CLAUDE.md "never let a model invent a production
 * scientific number" — so those fields stay recorded-but-unused until
 * that rule exists (a real product/scientific decision for the app
 * owner, not something to guess at here).
 */
export interface EffectiveSlurryComposition {
  dmPct: number;
  /** Reuses `DataStatus` — `"estimated"` (no real record; the national
   * average fallback), `"farmer_adjusted"` or `"verified"` (a real
   * persisted `SlurryComposition` at that tier). Never `"unavailable"`:
   * every outcome carries a real DM% figure. */
  status: Extract<DataStatus, "estimated"> | SlurryCompositionStatus;
  source: string;
  sourceDate?: string;
  /** The `SlurryComposition.id` this figure came from — absent when
   * `status === "estimated"` (no real record exists). */
  compositionRecordId?: string;
}

export function resolveEffectiveSlurryComposition(composition: SlurryComposition | undefined): EffectiveSlurryComposition {
  if (composition === undefined) {
    return {
      dmPct: NATIONAL_AVG_SLURRY_DM_PCT,
      status: "estimated",
      source: "Teagasc Green Book Table 9-1 (national average cattle slurry dry matter %)",
    };
  }
  return {
    dmPct: composition.dmPct,
    status: composition.status,
    source: composition.source,
    sourceDate: composition.sampleDate,
    compositionRecordId: composition.id,
  };
}

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
// Slurry Timing Evidence Patch V1 — summer LESS, additive to the two
// existing tables above (`SLURRY_TABLE_9_8`, `SPRING_LESS_SLURRY_TABLE`
// are UNCHANGED — both stay exactly as shipped).
//
// Source (directly read, primary document — not a search-result summary):
// Teagasc Signpost Programme fact sheet 07, "Getting the Most From Your
// Slurry" (Signpost Fact Sheets series), Table 2: "Available N, P and K
// values kg/m³ for slurry applied by LESS in spring and summer":
//
//   Spring:  N 1.0 (9 units/1,000 gal)  P 0.5 (5)  K 3.5 (32)
//   Summer:  N 0.6 (5 units/1,000 gal)  P 0.5 (5)  K 3.5 (32)
//
// https://teagasc.ie/wp-content/uploads/2025/05/Getting-the-Most-From-Your-Slurry-1.pdf
//
// The spring row here is identical to `SPRING_LESS_SLURRY_TABLE`'s own
// 6% DM point (N 1.0 / P 0.5 / K 3.5) — the same underlying Teagasc
// figure, independently reconfirmed, not a second competing number.
//
// SOURCE RECONCILIATION NOTE (brief §1 — a real, disclosed correction,
// not a silent one): a newer Teagasc Signpost article, "Cattle slurry a
// valuable source of N, P & K" (23 March 2026), presents what reads as
// the same spring/summer LESS comparison but with P shown as "0.6" for
// both periods rather than "0.5". That figure could not be independently
// confirmed against a directly-read primary source (repeated fetches of
// that specific article returned inconsistent, AI-summarised transcriptions
// rather than a clean verbatim quote of its own table), whereas fact sheet
// 07's Table 2 above was read directly and is internally consistent with
// this file's own, already-shipped `SPRING_LESS_SLURRY_TABLE` (its 6% DM
// row already uses P = 0.5, independently, since Slurry Application
// Context V1). Per this campaign's own brief §1 ("use the most current
// directly applicable source rather than averaging or inventing a
// compromise" / "do not modify existing constants just to make them
// agree"), P = 0.5 is used here, matching the value already shipped and
// independently confirmed, not the unconfirmed 0.6 figure. If a genuinely
// updated Teagasc P value is confirmed in future against a clean primary
// read, that is a real, separate evidence update — not something to
// average or guess between here.
//
// DM%: only the "typical" 6% DM row is published for summer LESS (Table 2
// carries no DM% breakdown of its own — unlike Table 1's four DM columns)
// — an EXACT DM% match (6% only) is required, the same "no interpolation
// without validated evidence" discipline `SPRING_LESS_SLURRY_TABLE`
// already applies to its own four points. Never scaled from the spring
// table's 2/4/7% rows — that would be inventing an interpolation this
// source does not evidence (brief §3: "Do not invent interpolation across
// DM values where none is evidenced").
// ---------------------------------------------------------------------------

interface SummerLessSlurryPoint {
  dmPct: number;
  nPerM3: number;
  pPerM3: number;
  kPerM3: number;
}

const SUMMER_LESS_SLURRY_TABLE: SummerLessSlurryPoint[] = [{ dmPct: 6, nPerM3: 0.6, pPerM3: 0.5, kPerM3: 3.5 }];

/**
 * Slurry Timing Evidence Patch V1. `BLOCK_NO_INTERPOLATION` for any DM%
 * other than the one published point (6%) — same fail-closed shape as
 * `slurryAvailableSpringLessKgHa`.
 */
export function slurryAvailableSummerLessKgHa(rateM3ha: number, dmPct: number): EngineOutcome<{ n: number; p: number; k: number }> {
  const point = SUMMER_LESS_SLURRY_TABLE.find((p) => p.dmPct === dmPct);
  if (point === undefined) {
    return {
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "BLOCK_NO_INTERPOLATION",
      missingInputs: [`slurry DM% matching a published summer/LESS table row (${SUMMER_LESS_SLURRY_TABLE.map((p) => p.dmPct).join(", ")})`],
    };
  }
  return ok(
    { n: point.nPerM3 * rateM3ha, p: point.pPerM3 * rateM3ha, k: point.kPerM3 * rateM3ha },
    "MEASURED",
  );
}

// ---------------------------------------------------------------------------
// Slurry Application Context V1 — the canonical resolver this campaign's
// own brief asks for: which of the evidenced Teagasc available-nutrient
// tables above (`slurryAvailableKgHa`/`SLURRY_TABLE_9_8`,
// `slurryAvailableSpringLessKgHa`/`SPRING_LESS_SLURRY_TABLE`,
// `slurryAvailableSummerLessKgHa`/`SUMMER_LESS_SLURRY_TABLE`) applies to a
// specific field's real slurry application context, or an honest
// UNSUPPORTED/NOT_ASSESSED state when none does. Replaces
// `calculateNutrientPlan`'s previous unconditional `slurryAvailableKgHa`
// call — every real farm's applicable Teagasc table is now selected from
// its own real, already-captured `SlurryAllocation.applicationMethod`
// (`requireSlurryApplicationMethod`, `input-gates.ts` — the same gate
// `lessMethodCompliance` below already uses for LESS legal compliance,
// reused here rather than a second, competing method-resolution branch)
// instead of assumed.
//
// TIMING (Slurry Timing Evidence Patch V1): `classifySlurryTiming`
// (`src/domain/slurry-timing.ts`) resolves a real captured
// `SlurryAllocation.applicationDate` against the Teagasc Farm Carbon
// Navigator's own published periods (SPRING Jan-Apr, SUMMER May-Jun,
// LATE_SUMMER Jul-Oct). A timing LABEL is not itself a nutrient-
// availability RULE — LESS has an evidenced rule for SPRING and SUMMER
// only; splashplate has an evidenced rule for SPRING only (no clean,
// engine-compatible official Teagasc summer-splashplate source was found
// — see this campaign's own completion report item 5); LATE_SUMMER never
// has an evidenced rule for any method, and is never silently treated as
// SUMMER (brief §2/§5 — "Do NOT manufacture a September nutrient
// credit"). When no real `applicationDate` has been captured at all, this
// resolver preserves Farm Return's pre-existing conservative default
// (SPRING) — the same `assumedDefault`-style disclosure this file already
// uses for a missing method, now applied to a missing date too
// (`timingAssumed: true`), never silently treated as evidenced.
// ---------------------------------------------------------------------------

export interface AvailableSlurryNutrientResult {
  n: number;
  p: number;
  k: number;
  unit: "kg/ha";
  /** The real captured method this result was computed for — `undefined`
   * only in the one ASSUMED-default branch (`assumedDefault: true`)
   * below, where no real method has been captured for this allocation at
   * all. */
  applicationMethod?: SlurryApplicationMethod;
  /** `true` only when no real method was ever captured for this
   * allocation and this result silently reproduces Farm Return's
   * pre-existing spring/splashplate assumption (the one case brief §7
   * explicitly allows preserving) — always `false` once a real method is
   * on file, whichever evidenced table that method selects. */
  assumedDefault: boolean;
  applicationRateM3ha: number;
  dmPct: number;
  /** `SlurryAllocation.applicationDate`'s own value, when a farmer has
   * recorded one — disclosed for the farmer's own information, and (since
   * Slurry Timing Evidence Patch V1) now the real basis for
   * `timingCategory` below too. */
  applicationDate?: string;
  /** Slurry Timing Evidence Patch V1 — the real Teagasc Farm Carbon
   * Navigator period this result was resolved against (`classifySlurryTiming`,
   * `src/domain/slurry-timing.ts`). Always SPRING or SUMMER on an `"OK"`
   * result — LATE_SUMMER/UNSUPPORTED never reach here (see
   * `resolveAvailableSlurryNutrients` below). */
  timingCategory: SlurryTimingCategory;
  /** `true` only when no real `applicationDate` was captured for this
   * allocation and SPRING was assumed (Farm Return's pre-existing
   * conservative default) — mirrors `assumedDefault` above, but for the
   * timing dimension rather than the method dimension; the two are
   * independent (a real captured method can still have an assumed
   * timing, and vice versa). */
  timingAssumed: boolean;
  ruleId: "SLURRY_TABLE_9_8" | "SPRING_LESS_SLURRY_TABLE" | "SUMMER_LESS_SLURRY_TABLE";
  source: string;
  /** Whether the low P/K Soil Index (1/2) availability reduction was
   * applied to `p`/`k` — Table 9-8 footnote 3 on the `SLURRY_TABLE_9_8`
   * path, and the equivalent Index 1/2 note of the Teagasc LESS table
   * (`CLM-OM-T2-NOTE`) on both LESS paths (CC-B2 / RISK-01 correction). */
  soilIndexAdjustmentApplied: { p: boolean; k: boolean };
  scientificBasisNote: string;
}

const SLURRY_APPLICATION_CONTEXT_SPRING_SCOPE_NOTE = `This figure assumes spring application (${SLURRY_TIMING_SOURCE}). Farm Return has no evidenced late-summer, autumn or winter cattle-slurry availability table for this method.`;

const SLURRY_APPLICATION_CONTEXT_SUMMER_SCOPE_NOTE = `This figure uses the Teagasc summer LESS available-nutrient table (${SLURRY_TIMING_SOURCE}). Farm Return has no evidenced late-summer, autumn or winter cattle-slurry availability table.`;

/**
 * Slurry Timing Evidence Patch V1 — resolves the real timing context for
 * this allocation: the Carbon Navigator period a real captured
 * `applicationDate` falls in, or the pre-existing SPRING default
 * (honestly flagged as assumed) when no date was ever captured. This is
 * the one place that resolution happens — every branch below consults it,
 * never re-derives it inline.
 */
function resolveSlurryTimingContext(applicationDate: string | undefined): {
  timingCategory: SlurryTimingCategory;
  timingAssumed: boolean;
} {
  if (applicationDate === undefined) {
    return { timingCategory: "SPRING", timingAssumed: true };
  }
  return { timingCategory: classifySlurryTiming(applicationDate), timingAssumed: false };
}

/**
 * A timing category was resolved (real or assumed) but no evidenced
 * available-nutrient rule exists for it with this method — brief §5:
 * "return SUPPORTED = false, reason = timing_not_supported", keeping the
 * real date/timing visible in the message rather than silently
 * substituting a different period's figure.
 */
function slurryTimingNotSupported<T>(method: SlurryApplicationMethod, timingCategory: SlurryTimingCategory, applicationDate: string | undefined): EngineOutcome<T> {
  const dateDetail = applicationDate !== undefined ? ` (recorded application date: ${applicationDate})` : "";
  return blockedInsufficientEvidence("SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED", [
    `Teagasc available-nutrient table for application method "${method}" during the ${timingCategory} period${dateDetail} — ${SLURRY_TIMING_SOURCE}`,
  ]);
}

/**
 * CC-FU-B — the evidence state of the slurry DM% a credit was computed
 * from. Same precedent as `calculateNutrientPlan`'s `fertilityEvidence`:
 * `MEASURED` only for a laboratory (`verified`) figure; the national-average
 * fallback (`estimated`) and a farmer-declared figure (`farmer_adjusted`)
 * are `IRISH_DEFAULT`, never presented as a measurement.
 */
function slurryDmPctEvidenceState(status: EffectiveSlurryComposition["status"]): EvidenceState {
  return status === "verified" ? "MEASURED" : "IRISH_DEFAULT";
}

/**
 * Campaign C per-nutrient P/K, Increment 2 (CP4 Target A) — the
 * index-independent half of the slurry credit: which evidenced table
 * applies to this application (method, timing, DM%), its Index 3/4-basis
 * N/P/K, and the table/method evidence combined with the DM% evidence
 * (CC-FU-B). Selected once by `selectSlurryAvailabilityTable`; the paired
 * `resolveAvailableSlurryNutrients` outcome and the per-nutrient view
 * (`availableSlurryNutrientsByNutrient`) are both derived from it, so the
 * table choice is never re-made. A non-OK selection is a table-level
 * block and is the outcome of every figure derived from it.
 */
interface SlurryTableSelection {
  /** Index 3/4-basis available N/P/K — before any low-index factor. */
  base: { n: number; p: number; k: number };
  applicationMethod?: SlurryApplicationMethod;
  assumedDefault: boolean;
  applicationRateM3ha: number;
  dmPct: number;
  applicationDate?: string;
  timingCategory: SlurryTimingCategory;
  timingAssumed: boolean;
  ruleId: AvailableSlurryNutrientResult["ruleId"];
  source: string;
  scientificBasisNote: string;
}

/**
 * The table selection behind `resolveAvailableSlurryNutrients` (see that
 * function's doc comment) — every branch and fail-closed outcome exactly
 * as before; it needs neither soil index. Never computes a number itself —
 * every real figure comes from `slurryAvailableAtIndex34`/
 * `slurryAvailableSpringLessKgHa`/`slurryAvailableSummerLessKgHa`, called,
 * not duplicated.
 */
function selectSlurryAvailabilityTable(input: {
  allocation?: Pick<SlurryAllocation, "applicationMethod" | "applicationDate"> & { applicationMethodConflict?: boolean };
  applicationRateM3ha: number;
  dmPct: number;
  dmPctStatus: EffectiveSlurryComposition["status"];
}): EngineOutcome<SlurryTableSelection> {
  if (input.applicationRateM3ha <= 0) {
    return notApplicable("SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE");
  }

  const dmPctEvidenceState = slurryDmPctEvidenceState(input.dmPctStatus);
  const applicationDate = input.allocation?.applicationDate?.value;
  const timing = resolveSlurryTimingContext(applicationDate);
  const methodOutcome = requireSlurryApplicationMethod(input.allocation ?? {});

  if (methodOutcome.status === "OK") {
    const method = methodOutcome.value;

    if (method === "splashplate") {
      // No clean, engine-compatible official Teagasc summer-splashplate
      // source was found (this campaign's own step-zero source search) —
      // splashplate has an evidenced rule for SPRING only.
      if (timing.timingCategory !== "SPRING") {
        return slurryTimingNotSupported(method, timing.timingCategory, applicationDate);
      }
      return ok(
        {
          base: slurryAvailableAtIndex34(input.applicationRateM3ha, input.dmPct),
          applicationMethod: method,
          assumedDefault: false,
          applicationRateM3ha: input.applicationRateM3ha,
          dmPct: input.dmPct,
          ...(applicationDate !== undefined ? { applicationDate } : {}),
          timingCategory: timing.timingCategory,
          timingAssumed: timing.timingAssumed,
          ruleId: "SLURRY_TABLE_9_8",
          source: "Teagasc Green Book Table 9-8 (spring application, splashplate)",
          scientificBasisNote: SLURRY_APPLICATION_CONTEXT_SPRING_SCOPE_NOTE,
        },
        weakestEvidenceState([methodOutcome.evidenceState, dmPctEvidenceState]),
      );
    }

    if (method === "LESS") {
      if (timing.timingCategory === "SPRING") {
        const lessOutcome = slurryAvailableSpringLessKgHa(input.applicationRateM3ha, input.dmPct);
        if (lessOutcome.status !== "OK") return lessOutcome;
        return ok(
          {
            base: lessOutcome.value,
            applicationMethod: method,
            assumedDefault: false,
            applicationRateM3ha: input.applicationRateM3ha,
            dmPct: input.dmPct,
            ...(applicationDate !== undefined ? { applicationDate } : {}),
            timingCategory: timing.timingCategory,
            timingAssumed: timing.timingAssumed,
            ruleId: "SPRING_LESS_SLURRY_TABLE",
            source: "Teagasc spring/LESS cattle-slurry available-nutrient table (GFT047)",
            scientificBasisNote: SLURRY_APPLICATION_CONTEXT_SPRING_SCOPE_NOTE,
          },
          weakestEvidenceState([lessOutcome.evidenceState, dmPctEvidenceState]),
        );
      }

      if (timing.timingCategory === "SUMMER") {
        const summerOutcome = slurryAvailableSummerLessKgHa(input.applicationRateM3ha, input.dmPct);
        if (summerOutcome.status !== "OK") return summerOutcome;
        return ok(
          {
            base: summerOutcome.value,
            applicationMethod: method,
            assumedDefault: false,
            applicationRateM3ha: input.applicationRateM3ha,
            dmPct: input.dmPct,
            ...(applicationDate !== undefined ? { applicationDate } : {}),
            timingCategory: timing.timingCategory,
            timingAssumed: timing.timingAssumed,
            ruleId: "SUMMER_LESS_SLURRY_TABLE",
            source: "Teagasc summer/LESS cattle-slurry available-nutrient table (Signpost Fact Sheet 07, \"Getting the Most From Your Slurry\")",
            scientificBasisNote: SLURRY_APPLICATION_CONTEXT_SUMMER_SCOPE_NOTE,
          },
          weakestEvidenceState([summerOutcome.evidenceState, dmPctEvidenceState]),
        );
      }

      // LATE_SUMMER or UNSUPPORTED — a real, named Carbon Navigator
      // period (or a date outside every published one), but no evidenced
      // available-N/P/K rule exists for LESS at that timing (brief §5:
      // never manufacture a September credit).
      return slurryTimingNotSupported(method, timing.timingCategory, applicationDate);
    }

    // "incorporate_24h" / "other" — real, captured methods, but no
    // evidenced Teagasc available-nutrient table exists in this
    // repository for either, at any timing. Never falls back to Table
    // 9-8: that would silently present an assumed splashplate figure as
    // if it were the farmer's own observed method (brief §4/§6).
    return blockedInsufficientEvidence("SLURRY_APPLICATION_CONTEXT_UNSUPPORTED_METHOD", [
      `Teagasc available-nutrient table for application method "${method}"`,
    ]);
  }

  // Method never captured at all for this allocation (not a conflict) —
  // the one real ASSUMED/default scenario brief §7 explicitly allows
  // preserving: Farm Return's pre-existing, unconditional spring/
  // splashplate assumption, now disclosed rather than silent. Still
  // timing-checked: a real captured date that is genuinely non-spring
  // means even the ASSUMED-method figure would be built on the wrong
  // period's table, so this also fails closed to
  // `SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED` rather than
  // compounding an assumed method with a silently-wrong timing.
  if (methodOutcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE" && methodOutcome.reasonCode === "UNKNOWN_SLURRY_METHOD") {
    if (timing.timingCategory !== "SPRING") {
      return slurryTimingNotSupported("splashplate", timing.timingCategory, applicationDate);
    }
    return ok(
      {
        base: slurryAvailableAtIndex34(input.applicationRateM3ha, input.dmPct),
        assumedDefault: true,
        applicationRateM3ha: input.applicationRateM3ha,
        dmPct: input.dmPct,
        ...(applicationDate !== undefined ? { applicationDate } : {}),
        timingCategory: timing.timingCategory,
        timingAssumed: timing.timingAssumed,
        ruleId: "SLURRY_TABLE_9_8",
        source:
          "Teagasc Green Book Table 9-8 (spring application, splashplate) — ASSUMED: no application method has been captured for this allocation yet",
        scientificBasisNote: `${SLURRY_APPLICATION_CONTEXT_SPRING_SCOPE_NOTE} Splashplate is also assumed here — record this allocation's real application method to replace the assumption with an evidenced figure.`,
      },
      weakestEvidenceState(["IRISH_DEFAULT", dmPctEvidenceState]),
    );
  }

  // Genuinely conflicting captured methods across this field's
  // contributing allocations (`AMBIGUOUS`) — never guessed; propagate the
  // same honest state `lessMethodCompliance` below already surfaces for
  // this exact case, rather than silently defaulting to splashplate for
  // a field with two real, disagreeing farmer answers on file.
  return methodOutcome;
}

/** The paired assessment from one table selection, with both Index 1/2
 * factors applied (`applyLowSoilIndexAvailability`). A table-level block
 * is returned unchanged. */
function pairedAvailableSlurryNutrients(
  selection: EngineOutcome<SlurryTableSelection>,
  pIndex: SoilIndex,
  kIndex: SoilIndex,
): EngineOutcome<AvailableSlurryNutrientResult> {
  if (selection.status !== "OK") return selection;
  const { base, applicationMethod, applicationDate, ...context } = selection.value;
  const adjusted = applyLowSoilIndexAvailability(base, pIndex, kIndex);
  return ok(
    {
      n: adjusted.n,
      p: adjusted.p,
      k: adjusted.k,
      unit: "kg/ha",
      ...(applicationMethod !== undefined ? { applicationMethod } : {}),
      assumedDefault: context.assumedDefault,
      applicationRateM3ha: context.applicationRateM3ha,
      dmPct: context.dmPct,
      ...(applicationDate !== undefined ? { applicationDate } : {}),
      timingCategory: context.timingCategory,
      timingAssumed: context.timingAssumed,
      ruleId: context.ruleId,
      source: context.source,
      // Table 9-8 footnote 3 on the splashplate path; CC-B2 / RISK-01: the
      // LESS table's own Index 1/2 note ("reduce P by 50% and K by 10%",
      // `CLM-OM-T2-NOTE`) on both LESS paths.
      soilIndexAdjustmentApplied: { p: pIndex <= 2, k: kIndex <= 2 },
      scientificBasisNote: context.scientificBasisNote,
    },
    selection.evidenceState,
  );
}

/**
 * Campaign C per-nutrient P/K, Increment 2 (CP4 Target A) — the
 * per-nutrient slurry credit from the same table selection as the paired
 * assessment. N needs no soil index. A known P or K arm applies only its
 * own index's Index 1/2 factor (`lowIndexAvailableP`/`lowIndexAvailableK`,
 * the two halves of `applyLowSoilIndexAvailability`); an unknown arm is
 * `MISSING_SOIL_FERTILITY_INDEX` naming only its own input and carries no
 * number. A table-level block (method, timing, DM%, unresolved composition,
 * conflicting methods) or `NOT_APPLICABLE` (no slurry) is every arm's
 * outcome. Each OK arm keeps the selection's evidence state — the paired
 * assessment's rule.
 */
function availableSlurryNutrientsByNutrient(
  selection: EngineOutcome<SlurryTableSelection>,
  pIndex: SoilIndex | undefined,
  kIndex: SoilIndex | undefined,
): NutrientPlan["organicApplication"]["availableNutrientByNutrient"] {
  if (selection.status !== "OK") return { n: selection, p: selection, k: selection };
  const { base } = selection.value;
  return {
    n: ok({ kgHa: base.n }, selection.evidenceState),
    p:
      pIndex === undefined
        ? blockedInsufficientEvidence("MISSING_SOIL_FERTILITY_INDEX", ["fertility.pIndex"])
        : ok({ kgHa: lowIndexAvailableP(base.p, pIndex), soilIndexAdjustmentApplied: pIndex <= 2 }, selection.evidenceState),
    k:
      kIndex === undefined
        ? blockedInsufficientEvidence("MISSING_SOIL_FERTILITY_INDEX", ["fertility.kIndex"])
        : ok({ kgHa: lowIndexAvailableK(base.k, kIndex), soilIndexAdjustmentApplied: kIndex <= 2 }, selection.evidenceState),
  };
}

/**
 * Per-nutrient P/K Increment 5b completion (CC-B6) — the basis of the
 * per-nutrient credit: the same selection's context without its numbers,
 * so a mixed field's credit keeps its method, timing and rule. A non-OK
 * selection is returned unchanged.
 */
function availableSlurryNutrientBasis(
  selection: EngineOutcome<SlurryTableSelection>,
): NutrientPlan["organicApplication"]["availableNutrientBasis"] {
  if (selection.status !== "OK") return selection;
  const { applicationMethod, applicationDate, ...context } = selection.value;
  return ok(
    {
      ...(applicationMethod !== undefined ? { applicationMethod } : {}),
      assumedDefault: context.assumedDefault,
      applicationRateM3ha: context.applicationRateM3ha,
      dmPct: context.dmPct,
      ...(applicationDate !== undefined ? { applicationDate } : {}),
      timingCategory: context.timingCategory,
      timingAssumed: context.timingAssumed,
      ruleId: context.ruleId,
      source: context.source,
      scientificBasisNote: context.scientificBasisNote,
    },
    selection.evidenceState,
  );
}

/**
 * `resolveAvailableSlurryNutrients({ allocation, applicationRateM3ha,
 * dmPct, dmPctStatus, pIndex, kIndex })` — the one real place `calculateNutrientPlan`
 * (and any future caller) selects an available-nutrient table, instead of
 * each caller re-deciding it inline. Never computes a number itself —
 * every real figure comes from `slurryAvailableKgHa`/
 * `slurryAvailableSpringLessKgHa`/`slurryAvailableSummerLessKgHa` above,
 * called, not duplicated. CC-FU-B: an `"OK"` result's `evidenceState` is
 * the weaker of the table/method evidence and the DM% evidence
 * (`dmPctStatus`, `EffectiveSlurryComposition.status`); values are
 * unaffected. Per-nutrient P/K Increment 2: the table selection
 * (`selectSlurryAvailabilityTable`) is shared with the per-nutrient view
 * (`availableSlurryNutrientsByNutrient`); this signature and its results
 * are unchanged.
 */
export function resolveAvailableSlurryNutrients(input: {
  allocation?: Pick<SlurryAllocation, "applicationMethod" | "applicationDate"> & { applicationMethodConflict?: boolean };
  applicationRateM3ha: number;
  dmPct: number;
  dmPctStatus: EffectiveSlurryComposition["status"];
  pIndex: SoilIndex;
  kIndex: SoilIndex;
}): EngineOutcome<AvailableSlurryNutrientResult> {
  return pairedAvailableSlurryNutrients(selectSlurryAvailabilityTable(input), input.pIndex, input.kIndex);
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
  soilOrganicMatterOver20Pct = false,
): NapComplianceCheck {
  // S.I. 588/2025 Art. 17(4)(i) and the Table 15a/15b/17 footnotes: the P
  // fertilisation rate on soils with more than 20% organic matter shall not
  // exceed the amount permitted for Phosphorus Index 3 soils.
  const pCeilingIndex: SoilIndex = soilOrganicMatterOver20Pct && pIndex < 3 ? 3 : pIndex;
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
    !eligibleForCutOnlyCeiling && pBuildUpEligible ? napEnhancedPBuildUpKgHa(orgNStockingRateKgHa, pCeilingIndex) : undefined;
  // V3 closure pass, Priority 9 (GFT025): the standard Table 15a ceiling
  // itself needs the same non-grass-area eligibility gate the N ceiling
  // has (AF011's exact shape) — see the module-level comment on
  // `napMaxAvailablePGrazingKgHaEligibilityGated` above.
  const pCeilingKgHa = eligibleForCutOnlyCeiling
    ? napMaxAvailablePCutOnlyKgHa(cutNumber, pCeilingIndex)
    : (enhancedPCeiling ?? napMaxAvailablePGrazingKgHaEligibilityGated(orgNStockingRateKgHa, pCeilingIndex, nonGrassPct));

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

/**
 * Codex audit CRITICAL (round 25): these three prices used to be a
 * hardcoded Phase 1 placeholder ("mock market data pending the real
 * Finance/Market Prices integration") — but `market.ts`'s own real CSO
 * AJM09 fertiliser-price series (evidence class A-OFFICIAL, see
 * `docs/evidence-register.md`) has covered these exact three products
 * since that module shipped, without this one ever being wired to it. A
 * fabricated `costEur`/`estimatedFieldCostEur` was reaching real, signed-
 * in farmer screens (Purchased Fertiliser, Dashboard, Finance, Input
 * Planner) with no "sample data"/"not yet available" disclosure — the
 * same class of failure this campaign has fixed for the Prompt/Decision/
 * CSV export paths since round 5/6, missed here because those rounds
 * scoped this specific gap as "pre-existing, already-disclosed,
 * out of campaign scope" before a real price source existed to fix it
 * with. Now uses each product's real, latest observed CSO price —
 * deterministic (a fixed historical data point, not a live fetch) and
 * re-usable the moment `market.ts`'s own embedded series is next
 * refreshed from the source workbook. "Protected Urea" uses the CSO
 * generic-urea series as a real, disclosed near-match (`market.ts`'s own
 * doc comment on `CSO_UREA_46N`) — CSO does not track stabilised/
 * protected urea specifically, but tracks the same 46% N product family
 * that dominates its price.
 */
const PRODUCTS: { zeroSevenThirty: ProductAnalysis; blend181612: ProductAnalysis; protectedUrea: ProductAnalysis } = {
  zeroSevenThirty: {
    name: "0-7-30",
    npkAnalysis: "0-7-30",
    nPct: 0,
    pPct: 0.07,
    kPct: 0.3,
    pricePerTonneEur: latestPoint(CSO_COMPOUND_0_7_30).value,
    formulation: { physicalForm: "solid", ureicNPercent: 0, inhibitorStatus: "inhibited" },
  },
  blend181612: {
    name: "18-6-12",
    npkAnalysis: "18-6-12",
    nPct: 0.18,
    pPct: 0.06,
    kPct: 0.12,
    pricePerTonneEur: latestPoint(CSO_COMPOUND_18_6_12).value,
    formulation: { physicalForm: "solid", ureicNPercent: 0, inhibitorStatus: "inhibited" },
  },
  protectedUrea: {
    name: "Protected Urea",
    npkAnalysis: "46-0-0",
    nPct: 0.46,
    pPct: 0,
    kPct: 0,
    pricePerTonneEur: latestPoint(CSO_UREA_46N).value,
    formulation: { physicalForm: "solid", ureicNPercent: 46, inhibitorStatus: "inhibited" },
  },
};

/**
 * Fertiliser Vertical campaign, 2026-09-08 — a real, honest, additive
 * export of the exact N/P/K composition already hardcoded above for
 * every product `calculateNutrientPlan` can ever recommend. Not a new
 * fact: every percentage here is the identical value `PRODUCTS` already
 * declares, exposed by name so a confirmed fertiliser Actual's own real
 * `product` text can be checked against it.
 *
 * These are the ONLY three product compositions this app has ever
 * verified — `nutrients.ts`'s own header comment (`CLAUDE.md`'s "never
 * let a model invent a production scientific number") applies with equal
 * force to a confirmed Actual as it does to a recommendation: a farmer's
 * free-text `product` field that does not match one of these three exact
 * names has a genuinely unknown composition to this app, and must never
 * be guessed at. Matching is exact and case-sensitive against the real
 * catalogue name (`"0-7-30"`, `"18-6-12"`, `"Protected Urea"`) — no fuzzy
 * matching, which would risk silently misattributing one product's real
 * composition to a different one the farmer actually meant.
 */
export interface FertiliserProductComposition {
  name: string;
  nPct: number;
  pPct: number;
  kPct: number;
}

const KNOWN_FERTILISER_PRODUCTS: readonly FertiliserProductComposition[] = [
  { name: PRODUCTS.zeroSevenThirty.name, nPct: PRODUCTS.zeroSevenThirty.nPct, pPct: PRODUCTS.zeroSevenThirty.pPct, kPct: PRODUCTS.zeroSevenThirty.kPct },
  { name: PRODUCTS.blend181612.name, nPct: PRODUCTS.blend181612.nPct, pPct: PRODUCTS.blend181612.pPct, kPct: PRODUCTS.blend181612.kPct },
  { name: PRODUCTS.protectedUrea.name, nPct: PRODUCTS.protectedUrea.nPct, pPct: PRODUCTS.protectedUrea.pPct, kPct: PRODUCTS.protectedUrea.kPct },
];

/**
 * Looks up a real, verified N/P/K composition by the fertiliser
 * catalogue's own exact product name — `undefined` for anything else,
 * including a close-but-not-exact match (e.g. "protected urea",
 * lowercase) — fail closed, never a fuzzy guess. See this module's own
 * `KNOWN_FERTILISER_PRODUCTS` doc comment.
 */
export function knownFertiliserProductComposition(productName: string): FertiliserProductComposition | undefined {
  return KNOWN_FERTILISER_PRODUCTS.find((p) => p.name === productName);
}

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

/** Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
 * F1) — the one materiality threshold `reconcileDeliveredSupply` uses to
 * decide whether a real delivered-vs-needed variance is worth
 * disclosing distinctly, named and versioned here rather than left as
 * an unexplained magic number wherever the reconciliation is rendered.
 * Not a Teagasc/statutory figure — a product-presentation heuristic
 * this app itself owns (the same "named, centralised, disclosed as a
 * product heuristic, not a scientific/regulatory fact" convention
 * `evidence-register.md`'s "Modules with no external source" section
 * already documents for comparable UI-facing thresholds elsewhere in
 * this codebase). */
export const DELIVERED_SUPPLY_MATERIALITY_THRESHOLD_KG_HA = 0.5;

export interface DeliveredSupplyReconciliationLine {
  nutrient: "n" | "p" | "k";
  deliveredKgHa: number;
  needKgHa: number;
  varianceKgHa: number;
  /** True only when `varianceKgHa`'s magnitude clears
   * `DELIVERED_SUPPLY_MATERIALITY_THRESHOLD_KG_HA` — a real, if small,
   * non-zero variance below that threshold is still real (never
   * silently zeroed), just not flagged as materially worth a farmer's
   * separate attention. */
  material: boolean;
  /** Present only when `material` — never asserts a direction for a
   * variance too small to be meaningfully "excess" or "shortfall". */
  direction?: "excess" | "shortfall";
}

/**
 * Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
 * F1; Codex audit round 3 HIGH) — the real delivered-vs-needed
 * reconciliation `PurchasedFertiliserCard.tsx` displays, moved out of
 * that component and into this pure domain module (`AGENTS.md`/
 * `DOMAIN_CONTRACTS.md`: no agronomic calculation, however small,
 * inside a React component). A real, sourced byproduct (e.g. 18-6-12's
 * own K) delivering more than the net requirement is a genuine, expected
 * consequence of this app's fixed 3-product catalogue, never
 * automatically a compliance breach on its own (K has no NAP ceiling;
 * N/P are separately checked against the real statutory ceiling by
 * `checkNapCompliance`) — this function states the plain agronomic
 * fact, nothing more.
 */
export function reconcileDeliveredSupply(
  need: { n: number; p: number; k: number },
  delivered: { n: number; p: number; k: number },
): DeliveredSupplyReconciliationLine[] {
  return (["n", "p", "k"] as const).map((nutrient) => {
    const varianceKgHa = delivered[nutrient] - need[nutrient];
    const material = Math.abs(varianceKgHa) >= DELIVERED_SUPPLY_MATERIALITY_THRESHOLD_KG_HA;
    return {
      nutrient,
      deliveredKgHa: delivered[nutrient],
      needKgHa: need[nutrient],
      varianceKgHa,
      material,
      ...(material ? { direction: varianceKgHa > 0 ? ("excess" as const) : ("shortfall" as const) } : {}),
    };
  });
}

/**
 * Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
 * F1) — the fixed 3-step waterfall sizes each product to a single
 * "target" nutrient (0-7-30 for K, 18-6-12 for the P still needed,
 * Protected Urea for the N still needed), but every one of these
 * products is a real, sourced multi-nutrient blend — 0-7-30 always
 * brings P along with its K, and 18-6-12 always brings K along with its
 * P (`PRODUCTS`'s own `pPct`/`kPct`/`nPct`, unchanged). The waterfall
 * already correctly SUBTRACTS 0-7-30's own P byproduct before sizing
 * 18-6-12 (`pStillNeeded`) and 18-6-12's own N byproduct before sizing
 * Urea (`nStillNeeded`) — so N and P are never double-counted — but
 * 18-6-12's own K byproduct was never tracked or subtracted from
 * anything at all (there is no "K still needed after 18-6-12" step),
 * the exact real gap the audit's own Meadow 3 example names ("K
 * requirement 0; 18-6-12 supplies about 8 kg K/ha").
 *
 * This function's own product-selection logic (which product is sized
 * to which nutrient, in which order) is unchanged — that allocation
 * strategy is retained. What changes is that the REAL total N/P/K every
 * chosen product actually delivers is now fully computed and returned
 * (`deliveredKgHa`), not just the one nutrient each step happened to be
 * sized against — so a caller can honestly reconcile "what was asked
 * for" against "what this real blend actually supplies", including any
 * byproduct the farmer is entitled to see, rather than an apparently
 * complete total that silently omits it.
 */
function allocatePurchasedProducts(
  remainingNKgHa: number,
  remainingPKgHa: number,
  remainingKKgHa: number,
  areaHa: number,
): { products: FertiliserProduct[]; totalCostEur: number; deliveredKgHa: { n: number; p: number; k: number } } {
  const { zeroSevenThirty, blend181612, protectedUrea } = PRODUCTS;

  const rate0730 = remainingKKgHa > 0 ? remainingKKgHa / zeroSevenThirty.kPct : 0;
  const pFrom0730 = rate0730 * zeroSevenThirty.pPct;

  const pStillNeeded = Math.max(0, remainingPKgHa - pFrom0730);
  const rate181612 = pStillNeeded > 0 ? pStillNeeded / blend181612.pPct : 0;
  const nFrom181612 = rate181612 * blend181612.nPct;

  const nStillNeeded = Math.max(0, remainingNKgHa - nFrom181612);
  const rateUrea = nStillNeeded > 0 ? nStillNeeded / protectedUrea.nPct : 0;

  const line0730 = rate0730 > 0.5 ? productLine(zeroSevenThirty, rate0730, areaHa) : null;
  const line181612 = rate181612 > 0.5 ? productLine(blend181612, rate181612, areaHa) : null;
  const lineUrea = rateUrea > 0.5 ? productLine(protectedUrea, rateUrea, areaHa) : null;

  const lines = [line0730, line181612, lineUrea].filter((l): l is FertiliserProduct => l !== null);

  // Real delivered kg/ha per nutrient — summed only from lines actually
  // included (never assumed from a rate whose own line was excluded by
  // `productLine`'s admissibility check, or fell below the 0.5 kg/ha
  // materiality threshold and was never really going to be bought).
  // Independent of the waterfall's own intermediate "still needed"
  // assumptions, so it stays correct even if a future admissibility
  // change or a below-threshold rate drops a line this waterfall
  // otherwise assumed would be there.
  //
  // Codex audit round 4 HIGH — computed from each line's own real
  // PUBLISHED `rateKgHa` (`productLine`'s own 0.1 kg/ha-rounded figure,
  // the exact rate a farmer actually sees on the product line and would
  // apply), never the waterfall's raw unrounded internal rate
  // (`rate0730`/`rate181612`/`rateUrea`). Using the unrounded internal
  // rate here let the NAP ceiling comparison and the supply
  // reconciliation card evaluate a real application slightly different
  // from the one actually shown/proposed — a boundary compliance result
  // must be judged against the same real number a farmer can verify,
  // never a hidden, more-precise figure they never see.
  const deliveredKgHa = {
    n: (line181612 ? line181612.rateKgHa * blend181612.nPct : 0) + (lineUrea ? lineUrea.rateKgHa * protectedUrea.nPct : 0),
    p: (line0730 ? line0730.rateKgHa * zeroSevenThirty.pPct : 0) + (line181612 ? line181612.rateKgHa * blend181612.pPct : 0),
    k: (line0730 ? line0730.rateKgHa * zeroSevenThirty.kPct : 0) + (line181612 ? line181612.rateKgHa * blend181612.kPct : 0),
  };

  return { products: lines, totalCostEur: lines.reduce((sum, l) => sum + l.costEur, 0), deliveredKgHa };
}

// ---------------------------------------------------------------------------
// Campaign B regulatory interpretation — home-produced grazing manure
// ---------------------------------------------------------------------------

/** Where a planned application's slurry came from, as evidenced. Only
 * `home_produced_grazing_livestock` (manure of cattle other than veal
 * calves, sheep, deer, goats or horses — Art. 4 "grazing livestock" —
 * produced on this holding) takes the Art. 17(8) treatment; `imported`
 * (produced on another holding) is organic fertiliser counted against the
 * maxima like any other available N/P applied (Art. 17(5)). */
export type RegulatoryManureOrigin = "home_produced_grazing_livestock" | "imported";

/** A legal interpretation, not scientific evidence. Verified 2026-09-27
 * against the Irish Statute Book text of S.I. 588/2025 and its only
 * listed amendment, S.I. 119/2026, which does not amend Art. 17(8) or
 * Tables 15a/15b/16/17 (it substitutes Tables 7, 13 and 14). */
export const HOME_GRAZING_MANURE_MAXIMA_RULE = {
  ruleId: "NAP_ART17_8_HOME_GRAZING_MANURE_ADDITIONAL",
  version: "1.0.0",
  legislation: "S.I. No. 588/2025, Article 17(8) (not amended by S.I. No. 119/2026)",
  text: "The nitrogen and phosphorus maximum rates in Tables 13, 15a, 15b, 16 and 17 are in addition to the nitrogen and phosphorus contained in grazing livestock manure produced on the holding.",
  index4Condition:
    "S.I. No. 588/2025, Tables 15a/15b footnote 3: home-produced grazing-livestock manure may go on Index 4 soils only where a surplus remains after the P needs of all Index 1-3 crops on the holding have been met by that manure alone.",
  sourceUrl: "https://www.irishstatutebook.ie/eli/2025/si/588/made/en/print",
  verifiedOn: "2026-09-27",
  regulatoryStatus: "legal_interpretation",
} as const;

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/** Campaign C per-nutrient P/K, Increment 1 — one nutrient's soil-fertility
 * evidence: the existing paired rule (`MEASURED` only for a `verified`
 * index, otherwise `IRISH_DEFAULT`; missing → `MISSING_SOIL_FERTILITY_INDEX`)
 * applied to a single index. */
function soilIndexEvidence(
  tracked: Field["fertility"]["pIndex"],
  input: "fertility.pIndex" | "fertility.kIndex",
): EngineOutcome<{ index: SoilIndex }> {
  return tracked !== undefined
    ? ok({ index: tracked.value }, tracked.status === "verified" ? "MEASURED" : "IRISH_DEFAULT")
    : blockedInsufficientEvidence("MISSING_SOIL_FERTILITY_INDEX", [input]);
}

/** The paired `NutrientPlan.fertilityEvidence` as the conjunction of the
 * per-nutrient arms: OK only if both are OK, `MEASURED` only if both are
 * `MEASURED`; otherwise blocked with the missing inputs of every blocked
 * arm, P before K — identical to the pre-Increment-1 paired computation. */
function pairedFertilityEvidence(
  byNutrient: NutrientPlan["fertilityEvidenceByNutrient"],
): EngineOutcome<{ pIndex: SoilIndex; kIndex: SoilIndex }> {
  const { p, k } = byNutrient;
  if (p.status === "OK" && k.status === "OK") {
    return ok(
      { pIndex: p.value.index, kIndex: k.value.index },
      p.evidenceState === "MEASURED" && k.evidenceState === "MEASURED" ? "MEASURED" : "IRISH_DEFAULT",
    );
  }
  return blockedInsufficientEvidence("MISSING_SOIL_FERTILITY_INDEX", [
    ...(p.status === "BLOCKED_INSUFFICIENT_EVIDENCE" ? p.missingInputs : []),
    ...(k.status === "BLOCKED_INSUFFICIENT_EVIDENCE" ? k.missingInputs : []),
  ]);
}

/**
 * Fertiliser Vertical Completion, Increment 1 — the canonical per-field
 * requirement (`NutrientPlan.fieldRequirement`), built from the same
 * unrounded `grossX` locals `requirement` rounds and released only where
 * `requirementByNutrient`'s arm is OK (own index only, never the Index-1
 * placeholder). Two existing caller-side rules are applied here so the
 * canonical output is never a fabricated figure: a tillage field is
 * `NOT_APPLICABLE` (no tillage table — `isTillageField`, prompt producer)
 * and a grazing field with no recorded livestock is `UNKNOWN`
 * (`MISSING_LIVESTOCK_DATA` — Table 12-3's clamped 35 kg N/ha row,
 * `hasNoRecordedLivestock`). The paired `requirement` keeps its legacy
 * behaviour for both (LEGACY_COMPATIBILITY_PATH).
 */
function buildFieldNutrientRequirement(args: {
  field: Field;
  silage: CalculateNutrientPlanInput["silage"];
  livestockGroups: readonly LivestockGroup[];
  agronomicStockingRateKgHa: number;
  farmGrasslandAreaHa: number;
  gross: { n: number; p: number; k: number };
  requirementByNutrient: NutrientPlan["requirementByNutrient"];
  fertilityEvidenceByNutrient: NutrientPlan["fertilityEvidenceByNutrient"];
}): FieldNutrientRequirement {
  const { field, silage, gross, requirementByNutrient, fertilityEvidenceByNutrient } = args;
  const plannedUse = field.plannedUse?.value;
  const basis: FieldNutrientRequirement["cropContext"]["basis"] =
    plannedUse === "tillage" ? "tillage" : silage !== undefined || isSilageCutPlannedUse(field) ? "silage" : "grazing";
  const cropContext: FieldNutrientRequirement["cropContext"] = {
    basis,
    ...(plannedUse !== undefined ? { plannedUse } : {}),
    plannedUseAssumed: plannedUse === undefined && silage === undefined,
    ...(basis === "silage" && silage !== undefined
      ? { silage: { cutNumber: silage.cutNumber, expectedYieldTDMha: silage.expectedYieldTDMha, wasGrazedPreviousYear: silage.wasGrazedPreviousYear ?? false } }
      : {}),
    ...(basis === "grazing" ? { grazingStockingRateKgNHa: args.agronomicStockingRateKgHa } : {}),
  };
  const areaUsable = Number.isFinite(field.areaHa) && field.areaHa > 0;
  const livestockMissing = basis === "grazing" && args.livestockGroups.length === 0;
  // Grazing N, P maintenance and K all read the stocking rate, which
  // `calculateGrasslandStockingRateKgHa` floors to 0 when the farm grassland
  // area is not positive — an unusable denominator, never a known 0.
  const grasslandAreaMissing = basis === "grazing" && !(Number.isFinite(args.farmGrasslandAreaHa) && args.farmGrasslandAreaHa > 0);
  const commonLimitations = cropContext.plannedUseAssumed ? ["PLANNED_USE_NOT_RECORDED_GRAZING_ASSUMED"] : [];

  const arm = (kgHa: number, outcome: EngineOutcome<number>, ruleRefs: string[], limitations: string[]): FieldNutrientRequirementArm => {
    if (basis === "tillage") return { status: "NOT_APPLICABLE", reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED" };
    if (outcome.status === "OK") {
      if (livestockMissing) return { status: "UNKNOWN", reasonCode: "MISSING_LIVESTOCK_DATA", missingInputs: ["livestockGroups"] };
      if (grasslandAreaMissing) return { status: "UNKNOWN", reasonCode: "MISSING_GRASSLAND_AREA", missingInputs: ["farmGrasslandAreaHa"] };
      return {
        status: "KNOWN",
        kgHa,
        totalKg: areaUsable ? ok(kgHa * field.areaHa, outcome.evidenceState) : blockedInsufficientEvidence("MISSING_FIELD_AREA", ["field.areaHa"]),
        evidenceState: outcome.evidenceState,
        source: "Teagasc Green Book (5th Ed., 2020)",
        ruleRefs,
        limitations: [...commonLimitations, ...limitations],
      };
    }
    const missingInputs = outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE" ? [...outcome.missingInputs] : [];
    if (livestockMissing) missingInputs.push("livestockGroups");
    if (grasslandAreaMissing) missingInputs.push("farmGrasslandAreaHa");
    return { status: "UNKNOWN", reasonCode: outcome.reasonCode, missingInputs };
  };

  const silageBasis = basis === "silage";
  return {
    contractVersion: "field_nutrient_requirement_v1",
    engineVersion: NUTRIENT_ENGINE_VERSION,
    fieldId: field.id,
    areaHa: field.areaHa,
    cropContext,
    n: arm(
      gross.n,
      requirementByNutrient.n,
      [silageBasis ? "Teagasc Green Book Table 12-7" : "Teagasc Green Book Table 12-3"],
      // First-cut N ±25 kg per t DM (`CLM-TGC-YIELD-SCALE`) stays
      // IMPLEMENTATION_DEFERRED_SUPPORTED_RANGE_UNCLEAR: N ignores yield.
      silageBasis ? ["N_YIELD_SCALING_NOT_APPLIED"] : [],
    ),
    p: {
      ...arm(gross.p, requirementByNutrient.p, ["Teagasc Green Book Table 13-2", silageBasis ? "Teagasc Green Book Table 13-4" : "Teagasc Green Book Table 13-3"], []),
      soilIndex: fertilityEvidenceByNutrient.p,
    },
    k: {
      ...arm(gross.k, requirementByNutrient.k, [silageBasis ? "Teagasc Green Book Table 14-2" : "Teagasc Green Book Table 14-1"], []),
      soilIndex: fertilityEvidenceByNutrient.k,
    },
  };
}

export interface CalculateNutrientPlanInput {
  field: Field;
  /** Net grassland area (grazing + silage) across the farm, ha — the
   * denominator for organic-N stocking rate (Tables 12-3/13-3/14-1 note). */
  farmGrasslandAreaHa: number;
  livestockGroups: LivestockGroup[];
  /** This field's slurry allocation, if any (from `SlurryAllocation[]`,
   * typically pre-resolved via `resolveFieldSlurryAllocation` when the
   * field has more than one real contributing allocation — accepting
   * `ResolvedSlurryAllocation` here too so its `applicationMethodConflict`
   * flag survives through to `requireSlurryApplicationMethod`). */
  slurryAllocation?: SlurryAllocation | ResolvedSlurryAllocation;
  housing?: Housing;
  /** Slurry Evidence & Composition V1 — the contributing shed/tank's own
   * current, effective composition record (already resolved by the
   * caller via `currentSlurryCompositionByHousing(records).get(slurryAllocation.housingId)`
   * — this function never reads a raw record list itself, keeping it a
   * pure function of its own inputs). Absent (the safe default for every
   * existing caller) falls back to the unchanged Teagasc national-
   * average DM% — see `resolveEffectiveSlurryComposition`. */
  slurryComposition?: SlurryComposition;
  /** Campaign A (A2.2) — set when the field's planned slurry comes from
   * more than one store and at least one has a recorded composition
   * (`resolveFieldSlurryCompositionInput`, `slurry-evidence-context.ts`).
   * No approved rule combines per-store DM%, so the available-nutrient
   * credit fails closed rather than silently using the national-average
   * DM% in place of recorded evidence. */
  slurryCompositionUnresolved?: { housingIds: string[]; compositionRecordIds: string[] };
  /** Campaign B (B1) — the regulatory neat cattle slurry in this field's
   * planned application, only where evidence establishes it
   * (`fieldPlannedRegulatoryNeatSlurry`, `slurry-regulatory-context.ts`).
   * `slurryAllocation.volumeM3` is PHYSICAL store volume (possibly
   * diluted) and is never read as neat slurry: when this is absent and
   * slurry is planned, the statutory manure N/P ledger and the NAP check
   * that consumes it are blocked, never computed 1:1 from physical m³.
   *
   * `origin` — where the planned slurry came from, only where evidence
   * establishes it. S.I. 588/2025 Art. 17(8) makes the Table 13/15a/15b/
   * 16/17 maxima additional to N/P in grazing livestock manure produced
   * on the holding; that exemption is never assumed for a store whose
   * origin is not evidenced (imports are not recorded —
   * `FarmRegulatoryContext.manureImports`), so absent = NAP check blocked. */
  plannedRegulatoryNeatSlurry?: { volumeM3: number; status: DataStatus; source: string; origin?: RegulatoryManureOrigin };
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
 * — so day-level precision is unneeded). Exported (Real Farm V1 Phase 7)
 * so the Soil/Fields UI can show a real "test is N years old" figure
 * using the exact same calculation `checkSoilTestAgeValidity` is fed here
 * — one age computation, not a second one reimplemented for display. */
export function yearsBetweenIsoDates(fromIso: string, toIso: string): number {
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / msPerYear;
}

/**
 * Campaign A (A1.2) — the soil-test age rule for the field's lab test on
 * file, evaluated against the laboratory's own P Index
 * (`laboratoryPIndexForSoilTestValidity`), never a farmer override of it.
 * Shared by `calculateNutrientPlan` and the Soil UI so both show one
 * classification.
 */
export function soilTestAgeValidityForFertility(fertility: Pick<Field["fertility"], "pIndex" | "verifiedTest">, asOfDate: string): EngineOutcome<SoilTestAgeStatus> {
  if (fertility.verifiedTest === undefined) return notApplicable("NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE");
  // An absent/unparseable sample date is undated (`UNKNOWN_BLOCK`), never
  // NaN years silently read as "too old".
  const rawAgeYears = yearsBetweenIsoDates(fertility.verifiedTest.sampleDate, asOfDate);
  const ageYears = Number.isFinite(rawAgeYears) ? rawAgeYears : undefined;
  const labPIndex = laboratoryPIndexForSoilTestValidity(fertility.pIndex);
  if (labPIndex.status === "OK") return checkSoilTestAgeValidity({ ageYears, pIndex: labPIndex.value });
  if (fertility.pIndex === undefined) return blockedInsufficientEvidence("MISSING_SOIL_FERTILITY_INDEX", ["fertility.pIndex"]);
  // No laboratory-derived index in the history: the 4-year limit still
  // applies, but the Index-4 persistence exception belongs to the RESULT's
  // own Index 4 — never granted on a farmer's or an estimated value.
  const outcome = checkSoilTestAgeValidity({ ageYears, pIndex: fertility.pIndex.value });
  return outcome.status === "OK" && outcome.value === "INDEX4_PERSISTED" ? ok("DISREGARD", "MEASURED") : outcome;
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

  // Codex remediation Priority 1 (fail-closed nutrients) — a field's P/K
  // Soil Index is no longer guaranteed to exist (Priority 2 removed the
  // fabricated Index-2 default new fields used to get). Whenever either is
  // genuinely missing, this whole plan's ACTIONABLE outputs
  // (`purchasedProducts`, `estimatedFieldCostEur`, `requirement`'s P/K,
  // `napCompliance`, `statutoryManureValue`) are forced into a fail-closed
  // state below, never computed from a guessed index. `pIndex`/`kIndex`
  // below still resolve to a real number (Index 1, the most nutrient-
  // deficient/conservative band) purely so the existing calculation
  // functions have a valid `SoilIndex` to run — that placeholder number
  // never reaches `requirement`/`purchasedProducts`/`napCompliance`/
  // `statutoryManureValue` once `fertilityEvidence.status !== "OK"`; it
  // exists only to keep this function's internal control flow linear
  // rather than duplicating it into two near-identical branches.
  // CC-B5: it does still decide the national buffer material (via the
  // purchase blend sized below) when P or K is missing — a pre-existing
  // statutory behaviour awaiting a Campaign B decision; per-nutrient P/K
  // CP3 (placeholder removal) is blocked on it. The per-nutrient slurry
  // view never reads the placeholder (`pIndexKnown`/`kIndexKnown`).
  const pIndexTracked = field.fertility.pIndex;
  const kIndexTracked = field.fertility.kIndex;
  // Campaign C per-nutrient P/K, Increment 1 — each nutrient's evidence is
  // resolved once from its own tracked index; the paired
  // `fertilityEvidence` is derived from the two arms as their conjunction,
  // so it can never disagree with them.
  const fertilityEvidenceByNutrient: NutrientPlan["fertilityEvidenceByNutrient"] = {
    p: soilIndexEvidence(pIndexTracked, "fertility.pIndex"),
    k: soilIndexEvidence(kIndexTracked, "fertility.kIndex"),
  };
  const fertilityEvidence = pairedFertilityEvidence(fertilityEvidenceByNutrient);
  const pIndexKnown: SoilIndex | undefined = pIndexTracked?.value;
  const kIndexKnown: SoilIndex | undefined = kIndexTracked?.value;
  const pIndex: SoilIndex = pIndexKnown ?? 1;
  const kIndex: SoilIndex = kIndexKnown ?? 1;
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
  const soilTestAgeValidity: EngineOutcome<SoilTestAgeStatus> = soilTestAgeValidityForFertility(field.fertility, asOfDate);

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
  // Slurry Evidence & Composition V1 — the one insertion point this
  // campaign's own brief identified: a real/measured/farmer-provided DM%
  // now replaces the unconditional national average whenever the
  // contributing shed/tank has one on file. See
  // `resolveEffectiveSlurryComposition`'s own doc comment for the full
  // hierarchy and for why only DM% (never the composition's own
  // recorded N/P/K) feeds this calculation.
  const effectiveSlurryComposition = resolveEffectiveSlurryComposition(input.slurryComposition);
  const dmPct = effectiveSlurryComposition.dmPct;
  // Slurry Application Context V1 — the one real insertion point this
  // campaign's own brief identified: replaces the previous unconditional
  // `slurryAvailableKgHa` call (always spring+splashplate, regardless of
  // this field's own real captured method) with the canonical resolver,
  // which selects the correct evidenced Teagasc table (or an honest
  // UNSUPPORTED/NOT_ASSESSED state) from `slurryAllocation.applicationMethod`.
  // See `resolveAvailableSlurryNutrients`'s own doc comment above.
  const compositionUnresolved = input.slurryCompositionUnresolved !== undefined && rateM3ha > 0;
  // Per-nutrient P/K Increment 2 (CP4 Target A): the table is selected
  // once, without either soil index; the paired assessment and the
  // per-nutrient view are both derived from that one selection.
  const slurryTableSelection: EngineOutcome<SlurryTableSelection> = compositionUnresolved
    ? blockedInsufficientEvidence("SLURRY_COMPOSITION_SOURCES_UNRESOLVED", [
        `one slurry composition for this field's combined planned slurry (stores ${input.slurryCompositionUnresolved!.housingIds.join(", ")} each hold separate recorded results; no approved rule combines them)`,
      ])
    : selectSlurryAvailabilityTable({
        allocation: slurryAllocation,
        applicationRateM3ha: rateM3ha,
        dmPct,
        dmPctStatus: effectiveSlurryComposition.status,
      });
  // The per-nutrient view reads only the real indices — never the Index-1
  // placeholder; an unknown arm is blocked with only its own input.
  const availableNutrientByNutrient = availableSlurryNutrientsByNutrient(slurryTableSelection, pIndexKnown, kIndexKnown);
  const resolvedSlurryNutrients = pairedAvailableSlurryNutrients(slurryTableSelection, pIndex, kIndex);
  // CC-B2 / CC-B4A: every supported slurry table's P/K credit depends on
  // the P/K Soil Index, so the Index-1 placeholder above must never
  // produce an OK, index-adjusted assessment — LESS or splashplate (Table
  // 9-8) — when either index is genuinely missing. P and K stay withheld
  // together (the plan's paired fertility evidence); N is kept below.
  const availableSlurryNutrients: EngineOutcome<AvailableSlurryNutrientResult> =
    fertilityEvidence.status === "BLOCKED_INSUFFICIENT_EVIDENCE" && resolvedSlurryNutrients.status === "OK"
      ? blockedInsufficientEvidence(fertilityEvidence.reasonCode, fertilityEvidence.missingInputs)
      : resolvedSlurryNutrients;
  // Never a fabricated non-zero credit for an unsupported/not-yet-
  // assessed application context (brief §6) — floors to the same safe
  // "no organic contribution counted" state this app already uses
  // whenever no slurry is applied at all (`rateM3ha <= 0` previously).
  // `availableSlurryNutrients` itself (returned below via
  // `organicApplication.availableNutrientAssessment`) is what honestly
  // discloses SUPPORTED vs UNSUPPORTED to the farmer — never this
  // internal arithmetic input.
  // CC-B2 audit F003 (and CC-B4A for splashplate): slurry N never depends
  // on the P/K Soil Index, so a missing index blocks only the P/K credit —
  // the evidenced N is kept.
  const offset =
    availableSlurryNutrients.status === "OK"
      ? { n: availableSlurryNutrients.value.n, p: availableSlurryNutrients.value.p, k: availableSlurryNutrients.value.k }
      : availableSlurryNutrients !== resolvedSlurryNutrients && resolvedSlurryNutrients.status === "OK"
        ? { n: resolvedSlurryNutrients.value.n, p: 0, k: 0 }
        : { n: 0, p: 0, k: 0 };

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
  // CC-B5: with P or K missing this blend is sized from the Index-1
  // placeholder, so the placeholder decides `bufferMaterial` below.
  const { products: allocatedProducts, totalCostEur: allocatedCostEur, deliveredKgHa: allocatedDeliveredKgHa } = allocatePurchasedProducts(
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
  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F1) — the real total N/P/K the actually-proposed blend delivers
  // (never the waterfall's own intermediate "still needed" figures,
  // which don't include a byproduct like 18-6-12's own K). Zeroed
  // together with `products` above whenever chemical fertiliser is
  // legally prohibited on this field — a suppressed blend delivers
  // nothing, not the figure a suppressed recommendation would have.
  const deliveredKgHa = chemicalFertiliserProhibited ? { n: 0, p: 0, k: 0 } : allocatedDeliveredKgHa;

  const cutIntendedForSale = silage?.intendedUse === "sale" || silage?.intendedUse === "both";
  const hasWrittenSaleEvidence = silage?.saleEvidence?.hasWrittenEvidence ?? false;

  const statutoryGsrOutcome = calculateStatutoryGrasslandStockingRateKgHa(livestockGroups, farmGrasslandAreaHa);

  // V3 closure pass, Priority 4 (`LESS_METHOD_GATE`, AF004 HIGH): real,
  // wired from the field's own real slurry allocation
  // (`SlurryAllocation.applicationMethod`, already captured by Phase C's
  // `requireSlurryApplicationMethod` — no new UI capture needed). Closes
  // audit conflict #6 (the old dead `slurryMethod`/`slurryTiming`
  // `CalculateNutrientPlanInput` parameters this comment used to
  // reference were removed by Slurry Application Context V1 — this gate,
  // and that campaign's own `resolveAvailableSlurryNutrients` table
  // selector above, are what they should have fed all along; neither
  // parameter had a real caller).
  const lessMethodCompliance: EngineOutcome<LessMethodGateOk> =
    rateM3ha <= 0 || slurryAllocation === undefined
      ? notApplicable("LESS_GATE_NOT_APPLICABLE")
      : (() => {
          const methodOutcome = requireSlurryApplicationMethod(slurryAllocation);
          if (methodOutcome.status !== "OK") return methodOutcome;
          return checkLessMethodGate({
            material: "cattle_slurry",
            gsrKgNHa: statutoryGsrOutcome.status === "OK" ? statutoryGsrOutcome.value.gsrKgNHa : undefined,
            landUse: field.plannedUse?.value === "tillage" ? "arable" : "grass",
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
  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F1) — `statutoryManureValueRaw` hoisted from its own original call
  // site further below (unchanged computation, same real inputs, just
  // computed earlier) so the real statutory-availability organic N/P
  // figure it produces can feed the compliance check immediately below,
  // rather than the compliance check comparing gross crop requirement
  // against the statutory ceiling — a real, materially different
  // question. A NAP ceiling limits what is actually APPLIED to a field
  // (organic + chemical combined) in a year, not what the crop
  // agronomically needs; those two figures are only ever the same
  // number by coincidence, when nothing organic was applied at all.
  // Deliberately reuses `statutoryManureValueRaw` (the real STATUTORY
  // availability-factor ledger, S.I. 588/2025), never `offset` (the
  // separate, real AGRONOMIC Teagasc Table 9-8 ledger `requirement`
  // itself is netted against) — this file's own established, audited
  // "two ledgers must never be conflated" rule (see
  // `statutory-manure-value.ts`'s own header comment) applied to this
  // one further real use of it.
  //
  // Campaign B (B1/B2.4): the statutory coefficients are per m³ of NEAT
  // cattle slurry, and `totalM3` is physical store volume — never the same
  // quantity by assumption. The ledger is computed only from evidenced
  // neat volume, and its P availability factor (keyed on P Index) only
  // from a laboratory-derived Index; otherwise it is blocked, not zero.
  const pIndexIsLaboratory = resolveFieldSoilIndexProvenance(field.fertility).p.basis === "laboratory";
  // S.I. 588/2025 Art. 17(4)(i) / Table 10 fn 1: a laboratory organic-matter
  // result above 20% caps the P ceiling at Index 3 and makes manure P 100%
  // available at Index 1-2. Table 10 fn 1-2 apply the same rule to peat
  // soils; per Art. 17(4)(j) the mapped soil status applies unless a soil
  // test determines otherwise. Neither present keeps the existing behaviour.
  const labOrganicMatterPct = field.fertility.verifiedTest?.organicMatterPct;
  const soilOrganicMatterOver20Pct =
    labOrganicMatterPct !== undefined ? labOrganicMatterPct > 20 : field.mappedSoil?.organicCarbonStatus === "peat";
  const plannedNeatM3 = input.plannedRegulatoryNeatSlurry?.volumeM3;
  const statutoryManureValueRaw: NutrientPlan["statutoryManureValue"] =
    totalM3 <= 0
      ? statutoryManureNutrientValuePerHa("cattle_slurry", 0, field.areaHa, pIndex, soilOrganicMatterOver20Pct)
      : plannedNeatM3 === undefined || !Number.isFinite(plannedNeatM3) || plannedNeatM3 < 0
        ? blockedInsufficientEvidence("REGULATORY_NEAT_SLURRY_VOLUME_UNKNOWN", [
            "how much of the planned physical slurry is neat cattle slurry for regulatory calculations",
          ])
        : !pIndexIsLaboratory
          ? blockedInsufficientEvidence("COMPLIANCE_P_INDEX_NOT_LABORATORY", ["a laboratory soil P Index for this field"])
          : statutoryManureNutrientValuePerHa("cattle_slurry", plannedNeatM3, field.areaHa, pIndex, soilOrganicMatterOver20Pct);
  // The real total N/P this plan actually proposes to apply — organic
  // (statutory-availability, 0 when genuinely `NOT_APPLICABLE` — no real
  // slurry allocated) plus the real chemical product supply
  // (`deliveredKgHa`, which already accounts for every real byproduct a
  // fixed-analysis blend delivers, e.g. 18-6-12's own K — see
  // `allocatePurchasedProducts`'s own doc comment). `undefined` only
  // when the real statutory figure is itself genuinely unresolvable
  // (`BLOCKED_INSUFFICIENT_EVIDENCE` — missing valid field area, not
  // reachable in practice since `Field.areaHa` is always derived from a
  // real drawn boundary, but never silently treated as "0 organic
  // applied" when the truth is actually unknown) — `napComplianceFinal`
  // below fails this whole check closed in that one real case, rather
  // than risk understating a real total that could exceed the ceiling.
  const actualAppliedNPKgHa =
    statutoryManureValueRaw.status === "OK"
      ? { n: statutoryManureValueRaw.value.availableNKgHa + deliveredKgHa.n, p: statutoryManureValueRaw.value.availablePKgHa + deliveredKgHa.p }
      : statutoryManureValueRaw.status === "NOT_APPLICABLE"
        ? { n: deliveredKgHa.n, p: deliveredKgHa.p }
        : undefined;
  // Campaign B regulatory interpretation (S.I. 588/2025 Art. 17(8)): the
  // Table 13/15a/15b/16/17 maxima are IN ADDITION TO the N/P in grazing
  // livestock manure produced on the holding, so evidenced home-produced
  // grazing slurry is not counted against them — only the chemical supply
  // is. Its statutory N/P stays in `statutoryManureValue` (its own ledger)
  // and is disclosed on the check. Imported manure keeps the full sum.
  const plannedManureOrigin = input.plannedRegulatoryNeatSlurry?.origin;
  const homeGrazingManureExcluded =
    statutoryManureValueRaw.status === "OK" && plannedManureOrigin === "home_produced_grazing_livestock"
      ? { nKgHa: statutoryManureValueRaw.value.availableNKgHa, pKgHa: statutoryManureValueRaw.value.availablePKgHa }
      : undefined;
  const countedAgainstMaximaKgHa = homeGrazingManureExcluded ? { n: deliveredKgHa.n, p: deliveredKgHa.p } : actualAppliedNPKgHa;
  // V3 closure pass (second pass, `SOIL_TEST_VALIDITY` enforcement) — the
  // independent verification found `soilTestAgeValidity` above was
  // computed and returned on `NutrientPlan` but never actually consulted
  // by `checkNapCompliance`, so a legally DISREGARDED soil test (4+ years
  // old, not P-Index 4) still backed a "compliance_value" statutory P
  // ceiling exactly as if it were current. `checkNapCompliance` itself
  // stays a pure P-Index-in function (its own signature/contract is
  // unchanged, matching every other gate's separation-of-concerns) — the
  // downgrade is applied here, once, to the result it returns.
  const rawNapComplianceCheck = checkNapCompliance(
    silage ? "cut_only" : "grazing",
    // Codex audit round 3 HIGH — the real DELIVERED-supply figure
    // (`actualAppliedNPKgHa`, audit finding F1's own fix) must be
    // compared to the statutory ceiling at full precision: rounding it
    // first could round a genuine sub-0.5 kg/ha breach down to
    // "within ceiling". The pre-existing gross-requirement fallback
    // (`grossN`/`grossP`, used only when no real delivered figure is
    // resolvable) keeps its own already-audited, disclosed
    // rounding-before-comparison convention (RPT007,
    // `nutrient-plan-trace.ts`'s own `roundingRule`) unchanged — this
    // fix is scoped to the new real-delivered-supply path only.
    countedAgainstMaximaKgHa ? { n: countedAgainstMaximaKgHa.n, p: countedAgainstMaximaKgHa.p } : { n: Math.round(grossN), p: Math.round(grossP) },
    statutoryGsrOutcome.status === "OK" ? statutoryGsrOutcome.value.gsrKgNHa : 0,
    pIndex,
    silage?.cutNumber,
    cutIntendedForSale,
    hasWrittenSaleEvidence,
    input.nonGrassPct ?? 0,
    pBuildUpEligibility?.status === "OK" && pBuildUpEligibility.value.eligible,
    soilOrganicMatterOver20Pct,
  );
  const rawNapCompliance: NapComplianceCheck = homeGrazingManureExcluded
    ? { ...rawNapComplianceCheck, homeProducedGrazingManureExcluded: { ...homeGrazingManureExcluded, legalBasis: HOME_GRAZING_MANURE_MAXIMA_RULE.legislation } }
    : rawNapComplianceCheck;
  const soilTestDisregarded = soilTestAgeValidity.status === "OK" && soilTestAgeValidity.value === "DISREGARD";
  // Campaign B stabilisation 2 (Codex HIGH): a verified lab test whose age
  // validity is blocked (`UNKNOWN_BLOCK` — undated — or any other
  // insufficient-evidence outcome) is unresolved, not valid. Only
  // `NOT_APPLICABLE` (no lab test on file — covered by
  // `pIndexNotLaboratory` below) and a resolved `OK` are excluded.
  const soilTestValidityUnresolved = soilTestAgeValidity.status !== "OK" && soilTestAgeValidity.status !== "NOT_APPLICABLE";
  // Codex audit CRITICAL (round 28): `landUse` just above (`silage ?
  // "cut_only" : "grazing"`) silently treats a field with a genuinely
  // never-recorded `plannedUse` as "grazing" — this app's own real
  // field-creation flow leaves `plannedUse` unset until the farmer
  // visits Field Detail (`FieldDrawer.tsx`'s own doc comment: "a real
  // 'not set' option, not a silent 'grazing' default"), and this file's
  // own `Field.plannedUse` doc comment (`types.ts`) already required
  // exactly this: "must treat an absent plannedUse as unresolved, not
  // grazing" for a legal/compliance calculation. `buildAllRealPrompts`
  // has no plannedUse filter, so a brand-new farm's fields — mapped but
  // not yet classified — could reach a real, actionable "OK" NAP
  // compliance_value classification for a land use nobody ever
  // confirmed. Deliberately narrower than the agronomic ledger's own
  // grazing-default (left unchanged — the two ledgers are never gated
  // against each other, spec Section A2, and 27 prior rounds' own
  // extensive tested precedent already treats that default as the
  // correct, disclosed "estimated" agronomic assumption): only the
  // COMPLIANCE ledger's own regulatory confidence is downgraded here,
  // using the identical `soilTestDisregarded`-style mechanism.
  const plannedUseUnresolved = field.plannedUse === undefined && !silage;
  // Campaign B (B2.4): the Table 15a/15b P ceiling is keyed on the soil P
  // Index, and S.I. 588/2025's soil-test rules (`soil_test_compliance_rules_2026.csv`)
  // classify P from a soil test. A farmer override or an unconfirmed
  // estimate stays the agronomic working value, but it is not laboratory
  // evidence, so the ceiling it selects is planning advice only.
  const pIndexNotLaboratory = !pIndexIsLaboratory;
  const napCompliance: EngineOutcome<NapComplianceCheck> =
    statutoryGsrOutcome.status === "OK"
      ? ok(
          soilTestDisregarded || soilTestValidityUnresolved || plannedUseUnresolved || pIndexNotLaboratory
            ? {
                ...rawNapCompliance,
                regulatory: "planning_advice",
                ...(pIndexNotLaboratory
                  ? {
                      pIndexNotLaboratoryReason:
                        "This field's P Index is not a laboratory soil-test result (it is your own figure or an unconfirmed estimate) — the P ceiling above is planning advice, not a confirmed statutory value, until a soil test is recorded.",
                    }
                  : {}),
                ...(soilTestDisregarded
                  ? {
                      soilTestDisregardedReason:
                        "This field's soil P Index comes from a lab test that is now legally disregarded (4+ years old, S.I. 588/2025) — the P ceiling above is planning advice, not a confirmed statutory value, until a current soil test is recorded.",
                    }
                  : {}),
                ...(soilTestValidityUnresolved
                  ? {
                      soilTestValidityUnresolvedReason:
                        soilTestAgeValidity.status === "BLOCKED_INSUFFICIENT_EVIDENCE" && soilTestAgeValidity.reasonCode === "UNKNOWN_BLOCK"
                          ? "This field's lab soil test has no usable sample date, so whether it is still legally valid (S.I. 588/2025) cannot be established — the P ceiling above is planning advice, not a confirmed statutory value, until the test date is recorded."
                          : "Whether this field's lab soil test is still legally valid (S.I. 588/2025) cannot be established from the evidence on file — the P ceiling above is planning advice, not a confirmed statutory value, until it is.",
                    }
                  : {}),
                ...(plannedUseUnresolved
                  ? {
                      plannedUseUnresolvedReason:
                        "This field's planned land use hasn't been recorded yet — this NAP classification assumes grazing until confirmed on the Field Detail screen, and is planning advice, not a confirmed statutory value, until then.",
                    }
                  : {}),
              }
            : rawNapCompliance,
          "DERIVED",
        )
      : statutoryGsrOutcome;

  // `statutoryManureValueRaw` — the real statutory manure N/P ledger
  // value, computed entirely separately from `offset`/`slurryAvailableKgHa`
  // above (the Teagasc agronomic figure); see statutory-manure-value.ts's
  // own header comment for why these two numbers must never be
  // conflated. Now computed earlier in this function (Grassland
  // Fertiliser Pilot Completion, Checkpoint A) so the compliance check
  // above can use it too — see that computation's own doc comment.

  // Codex remediation Priority 1 — the actual fail-closed suppression.
  // Everything above this point still runs the ordinary calculation
  // (using the Index-1 placeholder from `pIndex`/`kIndex` when evidence is
  // missing, per this function's own opening comment) so the control flow
  // stays linear; nothing below this line lets that placeholder-derived
  // figure escape as if it were a real recommendation (the national buffer
  // material above is the one pre-existing exception — CC-B5).
  const fertilityEvidenceOk = fertilityEvidence.status === "OK";
  // Codex audit CRITICAL (round 26): a field's own recorded `plannedUse`
  // (a silage cut) was never checked against whether a real `silage`
  // input was actually supplied. Every real caller in this vertical
  // either omits `silage` entirely or passes `silagePlans: []` — no
  // real, persisted `SilagePlan` source exists anywhere in this app
  // (`FERTILISER_VERTICAL_PHASE0.md`'s own disclosed scope limit) — so a
  // field the farmer has explicitly marked as a silage cut silently ran
  // the `if (silage) {...} else {...}` branch above's GRAZING half and
  // got a full, actionable grazing-basis N/P/K requirement/purchased-
  // product blend, reaching every real Prompt/Decision/GPS/Dashboard/
  // Finance/CSV surface — a wrong crop-specific formula presented with
  // the same confidence as a correct one. This is the missing
  // counterpart to the tillage gate every caller already applies
  // upstream: unlike tillage (this app genuinely has no N/P/K table at
  // all — `NOT_APPLICABLE`), silage DOES have real Green Book/NAP tables
  // (13-4/14-2/16/17) — this app just has no real per-field cut/yield
  // evidence source for them yet, the same "cannot calculate, not
  // nothing needed" shape as a missing P/K Soil Index. `slurryAvailableKgHa`'s
  // own organic-offset figures (`offset.n/p/k` below) are NOT land-use
  // dependent — only DM%/P/K-Index driven — so `organicApplication` is
  // deliberately left ungated by this new check.
  const silageEvidenceOk = !isSilageCutPlannedUse(field) || silage !== undefined;
  const evidenceOk = fertilityEvidenceOk && silageEvidenceOk;
  const requirement = evidenceOk
    ? tracked(
        { n: Math.round(grossN), p: Math.round(grossP), k: Math.round(grossK) },
        "estimated",
        "Teagasc Green Book (5th Ed., 2020)",
        { calculationVersion: NUTRIENT_ENGINE_VERSION },
      )
    : tracked(
        // N alone doesn't depend on soil P/K Index, so it stays disclosed
        // when fertility evidence alone is the problem — but when this
        // field's own silage evidence is missing, `grossN` itself was
        // computed via the wrong (grazing) branch above and is not a
        // real figure for this field at all, so it is suppressed too.
        { n: silageEvidenceOk ? Math.round(grossN) : 0, p: 0, k: 0 },
        "unavailable",
        !silageEvidenceOk
          ? "This field is recorded as a silage cut but has no real cut/yield plan to calculate its silage-specific N/P/K requirement from."
          : "This field's P/K Soil Index has not been recorded — add a soil test or a farmer estimate to unlock a fertiliser plan.",
        { calculationVersion: NUTRIENT_ENGINE_VERSION },
      );
  // Campaign A audit HIGH: an unresolved slurry composition means the
  // organic credit is unknown, not zero — the net requirement and every
  // quantity sized from it (products, delivered supply, cost, and the NAP
  // total that includes that supply) stay closed until it is resolved.
  // The gross `requirement` above does not depend on slurry and is kept.
  const netEvidenceOk = evidenceOk && !compositionUnresolved;
  const purchasedProductsFinal = netEvidenceOk ? products : [];
  const deliveredKgHaFinal = netEvidenceOk ? deliveredKgHa : { n: 0, p: 0, k: 0 };
  const estimatedFieldCostEurFinal = netEvidenceOk ? totalCostEur : 0;
  const napComplianceFinal: EngineOutcome<NapComplianceCheck> = !evidenceOk
    ? !fertilityEvidenceOk
      ? blockedInsufficientEvidence("MISSING_SOIL_FERTILITY_INDEX", ["fertility.pIndex", "fertility.kIndex"])
      : blockedInsufficientEvidence("MISSING_SILAGE_PLAN_DATA", ["plannedUse"])
    : compositionUnresolved
      ? blockedInsufficientEvidence("SLURRY_COMPOSITION_SOURCES_UNRESOLVED", ["slurryComposition"])
      : statutoryManureValueRaw.status === "BLOCKED_INSUFFICIENT_EVIDENCE"
      ? // Campaign B (B1): the organic share of the total is unknown (no
        // evidenced neat volume, or no laboratory P Index for its P
        // availability) — never counted as zero organic N/P.
        statutoryManureValueRaw
      : statutoryManureValueRaw.status === "OK" && plannedManureOrigin === undefined
      ? // Campaign B (B2.2): Art. 17(8) treats home-produced grazing manure
        // and imported manure differently, and no store records which it
        // holds — neither treatment is assumed.
        blockedInsufficientEvidence("PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED", [
          "whether the planned slurry is manure produced by grazing livestock on this holding or imported",
        ])
      : homeGrazingManureExcluded !== undefined && statutoryGsrOutcome.status === "OK" && statutoryGsrOutcome.value.gsrKgNHa <= 0
      ? // Home-produced GRAZING livestock manure on a holding whose herd
        // record shows no grazing livestock is contradictory evidence; the
        // Art. 17(8) treatment is not extended to it.
        blockedInsufficientEvidence("HOME_GRAZING_MANURE_WITHOUT_GRAZING_LIVESTOCK", [
          "grazing livestock on this holding's herd record that produced the planned slurry",
        ])
      : homeGrazingManureExcluded !== undefined && pIndex === 4
      ? // Tables 15a/15b footnote 3: on Index 4 soil this manure is allowed
        // only from a holding-wide surplus after every Index 1-3 crop's P
        // need is met by it alone — not evaluable from one field.
        blockedInsufficientEvidence("P_INDEX_4_HOME_MANURE_SURPLUS_UNRESOLVED", [
          "whether the holding's grazing-livestock manure exceeds the P needs of all its Index 1-3 soils",
        ])
      : actualAppliedNPKgHa === undefined
      ? // Grassland Fertiliser Pilot Completion, Checkpoint A (audit
        // finding F1) — the real total N/P this plan proposes to apply
        // could not be established (the real statutory manure figure
        // itself is unresolvable); comparing an unknown total against
        // the statutory ceiling would either silently understate it
        // (treating unknown organic contribution as zero) or fabricate
        // a number this function has no real evidence for. Fails closed
        // instead of a compliance verdict computed from a partial total.
        blockedInsufficientEvidence("MISSING_STATUTORY_MANURE_VALUE", ["field.areaHa"])
      : napCompliance;
  const statutoryManureValue: NutrientPlan["statutoryManureValue"] = fertilityEvidenceOk
    ? statutoryManureValueRaw
    : blockedInsufficientEvidence("MISSING_SOIL_FERTILITY_INDEX", ["fertility.pIndex"]);

  const organicApplication = {
    rateM3ha: Math.round(rateM3ha * 10) / 10,
    totalM3: Math.round(totalM3),
    offsetN: Math.round(offset.n),
    offsetP: fertilityEvidenceOk ? Math.round(offset.p) : 0,
    offsetK: fertilityEvidenceOk ? Math.round(offset.k) : 0,
    // Slurry Evidence & Composition V1 — which DM% this calculation
    // actually used and where it came from, always disclosed (never
    // conditionally hidden) so a caller can retrieve it regardless of
    // whether slurry was actually applied to this field this run — see
    // `resolveEffectiveSlurryComposition`'s own doc comment.
    dmPct: Math.round(dmPct * 10) / 10,
    // Campaign A: when recorded compositions could not be resolved to one,
    // the national-average figure above was NOT used for any credit — the
    // evidence says so instead of presenting it as the DM% used.
    dmPctEvidence: compositionUnresolved
      ? {
          status: "unavailable" as const,
          source: "Not resolved — this field's planned slurry comes from more than one store with recorded composition",
        }
      : {
          status: effectiveSlurryComposition.status,
          source: effectiveSlurryComposition.source,
          ...(effectiveSlurryComposition.sourceDate !== undefined ? { sourceDate: effectiveSlurryComposition.sourceDate } : {}),
          ...(effectiveSlurryComposition.compositionRecordId !== undefined ? { compositionRecordId: effectiveSlurryComposition.compositionRecordId } : {}),
        },
    // Slurry Application Context V1 — the canonical resolver's own full
    // outcome (`offsetN/P/K` above are derived from its `.value.n/p/k`
    // once `status === "OK"`), so a caller/UI can distinguish a real,
    // evidenced result from an honest NOT_ASSESSED/UNSUPPORTED one and
    // explain exactly which Teagasc rule (if any) produced it. See
    // `resolveAvailableSlurryNutrients`.
    availableNutrientAssessment: availableSlurryNutrients,
    // Per-nutrient P/K Increment 2 (CP4 Target A) — additive: the same
    // credit per nutrient, from the same table selection. No other output
    // reads it yet.
    availableNutrientByNutrient,
    // CC-B6 — additive, metadata only: that credit's basis, from the same
    // selection.
    availableNutrientBasis: availableSlurryNutrientBasis(slurryTableSelection),
  };
  // Fertiliser Vertical V1, Checkpoint 3 — additive, non-breaking
  // (DOMAIN_CONTRACTS.md's carve-out: a new field on this return type,
  // no existing consumer destructures it, no existing behaviour
  // changes). The campaign's own §"NUTRIENT REQUIREMENT" explicitly
  // separates "(5) Net nutrient requirement" as its own named concern,
  // distinct from the gross agronomic `requirement` and the organic
  // `organicApplication` credit — previously this value existed only as
  // an internal, unnamed local (`remainingN/P/K`) with no way for a
  // caller to inspect it directly.
  //
  // Codex audit HIGH (round 1): this used to re-derive the net figure
  // from `requirement.value`/`organicApplication.offset*` — both
  // *already rounded* to the nearest whole kg/ha for display — rather
  // than reading `remainingN/P/K` themselves, the actual UNROUNDED
  // values `allocatePurchasedProducts` above was called with. Rounding
  // each side before subtracting can disagree with rounding the
  // subtraction's own result whenever the fractional remainders don't
  // cancel (e.g. gross 10.5/offset 10.4: real remaining 0.1 rounds to
  // 0, but round(10.5)=11 minus round(10.4)=10 gives 1) — a materially
  // different number from what the product blend was actually sized
  // for. Rounding `remainingN/P/K` directly (the same variables fed to
  // `allocatePurchasedProducts` a few lines above, never a second,
  // separately-derived calculation) keeps this field provably
  // consistent with the real allocation by construction.
  const netRequirement = netEvidenceOk
    ? tracked(
        {
          n: Math.round(remainingN),
          p: Math.round(remainingP),
          k: Math.round(remainingK),
        },
        "estimated",
        "Teagasc Green Book (5th Ed., 2020) requirement, less organic nutrient credit (S.I. 588/2025 slurry availability)",
        { calculationVersion: NUTRIENT_ENGINE_VERSION },
      )
    : tracked({ n: 0, p: 0, k: 0 }, "unavailable", requirement.source, { calculationVersion: NUTRIENT_ENGINE_VERSION });

  // Per-nutrient P/K Increment 3 (CP2 Target A) — additive. Each gross arm
  // is `Math.round` of the same `grossX` local `requirement` uses, released
  // only when that nutrient's own real index exists (a known P or K gross
  // never depends on the other index, so the Index-1 placeholder never
  // reaches a released arm). N keeps `requirement`'s rule: kept unless the
  // silage evidence is missing.
  const silageEvidenceBlock: EngineOutcome<number> = blockedInsufficientEvidence("MISSING_SILAGE_PLAN_DATA", ["plannedUse"]);
  // Evidence state: the Green Book tables (Irish guidance), weakened by the
  // nutrient's own index evidence where one applies.
  const grossArm = (gross: number, fertilityArm: NutrientPlan["fertilityEvidenceByNutrient"]["p"] | undefined): EngineOutcome<number> => {
    if (fertilityArm === undefined) return silageEvidenceOk ? ok(Math.round(gross), "IRISH_DEFAULT") : silageEvidenceBlock;
    if (fertilityArm.status !== "OK") return fertilityArm;
    if (!silageEvidenceOk) return silageEvidenceBlock;
    return ok(Math.round(gross), weakestEvidenceState(["IRISH_DEFAULT", fertilityArm.evidenceState]));
  };
  const requirementByNutrient: NutrientPlan["requirementByNutrient"] = {
    n: grossArm(grossN, undefined),
    p: grossArm(grossP, fertilityEvidenceByNutrient.p),
    k: grossArm(grossK, fertilityEvidenceByNutrient.k),
  };
  // The one shared per-nutrient remaining calculation — never the paired
  // `remainingX`/`offset` (which zero P/K whenever either index is missing).
  // The credit is the per-nutrient slurry arm; `NOT_APPLICABLE` (no slurry
  // allocated) is a known zero credit, as the paired offset treats it. Any
  // other non-OK credit (unknown/unsupported/unresolved) blocks the net arm.
  const netArm = (gross: number, grossOutcome: EngineOutcome<number>, credit: EngineOutcome<{ kgHa: number }>): EngineOutcome<number> => {
    if (grossOutcome.status !== "OK") return grossOutcome;
    if (credit.status === "NOT_APPLICABLE") return ok(Math.round(Math.max(0, gross)), grossOutcome.evidenceState);
    if (credit.status !== "OK") return credit;
    return ok(Math.round(Math.max(0, gross - credit.value.kgHa)), weakestEvidenceState([grossOutcome.evidenceState, credit.evidenceState]));
  };
  const netRequirementByNutrient: NutrientPlan["netRequirementByNutrient"] = {
    n: netArm(grossN, requirementByNutrient.n, availableNutrientByNutrient.n),
    p: netArm(grossP, requirementByNutrient.p, availableNutrientByNutrient.p),
    k: netArm(grossK, requirementByNutrient.k, availableNutrientByNutrient.k),
  };
  // Fertiliser Vertical Completion, Increment 1 — additive canonical
  // requirement from the same unrounded gross locals.
  const fieldRequirement = buildFieldNutrientRequirement({
    field,
    silage,
    livestockGroups,
    agronomicStockingRateKgHa,
    farmGrasslandAreaHa,
    gross: { n: grossN, p: grossP, k: grossK },
    requirementByNutrient,
    fertilityEvidenceByNutrient,
  });

  // Slurry Timing Evidence Patch V1, brief §6 ("Unsupported credit
  // policy") — the real, named distinction the brief asks for: a genuine
  // 0 kg/ha slurry contribution (nothing allocated, `rateM3ha <= 0`, or a
  // real evidenced result that happens to compute to 0) is NOT the same
  // scientific state as an UNKNOWN/NOT-ASSESSED one (slurry IS allocated
  // to this field, but Farm Return has no evidenced available-nutrient
  // rule for its real captured method/timing/DM% combination — the
  // organic offset is still floored to 0 for calculation safety, per the
  // brief's own instruction, but that 0 must not silently read as a
  // resolved scientific answer). Computed once, here — the one real place
  // this decision is made, never re-derived/guessed in a UI component
  // (CLAUDE.md: no agronomy/financial formula inside React). `products`/
  // `requirement`/`netRequirement` above are NOT suppressed when this is
  // true — brief §6 is explicit that "the rest of the fertiliser plan
  // remains actionable"; this field only adds the qualification a caller
  // must surface alongside those real, still-computed figures.
  const slurryAllocatedThisRun = rateM3ha > 0;
  const slurryCreditUnassessed = slurryAllocatedThisRun && availableSlurryNutrients.status !== "OK";
  const requirementProvisional: NutrientPlan["requirementProvisional"] = {
    isProvisional: slurryCreditUnassessed,
    ...(slurryCreditUnassessed
      ? {
          headline: "Slurry nutrient credit not included",
          detail: "Fertiliser requirement is provisional until the slurry nutrient contribution can be assessed.",
        }
      : {}),
  };

  return {
    fieldId: field.id,
    fertilityEvidence,
    fertilityEvidenceByNutrient,
    soilIndexProvenance: resolveFieldSoilIndexProvenance(field.fertility),
    requirement,
    requirementByNutrient,
    organicApplication,
    requirementProvisional,
    netRequirement,
    netRequirementByNutrient,
    fieldRequirement,
    purchasedProducts: purchasedProductsFinal,
    deliveredKgHa: deliveredKgHaFinal,
    napCompliance: napComplianceFinal,
    statutoryManureValue,
    commonageFertiliserGate: commonageGateOutcome,
    lessMethodCompliance,
    localBufferOverrideStatus,
    nationalBufferDistanceStatus,
    soilTestAgeValidity,
    estimatedFieldCostEur: estimatedFieldCostEurFinal,
    calculationVersion: NUTRIENT_ENGINE_VERSION,
  };
}
