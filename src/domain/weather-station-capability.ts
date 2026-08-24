/**
 * Station capability matrix + capability-aware station selection.
 *
 * `weather-stations.ts`'s `nearestStation` answers "which station is
 * geographically closest" — nothing more. That is not always the right
 * question: if a field needs rainfall data and the geographically
 * nearest station doesn't report rainfall, silently returning it anyway
 * would hand a caller a station that can't actually answer what it
 * asked for. This module adds `nearestSuitableStation`, which answers
 * "which station is closest AND confirmed to report the parameter I
 * need" — built on VERIFIED capability data only, never on an assumption
 * that every station reports every parameter.
 *
 * ⚠️ The real capability matrix (`MET_EIREANN_STATION_CAPABILITIES`) is
 * currently EMPTY. This environment has never completed a real request
 * against Met Éireann's EDR API (see `src/server/weather/edr-client.ts`),
 * so there is no real evidence for which station reports which
 * parameter — not even for Athenry, whose station id is confirmed but
 * whose actual reported parameters are not. Populating this matrix for
 * real requires either a real EDR response per station (its `parameters`
 * block lists what it reports) or official Met Éireann documentation.
 * Until then, `nearestSuitableStation` correctly returns `null` for
 * every real call — that is the honest, tested behaviour, not a bug.
 */

import { MET_EIREANN_STATIONS, nearestStations, type MetEireannStation, type StationDistance } from "./weather-stations";

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

export interface StationCapability {
  stationId: string;
  parameter: WeatherParameter;
  /** `true`/`false` only once confirmed against a real Met Éireann
   * response or official documentation — `null` means "not yet
   * verified," never treated as "unavailable" by `nearestSuitableStation`
   * (an unverified parameter must not silently fail a station out; it
   * must be reported as unknown so the gap is visible). */
  available: boolean | null;
  /** How this was confirmed — e.g. "EDR response 2026-08-24" or a
   * documentation URL. `null` until `available` is non-null. */
  verifiedVia: string | null;
  verifiedAt: string | null;
}

/**
 * Real capability data, keyed by station id then parameter. Empty today
 * — see the module doc comment above. Structured as a lookup (not an
 * array) so `capabilityFor` stays O(1) as real entries are added.
 */
export const MET_EIREANN_STATION_CAPABILITIES: Record<string, Partial<Record<WeatherParameter, StationCapability>>> = {};

export function capabilityFor(stationId: string, parameter: WeatherParameter): StationCapability | null {
  return MET_EIREANN_STATION_CAPABILITIES[stationId]?.[parameter] ?? null;
}

/** `true` only when a real, confirmed entry says so — `false` for both
 * "confirmed unavailable" and "not yet verified," since neither is a
 * green light to route a request to this station for this parameter. */
export function isConfirmedAvailable(stationId: string, parameter: WeatherParameter): boolean {
  return capabilityFor(stationId, parameter)?.available === true;
}

export interface SuitableStationResult extends StationDistance {
  capability: StationCapability;
}

/**
 * Nearest station to `point` with a CONFIRMED (`available: true`)
 * capability for `parameter`, drawn only from `capabilities` — never
 * assumed. Returns `null` if no station in `stations` has verified
 * support, rather than silently falling back to the geographically
 * nearest station regardless of whether it can answer the question.
 * Checks every station within range (not just the closest one), so an
 * unverified or unsuitable near station never blocks a suitable farther
 * one from being found.
 */
export function nearestSuitableStation(
  point: { latitude: number; longitude: number },
  parameter: WeatherParameter,
  options: {
    stations?: MetEireannStation[];
    capabilities?: Record<string, Partial<Record<WeatherParameter, StationCapability>>>;
  } = {},
): SuitableStationResult | null {
  const stations = options.stations ?? MET_EIREANN_STATIONS;
  const capabilities = options.capabilities ?? MET_EIREANN_STATION_CAPABILITIES;

  const ranked = nearestStations(point, stations, stations.length);
  for (const candidate of ranked) {
    const capability = capabilities[candidate.station.id]?.[parameter];
    if (capability?.available === true) {
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
  options: Parameters<typeof nearestSuitableStation>[2] = {},
): SuitableStationResult | null {
  const [longitude, latitude] = entity.centroid;
  return nearestSuitableStation({ latitude, longitude }, parameter, options);
}
