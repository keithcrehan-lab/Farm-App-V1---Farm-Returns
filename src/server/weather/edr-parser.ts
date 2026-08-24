/**
 * Parses a Met Éireann EDR `/locations/{id}` response into this app's
 * provider-independent `WeatherObservation[]` schema
 * (`src/domain/weather-observations.ts`).
 *
 * ✅ VERIFIED against two real, LIVE-fetched `observations-swob-nrt-60min`
 * responses (Athenry `0018`, Valentia `0102`; 2026-08-24 — see
 * `docs/evidence-register.md` and `ATHENRY_LIVE_HOURLY_REAL_RESPONSE` in
 * `edr-parser.real-fixtures.ts`). This supersedes the prior
 * externally-captured-fixture-only verification; `VALENTIA_EMPTY_REAL_RESPONSE`
 * stays below for its own distinct evidence — a genuine zero-observation
 * response on a *different* collection, `observations-swob-nrt-10min`.
 *
 * Real, evidence-driven findings from the live captures (not guesses):
 *  - Confirmed real parameter names for `observations-swob-nrt-60min`:
 *    `precipitation_amount` (rainfall, mm, real hourly total — resolves
 *    the previously-open rainfall-parameter-name gap), `air_temperature`
 *    (°C), `relative_humidity` (%RH), `wind_direction` (Deg), `air_pressure`
 *    (hPa), `grass_temperature` (°C), `soil_temperature_10cm` (°C). These
 *    are now each candidate list's FIRST entry in `EDR_PARAMETER_ALIASES`;
 *    the old best-guess names stay as later fallback candidates in case a
 *    different collection uses them (as `-10min` demonstrably does).
 *  - `wind_speed` is real and confirmed, but published in **knots**, not
 *    m/s — `parseEdrObservationsResponse` converts using the real,
 *    documented nautical-mile definition (never a guessed factor) and
 *    refuses to populate the field at all if a response's unit isn't
 *    recognised as "kts" or "m/s".
 *  - Met Éireann's own parameter `description.en` text documents `-99` as
 *    its missing-reading sentinel across many parameters ("-99 if no
 *    sensor") — real evidence from the API's own response, not this
 *    app's assumption. The parser now nulls out any raw value exactly
 *    equal to `-99` for every field.
 *  - Solar radiation remains DELIBERATELY UNMAPPED: the real parameters
 *    (`global_solar_radiation_energy`/`diffuse_solar_radiation_energy`)
 *    are hourly-total ENERGY in J/cm², not instantaneous POWER in W/m²
 *    the way `solarRadiationWM2` assumes — a genuine quantity mismatch,
 *    not just a unit mismatch, so no alias is added and no conversion is
 *    guessed (same standing rule the earlier Valentia aggregate-mismatch
 *    finding already established).
 *
 * `VALENTIA_EMPTY_REAL_RESPONSE`'s own finding stays true and unchanged:
 * a *different* collection (`-10min`) uses an entirely different naming
 * convention (`{quantity}_{max|min}` 10-minute aggregates) with no
 * rainfall parameter at all — confirming `EDR_PARAMETER_ALIASES` genuinely
 * needs multiple candidates per field rather than one fixed name, since
 * the real name is collection-specific.
 */

import "server-only";
import {
  classifyObservationFreshness,
  type WeatherObservation,
  WEATHER_OBSERVATION_SCHEMA_VERSION,
} from "@/domain/weather-observations";

/** A loose, permissive CoverageJSON `Coverage` shape — only the parts this
 * parser actually reads. Real responses may carry more fields.
 *
 * `parameters[key].unit` accepts both `symbol` and `label.en` — both are
 * legitimate per the CoverageJSON spec's own Parameter object, and the
 * one real Met Éireann response captured so far (Valentia,
 * `observations-swob-nrt-10min`) uses `label.en` (e.g.
 * `{"label": {"en": "hPa"}}`), not `symbol`. This was a genuine,
 * evidence-driven correction: the parser previously only read
 * `unit.symbol`, which that real response never populates. `symbol`
 * stays supported too, since the hand-built `ATHENRY_HOURLY_FIXTURE`
 * (a structurally-valid but not Met-Éireann-captured example) uses it,
 * and the spec permits either form. `custom` carries Met Éireann's own
 * non-standard station/collection/result-count metadata, observed only
 * in that one real response — every field optional, nothing assumed. */
