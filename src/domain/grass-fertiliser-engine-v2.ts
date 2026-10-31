import type { Field } from "./types";
import type { FieldProductionCycle, GrazingProductionSystem } from "./fertiliser-field-evidence";

export const GRASS_ENGINE_V2_VERSION = "grass_fertiliser_engine_v2.0.0";

export type GrassEngineStatus = "READY" | "INCOMPLETE_EVIDENCE" | "UNSUPPORTED_PATHWAY" | "SOURCE_CONFLICT";
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
  grazingStockingEvidence?: {
    basis: "FIELD_GRAZING_SESSIONS" | "HOLDING_FALLBACK";
    trackingStart?: string;
    trackingDays?: number;
    sourceSessionCount?: number;
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

function interpolatePublishedRows(x: number, rows: readonly { organicN: number; totalN: number }[]): { value: number; lower: typeof rows[number]; upper: typeof rows[number]; fraction: number } {
  if (x <= rows[0].organicN) return { value: rows[0].totalN, lower: rows[0], upper: rows[0], fraction: 0 };
  const last = rows[rows.length - 1];
  if (x >= last.organicN) return { value: last.totalN, lower: last, upper: last, fraction: 0 };
  for (let i = 0; i < rows.length - 1; i++) {
    const lower = rows[i];
    const upper = rows[i + 1];
    if (x >= lower.organicN && x <= upper.organicN) {
      const fraction = (x - lower.organicN) / (upper.organicN - lower.organicN);
      return { value: lower.totalN + fraction * (upper.totalN - lower.totalN), lower, upper, fraction };
    }
  }
  return { value: last.totalN, lower: last, upper: last, fraction: 0 };
}

function pBuildUp(index: 1 | 2 | 3 | 4): number {
  return ({ 1: 20, 2: 10, 3: 0, 4: 0 } as const)[index];
}

function pMaintenanceDrystock(orgN: number): number {
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
  if (![n, p, k].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)) return null;
  return { n: n!, p: p!, k: k! };
}

function subtract(gross: NutrientQuantity, organic: NutrientQuantity, prior: NutrientQuantity): NutrientQuantity {
  return {
    n: Math.max(0, gross.n - organic.n - prior.n),
    p: Math.max(0, gross.p - organic.p - prior.p),
    k: Math.max(0, gross.k - organic.k - prior.k),
  };
}

function blocked(input: GrassFertiliserEngineInput, status: GrassEngineStatus, missingInputs: string[], limitations: string[]): GrassFertiliserResult {
  return { engineVersion: GRASS_ENGINE_V2_VERSION, status, fieldId: input.field.id, cropSystem: input.cycle.cropSystem, traces: {}, missingInputs, limitations };
}

