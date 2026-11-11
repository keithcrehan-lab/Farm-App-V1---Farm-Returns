import type { Field, GrazingSward } from "./types";
import {
  CLOVER_N_VERSION,
  DRYSTOCK_CLOVER_REFERENCE_GSR_KG_N_HA,
  checkCloverFertilityContext,
  drystockCloverAnnualTotalKgNHa,
  lookupDrystockCloverN,
  type DrystockCloverClass,
  type DrystockCloverTiming,
} from "./clover-n";
import type {
  FieldProductionCycle,
  GrazingProductionSystem,
} from "./fertiliser-field-evidence";

// v2.1.0 (2026-11-11, fertiliser close-out): (a) no grazing P maintenance at
// P Index 4 (Green Book §13; S.I. 588/2025 Table 15a Index 4 maximum 0);
// (b) grazing fails closed above the last published Table 12-2/12-3 row
// instead of holding it; (c) white-clover grazing pathway using the Teagasc
// drystock clover strategy, only where it is published (170 kg organic N/ha,
// April clover classes). Every other v2.0.0 result is unchanged.
export const GRASS_ENGINE_V2_VERSION = "grass_fertiliser_engine_v2.1.0";

export type GrassEngineStatus =
  "READY" | "INCOMPLETE_EVIDENCE" | "UNSUPPORTED_PATHWAY" | "SOURCE_CONFLICT";
export type Nutrient = "n" | "p" | "k";

export interface NutrientQuantity {
  n: number;
  p: number;
  k: number;
}

export interface GrassRuleTrace {
  ruleId: string;
  source: string;
  sourceVersion: string;
  inputs: Record<string, string | number | boolean | null>;
  resultKgHa: number;
  method: string;
}

export interface GrassFertiliserResult {
  engineVersion: string;
  status: GrassEngineStatus;
  fieldId: string;
  cropSystem: FieldProductionCycle["cropSystem"];
  grossRequirementKgHa?: NutrientQuantity;
  organicCreditsKgHa?: NutrientQuantity;
  priorChemicalCreditsKgHa?: NutrientQuantity;
  remainingRequirementKgHa?: NutrientQuantity;
  traces: { n?: GrassRuleTrace; p?: GrassRuleTrace; k?: GrassRuleTrace };
  missingInputs: string[];
  limitations: string[];
}

export interface GrassFertiliserEngineInput {
  field: Pick<Field, "id" | "fertility">;
  cycle: FieldProductionCycle;
  /**
   * Total annual livestock N excretion / net grassland area. This is NOT
   * LU/ha and NOT a chemical-N recommendation output.
   */
  annualOrganicNStockingRateKgHa?: number;
  grazingProductionSystem?: GrazingProductionSystem;
  organicCreditsKgHa?: NutrientQuantity;
  /**
   * v2.1.0: grazing table rows always use the holding's grassland stocking
   * rate (Green Book Table 12-3 footnote 3: total annual N excreted by
   * grazing livestock averaged over the net grassland area). A field's own
   * recorded grazing is carried as disclosed context only — it never selects
   * a table row (v2.0.0 used in-season paddock pressure, which the source's
   * definition does not support and which inflated N on heavily grazed
   * paddocks).
   */
  grazingStockingEvidence?: {
    basis: "HOLDING_GSR";
    fieldGrazingContext?: {
      averageStockingRateLUHa: number;
      trackingStart?: string;
      trackingDays?: number;
      sourceSessionCount: number;
    };
  };
}

const ZERO: NutrientQuantity = { n: 0, p: 0, k: 0 };

// Teagasc Green Book 5th ed. (2020), Table 12-3, suckler calf-to-beef.
// The table itself publishes BOTH LU/ha and annual organic-N kg/ha. V2 uses
// the latter directly and never recreates it from the chemical-N output.
const SUCKLER_CALF_TO_BEEF_N_ROWS = [
  { organicN: 80, totalN: 35 },
  { organicN: 99, totalN: 53 },
  { organicN: 118, totalN: 75 },
  { organicN: 138, totalN: 103 },
  { organicN: 158, totalN: 132 },
  { organicN: 176, totalN: 162 },
  { organicN: 196, totalN: 193 },
  { organicN: 215, totalN: 215 },
  { organicN: 235, totalN: 241 },
] as const;

