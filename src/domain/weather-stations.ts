/**
 * Met Éireann weather-station registry + nearest-station selection engine —
 * Phase 5 (spec §10), the missing piece flagged in `spreading.ts` and
 * README.md's "Is this connectable to live data?" note: every field
 * already carries a real `mappedSoil.drainage` class, but nothing mapped
 * each field to *which* Met Éireann station/grid source should feed it.
 *
 * The registry below was supplied directly by the user, confirmed against
 * Met Éireann's own published sources (not derived, estimated, or
 * cross-checked against a live feed in this session — network access to
 * met.ie is unavailable here, see README.md). Per the user's explicit
 * instruction it is treated as evidence class A-OFFICIAL,
 * `verificationStatus: "confirmed"` throughout — every field lists the
 * same two source citations rather than repeating them 25 times, in
 * `MET_EIREANN_STATION_REGISTRY_SOURCE` below.
 *
 * Deliberate separation (so a later real observation feed never requires
 * rewriting this file): this module is the STATION-SELECTION layer only —
 * station identity, coordinates, and "which station is nearest to this
 * field" geometry. It carries no weather observations of its own. The
 * only real observations anywhere in this app are `spreading.ts`'s
 * `DUNSANY_VALIDATION_SERIES` — 92 real days from ONE station (Dunsany),
 * explicitly a historical validation dataset, not a live feed, and not
 * automatically the "nearest station" result for any particular field.
 * No station in `MET_EIREANN_STATIONS` below has any observation data
 * wired to it yet; connecting one is a separate, future integration.
 *
 * Once a live feed exists, `nearestStationForField`'s result (a station
 * id) is what would key it — designed to serve every consumer the user
 * named as eventually needing it: rainfall history/forecast, soil
 * -temperature logic, slurry/fertiliser spreading suitability, field
 * trafficability, grass-growth modelling, grazing/silage-cutting
 * conditions, and weather warnings/alerts.
 *
 * That live feed is now underway, not just planned: `src/server/weather/`
 * implements a server-side Met Éireann EDR client + parser +
 * observation-ingestion service on top of this module, keyed by each
 * station's `edrStationId`. Only Athenry's id is populated — every other
 * station still needs its real EDR id retrieved (not guessed) from Met
 * Éireann's own metadata endpoint. See `weather-service.ts`'s doc comment
 * for the current, honestly-labelled state of that integration.
 */

export const WEATHER_STATION_ENGINE_VERSION = "weather_station_engine_v1.0.0";

export const MET_EIREANN_STATION_REGISTRY_SOURCE = {
  sourceOrganisation: "Met Éireann",
  primarySourceUrl: "https://www.met.ie/climate/weather-observing-stations",
  supportingSource:
    "Met Éireann Technical Note No. 68 — Estimation of Point Rainfall Frequencies in Ireland, 2023",
  evidenceClass: "A-OFFICIAL",
  verificationStatus: "confirmed" as const,
  /** Date this registry was supplied to and confirmed for Farm Return —
   * not a claim about when Met Éireann itself published these figures. */
  sourceDate: "2026-08-24",
  datasetVersion: "met_eireann_station_registry_v1",
  /** Met Éireann's own count for this network, per the user's brief —
   * a cross-check that nothing was dropped or duplicated below. */
  officialStationCount: 25,
} as const;

