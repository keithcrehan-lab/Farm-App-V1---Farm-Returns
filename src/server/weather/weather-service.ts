/**
 * Weather-observation service — composes the pipeline the user specified:
 *
 *   field coordinates → nearest geographic station → nearest QUERYABLE
 *   station (confirmed EDR id — falls back past an unqueryable nearer
 *   station rather than giving up, per spec) → server-side EDR request
 *   → normalised WeatherObservation[] → (agronomic decision engines,
 *   e.g. spreading.ts, consume the result)
 *
 * Each stage is a separate module on purpose, so none of them needs to
 * change if another does:
 *   1. Station registry            — src/domain/weather-stations.ts
 *   2. Station selection           — src/domain/weather-stations.ts
 *      (nearestStationsForField / nearestQueryableStationsForField).
 *      Parameter-specific SUITABLE-station selection —
 *      src/domain/weather-station-capability.ts — is a further,
 *      capability-aware layer this service doesn't use yet: fetching a
 *      station's full observation set isn't tied to one parameter the
 *      way a single-parameter query would be.
 *   3. Observation ingestion       — edr-client.ts + edr-parser.ts (this
 *                                    file composes them)
 *   4. Forecast ingestion          — forecast-provider.ts (stub only,
 *                                    deliberately not started this pass)
 *   5. Weather normalisation       — src/domain/weather-observations.ts
 *   6. Agronomic rules             — src/domain/spreading.ts (not yet
 *                                    wired to this service — see its own
 *                                    doc comment)
 *   7. UI presentation             — not yet built on top of this
 *
 * ⚠️ LIVE API CONNECTION: UNVERIFIED IN CURRENT RUNTIME. Every function
 * below is real, type-checked, and unit-tested against mocked/fixture
 * data — but a real request from this exact pipeline (see
 * `edr-client.ts`'s doc comment) was answered by this sandboxed session's
 * own network-egress proxy, not by Met Éireann's server. No function here
 * has ever completed a real request against the live API. Do not present
 * this integration as "live" or "working" until a real request succeeds
 * and its response is parsed from a runtime that can reach the host.
 * Today, calling this correctly and honestly returns `status:
 * "UNVERIFIED"` when the known runtime block is detected (or
 * `"UNAVAILABLE"` for any other real failure mode) — that is the
 * intended, tested, graceful-degradation behaviour, not a bug to route
 * around.
 */

import "server-only";
import {
  MET_EIREANN_STATIONS,
  nearestQueryableStationsForField,
  nearestStationsForField,
  type MetEireannStation,
  type StationDistance,
} from "@/domain/weather-stations";
import {
  calculateRollingRainfallTotals,
  classifyObservationFreshness,
  type ObservationFreshness,
  type RollingRainfallWindow,
  type WeatherObservation,
} from "@/domain/weather-observations";
import { fetchEdrObservations } from "./edr-client";
import { parseEdrObservationsResponse, type CoverageJsonResponse } from "./edr-parser";

/** Per the user's explicit instruction: start with this collection. */
export const OBSERVATIONS_COLLECTION = "observations-swob-nrt-60min";

/** Covers the widest rolling-rainfall window this app defines (7 days). */
export const DEFAULT_LOOKBACK_HOURS = 168;

export interface WeatherServiceStationInfo {
  id: string;
  canonicalName: string;
  edrStationId: string | null;
  distanceKm: number;
}

export interface WeatherForFieldResult {
  status: ObservationFreshness;
  station: WeatherServiceStationInfo | null;
  /** The geographically nearest station, always reported when known —
   * even when `station` above is a farther, queryable fallback. Lets a
   * caller see and explain a fallback rather than have it happen
   * silently (spec: "record nearestGeographicStation, fallbackUsed"). */
  nearestGeographicStation: WeatherServiceStationInfo | null;
  /** True when `station` is not the geographically nearest one — i.e. a
   * confirmed-queryable station farther away had to be used instead of
   * an unqueryable nearer one. */
  fallbackUsed: boolean;
  observations: WeatherObservation[];
  rollingRainfall: RollingRainfallWindow[];
  /** Populated whenever status is UNAVAILABLE/UNVERIFIED — always a real
   * reason (no station in range, no confirmed EDR id yet, or the
   * underlying fetch's own `reason`), never silently empty. */
  reason?: string;
  retrievedAt: string;
}

function toStationInfo(nearest: StationDistance): WeatherServiceStationInfo {
  return {
    id: nearest.station.id,
    canonicalName: nearest.station.canonicalName,
    edrStationId: nearest.station.edrStationId,
    distanceKm: nearest.distanceKm,
  };
}