// Teagasc Green Book 5th ed. (2020), Table 12-2, suckler calf-to-weaning.
// As above, V2 uses the table's published annual organic-N kg/ha column
// directly for interpolation; it does not convert from LU/ha.
const SUCKLER_CALF_TO_WEANING_N_ROWS = [
  { organicN: 80, totalN: 35 },
  { organicN: 92, totalN: 47 },
  { organicN: 110, totalN: 66 },
  { organicN: 129, totalN: 105 },
  { organicN: 148, totalN: 149 },
  { organicN: 166, totalN: 165 },
  { organicN: 185, totalN: 197 },
  { organicN: 218, totalN: 217 },
  { organicN: 238, totalN: 245 },
] as const;

function interpolatePublishedRows(
  x: number,
  rows: readonly { organicN: number; totalN: number }[],
): {
  value: number;
  lower: (typeof rows)[number];
  upper: (typeof rows)[number];
  fraction: number;
} {
  if (x <= rows[0].organicN)
    return {
      value: rows[0].totalN,
      lower: rows[0],
      upper: rows[0],
      fraction: 0,
    };
  const last = rows[rows.length - 1];
  if (x >= last.organicN)
    return { value: last.totalN, lower: last, upper: last, fraction: 0 };
  for (let i = 0; i < rows.length - 1; i++) {
    const lower = rows[i];
    const upper = rows[i + 1];
    if (x >= lower.organicN && x <= upper.organicN) {
      const fraction = (x - lower.organicN) / (upper.organicN - lower.organicN);
      return {
        value: lower.totalN + fraction * (upper.totalN - lower.totalN),
        lower,
        upper,
        fraction,
      };
    }
  }
  return { value: last.totalN, lower: last, upper: last, fraction: 0 };
}

function pBuildUp(index: 1 | 2 | 3 | 4): number {
  return ({ 1: 20, 2: 10, 3: 0, 4: 0 } as const)[index];
}

function pMaintenanceDrystock(orgN: number, index: 1 | 2 | 3 | 4): number {
  // Green Book §13: "Grassland soils with P levels at Index 4 … no P
  // fertilizer is advised until the soil P level reverts to the Index 3
  // range" — Table 13-3 maintenance does not apply at Index 4.
  if (index === 4) return 0;
  if (orgN <= 100) return 4;
  if (orgN <= 130) return 7;
  if (orgN <= 170) return 10;
  if (orgN <= 210) return 13;
  return 16;
}

function kGrazingDrystock(index: 1 | 2 | 3 | 4, orgN: number): number {
  if (index === 4) return 0;
  const base = ({ 1: 75, 2: 45, 3: 15 } as const)[index];
  return Math.max(0, base + ((orgN - 170) / 40) * 5);
}

