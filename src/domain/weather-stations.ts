/**
 * Met Éireann weather-station registry + station-selection engine —
 * Phase 5 (spec §10). This is the STATION-IDENTITY layer: who each
 * station is, where it is, whether it's queryable through the EDR API,
 * and whether it appears in Met Éireann's Open Observations Archive. It
 * carries no weather observations and no parameter-capability data of
 * its own — see `weather-station-capability.ts` for "which station
 * reports which parameter," and `src/server/weather/` for actually
 * fetching observations. Keeping these separate means a later live feed,
 * or new capability evidence, never requires rewriting this file.
 *
 * Two independent pieces of real, user/externally-supplied evidence feed
 * this registry, and this file is careful never to blur them together
 * (see `presentInOpenObservationsArchive` below):
 *
 *  1. `MET_EIREANN_STATION_REGISTRY_SOURCE` — the original 25-station
 *     geographic registry (name/latitude/longitude/elevation), supplied
 *     directly by the user and confirmed against Met Éireann's published
 *     station page + Technical Note No. 68. This is "which physical
 *     stations exist and where."
 *  2. `MET_EIREANN_OPEN_OBSERVATIONS_ARCHIVE_SOURCE` — 21 named station
 *     directories externally inspected at Met Éireann's real Open
 *     Observations Archive (`opendata2.met.ie/obs/`), reconciled against
 *     the 25-station registry by name/alias. This is "which stations
 *     this particular archive currently exposes" — a DIFFERENT claim. A
 *     station absent from this archive listing is not thereby invalid or
 *     deleted (5 of the original 25 — Dunsany, Casement, Cork Airport,
 *     Dublin Airport, Shannon Airport — are not present under these
 *     names in the archive; they are kept, flagged
 *     `presentInOpenObservationsArchive: false`, not removed). One new
 *     station this archive exposes that the original 25 did not include
 *     — Grange — is added as a real but geographically UNVERIFIED record
 *     (`latitude`/`longitude`/`elevationM: null` — never guessed).
 *
 * `edrStationId` (the id actually needed to query observations) is
 * confirmed for exactly 3 stations — Athenry (`0018`), Valentia
 * (`0102`), Claremorris (`0103`) — each from a real, cited, official Met
 * Éireann source (an EDR documentation example, or a genuine archive
 * filename encoding the id). Every other station's `edrStationId` is
 * `null`. These are never inferred sequentially from a known id (a
 * station id is an identifier, not a value with a predictable pattern)
 * and never guessed from the archive/geographic name alone.
 *
 * `src/server/weather/` implements the live EDR client + parser +
 * observation-ingestion service on top of this module, keyed by
 * `edrStationId`. See that layer's own doc comments for the current,
 * honestly-labelled state of the live connection itself
 * (UNVERIFIED IN CURRENT RUNTIME).
 */

export const WEATHER_STATION_ENGINE_VERSION = "weather_station_engine_v2.0.0";

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
  datasetVersion: "met_eireann_station_registry_v2",
  /** The ORIGINAL geographic registry's own count — does not include
   * Grange, which is a separate, later Open Observations Archive
   * discovery (see `MET_EIREANN_OPEN_OBSERVATIONS_ARCHIVE_SOURCE`). */
  officialStationCount: 25,
} as const;

export const MET_EIREANN_OPEN_OBSERVATIONS_ARCHIVE_SOURCE = {
  sourceOrganisation: "Met Éireann",
  archiveUrl: "https://opendata2.met.ie/obs/",
  evidenceClass: "A-OFFICIAL",
  verificationStatus: "confirmed" as const,
  sourceDate: "2026-08-24",
  /** 21 named station directories externally inspected — a separate
   * claim from the 25-station geographic registry's own count. Does not
   * include the archive's "Unknown" directory, which is deliberately
   * excluded here and never treated as a real station. */
  namedDirectoryCount: 21,
  note:
    "This is the archive's currently observed station set, not necessarily proof of Met Éireann's complete station network — absence from this list does not invalidate a station known from the geographic registry.",
} as const;

