import type { Field, LivestockGroup } from "./types";

/**
 * Fertiliser P2 — crop-extensible field evidence contract.
 *
 * This module deliberately owns NO fertiliser recommendation maths.
 * It answers one question only: do we have a supported crop pathway and
 * enough explicit field evidence to hand the field to a future crop rule pack?
 *
 * Unsupported crops are recordable but never fall back to grassland rules.
 */

export type GrazingProductionSystem =
  | "SUCKLER_CALF_TO_BEEF"
  | "SUCKLER_CALF_TO_WEANING"
  | "OTHER_DRYSTOCK";

export type CropFamily =
  | "grassland"
  | "forage_brassica"
  | "cereal"
  | "horticulture"
  | "other";

export type CropSystem =
  | "GRASS_GRAZING"
  | "GRASS_FIRST_CUT_SILAGE"
  | "GRASS_SECOND_CUT_SILAGE"
  | "GRASS_THIRD_CUT_SILAGE"
  | "GRASS_HAY"
  | "GRASS_MIXED"
  | "GRASS_WHITE_CLOVER_GRAZING"
  | "GRASS_WHITE_CLOVER_SILAGE"
  | "RED_CLOVER_SILAGE"
  | "FORAGE_KALE"
  | "FORAGE_RAPE"
  | "CEREAL_OTHER"
  | "HORTICULTURE_OTHER"
  | "OTHER_UNSUPPORTED";

export const CROP_SYSTEM_LABELS: Readonly<Record<CropSystem, string>> = Object.freeze({
  GRASS_GRAZING: "Grass — grazing",
  GRASS_FIRST_CUT_SILAGE: "Grass — first-cut silage",
  GRASS_SECOND_CUT_SILAGE: "Grass — second-cut silage",
  GRASS_THIRD_CUT_SILAGE: "Grass — third-cut silage",
  GRASS_HAY: "Grass — hay",
  GRASS_MIXED: "Grass — mixed grazing and silage",
  GRASS_WHITE_CLOVER_GRAZING: "Grass + white clover — grazing",
  GRASS_WHITE_CLOVER_SILAGE: "Grass + white clover — silage",
  RED_CLOVER_SILAGE: "Red clover silage",
  FORAGE_KALE: "Forage kale",
  FORAGE_RAPE: "Forage rape",
  CEREAL_OTHER: "Cereal crop",
  HORTICULTURE_OTHER: "Horticulture crop",
  OTHER_UNSUPPORTED: "Other crop",
});

export function cropFamilyFor(system: CropSystem): CropFamily {
  if (system.startsWith("GRASS_") || system === "RED_CLOVER_SILAGE") return "grassland";
  if (system === "FORAGE_KALE" || system === "FORAGE_RAPE") return "forage_brassica";
  if (system === "CEREAL_OTHER") return "cereal";
  if (system === "HORTICULTURE_OTHER") return "horticulture";
  return "other";
}

/**
 * P2 support boundary. Red clover is intentionally recordable but not ready:
 * it needs its own validated rule pack rather than borrowing grass-only rules.
 */
export const P2_SUPPORTED_CROP_SYSTEMS: readonly CropSystem[] = Object.freeze([
  "GRASS_GRAZING",
  "GRASS_FIRST_CUT_SILAGE",
  "GRASS_SECOND_CUT_SILAGE",
  "GRASS_THIRD_CUT_SILAGE",
  "GRASS_HAY",
  "GRASS_MIXED",
  "GRASS_WHITE_CLOVER_GRAZING",
  "GRASS_WHITE_CLOVER_SILAGE",
]);

export type FieldEvidenceMethod =
  | "MEASURED"
  | "RECORDED"
  | "FARMER_DECLARED"
  | "DERIVED"
  | "ASSUMED"
  | "UNKNOWN";

export interface EvidenceValue<T> {
  value: T;
  method: Exclude<FieldEvidenceMethod, "UNKNOWN">;
  source: string;
  observedAt?: string;
  sourceDate?: string;
  note?: string;
  /** Previous value in the evidence chain — never overwritten. */
  previous?: EvidenceValue<T>;
}