export interface MetEireannStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationM: number;
  /**
   * Met Éireann's own EDR API location identifier for this station (e.g.
   * `"0018"` for Athenry) — required to query
   * `opendata2.met.ie/edr/collections/{collection}/locations/{edrStationId}`
   * for real observations (see `src/server/weather/`).
   *
   * `null` where not yet retrieved. Per explicit instruction, these are
   * NOT guessed: only Athenry's id is populated, because the user
   * supplied it directly as a confirmed, documented example. Every other
   * station's real id must come from Met Éireann's own EDR
   * metadata/locations endpoint — this environment cannot reach
   * `opendata2.met.ie` to retrieve them (see
   * `MET_EIREANN_EDR_STATION_ID_SOURCE` below and README.md).
   */
  edrStationId: string | null;
  /**
   * EDR observation collections this station is confirmed to report
   * through, e.g. `["observations-swob-nrt-60min"]`. `null` — not `[]`
   * — where unverified: an empty array would wrongly claim "confirmed to
   * report nothing." Must come from Met Éireann's own EDR collection
   * metadata, never guessed from this app's own expectations.
   */
  collections: string[] | null;
  /**
   * Whether Met Éireann's own metadata confirms this station as
   * currently operational. `null` where unverified — appearing in this
   * registry is not itself evidence of being active today (Met Éireann's
   * published station list may include historical/decommissioned sites).
   */
  active: boolean | null;
  /**
   * ISO date this station's EDR-specific fields (`edrStationId`,
   * `collections`, `active`) were last checked against an official Met
   * Éireann source. `null` where nothing beyond the base
   * name/latitude/longitude/elevation (covered by
   * `MET_EIREANN_STATION_REGISTRY_SOURCE`) has been verified.
   */
  verifiedAt: string | null;
}

export const MET_EIREANN_EDR_STATION_ID_SOURCE = {
  sourceOrganisation: "Met Éireann",
  documentationUrl: "https://opendata2.met.ie/edr/docs",
  confirmedExample: {
    stationId: "athenry",
    edrStationId: "0018",
    confirmedVia:
      "https://opendata2.met.ie/edr/collections/observations-swob-nrt-60min/locations/0018?datetime=2026-04-23T00:00:00Z/2026-04-24T00:00:00Z",
  },
  evidenceClass: "A-OFFICIAL",
  /** "confirmed" only for the one example above — every other station's
   * edrStationId is `null` (not "unconfirmed": there is no guessed value
   * to distrust, there simply isn't one yet). */
  verificationStatus: "partially_confirmed" as const,
  sourceDate: "2026-08-24",
  note:
    "The remaining 24 stations' EDR location ids must be retrieved from Met Éireann's own EDR metadata/locations endpoint, not guessed. This environment's outbound network access to opendata2.met.ie is proxy-denied (confirmed) — see src/server/weather/edr-client.ts and README.md.",
} as const;

/**
 * The 25 synoptic weather-observing stations Met Éireann publishes daily
 * data for. Confirmed, A-OFFICIAL — see `MET_EIREANN_STATION_REGISTRY_SOURCE`
 * above for full provenance. Deliberately carries no `county` field: per
 * spec, nearest-station selection must use real geographic distance, not
 * county-boundary matching, and this shape makes that the only option.
 */