export const MET_EIREANN_EDR_STATION_ID_SOURCE = {
  sourceOrganisation: "Met Éireann",
  documentationUrl: "https://opendata2.met.ie/edr/docs",
  confirmedExamples: [
    {
      stationId: "athenry",
      edrStationId: "0018",
      confirmedVia:
        "https://opendata2.met.ie/edr/collections/observations-swob-nrt-60min/locations/0018?datetime=2026-04-23T00:00:00Z/2026-04-24T00:00:00Z",
    },
    {
      stationId: "valentia",
      edrStationId: "0102",
      confirmedVia:
        "https://opendata2.met.ie/edr/collections/observations-swob-nrt-10min/locations/0102?datetime=2026-04-24T08:00:00Z/2026-04-24T09:00:00Z&f=covjson",
    },
    {
      stationId: "claremorris",
      edrStationId: "0103",
      confirmedVia:
        "Official Met Éireann Claremorris Wind archive filename encoding the station id: 20260527043034_07222926_202605270430_60_Wind_A_0103_K.CR3",
    },
  ],
  evidenceClass: "A-OFFICIAL",
  /** "confirmed" only for the 3 examples above. Every other station's
   * `edrStationId` is `null` — not "unconfirmed": there is no guessed
   * value to distrust, there simply isn't one yet. Never inferred
   * sequentially from a known id. */
  verificationStatus: "partially_confirmed" as const,
  sourceDate: "2026-08-24",
  note:
    "The remaining 22 stations' (23 minus Grange, which was never in the original 25 and has no id either) EDR location ids must be retrieved from Met Éireann's own EDR metadata/locations endpoint, not guessed. This environment's outbound network access to opendata2.met.ie is proxy-denied (confirmed) — see src/server/weather/edr-client.ts and README.md.",
} as const;

export interface MetEireannStation {
  id: string;
  /** The authoritative name for this station within Farm Return — from
   * the original geographic registry where the station is in it, or
   * from the Open Observations Archive for a station discovered only
   * there (e.g. Grange). */
  canonicalName: string;
  /** Alternate names this station is known by elsewhere — today, just
   * the Open Observations Archive's own directory name where it differs
   * from `canonicalName` (see `openDataArchiveName`, which duplicates
   * the value here for direct lookup convenience). Empty where no
   * alternate name is known/needed. */
  aliases: string[];
  /** `null` only for Grange — a station the Open Observations Archive
   * proves exists, but whose geographic coordinates have not been
   * independently obtained. Never approximated. */
  latitude: number | null;
  longitude: number | null;
  elevationM: number | null;
  /**
   * Met Éireann's own EDR API location identifier (e.g. `"0018"` for
   * Athenry) — required to query
   * `opendata2.met.ie/edr/collections/{collection}/locations/{edrStationId}`.
   * `null` where not yet retrieved/confirmed — see
   * `MET_EIREANN_EDR_STATION_ID_SOURCE`.
   */
  edrStationId: string | null;
  /** This station's directory name in the Open Observations Archive,
   * e.g. `"OakPark"` for Carlow Oak Park. `null` if the station is not
   * present in the archive under any reconciled name. */
  openDataArchiveName: string | null;
  /** `true`/`false` once checked against the real, externally inspected
   * 21-directory archive listing (see
   * `MET_EIREANN_OPEN_OBSERVATIONS_ARCHIVE_SOURCE`) — `false` is a real,
   * confirmed negative ("checked, not there"), not "unknown." `null`
   * would mean genuinely not yet checked, which does not apply to any
   * station in this registry today. */
  presentInOpenObservationsArchive: boolean | null;
  /** Whether `edrStationId` itself has been confirmed via a real,
   * official Met Éireann source. */
  stationIdVerification: "VERIFIED" | "UNVERIFIED";
  /** Whether this station's own identity/geographic metadata (not its
   * EDR id, not its capabilities) is confirmed. `"PARTIAL"` for a
   * station whose existence/name is confirmed but whose geography isn't
   * (Grange). */
  metadataVerification: "VERIFIED" | "PARTIAL" | "UNVERIFIED";
  /** Real, citable URLs backing this station's record — registry/archive
   * sources plus, where applicable, the specific EDR-id-confirming
   * source. Filename-only evidence (not a URL) is documented in this
   * file's comments instead, not stuffed in here as a fake URL. */
  sourceUrls: string[];
}

const REGISTRY_URL = MET_EIREANN_STATION_REGISTRY_SOURCE.primarySourceUrl;
const ARCHIVE_URL = MET_EIREANN_OPEN_OBSERVATIONS_ARCHIVE_SOURCE.archiveUrl;
const EDR_DOCS_URL = MET_EIREANN_EDR_STATION_ID_SOURCE.documentationUrl;

/**
 * 26 records: the original 25-station geographic registry, plus Grange
 * (an Open Observations Archive discovery with unverified geography).
 * `presentInOpenObservationsArchive`/`openDataArchiveName`/`aliases`
 * reconcile the geographic registry against the real 21-directory
 * archive listing — see the module doc comment for the reconciliation
 * rules and which 5 original stations are absent from the archive.
 */
