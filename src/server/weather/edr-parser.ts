/**
 * Parses a Met Éireann EDR `/locations/{id}` response into this app's
 * provider-independent `WeatherObservation[]` schema
 * (`src/domain/weather-observations.ts`).
 *
 * ⚠️ UNVERIFIED IN CURRENT RUNTIME. The OGC EDR API standard's
 * `/locations` query response format is CoverageJSON (a real, public,
 * documented spec — https://covjson.org — used generally by EDR-
 * conformant APIs, not something specific to or invented for Met
 * Éireann). This parser is written against that standard's documented
 * `PointSeries` domain shape. What is NOT verified: the exact parameter
 * key names Met Éireann's own API uses inside `parameters`/`ranges`
 * (e.g. whether rainfall is keyed `"rainfall"`, `"precipitation"`,
 * `"PT1H_ACC"`, or something else — EDR/CoverageJSON only standardises
 * the envelope, not per-provider parameter naming). `EDR_PARAMETER_ALIASES`
 * below lists best-guess candidate keys per field; this MUST be checked
 * and corrected against a real captured response before this parser can
 * be trusted to actually populate any field. Until then, treat every
 * non-null value this parser returns as provisional.
 */

import "server-only";
import {
  classifyObservationFreshness,
  type WeatherObservation,
  WEATHER_OBSERVATION_SCHEMA_VERSION,
} from "@/domain/weather-observations";

/** A loose, permissive CoverageJSON `Coverage` shape — only the parts this
 * parser actually reads. Real responses may carry more fields. */
export interface CoverageJsonResponse {
  type?: string;
  domain?: {
    domainType?: string;
    axes?: {
      t?: { values?: string[] };
    };
  };
  parameters?: Record<string, { unit?: { symbol?: string }; observedProperty?: { label?: { en?: string } } }>;
  ranges?: Record<string, { axisNames?: string[]; shape?: number[]; values?: (number | null)[] }>;
}

/**
 * Best-guess candidate parameter keys per `WeatherObservation` field,
 * most-likely-first. UNVERIFIED — see module doc comment above. Each
 * `WeatherObservation` field is populated from the first candidate key
 * actually present in the response's `ranges`; if none match, the field
 * stays `null` (never a guessed/fabricated value).
 */
export const EDR_PARAMETER_ALIASES: Record<
  keyof Pick<
    WeatherObservation,
    | "rainfallMm"
    | "airTemperatureC"
    | "relativeHumidityPct"
    | "windSpeedMps"
    | "windDirectionDeg"
    | "pressureHPa"
    | "solarRadiationWM2"
    | "soilTemperatureC"
    | "grassTemperatureC"
  >,
  string[]
> = {
  rainfallMm: ["rainfall", "precipitation", "rain_amount", "precip_amt"],
  airTemperatureC: ["temperature", "air_temperature", "temp"],
  relativeHumidityPct: ["relative_humidity", "humidity", "rhum"],
  windSpeedMps: ["wind_speed", "wdsp"],
  windDirectionDeg: ["wind_direction", "wddir"],
  pressureHPa: ["pressure", "msl_pressure", "station_pressure"],
  solarRadiationWM2: ["solar_radiation", "global_radiation", "glorad"],
  soilTemperatureC: ["soil_temperature", "soil_temp_10cm"],
  grassTemperatureC: ["grass_temperature", "grass_min_temp"],
};

/** Which of the response's `ranges` keys, if any, matched each field —
 * useful for debugging/verifying once a real response is captured. Also
 * preserves each matched key's original unit symbol (as published in the
 * response's own `parameters` block) for traceability — this app's
 * `WeatherObservation` schema doesn't record units per field (it fixes
 * units by naming convention, e.g. `rainfallMm`), so without this, a
 * silent unit mismatch between what Met Éireann actually sent and what
 * this app assumed would be undetectable. */
export interface EdrParseDiagnostics {
  matchedKeys: Partial<Record<keyof typeof EDR_PARAMETER_ALIASES, string>>;
  matchedUnits: Partial<Record<keyof typeof EDR_PARAMETER_ALIASES, string | null>>;
  unmatchedRangeKeys: string[];
}

export interface EdrParseResult {
  observations: WeatherObservation[];
  diagnostics: EdrParseDiagnostics;
}

/**
 * Parses one station's CoverageJSON PointSeries response into a real
 * `WeatherObservation[]`, one per timestamp in `domain.axes.t.values`.
 * Never throws on a malformed/unexpected shape — returns an empty
 * observation list with diagnostics instead, so a live but
 * differently-shaped response degrades gracefully rather than crashing
 * the request.
 */
export function parseEdrObservationsResponse(
  body: CoverageJsonResponse,
  context: { stationId: string; stationName: string; source: string; retrievedAt: string },
): EdrParseResult {
  const times = body.domain?.axes?.t?.values ?? [];
  const ranges = body.ranges ?? {};
  const parameters = body.parameters ?? {};

  const matchedKeys: EdrParseDiagnostics["matchedKeys"] = {};
  const matchedUnits: EdrParseDiagnostics["matchedUnits"] = {};
  const fieldValues: Partial<Record<keyof typeof EDR_PARAMETER_ALIASES, (number | null)[]>> = {};

  for (const field of Object.keys(EDR_PARAMETER_ALIASES) as (keyof typeof EDR_PARAMETER_ALIASES)[]) {
    const candidateKeys = EDR_PARAMETER_ALIASES[field];
    const matchedKey = candidateKeys.find((key) => key in ranges);
    if (matchedKey) {
      matchedKeys[field] = matchedKey;
      matchedUnits[field] = parameters[matchedKey]?.unit?.symbol ?? null;
      fieldValues[field] = ranges[matchedKey].values ?? [];
    }
  }

  const matchedRangeKeys = new Set(Object.values(matchedKeys));
  const unmatchedRangeKeys = Object.keys(ranges).filter((key) => !matchedRangeKeys.has(key));

  const retrievedAtDate = new Date(context.retrievedAt);
  const observations: WeatherObservation[] = times.map((observedAt, i) => ({
    stationId: context.stationId,
    stationName: context.stationName,
    observedAt,
    rainfallMm: fieldValues.rainfallMm?.[i] ?? null,
    airTemperatureC: fieldValues.airTemperatureC?.[i] ?? null,
    relativeHumidityPct: fieldValues.relativeHumidityPct?.[i] ?? null,
    windSpeedMps: fieldValues.windSpeedMps?.[i] ?? null,
    windDirectionDeg: fieldValues.windDirectionDeg?.[i] ?? null,
    pressureHPa: fieldValues.pressureHPa?.[i] ?? null,
    solarRadiationWM2: fieldValues.solarRadiationWM2?.[i] ?? null,
    soilTemperatureC: fieldValues.soilTemperatureC?.[i] ?? null,
    grassTemperatureC: fieldValues.grassTemperatureC?.[i] ?? null,
    source: context.source,
    retrievedAt: context.retrievedAt,
    // Freshness of THIS observation as of the moment it was retrieved —
    // see WeatherObservation.dataStatus's doc comment for why this is
    // fixed at parse time rather than always recomputed against "now".
    dataStatus: classifyObservationFreshness(observedAt, retrievedAtDate),
  }));

  return { observations, diagnostics: { matchedKeys, matchedUnits, unmatchedRangeKeys } };
}

// Re-exported so callers can assert the schema version they parsed against.
export { WEATHER_OBSERVATION_SCHEMA_VERSION };