function priorChemical(cycle: FieldProductionCycle): NutrientQuantity | null {
  const n = cycle.evidence.chemicalNAppliedKgHa?.value;
  const p = cycle.evidence.chemicalPAppliedKgHa?.value;
  const k = cycle.evidence.chemicalKAppliedKgHa?.value;
  if (
    ![n, p, k].every(
      (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
    )
  )
    return null;
  return { n: n!, p: p!, k: k! };
}

function subtract(
  gross: NutrientQuantity,
  organic: NutrientQuantity,
  prior: NutrientQuantity,
): NutrientQuantity {
  return {
    n: Math.max(0, gross.n - organic.n - prior.n),
    p: Math.max(0, gross.p - organic.p - prior.p),
    k: Math.max(0, gross.k - organic.k - prior.k),
  };
}

function grazingStockingLimitations(evidence: GrassFertiliserEngineInput["grazingStockingEvidence"]): string[] {
  if (evidence?.basis !== "HOLDING_GSR") return [];
  const context = evidence.fieldGrazingContext;
  return [
    "Grazing advice uses the farm's grassland stocking rate — total annual livestock N excreted, averaged over all grassland — as the Green Book defines it.",
    ...(context
      ? [
          `This field's recorded grazing averaged ${context.averageStockingRateLUHa.toFixed(2)} LU/ha while stock were tracked; it is shown for context and does not change the table row.`,
        ]
      : []),
  ];
}

function blocked(
  input: GrassFertiliserEngineInput,
  status: GrassEngineStatus,
  missingInputs: string[],
  limitations: string[],
): GrassFertiliserResult {
  return {
    engineVersion: GRASS_ENGINE_V2_VERSION,
    status,
    fieldId: input.field.id,
    cropSystem: input.cycle.cropSystem,
    traces: {},
    missingInputs,
    limitations,
  };
}

export function calculateGrassFertiliserV2(
  input: GrassFertiliserEngineInput,
): GrassFertiliserResult {
  const { field, cycle } = input;
  const pIndex = field.fertility.pIndex?.value;
  const kIndex = field.fertility.kIndex?.value;
  const prior = priorChemical(cycle);
  const missing: string[] = [];
  if (!pIndex) missing.push("fertility.pIndex");
  if (!kIndex) missing.push("fertility.kIndex");
  if (!field.fertility.verifiedTest?.sampleDate)
    missing.push("fertility.verifiedTest.sampleDate");
  if (!prior) missing.push("chemicalN/P/KAppliedKgHa");
  if (missing.length) return blocked(input, "INCOMPLETE_EVIDENCE", missing, []);

  const organic = input.organicCreditsKgHa ?? ZERO;

  if (cycle.cropSystem === "GRASS_GRAZING" || cycle.cropSystem === "GRASS_WHITE_CLOVER_GRAZING") {
    const grazing = calculateGrazingGrossRequirement({
      pIndex: pIndex!,
      kIndex: kIndex!,
      ...(input.annualOrganicNStockingRateKgHa !== undefined
        ? { annualOrganicNStockingRateKgHa: input.annualOrganicNStockingRateKgHa }
        : {}),
      ...(input.grazingProductionSystem !== undefined
        ? { grazingProductionSystem: input.grazingProductionSystem }
        : {}),
      sward:
        cycle.cropSystem === "GRASS_WHITE_CLOVER_GRAZING"
          ? {
              kind: "WHITE_CLOVER",
              ...(cycle.evidence.whiteCloverPct?.value !== undefined
                ? { aprilWhiteCloverPct: cycle.evidence.whiteCloverPct.value }
                : {}),
            }
          : { kind: "GRASS" },
      ...(input.grazingStockingEvidence !== undefined
        ? { grazingStockingEvidence: input.grazingStockingEvidence }
        : {}),
    });
    if (grazing.status !== "READY")
      return blocked(input, grazing.status, grazing.missingInputs, grazing.limitations);
    return {
      engineVersion: GRASS_ENGINE_V2_VERSION,
      status: "READY",
      fieldId: field.id,
      cropSystem: cycle.cropSystem,
      grossRequirementKgHa: grazing.grossRequirementKgHa,
      organicCreditsKgHa: organic,
      priorChemicalCreditsKgHa: prior!,
      remainingRequirementKgHa: subtract(grazing.grossRequirementKgHa, organic, prior!),
      missingInputs: [],
      limitations: grazing.limitations,
      traces: grazing.traces,
    };
  }

  if (cycle.cropSystem === "GRASS_FIRST_CUT_SILAGE") {
    const target = cycle.evidence.productionTargetTDMHa?.value;
    if (target === undefined || !Number.isFinite(target))
      return blocked(
        input,
        "INCOMPLETE_EVIDENCE",
        ["productionTargetTDMHa"],
        [],
      );
    if (Math.abs(target - 5) > 1e-9) {
      return blocked(
        input,
        "UNSUPPORTED_PATHWAY",
        [],
        [
          "Current 2026 first-cut source validates the N/P/K table at 5 t DM/ha; P3 does not invent an N yield-scaling rule outside that published target.",
        ],
      );
    }
    const pByIndex = ({ 1: 40, 2: 30, 3: 20, 4: 0 } as const)[pIndex!];
    const kByIndex = ({ 1: 175, 2: 155, 3: 125, 4: 0 } as const)[kIndex!];
    const gross: NutrientQuantity = { n: 100, p: pByIndex, k: kByIndex };
    return {
      engineVersion: GRASS_ENGINE_V2_VERSION,
      status: "READY",
      fieldId: field.id,
      cropSystem: cycle.cropSystem,
      grossRequirementKgHa: gross,
      organicCreditsKgHa: organic,
      priorChemicalCreditsKgHa: prior!,
      remainingRequirementKgHa: subtract(gross, organic, prior!),
      missingInputs: [],
      limitations: [
        "First-cut P3 rule is intentionally scoped to the published 5 t DM/ha 2026 table.",
      ],
      traces: {
        n: {
          ruleId: "TEAGASC_FIRST_CUT_2026_N",
          source: "Teagasc Fertilising for First Cut Grass Silage",
          sourceVersion: "2026",
          inputs: { productionTargetTDMHa: 5 },
          resultKgHa: 100,
          method: "published 5 t DM/ha first-cut rate",
        },
        p: {
          ruleId: "TEAGASC_FIRST_CUT_2026_P",
          source: "Teagasc Fertilising for First Cut Grass Silage",
          sourceVersion: "2026",
          inputs: { productionTargetTDMHa: 5, pIndex: pIndex! },
          resultKgHa: pByIndex,
          method: "published soil-index table",
        },
        k: {
          ruleId: "TEAGASC_FIRST_CUT_2026_K",
          source: "Teagasc Fertilising for First Cut Grass Silage",
          sourceVersion: "2026",
          inputs: { productionTargetTDMHa: 5, kIndex: kIndex! },
          resultKgHa: kByIndex,
          method: "published soil-index table",
        },
      },
    };
  }

  if (
    cycle.cropSystem === "GRASS_SECOND_CUT_SILAGE" ||
    cycle.cropSystem === "GRASS_THIRD_CUT_SILAGE"
  ) {
    return blocked(
      input,
      "SOURCE_CONFLICT",
      [],
      [
        "Current Teagasc yield-based second-cut guidance and the general soil-index P/K table do not express the same P/K requirement model; P3 fails closed pending rule reconciliation.",
      ],
    );
  }

  return blocked(
    input,
    "UNSUPPORTED_PATHWAY",
    [],
    ["This grass pathway does not yet have a validated P3 rule pack."],
  );
}

// ---------------------------------------------------------------------------
// v2.1.0 — white-clover grazing (Teagasc drystock clover strategy)
// ---------------------------------------------------------------------------

/**
 * Teagasc, "Management of red and white clover in Irish beef grass-based
 * systems" (2026), Table 1: "Nitrogen fertiliser application strategy for a
 * drystock farm (stocking rate 170 kg organic N/ha) based on sward white
 * clover contents in April" (`TEAGASC_CLOVER_BEEF_2026`,
 * `advisory_teagasc/clover_n_drystock_2026.csv`). Only the published
 * classes are recognised — no interpolation between them (`GFT139`).
 */
const APRIL_WHITE_CLOVER_CLASS_BY_PCT: Readonly<Record<number, DrystockCloverClass>> = Object.freeze({
  0: "low_or_none",
  5: "april_5pct_approx_10pct_annual",
  10: "april_10pct_high_approx_15pct_annual",
});

const DRYSTOCK_CLOVER_TIMINGS: readonly DrystockCloverTiming[] = ["Feb_Mar", "Apr", "May", "Jun", "Jul", "Aug_Sep"];

/**
 * The white-clover grazing pathway. P and K follow the same Green Book
 * drystock grazing rules as grass (Tables 13-2, 13-3, 14-1). N comes from
 * the Teagasc drystock clover strategy, which is published at ONE stocking
 * rate only (170 kg organic N/ha): at any other stocking rate no clover N
 * rate is advised (`GFT140`) — and the grass-only Table 12-3 rate is never
 * substituted, because it ignores clover N fixation and would over-advise N.
 */
export type { GrazingSward };

/**
 * The grazing sward a field's production cycle records (fertiliser
 * close-out, 2026-11-11): the single mapping both engines use, so a clover
 * cycle is never read as grass by one and clover by the other. Non-grazing
 * cycles (silage, cereals, …) have no grazing sward.
 */
export function grazingSwardForCycle(cycle: FieldProductionCycle | undefined): GrazingSward | undefined {
  if (cycle === undefined) return undefined;
  if (cycle.cropSystem === "GRASS_GRAZING") return { kind: "GRASS" };
  if (cycle.cropSystem === "GRASS_WHITE_CLOVER_GRAZING") {
    const pct = cycle.evidence.whiteCloverPct?.value;
    return pct !== undefined ? { kind: "WHITE_CLOVER", aprilWhiteCloverPct: pct } : { kind: "WHITE_CLOVER" };
  }
  return undefined;
}

export interface GrazingRequirementInput {
  pIndex: 1 | 2 | 3 | 4;
  kIndex: 1 | 2 | 3 | 4;
  annualOrganicNStockingRateKgHa?: number;
  grazingProductionSystem?: GrazingProductionSystem;
  sward: GrazingSward;
  grazingStockingEvidence?: GrassFertiliserEngineInput["grazingStockingEvidence"];
}

export type GrazingRequirementOutcome =
  | {
      status: "READY";
      grossRequirementKgHa: NutrientQuantity;
      traces: { n: GrassRuleTrace; p: GrassRuleTrace; k: GrassRuleTrace };
      limitations: string[];
    }
  | {
      status: Exclude<GrassEngineStatus, "READY">;
      missingInputs: string[];
      limitations: string[];
    };

function grazingBlocked(
  status: Exclude<GrassEngineStatus, "READY">,
  missingInputs: string[],
  limitations: string[],
): GrazingRequirementOutcome {
  return { status, missingInputs, limitations };
}

/**
 * The single grazing N/P/K gross-requirement calculation (grass and white
 * clover swards), shared by `calculateGrassFertiliserV2` and the Nutrients
 * engine (`calculateNutrientPlan`) so both always give the same figures for
 * the same evidence (fertiliser close-out, "align both", 2026-11-11).
 * Organic credits, prior chemical applications, products and every
 * statutory check stay with the callers.
 */
export function calculateGrazingGrossRequirement(
  input: GrazingRequirementInput,
): GrazingRequirementOutcome {
  if (input.sward.kind === "WHITE_CLOVER") return whiteCloverGrazingRequirement(input, input.sward);
  const { pIndex, kIndex } = input;
  const nRows =
    input.grazingProductionSystem === "SUCKLER_CALF_TO_BEEF"
      ? SUCKLER_CALF_TO_BEEF_N_ROWS
      : input.grazingProductionSystem === "SUCKLER_CALF_TO_WEANING"
        ? SUCKLER_CALF_TO_WEANING_N_ROWS
        : null;
  if (!nRows) {
    return grazingBlocked(
      "UNSUPPORTED_PATHWAY",
      ["grazingProductionSystem"],
      [
        "P3 has no validated Green Book N table implemented for this grazing production system.",
      ],
    );
  }
  const orgN = input.annualOrganicNStockingRateKgHa;
  if (orgN === undefined || !Number.isFinite(orgN) || orgN < 0) {
    return grazingBlocked("INCOMPLETE_EVIDENCE", ["annualOrganicNStockingRateKgHa"], []);
  }
  const lastPublishedRow = nRows[nRows.length - 1];
  if (orgN > lastPublishedRow.organicN) {
    return grazingBlocked(
      "UNSUPPORTED_PATHWAY",
      [],
      [
        `This field's organic-N stocking rate (${Math.round(orgN)} kg N/ha) is above the last row Teagasc publishes for this grazing system (${lastPublishedRow.organicN} kg N/ha), so no grazing N, P or K advice is given rather than extending the table.`,
      ],
    );
  }
  const nInterp = interpolatePublishedRows(orgN, nRows);
  const nTableNumber =
    input.grazingProductionSystem === "SUCKLER_CALF_TO_WEANING"
      ? "12-2"
      : "12-3";
  const nRuleId =
    input.grazingProductionSystem === "SUCKLER_CALF_TO_WEANING"
      ? "TEAGASC_GREEN_BOOK_2020_TABLE_12_2_SUCKLER_CALF_TO_WEANING"
      : "TEAGASC_GREEN_BOOK_2020_TABLE_12_3_SUCKLER_CALF_TO_BEEF";
  const gross: NutrientQuantity = {
    n: nInterp.value,
    p: pBuildUp(pIndex) + pMaintenanceDrystock(orgN, pIndex),
    k: kGrazingDrystock(kIndex, orgN),
  };
  const stockingEvidence = input.grazingStockingEvidence;
  return {
    status: "READY",
    grossRequirementKgHa: gross,
    limitations: [
      `Grazing N uses transparent linear interpolation between published Table ${nTableNumber} organic-N rows; this modelling policy is disclosed in the trace.`,
      ...grazingStockingLimitations(stockingEvidence),
    ],
    traces: {
      n: {
        ruleId: nRuleId,
        source:
          "Teagasc Major & Micro Nutrient Advice for Productive Agricultural Crops",
        sourceVersion: "5th Edition 2020",
        inputs: {
          annualOrganicNStockingRateKgHa: orgN,
          lowerOrganicN: nInterp.lower.organicN,
          upperOrganicN: nInterp.upper.organicN,
          interpolationFraction: nInterp.fraction,
          stockingEvidenceBasis: stockingEvidence?.basis ?? null,
          fieldAverageStockingRateLUHa: stockingEvidence?.fieldGrazingContext?.averageStockingRateLUHa ?? null,
          trackingStart: stockingEvidence?.fieldGrazingContext?.trackingStart ?? null,
          trackingDays: stockingEvidence?.fieldGrazingContext?.trackingDays ?? null,
          sourceSessionCount: stockingEvidence?.fieldGrazingContext?.sourceSessionCount ?? null,
        },
        resultKgHa: gross.n,
        method:
          "linear interpolation between published organic-N stocking-rate rows; the printed first row covers lower stocking rates; no advice above the last row",
      },
      p: {
        ruleId: "TEAGASC_GREEN_BOOK_2020_TABLE_13_2_13_3_DRYSTOCK",
        source: "Teagasc Green Book",
        sourceVersion: "5th Edition 2020",
        inputs: {
          pIndex,
          annualOrganicNStockingRateKgHa: orgN,
          buildUpKgHa: pBuildUp(pIndex),
          maintenanceKgHa: pMaintenanceDrystock(orgN, pIndex),
          stockingEvidenceBasis: stockingEvidence?.basis ?? null,
        },
        resultKgHa: gross.p,
        method: "soil-index build-up plus drystock grazing maintenance band",
      },
      k: {
        ruleId: "TEAGASC_GREEN_BOOK_2020_TABLE_14_1_DRYSTOCK",
        source: "Teagasc Green Book",
        sourceVersion: "5th Edition 2020",
        inputs: {
          kIndex,
          annualOrganicNStockingRateKgHa: orgN,
          baselineOrganicN: 170,
          stockingEvidenceBasis: stockingEvidence?.basis ?? null,
        },
        resultKgHa: gross.k,
        method:
          "published drystock K baseline at 170 kg organic N/ha, adjusted 5 kg K/ha per 40 kg organic N/ha",
      },
    },
  };
}

function whiteCloverGrazingRequirement(
  input: GrazingRequirementInput,
  sward: Extract<GrazingSward, { kind: "WHITE_CLOVER" }>,
): GrazingRequirementOutcome {
  const { pIndex, kIndex } = input;
  const orgN = input.annualOrganicNStockingRateKgHa;
  if (orgN === undefined || !Number.isFinite(orgN) || orgN < 0) {
    return grazingBlocked("INCOMPLETE_EVIDENCE", ["annualOrganicNStockingRateKgHa"], []);
  }
  const cloverPct = sward.aprilWhiteCloverPct;
  if (cloverPct === undefined || !Number.isFinite(cloverPct)) {
    return grazingBlocked("INCOMPLETE_EVIDENCE", ["whiteCloverPct"], []);
  }
  const cloverClass = APRIL_WHITE_CLOVER_CLASS_BY_PCT[cloverPct];
  if (cloverClass === undefined) {
    return grazingBlocked("UNSUPPORTED_PATHWAY", [], [
      `Teagasc's clover N strategy is published for April sward white-clover contents of low/none, about 5% and about 10%; a recorded ${cloverPct}% is not one of those classes and is never interpolated between them.`,
    ]);
  }
  // GFT140 (audit F004): the canonical lookup is the gate — it is given the
  // field's actual stocking rate, never a substituted 170, and refuses any
  // rate other than the published reference.
  const referenceCheck = lookupDrystockCloverN(cloverClass, DRYSTOCK_CLOVER_TIMINGS[0], orgN);
  if (referenceCheck.status !== "OK") {
    return grazingBlocked("UNSUPPORTED_PATHWAY", [], [
      `Teagasc publishes the drystock white-clover N strategy only for farms stocked at ${DRYSTOCK_CLOVER_REFERENCE_GSR_KG_N_HA} kg organic N/ha; this field is at ${Number(orgN.toFixed(1))} kg N/ha, so no clover N rate is advised. The grass-only N table is not used for a clover sward because it ignores the N the clover fixes.`,
    ]);
  }
  const schedule: Record<string, number> = {};
  for (const timing of DRYSTOCK_CLOVER_TIMINGS) {
    const value = lookupDrystockCloverN(cloverClass, timing, orgN);
    if (value.status !== "OK") return grazingBlocked("SOURCE_CONFLICT", [], ["The clover N schedule could not be read for every timing."]);
    schedule[timing] = value.value;
  }
  const buildUp = pBuildUp(pIndex);
  const maintenance = pMaintenanceDrystock(orgN, pIndex);
  const gross: NutrientQuantity = {
    n: drystockCloverAnnualTotalKgNHa(cloverClass),
    p: buildUp + maintenance,
    k: kGrazingDrystock(kIndex, orgN),
  };
  const fertility = checkCloverFertilityContext(pIndex, kIndex);
  const stockingEvidence = input.grazingStockingEvidence;
  return {
    status: "READY",
    grossRequirementKgHa: gross,
    limitations: [
      `Clover N follows the Teagasc drystock white-clover strategy at ${DRYSTOCK_CLOVER_REFERENCE_GSR_KG_N_HA} kg organic N/ha for the recorded April clover class; the legal N maximum still applies.`,
      ...(fertility.status === "OK" && fertility.value === "FLAG_FERTILITY_CONTEXT_NOT_IDEAL"
        ? ["Teagasc flags very low soil fertility (P and K both Index 1) as not ideal for clover; correct P and K to support clover persistence."]
        : []),
      ...grazingStockingLimitations(stockingEvidence),
    ],
    traces: {
      n: {
        ruleId: "TEAGASC_CLOVER_BEEF_2026_TABLE_1_DRYSTOCK",
        source: "Teagasc, Management of red and white clover in Irish beef grass-based systems",
        sourceVersion: `2026 (${CLOVER_N_VERSION})`,
        inputs: {
          aprilWhiteCloverPct: cloverPct,
          cloverClass,
          referenceOrganicNKgHa: DRYSTOCK_CLOVER_REFERENCE_GSR_KG_N_HA,
          annualOrganicNStockingRateKgHa: orgN,
          ...Object.fromEntries(DRYSTOCK_CLOVER_TIMINGS.map((t) => [`n_${t}`, schedule[t]])),
        },
        resultKgHa: gross.n,
        method: "published annual total for the April clover class at the reference stocking rate; timings in inputs",
      },
      p: {
        ruleId: "TEAGASC_GREEN_BOOK_2020_TABLE_13_2_13_3_DRYSTOCK",
        source: "Teagasc Green Book",
        sourceVersion: "5th Edition 2020",
        inputs: { pIndex, annualOrganicNStockingRateKgHa: orgN, buildUpKgHa: buildUp, maintenanceKgHa: maintenance },
        resultKgHa: gross.p,
        method: "soil-index build-up plus drystock grazing maintenance band",
      },
      k: {
        ruleId: "TEAGASC_GREEN_BOOK_2020_TABLE_14_1_DRYSTOCK",
        source: "Teagasc Green Book",
        sourceVersion: "5th Edition 2020",
        inputs: { kIndex, annualOrganicNStockingRateKgHa: orgN, baselineOrganicN: 170 },
        resultKgHa: gross.k,
        method: "published drystock K baseline at 170 kg organic N/ha, adjusted 5 kg K/ha per 40 kg organic N/ha",
      },
    },
  };
}

