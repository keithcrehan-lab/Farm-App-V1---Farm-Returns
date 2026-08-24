/**
 * Station capability evidence + capability-aware station selection.
 *
 * `weather-stations.ts`'s `nearestStation`/`nearestQueryableStation`
 * answer "which station is closest" and "which is closest AND has a
 * confirmed EDR id" — neither asks whether that station actually reports
 * the parameter a caller needs. This module adds that third, most
 * specific concept: `nearestSuitableStation`, built ONLY on real
 * capability evidence, never on an assumption that every station reports
 * every parameter.
 *
 * Two distinct evidence layers, kept deliberately separate so neither
 * overstates the other:
 *
 *  1. `MET_EIREANN_ARCHIVE_CATEGORY_EVIDENCE` — raw, real observation
 *     categories seen as folder names in Met Éireann's Open Observations
 *     Archive for a given station (e.g. Athenry has a real "Rain"
 *     directory; Valentia has "Rain", "Pressure", "Solar_Radiation",
 *     "Wind", "Present_Weather", "Ceilometer", "Suit_A", "Suit_B").
 *     This proves the category EXISTS for that station somewhere in Met
 *     Éireann's systems. It does NOT prove the EDR API serves it, under
 *     what parameter key, in what unit, or with what missing-value
 *     convention — none of that has been verified. `Suit_A`/`Suit_B` in
 *     particular carry no known agronomic or scientific meaning and are
 *     recorded as opaque category names only, never interpreted.
 *  2. `MET_EIREANN_STATION_CAPABILITIES` — this app's own
 *     `WeatherParameter`-typed capability matrix, derived from (1) only
 *     where the archive category unambiguously corresponds to one of
 *     this app's parameters (Rain→rainfallMm, Wind→windSpeedMps/
 *     windDirectionDeg, Pressure→pressureHPa, Solar_Radiation→
 *     solarRadiationWM2). Every such derived entry is `"ARCHIVE_PRESENT"`
 *     — never `"VERIFIED"`, since the exact EDR parameter key and unit
 *     remain unconfirmed (see `src/server/weather/edr-parser.ts`).
 *     `Present_Weather`/`Ceilometer`/`Suit_A`/`Suit_B` have no
 *     WeatherParameter equivalent today and are deliberately NOT mapped
 *     into this matrix.
 *
 * ⚠️ No entry in either structure has ever been confirmed against a real
 * EDR response (this environment cannot reach `opendata2.met.ie` — see
 * `src/server/weather/edr-client.ts`). "ARCHIVE_PRESENT" is real evidence
 * from a real, externally-inspected archive, but it is evidence of
 * existence, not of exact retrieval format — treat it accordingly.
 */

import {
  MET_EIREANN_STATIONS,
  nearestQueryableStations,
  nearestStations,
  type MetEireannStation,
  type StationDistance,
} from "./weather-stations";

/** Mirrors `WeatherObservation`'s real-valued fields — the parameters a
 * station could plausibly be confirmed to report. */
export type WeatherParameter =
  | "rainfallMm"
  | "airTemperatureC"
  | "relativeHumidityPct"
  | "windSpeedMps"
  | "windDirectionDeg"
  | "pressureHPa"
  | "solarRadiationWM2"
  | "soilTemperatureC"
  | "grassTemperatureC";

/**
 * - `"VERIFIED"`: confirmed against a real EDR response or official
 *   Met Éireann documentation of the exact parameter key/unit. No entry
 *   anywhere in this app is at this level yet.
 * - `"ARCHIVE_PRESENT"`: a real Open Observations Archive category
 *   exists for this station, unambiguously corresponding to this
 *   parameter — real evidence the data exists, not that its EDR
 *   retrieval format is known.
 * - `"UNVERIFIED"`: no evidence either way.
 * - `"NOT_AVAILABLE"`: positively confirmed that this station does not
 *   report this parameter (not currently used anywhere — no source has
 *   confirmed a negative yet — but distinct from "UNVERIFIED" so a
 *   future real negative doesn't have to overload that state).
 */
export type CapabilityState = "VERIFIED" | "ARCHIVE_PRESENT" | "UNVERIFIED" | "NOT_AVAILABLE";

export interface StationCapability {
  stationId: string;
  parameter: WeatherParameter;
  state: CapabilityState;
  /** How this was confirmed — e.g. a documentation URL or a description
   * of the real archive evidence. `null` when `state` is "UNVERIFIED". */
  verifiedVia: string | null;
  verifiedAt: string | null;
}

// ---------------------------------------------------------------------------
// Layer 1: raw archive category evidence (real, externally inspected).
// ---------------------------------------------------------------------------

