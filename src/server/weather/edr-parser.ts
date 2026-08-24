/**
 * Parses a Met Éireann EDR `/locations/{id}` response into this app's
 * provider-independent `WeatherObservation[]` schema
 * (`src/domain/weather-observations.ts`).
 *
 * Parser verified against externally captured real Met Éireann EDR
 * payload — NOT live runtime connectivity. A real CoverageJSON response
 * (`observations-swob-nrt-10min`, Valentia Observatory, empty result —
 * see `VALENTIA_EMPTY_REAL_RESPONSE` in `edr-parser.real-fixtures.ts`)
 * was captured externally and used to test this parser's envelope
 * handling: `type`/`domainType` recognition, `domain.axes.x/y`
 * coordinate extraction, `custom.*` station/collection/result-count
 * metadata (`extractCoverageMetadata` below), `parameters[key].unit`
 * label parsing, and a genuinely empty `domain.axes.t.values`/`ranges`
 * response (zero observations returned, not zero rainfall — see
 * `edr-parser.test.ts`'s "real Met Éireann response" tests). This
 * environment still cannot reach `opendata2.met.ie` itself — this
 * fixture was supplied to the project already captured, not fetched by
 * this runtime.
 *
 * What remains UNVERIFIED: the exact parameter key names Met Éireann's
 * own API uses for rainfall specifically. The one real response captured
 * so far (Valentia, `observations-swob-nrt-10min`) contains no rainfall
 * parameter at all — its 21 parameters are pressure/temperature/
 * humidity/soil-temperature/visibility aggregates, none named
 * `"rainfall"`/`"rain"`/`"precipitation"` or similar.
 * `EDR_PARAMETER_ALIASES` below still lists best-guess candidate keys
 * per field (unchanged, not guessed further from this response); this
 * MUST be checked against a real response that actually contains
 * rainfall before that field can be trusted. Until then, treat every
 * non-null field value this parser returns as provisional, and treat
 * `rainfallMm` in particular as entirely unverified — this real
 * response also incidentally shows the naming CONVENTION Met Éireann
 * uses is `{quantity}_{max|min}` 10-minute aggregates (e.g.
 * `air_pressure_max`), not the plain instantaneous names
 * `EDR_PARAMETER_ALIASES` guesses (e.g. `"pressure"`) — those aggregate
 * keys are deliberately NOT added as aliases here, since an aggregate
 * max/min is not obviously the same quantity this app's field names
 * assume (an instantaneous reading), and mapping one onto the other
 * without confirmation would be exactly the kind of invented parameter
 * mapping this project refuses to make.
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
      matchedUnits[field] = parameters[matchedKey]?.unit?.label?.en ?? parameters[matchedKey]?.unit?.symbol ?? null;
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
