/**
 * Scientific engine V3 — second closure pass, Priority 3:
 * `P_BUILD_UP_ELIGIBILITY` (`implementation/calculation_contracts.csv`
 * row 13) — "all mandatory Article17(6) conditions + relevant table
 * footnotes must pass before Table15b values can be selected... Never
 * infer eligibility because soil is Index1/2."
 *
 * `SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md` §2.2: `nutrients.ts`'s
 * `napEnhancedPBuildUpKgHa` (S.I. 588/2025 Table 15b) has existed since
 * before this build and is correctly never called — but it also had NO
 * eligibility gate anywhere. This module is that gate, built from
 * `rules_statutory/p_build_up_eligibility_2026.csv`'s 6 real conditions
 * (5 mandatory, 1 conditional) and spec Section E2's own summary: "Any
 * failed/unknown condition => not eligible for increased build-up table."
 *
 * `napEnhancedPBuildUpKgHa`/`pBuildUpKgHa` in `nutrients.ts` are
 * UNCHANGED by this module — this file is not imported by `nutrients.ts`
 * for its own table values, only consumed by `checkNapCompliance` (via
 * `calculateNutrientPlan`) to decide WHICH ceiling function to call. This
 * is the exact same statutory-ceiling-vs-agronomic-requirement separation
 * `pBuildUpKgHa` (agronomic Green Book Table 13-2 requirement, feeds
 * `grossP`) already has from `napMaxAvailablePGrazingKgHa`/
 * `napEnhancedPBuildUpKgHa` (statutory Table 15a/15b compliance ceiling,
 * feeds `checkNapCompliance`'s `pCeilingKgHa`) — this gate only ever
 * touches the statutory side.
 */

import { ok, type EngineOutcome } from "./evidence";

export const P_BUILD_UP_ELIGIBILITY_VERSION = "p_build_up_eligibility_v1.0.0";

/** `rules_statutory/p_build_up_eligibility_2026.csv`'s own `condition_id`
 * values, copied verbatim — used as the `failedConditions` vocabulary so
 * a caller (UI or audit trace) can cite the exact failed condition, not a
 * paraphrase. */
export const P_BUILD_UP_CONDITION_IDS = [
  "PBUILD_A_SOIL_TESTS",
  "PBUILD_B_ADVISER",
  "PBUILD_C_NMP",
  "PBUILD_D_TRAINING",
  "PBUILD_OM_LIMIT",
  "PBUILD_HIGH_GSR",
] as const;

export type PBuildUpConditionId = (typeof P_BUILD_UP_CONDITION_IDS)[number];

/** `rules_statutory/p_build_up_eligibility_2026.csv`'s `PBUILD_OM_LIMIT`
 * row: "soil >20% OM cannot be handled as ordinary mineral-soil build-up".
 * Matches `nutrients.ts`'s own existing >20% organic-matter mineral-soil
 * threshold convention (Green Book Table 13-2 footnote 2, "Mineral soils
 * are defined as soils with less than or equal to 20% organic matter"). */
export const P_BUILD_UP_MINERAL_SOIL_OM_LIMIT_PCT = 20;

/**
 * `HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT` in `nutrients.ts` —
 * the same real, sourced (`GFT023`/`GFT024`) non-grass-area evidence
 * `PBUILD_HIGH_GSR`'s own text asks for ("prove the required non-grass
 * eligible area or valid derogation status"). Defined locally (not
 * imported) for the same decoupling reason `statutory-manure-value.ts`
 * gives — this module and `nutrients.ts` must not import each other. */
const HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT = 5;

/** `napEnhancedPBuildUpKgHa`'s own cutoff — Table 15b publishes nothing
 * at or below 130 kg N/ha organic-N stocking rate, so `PBUILD_HIGH_GSR`'s
 * conditional footnote only becomes relevant above it. */
const HIGH_GSR_FOOTNOTE_THRESHOLD_KG_HA = 130;

