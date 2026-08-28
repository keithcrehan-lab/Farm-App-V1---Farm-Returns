/**
 * Scientific engine V3 — Phase F3: `SOILED_WATER_APPLICATION_GATE`.
 *
 * `ADVERSARIAL_AUDIT_REPORT.md` §1.3 (AF005, HIGH): "A proposed
 * soiled-water event must be checked against prior application in the
 * statutory rolling period, not assessed in isolation." Two independent
 * statutory limits from `rules_statutory/soiled_water_application_limits_2026.csv`.
 */

import { blockedInsufficientEvidence, legalProhibition, ok, unknown, type EngineOutcome } from "./evidence";

export const SOILED_WATER_GATE_VERSION = "soiled_water_gate_v1.0.0";

/** `SOILED_42_DAY_VOLUME`: cumulative application <=50000 litres/ha over
 * a rolling 42-day window. */
export const SOILED_WATER_42_DAY_LIMIT_LITRES_PER_HA = 50000;
export const SOILED_WATER_42_DAY_WINDOW_DAYS = 42;

/** `SOILED_IRRIGATION_RATE`: application rate <=5 mm/hour. */
export const SOILED_WATER_MAX_RATE_MM_PER_HOUR = 5;

export interface SoiledWaterApplicationInput {
  areaHa: number;
  /** Sum of litres already applied to this area within the trailing
   * 42-day window, EXCLUDING the proposed event — `undefined` means the
   * rolling history is not known, which fails closed to `UNKNOWN`
   * (calculation_contracts.csv's own `missing_input_behaviour` for this
   * gate), never assumed to be zero. */
  priorApplicationsLitresInWindow: number | undefined;
  proposedVolumeLitres: number;
  applicationRateMmPerHour: number;
}

export interface SoiledWaterApplicationOk {
  cumulativeLitresPerHa: number;
}

export function checkSoiledWaterApplicationGate(input: SoiledWaterApplicationInput): EngineOutcome<SoiledWaterApplicationOk> {
  if (input.areaHa <= 0) {
    return blockedInsufficientEvidence("MISSING_ELIGIBLE_GRASSLAND_AREA", ["areaHa"]);
  }
  if (input.priorApplicationsLitresInWindow === undefined) {
    return unknown("SOILED_WATER_HISTORY_UNKNOWN");
  }

  const cumulativeLitresPerHa = (input.priorApplicationsLitresInWindow + input.proposedVolumeLitres) / input.areaHa;

  if (cumulativeLitresPerHa > SOILED_WATER_42_DAY_LIMIT_LITRES_PER_HA) {
    return legalProhibition(
      "SOILED_WATER_42_DAY_LIMIT_EXCEEDED",
      `Cumulative soiled-water application over the trailing ${SOILED_WATER_42_DAY_WINDOW_DAYS} days would reach ${cumulativeLitresPerHa.toFixed(0)} litres/ha, exceeding the statutory ${SOILED_WATER_42_DAY_LIMIT_LITRES_PER_HA.toLocaleString()} litres/ha limit.`,
    );
  }
  if (input.applicationRateMmPerHour > SOILED_WATER_MAX_RATE_MM_PER_HOUR) {
    return legalProhibition(
      "SOILED_WATER_RATE_LIMIT_EXCEEDED",
      `Proposed application rate ${input.applicationRateMmPerHour} mm/hour exceeds the statutory ${SOILED_WATER_MAX_RATE_MM_PER_HOUR} mm/hour limit.`,
    );
  }
  return ok({ cumulativeLitresPerHa }, "DERIVED");
}