// Every station below is unverified for collections/active (`null`) except
// noted: only Athenry's edrStationId is confirmed (see
// MET_EIREANN_EDR_STATION_ID_SOURCE), and even for Athenry, "which
// collections" and "is it active" are NOT confirmed — a station id being
// known is not evidence of its reporting capability or operational status.
export const MET_EIREANN_STATIONS: MetEireannStation[] = [
  { id: "athenry", name: "Athenry", latitude: 53.289167, longitude: -8.785556, elevationM: 40, edrStationId: "0018", collections: null, active: null, verifiedAt: "2026-08-24" },
  { id: "ballyhaise", name: "Ballyhaise", latitude: 54.051389, longitude: -7.309722, elevationM: 78, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "belmullet", name: "Belmullet", latitude: 54.2275, longitude: -10.006944, elevationM: 9, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "carlow_oak_park", name: "Carlow Oak Park", latitude: 52.861111, longitude: -6.915278, elevationM: 62, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "claremorris", name: "Claremorris", latitude: 53.710833, longitude: -8.9925, elevationM: 68, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "dunsany", name: "Dunsany", latitude: 53.515833, longitude: -6.66, elevationM: 83, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "fermoy_moore_park", name: "Fermoy Moore Park", latitude: 52.163889, longitude: -8.263889, elevationM: 46, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "finner", name: "Finner", latitude: 54.493889, longitude: -8.243056, elevationM: 33, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "gurteen", name: "Gurteen", latitude: 53.053056, longitude: -8.008611, elevationM: 75, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "johnstown_castle", name: "Johnstown Castle", latitude: 52.297778, longitude: -6.496667, elevationM: 62, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "mace_head", name: "Mace Head", latitude: 53.325833, longitude: -9.900833, elevationM: 21, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "malin_head", name: "Malin Head", latitude: 55.372222, longitude: -7.338889, elevationM: 22, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "markree", name: "Markree", latitude: 54.175, longitude: -8.455556, elevationM: 34, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "mount_dillon", name: "Mount Dillon", latitude: 53.726944, longitude: -7.980833, elevationM: 39, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "mullingar", name: "Mullingar", latitude: 53.537222, longitude: -7.362222, elevationM: 101, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "newport", name: "Newport", latitude: 53.922222, longitude: -9.572222, elevationM: 22, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "phoenix_park", name: "Phoenix Park", latitude: 53.363889, longitude: -6.333333, elevationM: 48, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "roches_point", name: "Roches Point", latitude: 51.793056, longitude: -8.244444, elevationM: 43, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "sherkin_island", name: "Sherkin Island", latitude: 51.476389, longitude: -9.427778, elevationM: 21, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "valentia", name: "Valentia", latitude: 51.939722, longitude: -10.244444, elevationM: 25, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "casement", name: "Casement", latitude: 53.3056, longitude: -6.43889, elevationM: 91, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "cork_airport", name: "Cork Airport", latitude: 51.8472, longitude: -8.48611, elevationM: 155, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "dublin_airport", name: "Dublin Airport", latitude: 53.4278, longitude: -6.24083, elevationM: 71, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "knock_airport", name: "Knock Airport", latitude: 53.9061, longitude: -8.81722, elevationM: 201, edrStationId: null, collections: null, active: null, verifiedAt: null },
  { id: "shannon_airport", name: "Shannon Airport", latitude: 52.6903, longitude: -8.91806, elevationM: 15, edrStationId: null, collections: null, active: null, verifiedAt: null },
];

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance between two points, in kilometres — the standard
 * haversine formula (mean Earth radius 6371km). Pure geometry, no
 * station data or regulatory content involved.
 */
export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export interface StationDistance {
  station: MetEireannStation;
  distanceKm: number;
}

/**
 * Every station's real geographic distance from `point`, nearest first.
 * Uses straight-line distance only — never county, region, or any other
 * administrative boundary, per spec.
 */
export function nearestStations(
  point: GeoPoint,
  stations: MetEireannStation[] = MET_EIREANN_STATIONS,
  count = 3,
): StationDistance[] {
  return stations
    .map((station) => ({ station, distanceKm: haversineDistanceKm(point, station) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, count);
}

/** The single nearest station, or `null` if the registry is empty. */
export function nearestStation(
  point: GeoPoint,
  stations: MetEireannStation[] = MET_EIREANN_STATIONS,
): StationDistance | null {
  return nearestStations(point, stations, 1)[0] ?? null;
}

/**
 * `Field.centroid`/`Farm.location.centroid` are stored `[longitude,
 * latitude]` (GeoJSON convention — confirmed against mock-farm.ts's real
 * coordinates: Co. Cork fields all read ~51.9°N/-8.5°W, which only
 * matches if index 0 is longitude). Every other function in this module
 * takes named `{latitude, longitude}` to keep that ordering explicit —
 * this is the one place a `[number, number]` tuple gets unpacked, so a
 * silent lat/lng swap can only ever happen here, not scattered through
 * call sites.
 */
export function centroidToPoint(centroid: [number, number]): GeoPoint {
  const [longitude, latitude] = centroid;
  return { latitude, longitude };
}

/** Nearest stations to a field (or farm), by its real centroid. */
export function nearestStationsForField(
  entity: { centroid: [number, number] },
  stations: MetEireannStation[] = MET_EIREANN_STATIONS,
  count = 3,
): StationDistance[] {
  return nearestStations(centroidToPoint(entity.centroid), stations, count);
}
