/**
 * Soil pH advice — fertiliser close-out (2026-11-11).
 *
 * Compares a field's soil pH with the Teagasc target pH for its land use
 * (`TEAGASC_PH_LIME`, transcribed in
 * `docs/scientific-engine/v3/advisory_teagasc/soil_pH_targets.csv`) and says
 * whether lime is likely needed. It NEVER gives a lime rate: the source's own
 * rule is "Exact lime t/ha must come from a laboratory lime requirement /
 * buffer test, not pH alone", so a below-target field without a laboratory
 * lime requirement is told to get one (`aggregateFarmLimeRequirement` still
 * only ever totals laboratory-reported rates).
 *
 * Peat: the Green Book defines peat as more than 20% organic matter; a
 * laboratory organic-matter result decides it when present, otherwise the
 * mapped soil's own organic-carbon status.
 *
 * v1.1.0 (Codex audit F005/F006): the target comes from the field's
 * canonical production-cycle crop (never the legacy planned use) and fails
 * closed when that crop is unrecorded or has no matching published row; the
 * pH reading's own provenance travels with the advice.
 */

import { blockedInsufficientEvidence, ok, type EngineOutcome, type EvidenceState } from "./evidence";
import type { Field } from "./types";
import type { CropSystem } from "./fertiliser-field-evidence";

export const SOIL_PH_ADVICE_VERSION = "soil_ph_advice_v1.1.0";

export type PhTargetLandUse = "grass" | "grass_clover" | "cereals" | "peat";

/** `soil_pH_targets.csv` rows used here (TEAGASC_PH_LIME). Ranges are kept as
 * published; "below target" is judged against the lower bound. */
export const TEAGASC_PH_TARGETS: Readonly<Record<PhTargetLandUse, { min: number; max?: number; label: string }>> = Object.freeze({
  grass: { min: 6.3, label: "grassland" },
  grass_clover: { min: 6.5, max: 6.8, label: "grass-clover swards" },
  cereals: { min: 6.5, label: "cereals" },
  peat: { min: 5.5, max: 5.8, label: "peat soils" },
});

/** Green Book: soils with more than 20% organic matter are peat soils. */
export const PEAT_ORGANIC_MATTER_THRESHOLD_PCT = 20;

export interface SoilPhAdvice {
  version: typeof SOIL_PH_ADVICE_VERSION;
  ph: number;
  landUse: PhTargetLandUse;
  target: { min: number; max?: number };
  status: "BELOW_TARGET" | "AT_OR_ABOVE_TARGET";
  /** How a lime rate can be obtained — never a rate derived from pH. */
  limeRate: "LABORATORY_LIME_REQUIREMENT_ON_FILE" | "LABORATORY_LIME_REQUIREMENT_NEEDED" | "NOT_NEEDED";
  sourceId: "TEAGASC_PH_LIME";
  /** Audit F006: the canonical production-cycle crop the target was chosen
   * for (peat overrides the crop's own target). */
  cropSystem: CropSystem;
  /** Audit F005: where the pH reading came from — kept with the advice and
   * shown beside it, so an estimate never looks like a laboratory result. */
  reading: SoilPhReadingProvenance;
}

export interface SoilPhReadingProvenance {
  kind: "LABORATORY_TEST" | "RECORDED_VALUE";
  /** The recorded value's own status (laboratory tests are "verified"). */
  status: string;
  source: string;
  /** Sample date (laboratory) or the recorded value's source date. */
  date?: string;
  laboratory?: string;
  sampleRef?: string;
  evidenceState: EvidenceState;
}

/** Audit F006: the published Teagasc pH row for each canonical crop system.
 * `undefined` means no row in `soil_pH_targets.csv` can be matched with
 * confidence (e.g. "other cereal" could be oats at 6.0 or barley/wheat at
 * 6.5; forage rape is not oilseed rape), so no target is guessed. */
const PH_LAND_USE_BY_CROP_SYSTEM: Readonly<Record<CropSystem, Exclude<PhTargetLandUse, "peat"> | undefined>> = Object.freeze({
  GRASS_GRAZING: "grass",
  GRASS_FIRST_CUT_SILAGE: "grass",
  GRASS_SECOND_CUT_SILAGE: "grass",
  GRASS_THIRD_CUT_SILAGE: "grass",
  GRASS_HAY: "grass",
  GRASS_MIXED: "grass",
  GRASS_WHITE_CLOVER_GRAZING: "grass_clover",
  GRASS_WHITE_CLOVER_SILAGE: "grass_clover",
  RED_CLOVER_SILAGE: undefined,
  FORAGE_KALE: undefined,
  FORAGE_RAPE: undefined,
  CEREAL_OTHER: undefined,
  HORTICULTURE_OTHER: undefined,
  OTHER_UNSUPPORTED: undefined,
});

function isPeat(field: Pick<Field, "fertility" | "mappedSoil">): boolean {
  const organicMatterPct = field.fertility.verifiedTest?.organicMatterPct;
  if (organicMatterPct !== undefined && Number.isFinite(organicMatterPct)) return organicMatterPct > PEAT_ORGANIC_MATTER_THRESHOLD_PCT;
  return field.mappedSoil?.organicCarbonStatus === "peat";
}

/** The pH target land use for a field from its canonical production-cycle
 * crop: peat first (it overrides the crop's target), then the crop's own
 * published row. Fails closed when the crop is unrecorded or has no
 * matching published row — the legacy `plannedUse` is never used. */
