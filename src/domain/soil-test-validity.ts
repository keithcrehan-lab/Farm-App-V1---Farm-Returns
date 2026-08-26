/**
 * Scientific engine V3 — Phase K: `SOIL_TEST_VALIDITY`.
 *
 * Spec §C1/B2 and `rules_statutory/soil_test_compliance_rules_2026.csv`:
 * the 4-year disregard rule with its P-Index-4 persistence exception, the
 * post-14-Sep-2025 georeference/LPIS requirement, and the 12-year OM
 * validity limit — none implemented anywhere in this codebase before this
 * phase (flagged as a major gap in the original audit: "no code anywhere
 * evaluates test age, P-Index-4 persistence, OM 12-year validity, or the
 * georeference requirement"). Grounded exactly in `GFT011`-`GFT018`.
 */

import { blockedInsufficientEvidence, ok, type EngineOutcome } from "./evidence";
import type { SoilIndex } from "./nutrients";

export const SOIL_TEST_VALIDITY_VERSION = "soil_test_validity_v1.0.0";

/** `SOIL_4Y_NON_INDEX4`/`SOIL_4Y_INDEX4_PERSISTS`: the disregard threshold. */
export const SOIL_TEST_MAX_AGE_YEARS = 4;
/** `SOIL_OM_12Y`. */
export const SOIL_OM_MAX_AGE_YEARS = 12;
/** `SOIL_GEOREF_AFTER_2025_09_14`: strictly AFTER this date, not on it —
 * `GFT016` confirms a report issued exactly on 2025-09-14 does NOT
 * trigger the requirement. */
export const SOIL_GEOREF_REQUIREMENT_EFFECTIVE_DATE = "2025-09-14";

export type SoilTestAgeStatus = "VALID" | "DISREGARD" | "INDEX4_PERSISTED";

export interface SoilTestAgeInput {
  /** `undefined` means the test is undated — fails closed
   * (`UNKNOWN_BLOCK`, `GFT015`), never treated as either valid or
   * disregardable. */
  ageYears: number | undefined;
  pIndex: SoilIndex;
}

/**
 * `GFT011`-`GFT015`. Spec B2: "a result four years old or older is
 * disregarded EXCEPT where it indicated P Index 4, in which case the
 * Index 4 result persists" — the exception is checked before the
 * disregard, never the reverse.
 */
export function checkSoilTestAgeValidity(input: SoilTestAgeInput): EngineOutcome<SoilTestAgeStatus> {
  if (input.ageYears === undefined) {
    return blockedInsufficientEvidence("UNKNOWN_BLOCK", ["soil test sample/report date"]);
  }
  if (input.ageYears < SOIL_TEST_MAX_AGE_YEARS) {
    return ok("VALID", "MEASURED");
  }
  if (input.pIndex === 4) {
    return ok("INDEX4_PERSISTED", "MEASURED");
  }
  return ok("DISREGARD", "MEASURED");
}

export interface SoilTestGeorefInput {
  georefOrLpisProvided: boolean;
  /** ISO date the report was issued. */
  reportIssueDate: string;
}

export type SoilTestGeorefStatus = "NOT_TRIGGERED_BY_DATE_ALONE" | "GEOREF_PROVIDED";

/**
 * `GFT016`/`GFT017`. `SOIL_GEOREF_AFTER_2025_09_14`: only reports issued
 * STRICTLY AFTER 14 Sep 2025 require a stated georeference/LPIS reference
 * — a report on that date itself does not trigger it.
 */
export function checkSoilTestGeorefRequirement(input: SoilTestGeorefInput): EngineOutcome<SoilTestGeorefStatus> {
  const requiresGeoref = input.reportIssueDate > SOIL_GEOREF_REQUIREMENT_EFFECTIVE_DATE;
  if (!requiresGeoref) {
    return ok("NOT_TRIGGERED_BY_DATE_ALONE", "DERIVED");
  }
  if (!input.georefOrLpisProvided) {
    return blockedInsufficientEvidence("MISSING_GEOREF_OR_LPIS", ["georeference or LPIS reference"]);
  }
  return ok("GEOREF_PROVIDED", "MEASURED");
}

export type SoilOmValidityStatus = "VALID" | "INVALID_FOR_CURRENT_OM_DETERMINATION";

/** `GFT018`: `SOIL_OM_12Y` — an OM analysis older than 12 years is not
 * used for the current OM determination. */
export function checkSoilOmValidity(omAgeYears: number): EngineOutcome<SoilOmValidityStatus> {
  if (omAgeYears > SOIL_OM_MAX_AGE_YEARS) {
    return ok("INVALID_FOR_CURRENT_OM_DETERMINATION", "DERIVED");
  }
  return ok("VALID", "DERIVED");
}