function unavailable(
  station: WeatherServiceStationInfo | null,
  nearestGeographicStation: WeatherServiceStationInfo | null,
  reason: string,
  retrievedAt: string = new Date().toISOString(),
  status: "UNAVAILABLE" | "UNVERIFIED" = "UNAVAILABLE",
): WeatherForFieldResult {
  return {
    status,
    station,
    nearestGeographicStation,
    fallbackUsed: Boolean(station && nearestGeographicStation && station.id !== nearestGeographicStation.id),
    observations: [],
    rollingRainfall: [],
    reason,
    retrievedAt,
  };
}

/**
 * The full pipeline for one field/farm. Never throws: every failure mode
 * (no station registered, no queryable station in range, network
 * failure, parse failure) resolves to a real `WeatherForFieldResult`
 * with a real `reason` — never fabricated data. `status` is
 * `"UNVERIFIED"` rather than `"UNAVAILABLE"` specifically when the
 * failure matches this sandboxed session's own known network-egress
 * block (see `edr-client.ts`'s `blockedByRuntime`) — everything else
 * that can fail (no station, no queryable station, a genuine upstream
 * error, an empty parse) stays `"UNAVAILABLE"`, since those would be
 * real failure modes in any runtime, not an artefact of this one.
 *
 * Falls back past the geographically nearest station when it has no
 * confirmed EDR id, walking the full ranked list for one that does —
 * never silently; `fallbackUsed`/`nearestGeographicStation` on the
 * result make that explicit.
 */
export async function getWeatherForField(
  entity: { centroid: [number, number] },
  options: { now?: Date; lookbackHours?: number; stations?: MetEireannStation[] } = {},
): Promise<WeatherForFieldResult> {
  const now = options.now ?? new Date();
  const lookbackHours = options.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
  const stations = options.stations ?? MET_EIREANN_STATIONS;

  const [geographic] = nearestStationsForField(entity, stations, 1);
  const geographicInfo = geographic ? toStationInfo(geographic) : null;

  if (!geographic) {
    return unavailable(null, null, "No Met Éireann stations with known coordinates in range.", now.toISOString());
  }

  const [queryable] = nearestQueryableStationsForField(entity, stations, 1);
  if (!queryable) {
    return unavailable(
      null,
      geographicInfo,
      `No station with a confirmed Met Éireann EDR id found for this field — nearest geographic station (${geographic.station.canonicalName}) has none, and none of the other registered stations do either. See MET_EIREANN_EDR_STATION_ID_SOURCE.`,
      now.toISOString(),
    );
  }

  const stationInfo = toStationInfo(queryable);
  // edrStationId is guaranteed non-null here — that's exactly what
  // nearestQueryableStationsForField filters on.
  const edrStationId = queryable.station.edrStationId as string;

  const toIso = now.toISOString();
  const fromIso = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000).toISOString();

  const fetchResult = await fetchEdrObservations({
    collection: OBSERVATIONS_COLLECTION,
    edrStationId,
    fromIso,
    toIso,
  });

  if (fetchResult.status === "unavailable") {
    return unavailable(
      stationInfo,
      geographicInfo,
      fetchResult.reason,
      fetchResult.retrievedAt,
      fetchResult.blockedByRuntime ? "UNVERIFIED" : "UNAVAILABLE",
    );
  }

  const { observations } = parseEdrObservationsResponse(fetchResult.body as CoverageJsonResponse, {
    stationId: queryable.station.id,
    stationName: queryable.station.canonicalName,
    source: `Met Éireann EDR ${OBSERVATIONS_COLLECTION}`,
    retrievedAt: fetchResult.retrievedAt,
  });

  if (observations.length === 0) {
    return unavailable(
      stationInfo,
      geographicInfo,
      "EDR response parsed but contained no observations.",
      fetchResult.retrievedAt,
    );
  }

  const latest = observations[observations.length - 1];
  const status = classifyObservationFreshness(latest.observedAt, now);
  const rollingRainfall = calculateRollingRainfallTotals(observations, now, {
    stationId: queryable.station.id,
    source: `Met Éireann EDR ${OBSERVATIONS_COLLECTION}`,
    retrievedAt: fetchResult.retrievedAt,
  });

  return {
    status,
    station: stationInfo,
    nearestGeographicStation: geographicInfo,
    fallbackUsed: stationInfo.id !== geographicInfo!.id,
    observations,
    rollingRainfall,
    retrievedAt: fetchResult.retrievedAt,
  };
}