export interface PBuildUpEligibilityInput {
  /** `PBUILD_A_SOIL_TESTS` — "current soil P test and soil organic-matter
   * determination available". Derived from the field's own real fertility
   * record (enter-once: the field already has this evidence captured or
   * it doesn't; this is not a separate yes/no the farmer is asked). */
  hasCurrentVerifiedSoilPTest: boolean;
  /** Present only once a verified soil test with an organic-matter result
   * exists — absence means "not determined", which is itself a fail
   * condition (`PBUILD_A_SOIL_TESTS`), not an assumed-safe 0%. */
  organicMatterPct?: number;
  /** `PBUILD_B_ADVISER` — occupier engages a DAFM-approved adviser.
   * `PBUILD_C_NMP` — a detailed NMP has been submitted.
   * `PBUILD_D_TRAINING` — occupier has completed the required training.
   * None of these are inferrable from any other Farm Return data — this
   * data model has never captured them before this priority (see
   * `Farm.pBuildUpCompliance`, `types.ts`). Undefined means "not
   * captured", which fails closed exactly like `false`. */
  adviserEngaged?: boolean;
  nmpSubmitted?: boolean;
  trainingCompleted?: boolean;
  /** `PBUILD_HIGH_GSR` (conditional) — this field's real organic-N
   * stocking rate and non-grass eligible area, reusing the same evidence
   * Priority 1's `isEligibleForElevatedNRate` gate already requires. */
  orgNStockingRateKgHa: number;
  nonGrassPct: number;
}

export interface PBuildUpEligibilityResult {
  eligible: boolean;
  /** Every condition that failed or could not be confirmed — empty only
   * when `eligible` is `true`. Always includes every applicable failure,
   * not just the first one, so a farmer/adviser sees the complete list to
   * resolve in one pass. */
  failedConditions: PBuildUpConditionId[];
}

/**
 * `P_BUILD_UP_ELIGIBILITY`. Always returns `OK` — an eligibility
 * determination (including "not eligible") is itself a complete,
 * actionable answer (acceptance tests T024-T026: "NMP missing ->
 * NOT_ELIGIBLE; standard P route" is a definitive result, not a missing-
 * evidence block) — the ordinary Table 15a route remains fully
 * computable either way, so this never fails closed in the
 * `BLOCKED_INSUFFICIENT_EVIDENCE` sense; it fails closed in the
 * `eligible: false` sense instead, matching spec Section E2's own rule:
 * "Any failed/unknown condition => not eligible for increased build-up
 * table." Never infers eligibility from the P Index alone (the contract's
 * own explicit warning) — `pIndex` isn't even a parameter here.
 */
export function evaluatePBuildUpEligibility(input: PBuildUpEligibilityInput): EngineOutcome<PBuildUpEligibilityResult> {
  const failedConditions: PBuildUpConditionId[] = [];

  if (!input.hasCurrentVerifiedSoilPTest || input.organicMatterPct === undefined) {
    failedConditions.push("PBUILD_A_SOIL_TESTS");
  }
  if (input.adviserEngaged !== true) {
    failedConditions.push("PBUILD_B_ADVISER");
  }
  if (input.nmpSubmitted !== true) {
    failedConditions.push("PBUILD_C_NMP");
  }
  if (input.trainingCompleted !== true) {
    failedConditions.push("PBUILD_D_TRAINING");
  }
  if (input.organicMatterPct !== undefined && input.organicMatterPct > P_BUILD_UP_MINERAL_SOIL_OM_LIMIT_PCT) {
    failedConditions.push("PBUILD_OM_LIMIT");
  }
  if (
    input.orgNStockingRateKgHa > HIGH_GSR_FOOTNOTE_THRESHOLD_KG_HA &&
    input.nonGrassPct < HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT
  ) {
    failedConditions.push("PBUILD_HIGH_GSR");
  }

  return ok({ eligible: failedConditions.length === 0, failedConditions }, "DERIVED");
}