export interface CoverageJsonResponse {
  type?: string;
  domain?: {
    type?: string;
    domainType?: string;
    axes?: {
      x?: { values?: number[] };
      y?: { values?: number[] };
      t?: { values?: string[] };
    };
    /** CoverageJSON's CRS/calendar declarations — not read by this
     * parser (no field here depends on a non-default CRS or calendar),
     * kept only so a real response's own `referencing` block doesn't
     * have to be stripped to satisfy this type. */
    referencing?: unknown[];
  };
  parameters?: Record<
    string,
    {
      type?: string;
      description?: { en?: string };
      unit?: { symbol?: string; label?: { en?: string } };
      observedProperty?: { label?: { en?: string } };
    }
  >;
  ranges?: Record<
    string,
    { type?: string; dataType?: string; axisNames?: string[]; shape?: number[]; values?: (number | null)[] }
  >;
  custom?: {
    collection_id?: string;
    station_id?: number | string;
    station_name?: string;
    parameter_names?: string[];
    /** Self/alternate links Met Éireann's response includes — not read
     * by this parser, kept only so a real response's own `links` array
     * doesn't have to be stripped to satisfy this type. */
    links?: unknown[];
    count_total?: number;
    numberReturned?: number;
    numberMatched?: number;
  };
}

/**
 * Candidate parameter keys per `WeatherObservation` field, most-likely
 * first. Each `WeatherObservation` field is populated from the first
 * candidate key actually present in the response's `ranges`; if none
 * match, the field stays `null` (never a guessed/fabricated value).
 *
 * The first entry in each list is now a REAL, live-confirmed Met Éireann
 * key for `observations-swob-nrt-60min` (see module doc comment) — every
 * later entry is a pre-verification best guess, kept only as a fallback
 * for a different collection that might use a different name (proven
 * necessary by `-10min`'s own, entirely different naming convention).
 * `solarRadiationWM2` has no confirmed key — see module doc comment for
 * why the two real solar parameters found are deliberately not aliased.
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
  rainfallMm: ["precipitation_amount", "rainfall", "precipitation", "rain_amount", "precip_amt"],
  airTemperatureC: ["air_temperature", "temperature", "temp"],
  relativeHumidityPct: ["relative_humidity", "humidity", "rhum"],
  windSpeedMps: ["wind_speed", "wdsp"],
  windDirectionDeg: ["wind_direction", "wddir"],
  pressureHPa: ["air_pressure", "pressure", "msl_pressure", "station_pressure"],
  solarRadiationWM2: ["solar_radiation", "global_radiation", "glorad"],
  soilTemperatureC: ["soil_temperature_10cm", "soil_temperature", "soil_temp_10cm"],
  grassTemperatureC: ["grass_temperature", "grass_min_temp"],
};

/**
 * Real, live-confirmed Met Éireann EDR parameter names for
 * `observations-swob-nrt-60min` (2026-08-24 live capture, Athenry &
 * Valentia) — passed as this app's own `parameter-name` request filter
 * (see `edr-client.ts`'s `EdrObservationsRequest.parameterNames`) so a
 * fetch only asks for the parameters this schema actually maps, instead
 * of every parameter the collection publishes. That matters concretely:
 * one real parameter, `present_weather_code_hour`, reports at ~1-minute
 * resolution even on this "hourly" collection and would otherwise blow
 * past the API's 2000-item single-page limit well before covering this
 * app's 7-day lookback window.
 */
export const DEFAULT_EDR_PARAMETER_NAMES = [
  "precipitation_amount",
  "air_temperature",
  "relative_humidity",
  "wind_speed",
  "wind_direction",
  "air_pressure",
  "grass_temperature",
  "soil_temperature_10cm",
] as const;

/**
 * Met Éireann's own parameter `description.en` text documents this
 * sentinel across many `observations-swob-nrt-60min` parameters (e.g.
 * "One minute average pressure at top of hour  -99 if no sensor") — real
 * evidence read directly from a live captured response, not this app's
 * assumption. Any raw range value exactly equal to this is a missing
 * reading, never a literal -99 measurement.
 */
