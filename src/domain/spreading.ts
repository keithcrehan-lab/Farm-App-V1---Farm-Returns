/**
 * Spreading-conditions weather engine — Phase 5 (spec §10, docs/agronomy
 * -engine.md § "Spreading conditions engine"), built from the "Farm
 * Return Core Data v4" workbook's `MetEireann_SMD` sheet (the Met
 * Éireann Soil Moisture Deficit model schema/rules, evidence class
 * A-OFFICIAL) and validated against the "Farm Return Gap Closure Data
 * v5" workbook's `Met_Dunsany_MayJul26` sheet (92 real daily
 * observations from the Dunsany synoptic station, 1 May-31 Jul 2026,
 * evidence class A-OFFICIAL, station file dly1375.csv).
 *
 * Scope, deliberately narrower than the full spec: docs/agronomy-engine.md
 * itself flags the spreading score's six components (rainfall, SMD/
 * trafficability, soil temp, crop demand, drainage/topographic risk,
 * wind) as "validate weights before production — spec explicitly flags
 * these as indicative." No source in hand supplies real weights for that
 * composite, and the closed-period calendar (S.I. 588/2025's actual
 * date ranges) isn't in either supplied workbook either — inventing
 * either would break CLAUDE.md's "never invent a production
 * scientific/regulatory number" rule. This module implements only what
 * the real data actually grounds:
 *
 *  - The two REAL, sourced drainage-class constants from `MetEireann_SMD`
 *    (a field's modelled minimum SMD, and the model's theoretical max of
 *    110mm for every class) — used for `soilDrynessIndex`, a genuine
 *    unit-rescale of the real SMD value onto its own published range,
 *    not an invented weighting formula.
 *  - `isGroundSaturated`: the model's own definition of its saturation
 *    floor (SMD at or below the class minimum) as a hard stop — sourced
 *    directly from the same table, not a guessed threshold.
 *  - `isGroundFrozen`: 0°C, the physical freezing point of water, not a
 *    regulatory or scientific judgement call.
 *  - `smdTrend`: a plain day-over-day direction read (rising SMD = soil
 *    drying, falling = wetting), no threshold involved.
 *
 * `DUNSANY_VALIDATION_SERIES` below is real data, not this farm's own
 * weather — the source sheet is explicit that Dunsany is "representative
 * station only... production should select the nearest appropriate Met
 * Éireann station/grid source to each mapped farm/field," which this
 * data model doesn't yet have a way to do (no per-field weather-station
 * mapping exists). Per CLAUDE.md's "never present modelled/station
 * weather... as an in-field sensor measurement," this dataset is used
 * here only to validate the deterministic rules against 92 real days —
 * it must never be wired into a screen as if it were live conditions for
 * this farm's own fields. See README.md/evidence-register.md for what a
 * real per-field live connection would need.
 */

import type { Drainage } from "./types";

export const SPREADING_ENGINE_VERSION = "spreading_engine_v1.0.0";

export const MET_EIREANN_SMD_SOURCE_URL = "https://www.met.ie/climate/services";

/**
 * `MetEireann_SMD` sheet, "Drainage class" table — the model's own
 * saturation floor per drainage class, and its theoretical maximum
 * (identical across classes: 110mm).
 */
export const DRAINAGE_CLASS_SMD_MODEL: Record<Drainage, { minimumSmdMm: number; theoreticalMaxSmdMm: number }> = {
  well_drained: { minimumSmdMm: 0, theoreticalMaxSmdMm: 110 },
  moderately_drained: { minimumSmdMm: -10, theoreticalMaxSmdMm: 110 },
  poorly_drained: { minimumSmdMm: -10, theoreticalMaxSmdMm: 110 },
};

/**
 * Real SMD, rescaled onto its own class's real [minimum, theoretical max]
 * range from a 0 (saturated floor) to 100 (theoretical driest) index.
 * This is a unit conversion of the real number, not a fabricated
 * suitability formula — it says nothing about rainfall, crop demand or
 * any of the other spec-flagged-as-indicative score components.
 */
