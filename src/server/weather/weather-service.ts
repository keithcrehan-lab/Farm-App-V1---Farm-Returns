/**
 * Weather-observation service — composes the pipeline the user specified:
 *
 *   field coordinates → nearest verified station → Met Éireann station id
 *   → server-side EDR request → normalised WeatherObservation[]
 *   → (agronomic decision engines, e.g. spreading.ts, consume the result)
 *
 * Each stage is a separate module on purpose, so none of them needs to
 * change if another does:
 *   1. Station registry            — src/domain/weather-stations.ts
 *   2. Nearest-station matching    — src/domain/weather-stations.ts
 *      (nearest SUITABLE station — src/domain/weather-station-capability.ts
 *      — is a separate, capability-aware upgrade path; this service still
 *      uses plain nearest-station-by-distance since the real capability
 *      matrix is empty today — see that module's doc comment)
 *   3. Observation ingestion       — edr-client.ts + edr-parser.ts (this
 *                                    file composes them)
 *   4. Forecast ingestion          — forecast-provider.ts (stub only)
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
  nearestStationsForField,
  type MetEireannStation,
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
  name: string;
  edrStationId: string | null;
  distanceKm: number;
}

export interface WeatherForFieldResult {
  status: ObservationFreshness;
  station: WeatherServiceStationInfo | null;
  observations: WeatherObservation[];
  rollingRainfall: RollingRainfallWindow[];
  /** Populated whenever status is UNAVAILABLE/UNVERIFIED — always a real
   * reason (no station in range, no confirmed EDR id yet, or the
   * underlying fetch's own `reason`), never silently empty. */
  reason?: string;
  retrievedAt: string;
}

function unavailable(
  station: WeatherServiceStationInfo | null,
  reason: string,
  retrievedAt: string = new Date().toISOString(),
  status: "UNAVAILABLE" | "UNVERIFIED" = "UNAVAILABLE",
): WeatherForFieldResult {
  return { status, station, observations: [], rollingRainfall: [], reason, retrievedAt };
}

/**
 * The full pipeline for one field/farm. Never throws: every failure mode
 * (no station registered, no confirmed EDR id, network failure, parse
 * failure) resolves to a real `WeatherForFieldResult` with a real
 * `reason` — never fabricated data. `status` is `"UNVERIFIED"` rather
 * than `"UNAVAILABLE"` specifically when the failure matches this
 * sandboxed session's own known network-egress block (see
 * `edr-client.ts`'s `blockedByRuntime`) — everything else that can fail
 * (no station, no EDR id, a genuine upstream error, an empty parse)
 * stays `"UNAVAILABLE"`, since those would be real failure modes in any
 * runtime, not an artefact of this one.
 */
export async function getWeatherForField(
  entity: { centroid: [number, number] },
  options: { now?: Date; lookbackHours?: number; stations?: MetEireannStation[] } = {},
): Promise<WeatherForFieldResult> {
  const now = options.now ?? new Date();
  const lookbackHours = options.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
  const stations = options.stations ?? MET_EIREANN_STATIONS;

  const [nearest] = nearestStationsForField(entity, stations, 1);
  if (!nearest) {
    return unavailable(null, "No Met Éireann stations in the registry.", now.toISOString());
  }

  const stationInfo: WeatherServiceStationInfo = {
    id: nearest.station.id,
    name: nearest.station.name,
    edrStationId: nearest.station.edrStationId,
    distanceKm: nearest.distanceKm,
  };

  if (!nearest.station.edrStationId) {
    return unavailable(
      stationInfo,
      `No confirmed Met Éireann EDR station id for ${nearest.station.name} yet — see MET_EIREANN_EDR_STATION_ID_SOURCE.`,
      now.toISOString(),
    );
  }

  const toIso = now.toISOString();
  const fromIso = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000).toISOString();

  const fetchResult = await fetchEdrObservations({
    collection: OBSERVATIONS_COLLECTION,
    edrStationId: nearest.station.edrStationId,
    fromIso,
    toIso,
  });

  if (fetchResult.status === "unavailable") {
    return unavailable(
      stationInfo,
      fetchResult.reason,
      fetchResult.retrievedAt,
      fetchResult.blockedByRuntime ? "UNVERIFIED" : "UNAVAILABLE",
    );
  }

  const { observations } = parseEdrObservationsResponse(fetchResult.body as CoverageJsonResponse, {
    stationId: nearest.station.id,
    stationName: nearest.station.name,
    source: `Met Éireann EDR ${OBSERVATIONS_COLLECTION}`,
    retrievedAt: fetchResult.retrievedAt,
  });

  if (observations.length === 0) {
    return unavailable(stationInfo, "EDR response parsed but contained no observations.", fetchResult.retrievedAt);
  }

  const latest = observations[observations.length - 1];
  const status = classifyObservationFreshness(latest.observedAt, now);
  const rollingRainfall = calculateRollingRainfallTotals(observations, now, {
    stationId: nearest.station.id,
    source: `Met Éireann EDR ${OBSERVATIONS_COLLECTION}`,
    retrievedAt: fetchResult.retrievedAt,
  });

  return {
    status,
    station: stationInfo,
    observations,
    rollingRainfall,
    retrievedAt: fetchResult.retrievedAt,
  };
}