export const EDR_MISSING_SENTINEL = -99;

function nullOutSentinel(value: number | null): number | null {
  return value === EDR_MISSING_SENTINEL ? null : value;
}

/** 1 international knot = 1852m / 3600s, exact by definition (not a
 * guessed conversion factor). Met Éireann's real `wind_speed` parameter
 * is published in knots (confirmed via a live captured response — see
 * module doc comment), while this app's schema field is `windSpeedMps`
 * (m/s). */
const KNOTS_TO_MPS = 1852 / 3600;

/**
 * Converts a matched wind-speed range's raw values to m/s using the
 * response's own declared unit. Refuses to populate the field at all
 * (all values null) if the unit isn't recognised as exactly "kts" or
 * already "m/s" — reporting a wrong-unit number as if it were m/s would
 * be exactly the kind of invented value this project refuses to produce.
 */
function convertWindSpeedToMps(values: (number | null)[], unit: string | null): (number | null)[] {
  if (unit === "kts") {
    return values.map((v) => (v === null ? null : Math.round(v * KNOTS_TO_MPS * 100) / 100));
  }
  if (unit === "m/s" || unit === "m s-1") {
    return values;
  }
  return values.map(() => null);
}

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
      const unit = parameters[matchedKey]?.unit?.label?.en ?? parameters[matchedKey]?.unit?.symbol ?? null;
      matchedUnits[field] = unit;
      const rawValues = (ranges[matchedKey].values ?? []).map(nullOutSentinel);
      fieldValues[field] = field === "windSpeedMps" ? convertWindSpeedToMps(rawValues, unit) : rawValues;
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

export interface CoverageMetadata {
  /** e.g. `"observations-swob-nrt-10min"` — from `custom.collection_id`. */
  collectionId: string | null;
  stationName: string | null;
  /**
   * Met Éireann's own EDR station id, exactly as this response
   * serialises it — a JSON NUMBER in the one real response captured so
   * far (`102` for Valentia), NOT the zero-padded string this app's
   * registry uses (`"0102"`, `MetEireannStation.edrStationId`). Kept
   * exactly as received here, never coerced — see
   * `normalizeEdrStationId` in `weather-stations.ts` to reconcile the
   * two representations where a caller actually needs to compare them.
   */
  stationIdRaw: number | string | null;
  /** From `domain.axes.x/y.values[0]` — `null` if either axis is absent
   * or empty, never defaulted to a fabricated coordinate. */
  coordinates: { longitude: number; latitude: number } | null;
  /** The response's own declared parameter keys (`Object.keys(parameters)`)
   * — real names as Met Éireann's API returns them, not this app's guessed
   * `EDR_PARAMETER_ALIASES`. */
  parameterNames: string[];
  resultCounts: { total: number | null; returned: number | null; matched: number | null };
}

/**
 * Reads the station/collection/coordinate/result-count metadata a real
 * Met Éireann EDR response carries outside `domain.axes.t`/`ranges` (the
 * only parts `parseEdrObservationsResponse` itself reads). Kept as a
 * separate function, not merged into `parseEdrObservationsResponse`,
 * because this metadata exists once per response while observations
 * exist once per timestamp — conflating them would force every
 * observation to carry duplicate station metadata for no reason. Never
 * throws; every field is `null`/empty on a response that doesn't carry it.
 */
export function extractCoverageMetadata(body: CoverageJsonResponse): CoverageMetadata {
  const x = body.domain?.axes?.x?.values?.[0];
  const y = body.domain?.axes?.y?.values?.[0];
  return {
    collectionId: body.custom?.collection_id ?? null,
    stationName: body.custom?.station_name ?? null,
    stationIdRaw: body.custom?.station_id ?? null,
    coordinates: typeof x === "number" && typeof y === "number" ? { longitude: x, latitude: y } : null,
    parameterNames: Object.keys(body.parameters ?? {}),
    resultCounts: {
      total: body.custom?.count_total ?? null,
      returned: body.custom?.numberReturned ?? null,
      matched: body.custom?.numberMatched ?? null,
    },
  };
}

// Re-exported so callers can assert the schema version they parsed against.
export { WEATHER_OBSERVATION_SCHEMA_VERSION };