export interface FieldProductionCycleEvidence {
  /** Canonical farmer-declared crop-system provenance for this cycle. */
  cropSystem?: EvidenceValue<CropSystem>;
  /** Required by grazing rule packs. May be derived from recorded livestock; farmer confirmation/override remains authoritative. */
  grazingProductionSystem?: EvidenceValue<GrazingProductionSystem>;
  /**
   * Farmer's intended dry-matter production for the cycle. Required for
   * cut systems because future agronomy rules scale nutrient demand to yield.
   */
  productionTargetTDMHa?: EvidenceValue<number>;
  /**
   * Explicitly captured rather than silently inferred from absence.
   * A value of zero means "farmer has declared none applied in this cycle".
   */
  chemicalNAppliedKgHa?: EvidenceValue<number>;
  chemicalPAppliedKgHa?: EvidenceValue<number>;
  chemicalKAppliedKgHa?: EvidenceValue<number>;
  /** White-clover content is only meaningful for a clover pathway. */
  whiteCloverPct?: EvidenceValue<number>;
  reseededOn?: EvidenceValue<string>;
}

export type ProductionCycleStatus = "planned" | "active" | "closed";

export interface FieldProductionCycle {
  id: string;
  fieldId: string;
  season: string;
  cropSystem: CropSystem;
  status: ProductionCycleStatus;
  startDate?: string;
  endDate?: string;
  evidence: FieldProductionCycleEvidence;
  createdAt: string;
  updatedAt: string;
}

export type FertiliserInputGateStatus =
  | "READY_FOR_CALCULATION"
  | "INCOMPLETE_EVIDENCE"
  | "UNSUPPORTED_PATHWAY";

export type FertiliserEvidenceInputKey =
  | "cropSystem"
  | "fertility.pIndex"
  | "fertility.kIndex"
  | "fertility.verifiedTest.sampleDate"
  | "productionTargetTDMHa"
  | "chemicalNAppliedKgHa"
  | "chemicalPAppliedKgHa"
  | "chemicalKAppliedKgHa"
  | "whiteCloverPct"
  | "grazingProductionSystem";

export interface FertiliserInputGateResult {
  status: FertiliserInputGateStatus;
  cropSystem: CropSystem;
  cropFamily: CropFamily;
  missingInputs: FertiliserEvidenceInputKey[];
  assumptions: string[];
}

function isCutSystem(system: CropSystem): boolean {
  return (
    system === "GRASS_FIRST_CUT_SILAGE" ||
    system === "GRASS_SECOND_CUT_SILAGE" ||
    system === "GRASS_THIRD_CUT_SILAGE" ||
    system === "GRASS_HAY" ||
    system === "GRASS_MIXED" ||
    system === "GRASS_WHITE_CLOVER_SILAGE"
  );
}

function validNonNegativeEvidence(v: EvidenceValue<number> | undefined): boolean {
  return !!v && Number.isFinite(v.value) && v.value >= 0;
}

/**
 * P2 input gate only. This MUST NOT be used as a nutrient calculator.
 *
 * Scientific posture:
 * - no crop fallback;
 * - no P/K default;
 * - no "absence means zero" for prior chemical applications;
 * - cut yield target is explicit;
 * - white-clover pathway needs an explicit clover observation/declaration.
 */
export function evaluateFertiliserInputGate(
  field: Pick<Field, "fertility">,
  cycle: FieldProductionCycle,
): FertiliserInputGateResult {
  const cropFamily = cropFamilyFor(cycle.cropSystem);

  if (!P2_SUPPORTED_CROP_SYSTEMS.includes(cycle.cropSystem)) {
    return {
      status: "UNSUPPORTED_PATHWAY",
      cropSystem: cycle.cropSystem,
      cropFamily,
      missingInputs: [],
      assumptions: [],
    };
  }

  const missingInputs: FertiliserEvidenceInputKey[] = [];

  if (cycle.evidence.cropSystem?.value !== cycle.cropSystem) missingInputs.push("cropSystem");
  if (cycle.cropSystem === "GRASS_GRAZING" && !cycle.evidence.grazingProductionSystem) {
    missingInputs.push("grazingProductionSystem");
  }

  if (!field.fertility.pIndex) missingInputs.push("fertility.pIndex");
  if (!field.fertility.kIndex) missingInputs.push("fertility.kIndex");
  if (!field.fertility.verifiedTest?.sampleDate) {
    missingInputs.push("fertility.verifiedTest.sampleDate");
  }

  if (isCutSystem(cycle.cropSystem) && !validNonNegativeEvidence(cycle.evidence.productionTargetTDMHa)) {
    missingInputs.push("productionTargetTDMHa");
  }

  if (!validNonNegativeEvidence(cycle.evidence.chemicalNAppliedKgHa)) {
    missingInputs.push("chemicalNAppliedKgHa");
  }
  if (!validNonNegativeEvidence(cycle.evidence.chemicalPAppliedKgHa)) {
    missingInputs.push("chemicalPAppliedKgHa");
  }
  if (!validNonNegativeEvidence(cycle.evidence.chemicalKAppliedKgHa)) {
    missingInputs.push("chemicalKAppliedKgHa");
  }

  if (
    (cycle.cropSystem === "GRASS_WHITE_CLOVER_GRAZING" || cycle.cropSystem === "GRASS_WHITE_CLOVER_SILAGE") &&
    (!validNonNegativeEvidence(cycle.evidence.whiteCloverPct) ||
      (cycle.evidence.whiteCloverPct?.value ?? 0) > 100)
  ) {
    missingInputs.push("whiteCloverPct");
  }

  return {
    status: missingInputs.length ? "INCOMPLETE_EVIDENCE" : "READY_FOR_CALCULATION",
    cropSystem: cycle.cropSystem,
    cropFamily,
    missingInputs,
    assumptions: [],
  };
}