export function soilDrynessIndex(smdMm: number, drainage: Drainage): number {
  const { minimumSmdMm, theoreticalMaxSmdMm } = DRAINAGE_CLASS_SMD_MODEL[drainage];
  const pct = ((smdMm - minimumSmdMm) / (theoreticalMaxSmdMm - minimumSmdMm)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/**
 * True when SMD has reached or gone below the model's own saturation
 * floor for this drainage class — the sheet's own "Critical behaviour"
 * text describes exactly this state (e.g. moderately-drained "may
 * saturate on wet winter days" at SMD near its -10mm floor).
 */
export function isGroundSaturated(smdMm: number, drainage: Drainage): boolean {
  return smdMm <= DRAINAGE_CLASS_SMD_MODEL[drainage].minimumSmdMm;
}

/** 0°C, the physical freezing point of water — not a sourced/versioned
 * regulatory figure, just physics. Checked against 10cm soil temperature
 * (the real dataset's most directly relevant reading for ground
 * condition), which is what production should use once wired to a live
 * per-field source. */
export function isGroundFrozen(soilTemp10cmC: number): boolean {
  return soilTemp10cmC <= 0;
}

export type SmdTrend = "drying" | "wetting" | "steady";

/** Higher SMD = drier soil in this model, so a rising day-over-day SMD
 * means the ground is drying; a falling one means it's wetting. */
export function smdTrend(todaySmdMm: number, previousDaySmdMm: number): SmdTrend {
  if (todaySmdMm > previousDaySmdMm) return "drying";
  if (todaySmdMm < previousDaySmdMm) return "wetting";
  return "steady";
}

export interface SpreadingHardStop {
  reason: string;
}

/**
 * The two real, sourced hard stops this engine can determine from
 * weather/soil data alone. Does NOT check the statutory closed-period
 * calendar (no real S.I. 588/2025 date-range extract is in hand — see
 * docs/evidence-register.md) or buffer-zone/waterlogged-beyond-the-model
 * conditions a human would also need to judge on the day. Callers must
 * still apply the closed-period check separately; this is a floor, not
 * the complete hard-stop set the spec describes.
 */
export function assessWeatherHardStops(day: {
  smdMm: number;
  drainage: Drainage;
  soilTemp10cmC: number;
}): SpreadingHardStop[] {
  const stops: SpreadingHardStop[] = [];
  if (isGroundFrozen(day.soilTemp10cmC)) {
    stops.push({ reason: `Ground frozen (10cm soil temp ${day.soilTemp10cmC}°C)` });
  }
  if (isGroundSaturated(day.smdMm, day.drainage)) {
    stops.push({ reason: "Ground saturated (soil moisture deficit at the model's saturation floor)" });
  }
  return stops;
}

// ---------------------------------------------------------------------------
// Met Éireann Dunsany synoptic station — real 92-day validation dataset.
// Source: farm_return_gap_closure_data_v5.xlsx, sheet Met_Dunsany_MayJul26.
// Validation data only — see the module doc comment above. Never present
// this as a live reading for this farm's own fields.
// ---------------------------------------------------------------------------

export interface DunsanyDailyObservation {
  date: string;
  rainfallMm: number;
  peMm: number;
  evaporationMm: number;
  smdWellDrainedMm: number;
  smdModeratelyDrainedMm: number;
  smdPoorlyDrainedMm: number;
  soilTemp10cmC: number;
  maxAirTempC: number;
  minAirTempC: number;
}

export const DUNSANY_VALIDATION_SERIES: DunsanyDailyObservation[] = [
  { date: "2026-05-01", rainfallMm: 0.2, peMm: 2.6, evaporationMm: 3.6, smdWellDrainedMm: 30, smdModeratelyDrainedMm: 30, smdPoorlyDrainedMm: 25.3, soilTemp10cmC: 12.077, maxAirTempC: 17.5, minAirTempC: 9.5 },
  { date: "2026-05-02", rainfallMm: 0, peMm: 2, evaporationMm: 2.7, smdWellDrainedMm: 31.5, smdModeratelyDrainedMm: 31.5, smdPoorlyDrainedMm: 27, soilTemp10cmC: 12.108, maxAirTempC: 16, minAirTempC: 9.7 },
  { date: "2026-05-03", rainfallMm: 0, peMm: 1.9, evaporationMm: 2.6, smdWellDrainedMm: 32.8, smdModeratelyDrainedMm: 32.8, smdPoorlyDrainedMm: 28.6, soilTemp10cmC: 12.01, maxAirTempC: 14.8, minAirTempC: 9.9 },
  { date: "2026-05-04", rainfallMm: 0, peMm: 2.1, evaporationMm: 2.9, smdWellDrainedMm: 34.3, smdModeratelyDrainedMm: 34.3, smdPoorlyDrainedMm: 30.3, soilTemp10cmC: 11.882, maxAirTempC: 14.7, minAirTempC: 5.2 },
  { date: "2026-05-05", rainfallMm: 0, peMm: 2, evaporationMm: 2.7, smdWellDrainedMm: 35.7, smdModeratelyDrainedMm: 35.7, smdPoorlyDrainedMm: 31.9, soilTemp10cmC: 11.02, maxAirTempC: 13.2, minAirTempC: 4.3 },
  { date: "2026-05-06", rainfallMm: 0, peMm: 2.8, evaporationMm: 4, smdWellDrainedMm: 37.6, smdModeratelyDrainedMm: 37.6, smdPoorlyDrainedMm: 34.1, soilTemp10cmC: 11.02, maxAirTempC: 15.4, minAirTempC: 0.1 },
  { date: "2026-05-07", rainfallMm: 0, peMm: 2.3, evaporationMm: 3.1, smdWellDrainedMm: 39.1, smdModeratelyDrainedMm: 39.1, smdPoorlyDrainedMm: 35.8, soilTemp10cmC: 11.64, maxAirTempC: 15.2, minAirTempC: 8.1 },
  { date: "2026-05-08", rainfallMm: 4.4, peMm: 1.5, evaporationMm: 2, smdWellDrainedMm: 35.6, smdModeratelyDrainedMm: 35.6, smdPoorlyDrainedMm: 32.5, soilTemp10cmC: 11.448, maxAirTempC: 13.3, minAirTempC: 5.8 },
  { date: "2026-05-09", rainfallMm: 0, peMm: 3.3, evaporationMm: 4.9, smdWellDrainedMm: 37.8, smdModeratelyDrainedMm: 37.8, smdPoorlyDrainedMm: 35, soilTemp10cmC: 11.148, maxAirTempC: 13.5, minAirTempC: 4.6 },
  { date: "2026-05-10", rainfallMm: 0, peMm: 2.9, evaporationMm: 4.1, smdWellDrainedMm: 39.7, smdModeratelyDrainedMm: 39.7, smdPoorlyDrainedMm: 37.2, soilTemp10cmC: 10.872, maxAirTempC: 14, minAirTempC: 2.7 },
  { date: "2026-05-11", rainfallMm: 0, peMm: 2.7, evaporationMm: 3.8, smdWellDrainedMm: 41.4, smdModeratelyDrainedMm: 41.4, smdPoorlyDrainedMm: 39.2, soilTemp10cmC: 11.21, maxAirTempC: 14.7, minAirTempC: 5.2 },
  { date: "2026-05-12", rainfallMm: 0, peMm: 2.8, evaporationMm: 4.4, smdWellDrainedMm: 43.2, smdModeratelyDrainedMm: 43.2, smdPoorlyDrainedMm: 41.2, soilTemp10cmC: 11.153, maxAirTempC: 14.7, minAirTempC: 4.8 },
  { date: "2026-05-13", rainfallMm: 7.4, peMm: 2.3, evaporationMm: 3.6, smdWellDrainedMm: 37.2, smdModeratelyDrainedMm: 37.2, smdPoorlyDrainedMm: 35.3, soilTemp10cmC: 11.015, maxAirTempC: 12.4, minAirTempC: 6.2 },
  { date: "2026-05-14", rainfallMm: 1.8, peMm: 2.3, evaporationMm: 3.7, smdWellDrainedMm: 36.9, smdModeratelyDrainedMm: 36.9, smdPoorlyDrainedMm: 35.3, soilTemp10cmC: 10.677, maxAirTempC: 12.5, minAirTempC: 5.6 },
  { date: "2026-05-15", rainfallMm: 0, peMm: 2.1, evaporationMm: 3.1, smdWellDrainedMm: 38.4, smdModeratelyDrainedMm: 38.4, smdPoorlyDrainedMm: 36.9, soilTemp10cmC: 10.557, maxAirTempC: 12.5, minAirTempC: 2.3 },
  { date: "2026-05-16", rainfallMm: 4.7, peMm: 1.6, evaporationMm: 2.3, smdWellDrainedMm: 34.7, smdModeratelyDrainedMm: 34.7, smdPoorlyDrainedMm: 33.3, soilTemp10cmC: 11.175, maxAirTempC: 13.7, minAirTempC: 5.2 },
  { date: "2026-05-17", rainfallMm: 6.6, peMm: 2, evaporationMm: 2.9, smdWellDrainedMm: 29.4, smdModeratelyDrainedMm: 29.4, smdPoorlyDrainedMm: 28.2, soilTemp10cmC: 10.97, maxAirTempC: 12.9, minAirTempC: 5.2 },
  { date: "2026-05-18", rainfallMm: 6.7, peMm: 2, evaporationMm: 2.9, smdWellDrainedMm: 24.2, smdModeratelyDrainedMm: 24.2, smdPoorlyDrainedMm: 23.2, soilTemp10cmC: 11.2, maxAirTempC: 13.7, minAirTempC: 6.3 },
  { date: "2026-05-19", rainfallMm: 8.8, peMm: 2, evaporationMm: 3, smdWellDrainedMm: 17, smdModeratelyDrainedMm: 17, smdPoorlyDrainedMm: 16.1, soilTemp10cmC: 11.82, maxAirTempC: 16.4, minAirTempC: 9.2 },
  { date: "2026-05-20", rainfallMm: 0.9, peMm: 2.1, evaporationMm: 3.1, smdWellDrainedMm: 17.9, smdModeratelyDrainedMm: 17.9, smdPoorlyDrainedMm: 17.2, soilTemp10cmC: 12.172, maxAirTempC: 16.8, minAirTempC: 9.4 },
  { date: "2026-05-21", rainfallMm: 1.7, peMm: 2.6, evaporationMm: 3.6, smdWellDrainedMm: 18.3, smdModeratelyDrainedMm: 18.3, smdPoorlyDrainedMm: 17.9, soilTemp10cmC: 13.002, maxAirTempC: 19, minAirTempC: 12.3 },
  { date: "2026-05-22", rainfallMm: 0, peMm: 2.4, evaporationMm: 3.5, smdWellDrainedMm: 20.3, smdModeratelyDrainedMm: 20.3, smdPoorlyDrainedMm: 20.1, soilTemp10cmC: 13.595, maxAirTempC: 17.5, minAirTempC: 11.4 },
  { date: "2026-05-23", rainfallMm: 0, peMm: 3.4, evaporationMm: 4.7, smdWellDrainedMm: 23.1, smdModeratelyDrainedMm: 23.1, smdPoorlyDrainedMm: 23.2, soilTemp10cmC: 14.028, maxAirTempC: 20.1, minAirTempC: 10.1 },
  { date: "2026-05-24", rainfallMm: 0, peMm: 4.7, evaporationMm: 6.3, smdWellDrainedMm: 26.8, smdModeratelyDrainedMm: 26.8, smdPoorlyDrainedMm: 27.3, soilTemp10cmC: 14.97, maxAirTempC: 23.6, minAirTempC: 11.8 },
  { date: "2026-05-25", rainfallMm: 0, peMm: 4.4, evaporationMm: 5.8, smdWellDrainedMm: 30.2, smdModeratelyDrainedMm: 30.2, smdPoorlyDrainedMm: 30.9, soilTemp10cmC: 15.413, maxAirTempC: 25.6, minAirTempC: 10.6 },
  { date: "2026-05-26", rainfallMm: 0, peMm: 4.1, evaporationMm: 5.7, smdWellDrainedMm: 33.2, smdModeratelyDrainedMm: 33.2, smdPoorlyDrainedMm: 34.2, soilTemp10cmC: 15.642, maxAirTempC: 22.9, minAirTempC: 11.6 },
  { date: "2026-05-27", rainfallMm: 3.4, peMm: 3.7, evaporationMm: 5.5, smdWellDrainedMm: 32.3, smdModeratelyDrainedMm: 32.3, smdPoorlyDrainedMm: 33.6, soilTemp10cmC: 15.342, maxAirTempC: 19.5, minAirTempC: 10.1 },
  { date: "2026-05-28", rainfallMm: 0.1, peMm: 3.5, evaporationMm: 5.1, smdWellDrainedMm: 34.7, smdModeratelyDrainedMm: 34.7, smdPoorlyDrainedMm: 36.1, soilTemp10cmC: 15.882, maxAirTempC: 19.9, minAirTempC: 13.3 },
  { date: "2026-05-29", rainfallMm: 0, peMm: 3.8, evaporationMm: 5.5, smdWellDrainedMm: 37.3, smdModeratelyDrainedMm: 37.3, smdPoorlyDrainedMm: 39, soilTemp10cmC: 15.665, maxAirTempC: 20.5, minAirTempC: 11 },
  { date: "2026-05-30", rainfallMm: 2.6, peMm: 2.5, evaporationMm: 3.3, smdWellDrainedMm: 36.3, smdModeratelyDrainedMm: 36.3, smdPoorlyDrainedMm: 38.1, soilTemp10cmC: 14.932, maxAirTempC: 19.6, minAirTempC: 10.8 },
  { date: "2026-05-31", rainfallMm: 5, peMm: 2.3, evaporationMm: 3.2, smdWellDrainedMm: 32.9, smdModeratelyDrainedMm: 32.9, smdPoorlyDrainedMm: 34.7, soilTemp10cmC: 14.892, maxAirTempC: 18.1, minAirTempC: 10.7 },
  { date: "2026-06-01", rainfallMm: 5.4, peMm: 1.9, evaporationMm: 2.7, smdWellDrainedMm: 28.8, smdModeratelyDrainedMm: 28.8, smdPoorlyDrainedMm: 30.8, soilTemp10cmC: 15.17, maxAirTempC: 19.6, minAirTempC: 13.2 },
  { date: "2026-06-02", rainfallMm: 5.2, peMm: 2.9, evaporationMm: 4, smdWellDrainedMm: 25.7, smdModeratelyDrainedMm: 25.7, smdPoorlyDrainedMm: 27.9, soilTemp10cmC: 15.39, maxAirTempC: 18.2, minAirTempC: 11.7 },
  { date: "2026-06-03", rainfallMm: 11.3, peMm: 2.5, evaporationMm: 4, smdWellDrainedMm: 16.4, smdModeratelyDrainedMm: 16.4, smdPoorlyDrainedMm: 18.7, soilTemp10cmC: 14.983, maxAirTempC: 17.8, minAirTempC: 10.3 },
  { date: "2026-06-04", rainfallMm: 5.8, peMm: 2.3, evaporationMm: 3.7, smdWellDrainedMm: 12.6, smdModeratelyDrainedMm: 12.6, smdPoorlyDrainedMm: 15, soilTemp10cmC: 14.557, maxAirTempC: 15.9, minAirTempC: 9.2 },
  { date: "2026-06-05", rainfallMm: 1.7, peMm: 3, evaporationMm: 4.3, smdWellDrainedMm: 13.5, smdModeratelyDrainedMm: 13.5, smdPoorlyDrainedMm: 16.1, soilTemp10cmC: 14.105, maxAirTempC: 16.8, minAirTempC: 7.7 },
  { date: "2026-06-06", rainfallMm: 7.6, peMm: 1.8, evaporationMm: 2.7, smdWellDrainedMm: 7.5, smdModeratelyDrainedMm: 7.5, smdPoorlyDrainedMm: 10.2, soilTemp10cmC: 13.637, maxAirTempC: 15.5, minAirTempC: 10.5 },
  { date: "2026-06-07", rainfallMm: 12.5, peMm: 2, evaporationMm: 3, smdWellDrainedMm: 0, smdModeratelyDrainedMm: -3.2, smdPoorlyDrainedMm: -0.3, soilTemp10cmC: 13.858, maxAirTempC: 16.8, minAirTempC: 10 },
  { date: "2026-06-08", rainfallMm: 2.7, peMm: 3, evaporationMm: 4.6, smdWellDrainedMm: 0.3, smdModeratelyDrainedMm: 0.3, smdPoorlyDrainedMm: 0, soilTemp10cmC: 14.105, maxAirTempC: 15.6, minAirTempC: 7 },
  { date: "2026-06-09", rainfallMm: 2.8, peMm: 3.1, evaporationMm: 4.7, smdWellDrainedMm: 0.6, smdModeratelyDrainedMm: 0.6, smdPoorlyDrainedMm: 0.3, soilTemp10cmC: 13.948, maxAirTempC: 15.2, minAirTempC: 7 },
  { date: "2026-06-10", rainfallMm: 1.7, peMm: 3.1, evaporationMm: 4.5, smdWellDrainedMm: 1.9, smdModeratelyDrainedMm: 1.9, smdPoorlyDrainedMm: 1.7, soilTemp10cmC: 13.892, maxAirTempC: 16.2, minAirTempC: 6.8 },
  { date: "2026-06-11", rainfallMm: 13.8, peMm: 1.6, evaporationMm: 2.4, smdWellDrainedMm: 0, smdModeratelyDrainedMm: -10, smdPoorlyDrainedMm: -10, soilTemp10cmC: 13.815, maxAirTempC: 17.1, minAirTempC: 10.1 },
  { date: "2026-06-12", rainfallMm: 0.2, peMm: 2.8, evaporationMm: 4.6, smdWellDrainedMm: 2.6, smdModeratelyDrainedMm: 2.6, smdPoorlyDrainedMm: -6.9, soilTemp10cmC: 14.505, maxAirTempC: 17.4, minAirTempC: 10.8 },
  { date: "2026-06-13", rainfallMm: 0, peMm: 3.6, evaporationMm: 5, smdWellDrainedMm: 6.1, smdModeratelyDrainedMm: 6.1, smdPoorlyDrainedMm: -3, soilTemp10cmC: 14.438, maxAirTempC: 18.4, minAirTempC: 9.9 },
  { date: "2026-06-14", rainfallMm: 0, peMm: 3.5, evaporationMm: 4.8, smdWellDrainedMm: 9.4, smdModeratelyDrainedMm: 9.4, smdPoorlyDrainedMm: 0.6, soilTemp10cmC: 14.33, maxAirTempC: 18.1, minAirTempC: 8.4 },
  { date: "2026-06-15", rainfallMm: 0.3, peMm: 2.7, evaporationMm: 3.7, smdWellDrainedMm: 11.5, smdModeratelyDrainedMm: 11.5, smdPoorlyDrainedMm: 3, soilTemp10cmC: 14.458, maxAirTempC: 18.6, minAirTempC: 10.8 },
  { date: "2026-06-16", rainfallMm: 0.2, peMm: 2.4, evaporationMm: 3.2, smdWellDrainedMm: 13.4, smdModeratelyDrainedMm: 13.4, smdPoorlyDrainedMm: 5.2, soilTemp10cmC: 14.887, maxAirTempC: 20.1, minAirTempC: 12 },
  { date: "2026-06-17", rainfallMm: 1.4, peMm: 3.4, evaporationMm: 4.8, smdWellDrainedMm: 15.1, smdModeratelyDrainedMm: 15.1, smdPoorlyDrainedMm: 7.2, soilTemp10cmC: 15.597, maxAirTempC: 20.5, minAirTempC: 12.7 },
  { date: "2026-06-18", rainfallMm: 1.6, peMm: 2.6, evaporationMm: 3.7, smdWellDrainedMm: 15.7, smdModeratelyDrainedMm: 15.7, smdPoorlyDrainedMm: 8.2, soilTemp10cmC: 15.852, maxAirTempC: 21, minAirTempC: 13.2 },
  { date: "2026-06-19", rainfallMm: 9.1, peMm: 1.9, evaporationMm: 2.7, smdWellDrainedMm: 8.2, smdModeratelyDrainedMm: 8.2, smdPoorlyDrainedMm: 1, soilTemp10cmC: 16.118, maxAirTempC: 18.9, minAirTempC: 13.4 },
  { date: "2026-06-20", rainfallMm: 0, peMm: 3.7, evaporationMm: 5, smdWellDrainedMm: 11.6, smdModeratelyDrainedMm: 11.6, smdPoorlyDrainedMm: 4.7, soilTemp10cmC: 15.983, maxAirTempC: 21, minAirTempC: 9.1 },
  { date: "2026-06-21", rainfallMm: 0.1, peMm: 3.9, evaporationMm: 5.4, smdWellDrainedMm: 15, smdModeratelyDrainedMm: 15, smdPoorlyDrainedMm: 8.5, soilTemp10cmC: 15.575, maxAirTempC: 20.3, minAirTempC: 7.3 },
  { date: "2026-06-22", rainfallMm: 0, peMm: 2.5, evaporationMm: 3.3, smdWellDrainedMm: 17.2, smdModeratelyDrainedMm: 17.2, smdPoorlyDrainedMm: 11, soilTemp10cmC: 15.495, maxAirTempC: 22.3, minAirTempC: 10.8 },
  { date: "2026-06-23", rainfallMm: 0, peMm: 4.4, evaporationMm: 5.8, smdWellDrainedMm: 20.9, smdModeratelyDrainedMm: 20.9, smdPoorlyDrainedMm: 15.4, soilTemp10cmC: 17.048, maxAirTempC: 27.1, minAirTempC: 13.4 },
  { date: "2026-06-24", rainfallMm: 0, peMm: 3.2, evaporationMm: 4.1, smdWellDrainedMm: 23.5, smdModeratelyDrainedMm: 23.5, smdPoorlyDrainedMm: 18.4, soilTemp10cmC: 17.142, maxAirTempC: 25.5, minAirTempC: 12.1 },
  { date: "2026-06-25", rainfallMm: 0, peMm: 4.6, evaporationMm: 6.2, smdWellDrainedMm: 27.1, smdModeratelyDrainedMm: 27.1, smdPoorlyDrainedMm: 22.6, soilTemp10cmC: 17.83, maxAirTempC: 27.7, minAirTempC: 14.1 },
  { date: "2026-06-26", rainfallMm: 0, peMm: 4.4, evaporationMm: 6, smdWellDrainedMm: 30.4, smdModeratelyDrainedMm: 30.4, smdPoorlyDrainedMm: 26.4, soilTemp10cmC: 18.823, maxAirTempC: 26.2, minAirTempC: 17.2 },
  { date: "2026-06-27", rainfallMm: 0.8, peMm: 2.5, evaporationMm: 3.5, smdWellDrainedMm: 31.4, smdModeratelyDrainedMm: 31.4, smdPoorlyDrainedMm: 27.7, soilTemp10cmC: 18.145, maxAirTempC: 20.9, minAirTempC: 15.5 },
  { date: "2026-06-28", rainfallMm: 0.3, peMm: 3.7, evaporationMm: 5.5, smdWellDrainedMm: 33.8, smdModeratelyDrainedMm: 33.8, smdPoorlyDrainedMm: 30.5, soilTemp10cmC: 17.388, maxAirTempC: 19, minAirTempC: 11.6 },
  { date: "2026-06-29", rainfallMm: 0.1, peMm: 2.4, evaporationMm: 3.3, smdWellDrainedMm: 35.3, smdModeratelyDrainedMm: 35.3, smdPoorlyDrainedMm: 32.3, soilTemp10cmC: 16.642, maxAirTempC: 19.2, minAirTempC: 11.3 },
  { date: "2026-06-30", rainfallMm: 4.8, peMm: 2.9, evaporationMm: 4, smdWellDrainedMm: 32.5, smdModeratelyDrainedMm: 32.5, smdPoorlyDrainedMm: 29.7, soilTemp10cmC: 16.625, maxAirTempC: 20.6, minAirTempC: 12.7 },
  { date: "2026-07-01", rainfallMm: 0.3, peMm: 1.9, evaporationMm: 2.7, smdWellDrainedMm: 33.5, smdModeratelyDrainedMm: 33.5, smdPoorlyDrainedMm: 30.9, soilTemp10cmC: 16.483, maxAirTempC: 18.7, minAirTempC: 13.5 },
  { date: "2026-07-02", rainfallMm: 0, peMm: 2.6, evaporationMm: 3.7, smdWellDrainedMm: 35.4, smdModeratelyDrainedMm: 35.4, smdPoorlyDrainedMm: 33, soilTemp10cmC: 16.173, maxAirTempC: 18.5, minAirTempC: 11.9 },
  { date: "2026-07-03", rainfallMm: 0, peMm: 3.1, evaporationMm: 4.5, smdWellDrainedMm: 37.5, smdModeratelyDrainedMm: 37.5, smdPoorlyDrainedMm: 35.4, soilTemp10cmC: 16.275, maxAirTempC: 21.9, minAirTempC: 8.9 },
  { date: "2026-07-04", rainfallMm: 0, peMm: 2.6, evaporationMm: 3.7, smdWellDrainedMm: 39.2, smdModeratelyDrainedMm: 39.2, smdPoorlyDrainedMm: 37.4, soilTemp10cmC: 16.757, maxAirTempC: 20, minAirTempC: 15.1 },
  { date: "2026-07-05", rainfallMm: 0, peMm: 3, evaporationMm: 4.3, smdWellDrainedMm: 41.1, smdModeratelyDrainedMm: 41.1, smdPoorlyDrainedMm: 39.6, soilTemp10cmC: 16.995, maxAirTempC: 21.8, minAirTempC: 14.2 },
  { date: "2026-07-06", rainfallMm: 0, peMm: 4.1, evaporationMm: 5.8, smdWellDrainedMm: 43.7, smdModeratelyDrainedMm: 43.7, smdPoorlyDrainedMm: 42.4, soilTemp10cmC: 17.513, maxAirTempC: 23.8, minAirTempC: 12.6 },
  { date: "2026-07-07", rainfallMm: 0, peMm: 4.4, evaporationMm: 6, smdWellDrainedMm: 46.3, smdModeratelyDrainedMm: 46.3, smdPoorlyDrainedMm: 45.4, soilTemp10cmC: 18.233, maxAirTempC: 24.9, minAirTempC: 13 },
  { date: "2026-07-08", rainfallMm: 0, peMm: 4.5, evaporationMm: 5.8, smdWellDrainedMm: 48.9, smdModeratelyDrainedMm: 48.9, smdPoorlyDrainedMm: 48.3, soilTemp10cmC: 19.635, maxAirTempC: 28.5, minAirTempC: 11.9 },
  { date: "2026-07-09", rainfallMm: 0, peMm: 3.6, evaporationMm: 4.7, smdWellDrainedMm: 50.9, smdModeratelyDrainedMm: 50.9, smdPoorlyDrainedMm: 50.5, soilTemp10cmC: 20.068, maxAirTempC: 24.8, minAirTempC: 13.4 },
  { date: "2026-07-10", rainfallMm: 0, peMm: 4.4, evaporationMm: 5.8, smdWellDrainedMm: 53.2, smdModeratelyDrainedMm: 53.2, smdPoorlyDrainedMm: 53.1, soilTemp10cmC: 20.503, maxAirTempC: 25, minAirTempC: 12.9 },
  { date: "2026-07-11", rainfallMm: 0, peMm: 4.2, evaporationMm: 5.6, smdWellDrainedMm: 55.4, smdModeratelyDrainedMm: 55.4, smdPoorlyDrainedMm: 55.5, soilTemp10cmC: 20.708, maxAirTempC: 25, minAirTempC: 12.9 },
  { date: "2026-07-12", rainfallMm: 0, peMm: 4.4, evaporationMm: 6.4, smdWellDrainedMm: 57.6, smdModeratelyDrainedMm: 57.6, smdPoorlyDrainedMm: 57.9, soilTemp10cmC: 20.58, maxAirTempC: 23.4, minAirTempC: 15.3 },
  { date: "2026-07-13", rainfallMm: 0, peMm: 4.3, evaporationMm: 6.2, smdWellDrainedMm: 59.6, smdModeratelyDrainedMm: 59.6, smdPoorlyDrainedMm: 60.1, soilTemp10cmC: 19.96, maxAirTempC: 20.2, minAirTempC: 14.9 },
  { date: "2026-07-14", rainfallMm: 0, peMm: 4.8, evaporationMm: 6.7, smdWellDrainedMm: 61.8, smdModeratelyDrainedMm: 61.8, smdPoorlyDrainedMm: 62.5, soilTemp10cmC: 19.78, maxAirTempC: 21.9, minAirTempC: 14.4 },
  { date: "2026-07-15", rainfallMm: 0, peMm: 4.2, evaporationMm: 6, smdWellDrainedMm: 63.7, smdModeratelyDrainedMm: 63.7, smdPoorlyDrainedMm: 64.5, soilTemp10cmC: 20.21, maxAirTempC: 23.4, minAirTempC: 13 },
  { date: "2026-07-16", rainfallMm: 0, peMm: 4, evaporationMm: 5.3, smdWellDrainedMm: 65.3, smdModeratelyDrainedMm: 65.3, smdPoorlyDrainedMm: 66.3, soilTemp10cmC: 20.198, maxAirTempC: 24.6, minAirTempC: 9.7 },
  { date: "2026-07-17", rainfallMm: 0, peMm: 4.4, evaporationMm: 5.9, smdWellDrainedMm: 67.1, smdModeratelyDrainedMm: 67.1, smdPoorlyDrainedMm: 68.2, soilTemp10cmC: 20.5, maxAirTempC: 26, minAirTempC: 11.2 },
  { date: "2026-07-18", rainfallMm: 0, peMm: 4.1, evaporationMm: 5.7, smdWellDrainedMm: 68.7, smdModeratelyDrainedMm: 68.7, smdPoorlyDrainedMm: 69.9, soilTemp10cmC: 20.23, maxAirTempC: 21.5, minAirTempC: 8.5 },
  { date: "2026-07-19", rainfallMm: 0, peMm: 4.1, evaporationMm: 5.5, smdWellDrainedMm: 70.3, smdModeratelyDrainedMm: 70.3, smdPoorlyDrainedMm: 71.6, soilTemp10cmC: 19.95, maxAirTempC: 23, minAirTempC: 7.9 },
  { date: "2026-07-20", rainfallMm: 0, peMm: 3.1, evaporationMm: 4.2, smdWellDrainedMm: 71.4, smdModeratelyDrainedMm: 71.4, smdPoorlyDrainedMm: 72.8, soilTemp10cmC: 19.29, maxAirTempC: 22, minAirTempC: 8.7 },
  { date: "2026-07-21", rainfallMm: 0, peMm: 2.5, evaporationMm: 3.4, smdWellDrainedMm: 72.3, smdModeratelyDrainedMm: 72.3, smdPoorlyDrainedMm: 73.7, soilTemp10cmC: 18.94, maxAirTempC: 19.7, minAirTempC: 13.1 },
  { date: "2026-07-22", rainfallMm: 0, peMm: 3.6, evaporationMm: 4.9, smdWellDrainedMm: 73.5, smdModeratelyDrainedMm: 73.5, smdPoorlyDrainedMm: 75, soilTemp10cmC: 19.177, maxAirTempC: 22.2, minAirTempC: 12.8 },
  { date: "2026-07-23", rainfallMm: 0, peMm: 3.1, evaporationMm: 4.1, smdWellDrainedMm: 74.5, smdModeratelyDrainedMm: 74.5, smdPoorlyDrainedMm: 76.1, soilTemp10cmC: 19.01, maxAirTempC: 22.6, minAirTempC: 12.1 },
  { date: "2026-07-24", rainfallMm: 0, peMm: 3.2, evaporationMm: 4.2, smdWellDrainedMm: 75.6, smdModeratelyDrainedMm: 75.6, smdPoorlyDrainedMm: 77.2, soilTemp10cmC: 18.945, maxAirTempC: 22.9, minAirTempC: 11.5 },
  { date: "2026-07-25", rainfallMm: 0.6, peMm: 1.9, evaporationMm: 2.5, smdWellDrainedMm: 75.6, smdModeratelyDrainedMm: 75.6, smdPoorlyDrainedMm: 77.2, soilTemp10cmC: 18.227, maxAirTempC: 20.8, minAirTempC: 13 },
  { date: "2026-07-26", rainfallMm: 0.8, peMm: 2.2, evaporationMm: 3.3, smdWellDrainedMm: 75.4, smdModeratelyDrainedMm: 75.4, smdPoorlyDrainedMm: 77.1, soilTemp10cmC: 17.763, maxAirTempC: 18.7, minAirTempC: 12.6 },
  { date: "2026-07-27", rainfallMm: 0.4, peMm: 1.8, evaporationMm: 2.4, smdWellDrainedMm: 75.6, smdModeratelyDrainedMm: 75.6, smdPoorlyDrainedMm: 77.3, soilTemp10cmC: 17.29, maxAirTempC: 21.2, minAirTempC: 12.2 },
  { date: "2026-07-28", rainfallMm: 0.1, peMm: 4.2, evaporationMm: 5.6, smdWellDrainedMm: 76.8, smdModeratelyDrainedMm: 76.8, smdPoorlyDrainedMm: 78.6, soilTemp10cmC: 19.273, maxAirTempC: 26.6, minAirTempC: 16.4 },
  { date: "2026-07-29", rainfallMm: 2.3, peMm: 2.1, evaporationMm: 2.8, smdWellDrainedMm: 75.2, smdModeratelyDrainedMm: 75.2, smdPoorlyDrainedMm: 77, soilTemp10cmC: 18.823, maxAirTempC: 22.1, minAirTempC: 12.3 },
  { date: "2026-07-30", rainfallMm: 0, peMm: 3.4, evaporationMm: 4.6, smdWellDrainedMm: 76.2, smdModeratelyDrainedMm: 76.2, smdPoorlyDrainedMm: 78.1, soilTemp10cmC: 17.638, maxAirTempC: 20.3, minAirTempC: 8.4 },
  { date: "2026-07-31", rainfallMm: 0.3, peMm: 3.1, evaporationMm: 4.3, smdWellDrainedMm: 76.9, smdModeratelyDrainedMm: 76.9, smdPoorlyDrainedMm: 78.8, soilTemp10cmC: 17.045, maxAirTempC: 19.8, minAirTempC: 7.8 },
];

/** Pulls out the right SMD column for a drainage class from one day's
 * Dunsany observation. */
export function smdForDrainage(day: DunsanyDailyObservation, drainage: Drainage): number {
  if (drainage === "well_drained") return day.smdWellDrainedMm;
  if (drainage === "moderately_drained") return day.smdModeratelyDrainedMm;
  return day.smdPoorlyDrainedMm;
}