/** Real Open Observations Archive category directory names — recorded
 * verbatim, not reinterpreted. */
export type ArchiveCategory =
  | "Rain"
  | "Pressure"
  | "Solar_Radiation"
  | "Wind"
  | "Present_Weather"
  | "Ceilometer"
  | "Suit_A"
  | "Suit_B";

export interface ArchiveCategoryEvidence {
  stationId: string;
  category: ArchiveCategory;
  /** Real evidence this category exists for this station — a described
   * archive filename/listing, not a fabricated citation. */
  evidence: string;
  verifiedAt: string;
}

/**
 * Real archive category evidence supplied for Athenry, Claremorris and
 * Valentia. No other station has any archive category evidence recorded
 * — absence here means "not yet inspected," not "confirmed absent."
 */
export const MET_EIREANN_ARCHIVE_CATEGORY_EVIDENCE: ArchiveCategoryEvidence[] = [
  {
    stationId: "athenry",
    category: "Rain",
    evidence:
      "Official Met Éireann Athenry Rain archive filename: 20260517113038_69561926_202605171130_99_Rain_A_0018_K.CR3",
    verifiedAt: "2026-08-24",
  },
  {
    stationId: "claremorris",
    category: "Wind",
    evidence:
      "Official Met Éireann Claremorris Wind archive filenames: 20260527043032_32451526_202605270430_01_Wind_A_0103_K.CR3, 20260527043034_07222926_202605270430_60_Wind_A_0103_K.CR3",
    verifiedAt: "2026-08-24",
  },
  ...(["Rain", "Pressure", "Solar_Radiation", "Wind", "Present_Weather", "Ceilometer", "Suit_A", "Suit_B"] as const).map(
    (category): ArchiveCategoryEvidence => ({
      stationId: "valentia",
      category,
      evidence: "Real Valentia Open Observations Archive category directory listing.",
      verifiedAt: "2026-08-24",
    }),
  ),
];

/** Archive categories that unambiguously correspond to one of this app's
 * `WeatherParameter`s — used to derive `ARCHIVE_PRESENT` capability
 * entries in Layer 2. `Present_Weather`/`Ceilometer`/`Suit_A`/`Suit_B`
 * are deliberately absent: no known, confirmed correspondence. */
const ARCHIVE_CATEGORY_TO_PARAMETERS: Partial<Record<ArchiveCategory, WeatherParameter[]>> = {
  Rain: ["rainfallMm"],
  Pressure: ["pressureHPa"],
  Solar_Radiation: ["solarRadiationWM2"],
  Wind: ["windSpeedMps", "windDirectionDeg"],
};

// ---------------------------------------------------------------------------
// Layer 2: this app's own WeatherParameter capability matrix, derived
// from Layer 1 only where the correspondence is unambiguous.
// ---------------------------------------------------------------------------

function deriveCapabilitiesFromArchiveEvidence(): Record<string, Partial<Record<WeatherParameter, StationCapability>>> {
  const result: Record<string, Partial<Record<WeatherParameter, StationCapability>>> = {};
  for (const evidence of MET_EIREANN_ARCHIVE_CATEGORY_EVIDENCE) {
    const parameters = ARCHIVE_CATEGORY_TO_PARAMETERS[evidence.category];
    if (!parameters) continue; // Present_Weather/Ceilometer/Suit_A/Suit_B: no mapping, deliberately skipped.
    result[evidence.stationId] ??= {};
    for (const parameter of parameters) {
      result[evidence.stationId][parameter] = {
        stationId: evidence.stationId,
        parameter,
        state: "ARCHIVE_PRESENT",
        verifiedVia: evidence.evidence,
        verifiedAt: evidence.verifiedAt,
      };
    }
  }
  return result;
}

/**
 * Real capability data, keyed by station id then parameter. Derived
 * entirely from `MET_EIREANN_ARCHIVE_CATEGORY_EVIDENCE` above — no entry
 * here is "VERIFIED"; every entry present is "ARCHIVE_PRESENT". Every
 * other station/parameter combination is absent (equivalent to
 * "UNVERIFIED" — see `capabilityFor`).
 */
export const MET_EIREANN_STATION_CAPABILITIES: Record<string, Partial<Record<WeatherParameter, StationCapability>>> =
  deriveCapabilitiesFromArchiveEvidence();

export function capabilityFor(
  stationId: string,
  parameter: WeatherParameter,
  capabilities: Record<string, Partial<Record<WeatherParameter, StationCapability>>> = MET_EIREANN_STATION_CAPABILITIES,
): StationCapability {
  return (
    capabilities[stationId]?.[parameter] ?? { stationId, parameter, state: "UNVERIFIED", verifiedVia: null, verifiedAt: null }
  );
}