export function phTargetLandUseForField(
  field: Pick<Field, "fertility" | "mappedSoil">,
  cropSystem: CropSystem | undefined,
): EngineOutcome<PhTargetLandUse> {
  if (cropSystem === undefined) return blockedInsufficientEvidence("MISSING_FIELD_PRODUCTION_CYCLE", ["productionCycle.cropSystem"]);
  const cropLandUse = PH_LAND_USE_BY_CROP_SYSTEM[cropSystem];
  if (cropLandUse === undefined) return blockedInsufficientEvidence("PH_TARGET_NOT_PUBLISHED_FOR_CROP", ["productionCycle.cropSystem"]);
  return ok(isPeat(field) ? "peat" : cropLandUse, "IRISH_DEFAULT");
}

/** The best available pH for a field, with where it came from: the
 * laboratory test first, otherwise a recorded pH value. */
function fieldPh(field: Pick<Field, "fertility">): { ph: number; reading: SoilPhReadingProvenance } | undefined {
  const test = field.fertility.verifiedTest;
  const labPh = test?.pH;
  if (test !== undefined && labPh !== undefined && Number.isFinite(labPh) && labPh > 0) {
    return {
      ph: labPh,
      reading: {
        kind: "LABORATORY_TEST",
        status: "verified",
        source: "Laboratory soil test",
        ...(test.sampleDate ? { date: test.sampleDate } : {}),
        ...(test.laboratory ? { laboratory: test.laboratory } : {}),
        ...(test.sampleRef ? { sampleRef: test.sampleRef } : {}),
        evidenceState: "MEASURED",
      },
    };
  }
  const recorded = field.fertility.pH;
  // Codex audit F011: an `unavailable` value carries no usable figure.
  if (recorded !== undefined && recorded.status !== "unavailable" && Number.isFinite(recorded.value) && recorded.value > 0) {
    return {
      ph: recorded.value,
      reading: {
        kind: "RECORDED_VALUE",
        status: recorded.status,
        source: recorded.source,
        ...(recorded.sourceDate ? { date: recorded.sourceDate } : {}),
        evidenceState: recorded.status === "verified" ? "MEASURED" : "IRISH_DEFAULT",
      },
    };
  }
  return undefined;
}

export function assessSoilPh(
  field: Pick<Field, "fertility" | "mappedSoil">,
  cropSystem: CropSystem | undefined,
): EngineOutcome<SoilPhAdvice> {
  const reading = fieldPh(field);
  if (reading === undefined) return blockedInsufficientEvidence("MISSING_SOIL_PH", ["fertility.verifiedTest.pH"]);
  const landUseOutcome = phTargetLandUseForField(field, cropSystem);
  if (landUseOutcome.status !== "OK") {
    return blockedInsufficientEvidence(
      landUseOutcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE" ? landUseOutcome.reasonCode : "PH_TARGET_NOT_PUBLISHED_FOR_CROP",
      landUseOutcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE" ? [...landUseOutcome.missingInputs] : ["productionCycle.cropSystem"],
    );
  }
  const landUse = landUseOutcome.value;
  const target = TEAGASC_PH_TARGETS[landUse];
  const below = reading.ph < target.min;
  const labLime = field.fertility.verifiedTest?.limeRequirement;
  const labLimeOnFile = labLime !== undefined && Number.isFinite(labLime) && labLime >= 0;
  return ok(
    {
      version: SOIL_PH_ADVICE_VERSION,
      ph: reading.ph,
      landUse,
      target: target.max !== undefined ? { min: target.min, max: target.max } : { min: target.min },
      status: below ? "BELOW_TARGET" : "AT_OR_ABOVE_TARGET",
      // A laboratory lime requirement on file always governs the rate.
      limeRate: labLimeOnFile ? "LABORATORY_LIME_REQUIREMENT_ON_FILE" : below ? "LABORATORY_LIME_REQUIREMENT_NEEDED" : "NOT_NEEDED",
      sourceId: "TEAGASC_PH_LIME",
      // `phTargetLandUseForField` only resolves when the crop is recorded.
      cropSystem: cropSystem as CropSystem,
      reading: reading.reading,
    },
    reading.reading.evidenceState,
  );
}

/** Farmer-facing description of where a pH reading came from. */
export function formatPhReading(reading: SoilPhReadingProvenance): string {
  if (reading.kind === "LABORATORY_TEST") {
    return ["lab test", reading.laboratory, reading.date].filter((part) => part !== undefined && part !== "").join(", ");
  }
  // Codex audit F005: verified, farmer-adjusted and estimated readings stay
  // visibly distinct.
  const label =
    reading.status === "verified"
      ? "verified record"
      : reading.status === "farmer_adjusted"
        ? "farmer-adjusted"
        : reading.status === "estimated"
          ? "estimate"
          : reading.status.replace(/_/g, " ");
  return [label, reading.source, reading.date].filter((part) => part !== undefined && part !== "").join(", ");
}

/** Farmer-facing target wording, e.g. "6.3" or "6.5–6.8". */
export function formatPhTarget(target: { min: number; max?: number }): string {
  return target.max !== undefined ? `${target.min.toFixed(1)}–${target.max.toFixed(1)}` : target.min.toFixed(1);
}