export const MET_EIREANN_STATIONS: MetEireannStation[] = [
  { id: "athenry", canonicalName: "Athenry", aliases: [], latitude: 53.289167, longitude: -8.785556, elevationM: 40, edrStationId: "0018", openDataArchiveName: "Athenry", presentInOpenObservationsArchive: true, stationIdVerification: "VERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL, EDR_DOCS_URL, "https://opendata2.met.ie/edr/collections/observations-swob-nrt-60min/locations/0018?datetime=2026-04-23T00:00:00Z/2026-04-24T00:00:00Z"] },
  { id: "ballyhaise", canonicalName: "Ballyhaise", aliases: [], latitude: 54.051389, longitude: -7.309722, elevationM: 78, edrStationId: null, openDataArchiveName: "Ballyhaise", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "belmullet", canonicalName: "Belmullet", aliases: [], latitude: 54.2275, longitude: -10.006944, elevationM: 9, edrStationId: null, openDataArchiveName: "Belmullet", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "carlow_oak_park", canonicalName: "Carlow Oak Park", aliases: ["OakPark"], latitude: 52.861111, longitude: -6.915278, elevationM: 62, edrStationId: null, openDataArchiveName: "OakPark", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "claremorris", canonicalName: "Claremorris", aliases: [], latitude: 53.710833, longitude: -8.9925, elevationM: 68, edrStationId: "0103", openDataArchiveName: "Claremorris", presentInOpenObservationsArchive: true, stationIdVerification: "VERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL, EDR_DOCS_URL] },
  { id: "dunsany", canonicalName: "Dunsany", aliases: [], latitude: 53.515833, longitude: -6.66, elevationM: 83, edrStationId: null, openDataArchiveName: null, presentInOpenObservationsArchive: false, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL] },
  { id: "fermoy_moore_park", canonicalName: "Fermoy Moore Park", aliases: ["Moorepark"], latitude: 52.163889, longitude: -8.263889, elevationM: 46, edrStationId: null, openDataArchiveName: "Moorepark", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "finner", canonicalName: "Finner", aliases: [], latitude: 54.493889, longitude: -8.243056, elevationM: 33, edrStationId: null, openDataArchiveName: "Finner", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "gurteen", canonicalName: "Gurteen", aliases: [], latitude: 53.053056, longitude: -8.008611, elevationM: 75, edrStationId: null, openDataArchiveName: "Gurteen", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "johnstown_castle", canonicalName: "Johnstown Castle", aliases: ["JohnstownCastleII"], latitude: 52.297778, longitude: -6.496667, elevationM: 62, edrStationId: null, openDataArchiveName: "JohnstownCastleII", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "mace_head", canonicalName: "Mace Head", aliases: ["MaceHead"], latitude: 53.325833, longitude: -9.900833, elevationM: 21, edrStationId: null, openDataArchiveName: "MaceHead", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "malin_head", canonicalName: "Malin Head", aliases: ["MalinHead"], latitude: 55.372222, longitude: -7.338889, elevationM: 22, edrStationId: null, openDataArchiveName: "MalinHead", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "markree", canonicalName: "Markree", aliases: ["MarkreeCastle"], latitude: 54.175, longitude: -8.455556, elevationM: 34, edrStationId: null, openDataArchiveName: "MarkreeCastle", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "mount_dillon", canonicalName: "Mount Dillon", aliases: ["MountDillon"], latitude: 53.726944, longitude: -7.980833, elevationM: 39, edrStationId: null, openDataArchiveName: "MountDillon", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "mullingar", canonicalName: "Mullingar", aliases: [], latitude: 53.537222, longitude: -7.362222, elevationM: 101, edrStationId: null, openDataArchiveName: "Mullingar", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "newport", canonicalName: "Newport", aliases: [], latitude: 53.922222, longitude: -9.572222, elevationM: 22, edrStationId: null, openDataArchiveName: "Newport", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "phoenix_park", canonicalName: "Phoenix Park", aliases: ["PhoenixPark"], latitude: 53.363889, longitude: -6.333333, elevationM: 48, edrStationId: null, openDataArchiveName: "PhoenixPark", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "roches_point", canonicalName: "Roches Point", aliases: ["RochesPoint"], latitude: 51.793056, longitude: -8.244444, elevationM: 43, edrStationId: null, openDataArchiveName: "RochesPoint", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "sherkin_island", canonicalName: "Sherkin Island", aliases: ["SherkinIsland"], latitude: 51.476389, longitude: -9.427778, elevationM: 21, edrStationId: null, openDataArchiveName: "SherkinIsland", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "valentia", canonicalName: "Valentia", aliases: [], latitude: 51.939722, longitude: -10.244444, elevationM: 25, edrStationId: "0102", openDataArchiveName: "Valentia", presentInOpenObservationsArchive: true, stationIdVerification: "VERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL, EDR_DOCS_URL] },
  { id: "casement", canonicalName: "Casement", aliases: [], latitude: 53.3056, longitude: -6.43889, elevationM: 91, edrStationId: null, openDataArchiveName: null, presentInOpenObservationsArchive: false, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL] },
  { id: "cork_airport", canonicalName: "Cork Airport", aliases: [], latitude: 51.8472, longitude: -8.48611, elevationM: 155, edrStationId: null, openDataArchiveName: null, presentInOpenObservationsArchive: false, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL] },
  { id: "dublin_airport", canonicalName: "Dublin Airport", aliases: [], latitude: 53.4278, longitude: -6.24083, elevationM: 71, edrStationId: null, openDataArchiveName: null, presentInOpenObservationsArchive: false, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL] },
  { id: "knock_airport", canonicalName: "Knock Airport", aliases: ["Knock"], latitude: 53.9061, longitude: -8.81722, elevationM: 201, edrStationId: null, openDataArchiveName: "Knock", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL, ARCHIVE_URL] },
  { id: "shannon_airport", canonicalName: "Shannon Airport", aliases: [], latitude: 52.6903, longitude: -8.91806, elevationM: 15, edrStationId: null, openDataArchiveName: null, presentInOpenObservationsArchive: false, stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [REGISTRY_URL] },
  // Grange: a real Open Observations Archive directory with no
  // corresponding entry in the original 25-station geographic registry.
  // Its existence/name is confirmed by the archive itself; its geography
  // is not — never approximated.
  { id: "grange", canonicalName: "Grange", aliases: [], latitude: null, longitude: null, elevationM: null, edrStationId: null, openDataArchiveName: "Grange", presentInOpenObservationsArchive: true, stationIdVerification: "UNVERIFIED", metadataVerification: "PARTIAL", sourceUrls: [ARCHIVE_URL] },
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