/** States considered strong enough evidence to route a query to this
 * station for this parameter by default — both real evidence tiers.
 * Pass a narrower list (e.g. `["VERIFIED"]`) for a stricter search. */
export const DEFAULT_SUITABLE_STATES: CapabilityState[] = ["VERIFIED", "ARCHIVE_PRESENT"];

export function isSuitableState(state: CapabilityState, acceptableStates: CapabilityState[] = DEFAULT_SUITABLE_STATES): boolean {
  return acceptableStates.includes(state);
}

// ---------------------------------------------------------------------------
// Capability-aware selection.
// ---------------------------------------------------------------------------

export interface SuitableStationResult extends StationDistance {
  capability: StationCapability;
}

export interface StationCapabilityOptions {
  stations?: MetEireannStation[];
  capabilities?: Record<string, Partial<Record<WeatherParameter, StationCapability>>>;
  /** Capability states accepted as "suitable" — defaults to both real
   * evidence tiers (`DEFAULT_SUITABLE_STATES`). Pass `["VERIFIED"]` to
   * require full confirmation only. */
  acceptableStates?: CapabilityState[];
}

/**
 * Nearest QUERYABLE station (has a confirmed `edrStationId`) with
 * suitable capability evidence for `parameter` — never assumed. Walks
 * every queryable station within range (not just the closest), so an
 * unsuitable near station never blocks a suitable farther one. Returns
 * `null` if none qualifies, rather than silently falling back to the
 * nearest station regardless of whether it can answer the question.
 */
export function nearestSuitableStation(
  point: { latitude: number; longitude: number },
  parameter: WeatherParameter,
  options: StationCapabilityOptions = {},
): SuitableStationResult | null {
  const stations = options.stations ?? MET_EIREANN_STATIONS;
  const capabilities = options.capabilities ?? MET_EIREANN_STATION_CAPABILITIES;
  const acceptableStates = options.acceptableStates ?? DEFAULT_SUITABLE_STATES;

  const ranked = nearestQueryableStations(point, stations, stations.length);
  for (const candidate of ranked) {
    const capability = capabilityFor(candidate.station.id, parameter, capabilities);
    if (isSuitableState(capability.state, acceptableStates)) {
      return { ...candidate, capability };
    }
  }
  return null;
}

/** Same as `nearestSuitableStation`, but resolving from a field/farm's
 * real `[longitude, latitude]` centroid. */
export function nearestSuitableStationForField(
  entity: { centroid: [number, number] },
  parameter: WeatherParameter,
  options: StationCapabilityOptions = {},
): SuitableStationResult | null {
  const [longitude, latitude] = entity.centroid;
  return nearestSuitableStation({ latitude, longitude }, parameter, options);
}

/**
 * Full, explainable station selection: all three nearest-station
 * concepts together, plus whether picking a suitable station required
 * falling back past the geographically nearest one. Built for exactly
 * the scenario the spec describes: a field's nearest physical station
 * (say, Ballyhaise) has no confirmed EDR id, so the real queryable/
 * suitable answer comes from farther down the ranked list — this result
 * makes that explicit rather than silently substituting one station for
 * another.
 */
export interface StationSelectionResult {
  nearestGeographicStation: StationDistance | null;
  nearestQueryableStation: StationDistance | null;
  nearestSuitableStation: SuitableStationResult | null;
  /** True when `nearestQueryableStation`'s id differs from
   * `nearestGeographicStation`'s — i.e. the geographically closest
   * station could not be used and a farther one had to be queried
   * instead. `false` whenever no queryable station exists at all, since
   * nothing was actually substituted. */
  fallbackUsed: boolean;
}

export function selectStationForParameter(
  point: { latitude: number; longitude: number },
  parameter: WeatherParameter,
  options: StationCapabilityOptions = {},
): StationSelectionResult {
  const stations = options.stations ?? MET_EIREANN_STATIONS;
  const [geographic] = nearestStations(point, stations, 1);
  const [queryable] = nearestQueryableStations(point, stations, 1);
  const suitable = nearestSuitableStation(point, parameter, options);

  return {
    nearestGeographicStation: geographic ?? null,
    nearestQueryableStation: queryable ?? null,
    nearestSuitableStation: suitable,
    fallbackUsed: Boolean(queryable && geographic && queryable.station.id !== geographic.station.id),
  };
}

export function selectStationForField(
  entity: { centroid: [number, number] },
  parameter: WeatherParameter,
  options: StationCapabilityOptions = {},
): StationSelectionResult {
  const [longitude, latitude] = entity.centroid;
  return selectStationForParameter({ latitude, longitude }, parameter, options);
}