export function calculateGrassFertiliserV2(input: GrassFertiliserEngineInput): GrassFertiliserResult {
  const { field, cycle } = input;
  const pIndex = field.fertility.pIndex?.value;
  const kIndex = field.fertility.kIndex?.value;
  const prior = priorChemical(cycle);
  const missing: string[] = [];
  if (!pIndex) missing.push("fertility.pIndex");
  if (!kIndex) missing.push("fertility.kIndex");
  if (!field.fertility.verifiedTest?.sampleDate) missing.push("fertility.verifiedTest.sampleDate");
  if (!prior) missing.push("chemicalN/P/KAppliedKgHa");
  if (missing.length) return blocked(input, "INCOMPLETE_EVIDENCE", missing, []);

  const organic = input.organicCreditsKgHa ?? ZERO;

  if (cycle.cropSystem === "GRASS_GRAZING") {
    if (input.grazingProductionSystem !== "SUCKLER_CALF_TO_BEEF") {
      return blocked(input, "UNSUPPORTED_PATHWAY", ["grazingProductionSystem"], ["P3 has no validated fallback from another grazing system to suckler calf-to-beef."]);
    }
    const orgN = input.annualOrganicNStockingRateKgHa;
    if (orgN === undefined || !Number.isFinite(orgN) || orgN < 0) {
      return blocked(input, "INCOMPLETE_EVIDENCE", ["annualOrganicNStockingRateKgHa"], []);
    }
    const nInterp = interpolatePublishedRows(orgN, SUCKLER_CALF_TO_BEEF_N_ROWS);
    const gross: NutrientQuantity = {
      n: nInterp.value,
      p: pBuildUp(pIndex!) + pMaintenanceDrystock(orgN),
      k: kGrazingDrystock(kIndex!, orgN),
    };
    const stockingEvidence = input.grazingStockingEvidence;
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
        "Grazing N uses transparent linear interpolation between published Table 12-3 organic-N rows; this modelling policy is disclosed in the trace.",
        ...(stockingEvidence?.basis === "FIELD_GRAZING_SESSIONS"
          ? ["The organic-N stocking input is field-specific and annualised from the continuously recorded grazing-movement window; it is an agronomic demand input, not the statutory NAP GSR."]
          : stockingEvidence?.basis === "HOLDING_FALLBACK"
            ? ["Complete field movement history was not available, so the holding-level grazing stocking rate was used for this field."]
            : []),
      ],
      traces: {
        n: {
          ruleId: "TEAGASC_GREEN_BOOK_2020_TABLE_12_3_SUCKLER_CALF_TO_BEEF",
          source: "Teagasc Major & Micro Nutrient Advice for Productive Agricultural Crops",
          sourceVersion: "5th Edition 2020",
          inputs: {
            annualOrganicNStockingRateKgHa: orgN,
            lowerOrganicN: nInterp.lower.organicN,
            upperOrganicN: nInterp.upper.organicN,
            interpolationFraction: nInterp.fraction,
            stockingEvidenceBasis: stockingEvidence?.basis ?? null,
            trackingStart: stockingEvidence?.trackingStart ?? null,
            trackingDays: stockingEvidence?.trackingDays ?? null,
            sourceSessionCount: stockingEvidence?.sourceSessionCount ?? null,
          },
          resultKgHa: gross.n,
          method: "linear interpolation between published organic-N stocking-rate rows; clamped at published endpoints",
        },
        p: {
          ruleId: "TEAGASC_GREEN_BOOK_2020_TABLE_13_2_13_3_DRYSTOCK",
          source: "Teagasc Green Book",
          sourceVersion: "5th Edition 2020",
          inputs: { pIndex: pIndex!, annualOrganicNStockingRateKgHa: orgN, buildUpKgHa: pBuildUp(pIndex!), maintenanceKgHa: pMaintenanceDrystock(orgN), stockingEvidenceBasis: stockingEvidence?.basis ?? null },
          resultKgHa: gross.p,
          method: "soil-index build-up plus drystock grazing maintenance band",
        },
        k: {
          ruleId: "TEAGASC_GREEN_BOOK_2020_TABLE_14_1_DRYSTOCK",
          source: "Teagasc Green Book",
          sourceVersion: "5th Edition 2020",
          inputs: { kIndex: kIndex!, annualOrganicNStockingRateKgHa: orgN, baselineOrganicN: 170, stockingEvidenceBasis: stockingEvidence?.basis ?? null },
          resultKgHa: gross.k,
          method: "published drystock K baseline at 170 kg organic N/ha, adjusted 5 kg K/ha per 40 kg organic N/ha",
        },
      },
    };
  }

  if (cycle.cropSystem === "GRASS_FIRST_CUT_SILAGE") {
    const target = cycle.evidence.productionTargetTDMHa?.value;
    if (target === undefined || !Number.isFinite(target)) return blocked(input, "INCOMPLETE_EVIDENCE", ["productionTargetTDMHa"], []);
    if (Math.abs(target - 5) > 1e-9) {
      return blocked(input, "UNSUPPORTED_PATHWAY", [], ["Current 2026 first-cut source validates the N/P/K table at 5 t DM/ha; P3 does not invent an N yield-scaling rule outside that published target."]);
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
      limitations: ["First-cut P3 rule is intentionally scoped to the published 5 t DM/ha 2026 table."],
      traces: {
        n: { ruleId: "TEAGASC_FIRST_CUT_2026_N", source: "Teagasc Fertilising for First Cut Grass Silage", sourceVersion: "2026", inputs: { productionTargetTDMHa: 5 }, resultKgHa: 100, method: "published 5 t DM/ha first-cut rate" },
        p: { ruleId: "TEAGASC_FIRST_CUT_2026_P", source: "Teagasc Fertilising for First Cut Grass Silage", sourceVersion: "2026", inputs: { productionTargetTDMHa: 5, pIndex: pIndex! }, resultKgHa: pByIndex, method: "published soil-index table" },
        k: { ruleId: "TEAGASC_FIRST_CUT_2026_K", source: "Teagasc Fertilising for First Cut Grass Silage", sourceVersion: "2026", inputs: { productionTargetTDMHa: 5, kIndex: kIndex! }, resultKgHa: kByIndex, method: "published soil-index table" },
      },
    };
  }

  if (cycle.cropSystem === "GRASS_SECOND_CUT_SILAGE" || cycle.cropSystem === "GRASS_THIRD_CUT_SILAGE") {
    return blocked(input, "SOURCE_CONFLICT", [], ["Current Teagasc yield-based second-cut guidance and the general soil-index P/K table do not express the same P/K requirement model; P3 fails closed pending rule reconciliation."]);
  }

  return blocked(input, "UNSUPPORTED_PATHWAY", [], ["This grass pathway does not yet have a validated P3 rule pack."]);
}
