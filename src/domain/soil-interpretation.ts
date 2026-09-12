/**
 * Fertiliser Vertical V1, Checkpoint 2 — Laboratory Evidence.
 * `docs/product/farm-return-next-v1.1/SOIL_SAMPLING_ARCHITECTURE.md`'s
 * `LabResult -> SoilInterpretation` link: raw lab measurements stay
 * separate from their derived classification, so a future methodology
 * change never requires re-typing the original measurements.
 *
 * Deliberately reuses, never re-derives, the exact classification
 * functions `src/lib/farm-data/soil.ts`'s `addSoilTestToField` already
 * uses for the legacy manual-entry soil-test path (`pIndexFromMgL`,
 * `kIndexFromMgL`, `resolvePIndexConservatively`,
 * `cropGroupForFieldUse`, `soilMaterialForOrganicCarbonStatus`) — one
 * real classification path, not two that could quietly diverge
 * (`DOMAIN_CONTRACTS.md`'s reuse boundary). This module's own job is
 * narrower than that function's: produce a standalone, persistable
 * `SoilInterpretation` record for evidence/reporting purposes, not to
 * mutate a `Field`.
 */
import type { EngineOutcome } from "./evidence";
import {
  pIndexFromMgL,
  kIndexFromMgL,
  resolvePIndexConservatively,
  cropGroupForFieldUse,
  soilMaterialForOrganicCarbonStatus,
  type SoilIndex,
  type CropGroup,
  type SoilMaterial,
} from "./nutrients";
import type { FieldUse } from "./types";

export const SOIL_INTERPRETATION_VERSION = "soil_interpretation_v1.0.0";

export interface SoilInterpretationInput {
  labResultId: string;
  /** Raw Morgan's P, mg/L — the lab's own measured value. */
  pMgL: number;
  /** Raw Morgan's K, mg/L — the lab's own measured value. */
  kMgL: number;
  pH: number;
  /** The field's own real `plannedUse`, when known. Absent lets P Index
   * classification fall back to its own documented grassland default —
   * the identical, non-fail-closed behaviour
   * `addSoilTestToField` (`src/lib/farm-data/soil.ts`) already uses for
   * this same soil-test-entry scenario (distinct from the fail-closed
   * compliance check in `field-soil-test-age.ts`, which is a different
   * caller with different stakes). Never guessed beyond that documented
   * default. */
  plannedUse?: FieldUse;
  organicCarbonStatus?: "mineral" | "peat" | "high_organic";
  /** A laboratory-reported lime requirement, when supplied — passed
   * through verbatim, never derived. No validated Irish model exists in
   * this codebase to compute one from pH alone (`TEAGASC_PH_LIME`'s own
   * source-register note: "Exact lime t/ha must come from a laboratory
   * lime requirement/buffer test, not pH alone"). */
  limeRequirementTHa?: number;
  now: string;
}

export interface SoilInterpretation {
  labResultId: string;
  methodologyVersion: string;
  calculatedAt: string;
  /** The real, unresolved classification outcome — preserves
   * `AMBIGUOUS_STATUTORY_BOUNDARY` rather than hiding it (campaign
   * "fail-closed when evidence is insufficient", applied to ambiguous
   * evidence too). */
  pIndexOutcome: EngineOutcome<SoilIndex>;
  /** The resolved index a downstream calculation can use — conservative
   * P4 treatment when `pIndexOutcome` is ambiguous, mirroring
   * `resolvePIndexConservatively`'s own documented behaviour exactly. */
  pIndex: SoilIndex;
  pIndexConservativeTreatment: boolean;
  kIndex: SoilIndex;
  pH: number;
  limeRequirementTHa?: number;
  cropGroup: CropGroup;
  soilMaterial: SoilMaterial;
}

export function interpretLabResult(input: SoilInterpretationInput): SoilInterpretation {
  const cropGroup: CropGroup = input.plannedUse ? cropGroupForFieldUse(input.plannedUse) : "grassland";
  const soilMaterial = soilMaterialForOrganicCarbonStatus(input.organicCarbonStatus);
  const pIndexOutcome = pIndexFromMgL(input.pMgL, cropGroup);
  const { index: pIndex, conservativeTreatment } = resolvePIndexConservatively(pIndexOutcome);
  const kIndex = kIndexFromMgL(input.kMgL, soilMaterial);

  return {
    labResultId: input.labResultId,
    methodologyVersion: SOIL_INTERPRETATION_VERSION,
    calculatedAt: input.now,
    pIndexOutcome,
    pIndex,
    pIndexConservativeTreatment: conservativeTreatment,
    kIndex,
    pH: input.pH,
    ...(input.limeRequirementTHa !== undefined ? { limeRequirementTHa: input.limeRequirementTHa } : {}),
    cropGroup,
    soilMaterial,
  };
}