/** True only when both coordinates are real numbers — Grange (and any
 * future geographically-unverified station) can never participate in a
 * distance ranking; it would be meaningless to invent a distance for it. */
export function hasGeographicCoordinates(
  station: MetEireannStation,
): station is MetEireannStation & { latitude: number; longitude: number } {
  return station.latitude !== null && station.longitude !== null;
}

export interface StationDistance {
  station: MetEireannStation;
  distanceKm: number;
}

/**
 * Every geographically-known station's real distance from `point`,
 * nearest first — pure geometry, no EDR/capability awareness. Uses
 * straight-line distance only — never county, region, or any other
 * administrative boundary, per spec. Stations without real coordinates
 * (Grange) are excluded, not ranked with a fabricated distance.
 */
export function nearestStations(
  point: GeoPoint,
  stations: MetEireannStation[] = MET_EIREANN_STATIONS,
  count = 3,
): StationDistance[] {
  return stations
    .filter(hasGeographicCoordinates)
    .map((station) => ({ station, distanceKm: haversineDistanceKm(point, station) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, count);
}

/** The single nearest geographic station, or `null` if no station in
 * `stations` has known coordinates. */
export function nearestStation(
  point: GeoPoint,
  stations: MetEireannStation[] = MET_EIREANN_STATIONS,
): StationDistance | null {
  return nearestStations(point, stations, 1)[0] ?? null;
}

// Explicit "nearestGeographicStation*" aliases — the first of the three
// nearest-station concepts (spec's own naming): purely geographic,
// ignoring EDR queryability or parameter capability entirely.
export const nearestGeographicStation = nearestStation;
export const nearestGeographicStations = nearestStations;

/**
 * Nearest station(s) that ALSO have a confirmed `edrStationId` — the
 * second concept: "geographically closest AND actually queryable through
 * the EDR API today." Walks the full geographic ranking (not just the
 * closest station) so an unqueryable near station never hides a
 * queryable farther one.
 */
export function nearestQueryableStations(
  point: GeoPoint,
  stations: MetEireannStation[] = MET_EIREANN_STATIONS,
  count = 3,
): StationDistance[] {
  const queryable = stations.filter((s) => s.edrStationId !== null);
  return nearestStations(point, queryable, count);
}

export function nearestQueryableStation(
  point: GeoPoint,
  stations: MetEireannStation[] = MET_EIREANN_STATIONS,
): StationDistance | null {
  return nearestQueryableStations(point, stations, 1)[0] ?? null;
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

/** Nearest geographic stations to a field (or farm), by its real centroid. */
export function nearestStationsForField(
  entity: { centroid: [number, number] },
  stations: MetEireannStation[] = MET_EIREANN_STATIONS,
  count = 3,
): StationDistance[] {
  return nearestStations(centroidToPoint(entity.centroid), stations, count);
}

export const nearestGeographicStationsForField = nearestStationsForField;

/** Nearest queryable stations to a field (or farm), by its real centroid. */
export function nearestQueryableStationsForField(
  entity: { centroid: [number, number] },
  stations: MetEireannStation[] = MET_EIREANN_STATIONS,
  count = 3,
): StationDistance[] {
  return nearestQueryableStations(centroidToPoint(entity.centroid), stations, count);
}
