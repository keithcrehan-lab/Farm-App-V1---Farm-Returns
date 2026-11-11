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
 */

import { blockedInsufficientEvidence, ok, type EngineOutcome, type EvidenceState } from "./evidence";
import type { Field } from "./types";

export const SOIL_PH_ADVICE_VERSION = "soil_ph_advice_v1.0.0";

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
}

/** The pH target land use for a field: peat first (it overrides crop), then
 * clover, then tillage/cereals, otherwise grassland. */
export function phTargetLandUseForField(
  field: Pick<Field, "fertility" | "mappedSoil" | "plannedUse">,
  options: { cloverSward?: boolean } = {},
): PhTargetLandUse {
  const organicMatterPct = field.fertility.verifiedTest?.organicMatterPct;
  if (organicMatterPct !== undefined && Number.isFinite(organicMatterPct)) {
    if (organicMatterPct > PEAT_ORGANIC_MATTER_THRESHOLD_PCT) return "peat";
  } else if (field.mappedSoil?.organicCarbonStatus === "peat") {
    return "peat";
  }
  if (options.cloverSward) return "grass_clover";
  if (field.plannedUse?.value === "tillage") return "cereals";
  return "grass";
}

/** The best available pH for a field: the laboratory test first, otherwise a
 * recorded pH value with its own provenance. */
function fieldPh(field: Pick<Field, "fertility">): { ph: number; evidenceState: EvidenceState } | undefined {
  const labPh = field.fertility.verifiedTest?.pH;
  if (labPh !== undefined && Number.isFinite(labPh) && labPh > 0) return { ph: labPh, evidenceState: "MEASURED" };
  const recorded = field.fertility.pH;
  if (recorded !== undefined && Number.isFinite(recorded.value) && recorded.value > 0) {
    return { ph: recorded.value, evidenceState: recorded.status === "verified" ? "MEASURED" : "IRISH_DEFAULT" };
  }
  return undefined;
}

export function assessSoilPh(
  field: Pick<Field, "fertility" | "mappedSoil" | "plannedUse">,
  options: { cloverSward?: boolean } = {},
): EngineOutcome<SoilPhAdvice> {
  const reading = fieldPh(field);
  if (reading === undefined) return blockedInsufficientEvidence("MISSING_SOIL_PH", ["fertility.verifiedTest.pH"]);
  const landUse = phTargetLandUseForField(field, options);
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
    },
    reading.evidenceState,
  );
}

/** Farmer-facing target wording, e.g. "6.3" or "6.5–6.8". */
export function formatPhTarget(target: { min: number; max?: number }): string {
  return target.max !== undefined ? `${target.min.toFixed(1)}–${target.max.toFixed(1)}` : target.min.toFixed(1);
}