export interface GrazingProductionSystemInference {
  value: GrazingProductionSystem | null;
  confidence: "high" | "none";
  reason: string;
  evidenceLabels: string[];
}

function positiveGroup(group: LivestockGroup): boolean {
  return Number.isFinite(group.count?.value) && group.count.value > 0;
}

/**
 * Conservative, auditable inference from livestock already recorded on the farm.
 * It deliberately returns unknown when the herd shape does not distinguish a
 * Teagasc grazing system reliably enough; unknown must be confirmed by farmer.
 */
export function inferGrazingProductionSystem(
  groups: readonly LivestockGroup[],
): GrazingProductionSystemInference {
  const active = groups.filter(positiveGroup);
  const labels = active.map((group) => `${group.label} (${group.count.value})`);
  if (active.length === 0) {
    return { value: null, confidence: "none", reason: "No livestock are recorded for this farm.", evidenceLabels: [] };
  }

  const hasSucklerCows = active.some((group) => group.category === "suckler_cow");
  const retainedBeef = active.some((group) =>
    group.category === "store" ||
    group.category === "steer" ||
    (group.category === "bull" && group.goal !== "breed") ||
    (group.category === "heifer" && (group.goal === "grow" || group.goal === "finish_slaughter")) ||
    (group.category === "weanling" && group.goal === "finish_slaughter")
  );
  const soldAtWeaning = active.some((group) =>
    (group.category === "calf" || group.category === "weanling") && group.goal === "sell_store"
  );

  if (hasSucklerCows && retainedBeef) {
    return {
      value: "SUCKLER_CALF_TO_BEEF",
      confidence: "high",
      reason: "Suckler cows and retained post-weaning cattle are recorded, indicating progeny are kept beyond weaning.",
      evidenceLabels: labels,
    };
  }
  if (hasSucklerCows && soldAtWeaning) {
    return {
      value: "SUCKLER_CALF_TO_WEANING",
      confidence: "high",
      reason: "Suckler cows are recorded and calves/weanlings are marked for sale as stores, with no retained finishing group recorded.",
      evidenceLabels: labels,
    };
  }
  if (!hasSucklerCows && active.some((group) => ["calf", "weanling", "store", "steer", "heifer", "bull"].includes(group.category))) {
    return {
      value: "OTHER_DRYSTOCK",
      confidence: "high",
      reason: "Drystock cattle are recorded without a suckler-cow enterprise.",
      evidenceLabels: labels,
    };
  }

  return {
    value: null,
    confidence: "none",
    reason: "The recorded herd does not distinguish the grazing production system reliably enough.",
    evidenceLabels: labels,
  };
}

export function createDerivedEvidence<T>(
  value: T,
  source: string,
  note: string,
  observedAt = new Date().toISOString(),
  previous?: EvidenceValue<T>,
): EvidenceValue<T> {
  return { value, method: "DERIVED", source, note, observedAt, ...(previous ? { previous } : {}) };
}

export function createFarmerEvidence<T>(
  value: T,
  source: string,
  observedAt = new Date().toISOString(),
  previous?: EvidenceValue<T>,
): EvidenceValue<T> {
  return { value, method: "FARMER_DECLARED", source, observedAt, ...(previous ? { previous } : {}) };
}
