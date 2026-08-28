/**
 * Scientific engine V3 — Phase F6: national water-buffer distances
 * (`rules_statutory/buffer_distances_2026.csv`) and the local-authority
 * override layer (`rules_statutory/local_buffer_override_rules_2026.csv`,
 * AF010, `ADVERSARIAL_AUDIT_REPORT.md` §1.8 — "Where an authoritative
 * local buffer determination exists, it can supersede the national
 * baseline for that water source." Grounded exactly in
 * `GFT083`-`GFT090`.
 */

import { blockedInsufficientEvidence, legalProhibition, ok, unknown, type EngineOutcome } from "./evidence";

export const BUFFER_GATE_VERSION = "buffer_gate_v1.0.0";

export type BufferMaterial = "chemical_fertiliser" | "organic_fertiliser_or_soiled_water";
export type BufferFeature =
  | "surface_water"
  | "major_drinking_water_abstraction"
  | "drinking_water_abstraction"
  | "other_drinking_well_spring_borehole"
  | "lake_or_turlough_likely_to_flood"
  | "exposed_cavernous_or_karst_limestone_feature";

/** `buffer_distances_2026.csv` national baselines, metres. */
export const NATIONAL_BUFFER_DISTANCES_M = {
  chemicalFertiliserSurfaceWater: 3,
  organicSurfaceWaterBaseline: 5,
  /** Elevated requirement when EITHER the two-week enhanced period around
   * the closed period applies, OR average incline >10% slopes toward the
   * water — two independent conditions, same elevated distance. */
  organicSurfaceWaterElevated: 10,
  organicMajorDrinkingWaterAbstraction: 200,
  organicDrinkingWaterAbstraction: 100,
  organicOtherDrinkingWellSpringBorehole: 25,
  organicLakeOrTurloughLikelyToFlood: 20,
  organicExposedCavernousOrKarstLimestoneFeature: 15,
} as const;

/** `SPREAD_STOP_STEEP_RISK`/the surface-water incline rule's own stated
 * trigger: average incline >10% toward the water. */
export const STEEP_INCLINE_TO_WATER_THRESHOLD_PCT = 10;

export interface NationalBufferInput {
  material: BufferMaterial;
  feature: BufferFeature;
  distanceM: number;
  /** Two weeks before/after the applicable closed period — only relevant
   * to organic fertiliser/soiled water near surface water. */
  enhancedPeriod?: boolean;
  averageInclinePct?: number;
  slopesTowardWater?: boolean;
}

function requiredNationalDistanceM(input: NationalBufferInput): number {
  if (input.material === "chemical_fertiliser") {
    return NATIONAL_BUFFER_DISTANCES_M.chemicalFertiliserSurfaceWater;
  }
  switch (input.feature) {
    case "major_drinking_water_abstraction":
      return NATIONAL_BUFFER_DISTANCES_M.organicMajorDrinkingWaterAbstraction;
    case "drinking_water_abstraction":
      return NATIONAL_BUFFER_DISTANCES_M.organicDrinkingWaterAbstraction;
    case "other_drinking_well_spring_borehole":
      return NATIONAL_BUFFER_DISTANCES_M.organicOtherDrinkingWellSpringBorehole;
    case "lake_or_turlough_likely_to_flood":
      return NATIONAL_BUFFER_DISTANCES_M.organicLakeOrTurloughLikelyToFlood;
    case "exposed_cavernous_or_karst_limestone_feature":
      return NATIONAL_BUFFER_DISTANCES_M.organicExposedCavernousOrKarstLimestoneFeature;
    case "surface_water": {
      const steepTowardWater =
        input.slopesTowardWater === true &&
        input.averageInclinePct !== undefined &&
        input.averageInclinePct > STEEP_INCLINE_TO_WATER_THRESHOLD_PCT;
      return input.enhancedPeriod === true || steepTowardWater
        ? NATIONAL_BUFFER_DISTANCES_M.organicSurfaceWaterElevated
        : NATIONAL_BUFFER_DISTANCES_M.organicSurfaceWaterBaseline;
    }
  }
}

/**
 * `GFT083`-`GFT088`. `distanceM >= required` returns
 * `"BOUNDARY_MET_SUBJECT_TO_OTHER_RULES"` (`ok`) rather than a bare
 * "compliant" — meeting the buffer distance alone is not a full
 * compliance guarantee (ground condition, closed-period and other gates
 * still apply separately); below the required distance is a definite
 * `LEGAL_PROHIBITION`.
 */
export function checkNationalBufferDistance(input: NationalBufferInput): EngineOutcome<"BOUNDARY_MET_SUBJECT_TO_OTHER_RULES"> {
  const requiredM = requiredNationalDistanceM(input);
  if (input.distanceM < requiredM) {
    return legalProhibition(
      "NATIONAL_BUFFER_DISTANCE_NOT_MET",
      `Proposed application at ${input.distanceM}m to ${input.feature} is below the statutory ${requiredM}m buffer for ${input.material}.`,
    );
  }
  return ok("BOUNDARY_MET_SUBJECT_TO_OTHER_RULES", "DERIVED");
}

// ---------------------------------------------------------------------------
// Local authority override layer (AF010)
// ---------------------------------------------------------------------------

export interface LocalBufferOverrideInput {
  actualDistanceM: number;
  /** Resolved via `input-gates.ts`'s `resolveLocalWaterBufferOverrideStatus`. */
  localOverrideStatus: EngineOutcome<"authoritative_rule" | "verified_none" | "unknown">;
  /** Required only when `localOverrideStatus` resolves to `"authoritative_rule"`. */
  localOverrideDistanceM?: number;
}

/**
 * `GFT089`/`GFT090`. `"unknown"` maps to the top-level `UNKNOWN` status —
 * V3's own `QUALIFIED_NOT_DEFINITIVE` language for exactly this case
 * (AF010: "qualify result; do not state definitive local compliance if
 * override status is unknown"), not a new bespoke status.
 */
export function checkLocalBufferOverride(
  input: LocalBufferOverrideInput,
): EngineOutcome<"NATIONAL_BASELINE_APPLIES"> {
  if (input.localOverrideStatus.status !== "OK") return input.localOverrideStatus;

  const status = input.localOverrideStatus.value;
  if (status === "unknown") {
    return unknown("LOCAL_BUFFER_STATUS_UNKNOWN");
  }
  if (status === "verified_none") {
    return ok("NATIONAL_BASELINE_APPLIES", "DERIVED");
  }

  // "authoritative_rule"
  if (input.localOverrideDistanceM === undefined) {
    return blockedInsufficientEvidence("LOCAL_BUFFER_STATUS_UNKNOWN", ["localOverrideDistanceM"]);
  }
  if (input.actualDistanceM < input.localOverrideDistanceM) {
    return legalProhibition(
      "LOCAL_BUFFER_OVERRIDE_EXCEEDS_ACTUAL_DISTANCE",
      `A local authority buffer of ${input.localOverrideDistanceM}m applies and exceeds the actual distance of ${input.actualDistanceM}m.`,
    );
  }
  return ok("NATIONAL_BASELINE_APPLIES", "DERIVED");
}
