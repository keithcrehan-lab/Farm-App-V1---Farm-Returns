import { describe, expect, it } from "vitest";
import {
  MET_EIREANN_EDR_STATION_ID_SOURCE,
  MET_EIREANN_OPEN_OBSERVATIONS_ARCHIVE_SOURCE,
  MET_EIREANN_STATIONS,
  MET_EIREANN_STATION_REGISTRY_SOURCE,
  centroidToPoint,
  hasGeographicCoordinates,
  haversineDistanceKm,
  nearestGeographicStation,
  nearestGeographicStations,
  nearestQueryableStation,
  nearestQueryableStations,
  nearestQueryableStationsForField,
  nearestStation,
  nearestStations,
  nearestStationsForField,
  type GeoPoint,
} from "./weather-stations";

function station(id: string) {
  const s = MET_EIREANN_STATIONS.find((st) => st.id === id);
  if (!s) throw new Error(`fixture station not found: ${id}`);
  return s;
}

/** Real stations only — asserts non-null coordinates for use as a GeoPoint. */
function point(id: string): GeoPoint {
  const s = station(id);
  if (s.latitude === null || s.longitude === null) throw new Error(`station has no coordinates: ${id}`);
  return { latitude: s.latitude, longitude: s.longitude };
}

describe("haversineDistanceKm", () => {
  it("is zero for a point against itself", () => {
    expect(haversineDistanceKm(point("cork_airport"), point("cork_airport"))).toBe(0);
  });

  it("is symmetric", () => {
    const a = point("dublin_airport");
    const b = point("valentia");
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 9);
  });

  it("matches real distances between real Met Éireann stations (independently computed)", () => {
    // Dublin Airport <-> Casement: two Dublin-area stations, real distance.
    expect(haversineDistanceKm(point("dublin_airport"), point("casement"))).toBeCloseTo(18.9, 1);
    // Malin Head (far north) <-> Cork Airport (south): roughly the length of Ireland.
    expect(haversineDistanceKm(point("malin_head"), point("cork_airport"))).toBeCloseTo(399.2, 1);
    // Cork Airport <-> Roches Point: both real Cork-area stations, short real distance.
    expect(haversineDistanceKm(point("cork_airport"), point("roches_point"))).toBeCloseTo(17.7, 1);
  });
});

describe("hasGeographicCoordinates", () => {
  it("is true for a station with real coordinates", () => {
    expect(hasGeographicCoordinates(station("cork_airport"))).toBe(true);
  });

  it("is false for Grange — a real archive discovery with unverified geography", () => {
    expect(hasGeographicCoordinates(station("grange"))).toBe(false);
  });
});

describe("nearestStations / nearestStation (nearest GEOGRAPHIC station)", () => {
  it("ranks by real geographic distance only, never by county", () => {
    // A point sitting exactly on a real station's own coordinates must
    // rank that station first, distance 0 — a pure geometry check.
    const cork = point("cork_airport");
    const ranked = nearestStations(cork, MET_EIREANN_STATIONS, 3);
    expect(ranked[0].station.id).toBe("cork_airport");
    expect(ranked[0].distanceKm).toBe(0);
    // Next real-nearest to Cork Airport is Roches Point, not (say) Dublin
    // Airport's Casement neighbour — confirms it isn't grouping by county
    // name or any administrative label (none exists on the type at all).
    expect(ranked[1].station.id).toBe("roches_point");
  });

  it("returns the requested count, sorted ascending by distance", () => {
    const ranked = nearestStations(point("cork_airport"), MET_EIREANN_STATIONS, 5);
    expect(ranked).toHaveLength(5);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].distanceKm).toBeGreaterThanOrEqual(ranked[i - 1].distanceKm);
    }
  });

  it("nearestStation returns just the top result", () => {
    const top = nearestStation(point("valentia"));
    expect(top?.station.id).toBe("valentia");
    expect(top?.distanceKm).toBe(0);
  });

  it("returns null for an empty station registry rather than throwing", () => {
    expect(nearestStation(point("cork_airport"), [])).toBeNull();
    expect(nearestStations(point("cork_airport"), [], 3)).toEqual([]);
  });

  it("never ranks Grange — a station with no known coordinates can't be geographically ranked", () => {
    const ranked = nearestStations(point("cork_airport"), MET_EIREANN_STATIONS, MET_EIREANN_STATIONS.length);
    expect(ranked.find((r) => r.station.id === "grange")).toBeUndefined();
    // Confirms the full real registry minus Grange, not silently truncated.
    expect(ranked).toHaveLength(MET_EIREANN_STATIONS.length - 1);
  });

  it("nearestGeographicStation(s) are the same functions under the spec's explicit naming", () => {
    expect(nearestGeographicStation).toBe(nearestStation);
    expect(nearestGeographicStations).toBe(nearestStations);
  });
});

describe("nearestQueryableStation(s) — nearest station with a confirmed EDR id", () => {
  it("skips a nearer geographic station with no confirmed EDR id, in favour of a farther queryable one", () => {
    // Cork Airport (nearest to itself, distance 0) has no confirmed EDR id.
    // Roches Point (its real next-nearest) also has none. Valentia does —
    // walking far enough down the real ranked list must reach it rather
    // than giving up at the first unqueryable station.
    const top = nearestQueryableStation(point("cork_airport"), MET_EIREANN_STATIONS);
    expect(top).not.toBeNull();
    expect(top?.station.edrStationId).not.toBeNull();
  });

  it("returns the queryable station itself when it IS the nearest", () => {
    const top = nearestQueryableStation(point("athenry"), MET_EIREANN_STATIONS);
    expect(top?.station.id).toBe("athenry");
    expect(top?.distanceKm).toBe(0);
  });

  it("returns null when no station in the given list is queryable", () => {
    const noneQueryable = MET_EIREANN_STATIONS.filter((s) => s.edrStationId === null);
    expect(nearestQueryableStation(point("cork_airport"), noneQueryable)).toBeNull();
  });

  it("nearestQueryableStations returns only queryable stations, sorted by real distance", () => {
    const ranked = nearestQueryableStations(point("cork_airport"), MET_EIREANN_STATIONS, 3);
    for (const r of ranked) {
      expect(r.station.edrStationId).not.toBeNull();
    }
  });
});

describe("centroidToPoint / nearestStationsForField", () => {
  it("unpacks [longitude, latitude] centroids correctly, not swapped", () => {
    // mock-farm.ts's real farm centroid: Co. Cork, ~51.9degN / -8.5degW.
    const p = centroidToPoint([-8.4863, 51.8985]);
    expect(p.latitude).toBeCloseTo(51.8985, 6);
    expect(p.longitude).toBeCloseTo(-8.4863, 6);
  });

  it("finds Cork Airport as nearest for this farm's real field centroids, not a swapped-coordinate false match", () => {
    // Real field centroids from mock-farm.ts (Co. Cork). If lat/lng were
    // silently swapped here, the nearest station would come out wildly
    // wrong (likely nothing within hundreds of km) rather than the
    // genuinely close ~5-6km Cork Airport result.
    const fields = [
      { centroid: [-8.489, 51.9] as [number, number] },
      { centroid: [-8.483, 51.901] as [number, number] },
      { centroid: [-8.478, 51.897] as [number, number] },
      { centroid: [-8.486, 51.895] as [number, number] },
    ];
    for (const field of fields) {
      const [nearest, second] = nearestStationsForField(field, MET_EIREANN_STATIONS, 2);
      expect(nearest.station.id).toBe("cork_airport");
      expect(nearest.distanceKm).toBeLessThan(10);
      expect(second.station.id).toBe("roches_point");
    }
  });

  it("nearestQueryableStationsForField resolves the same fallback behaviour from a field centroid", () => {
    const field = { centroid: [-8.489, 51.9] as [number, number] };
    const [nearestQueryable] = nearestQueryableStationsForField(field, MET_EIREANN_STATIONS, 1);
    expect(nearestQueryable.station.edrStationId).not.toBeNull();
  });
});

describe("MET_EIREANN_STATIONS registry integrity", () => {
  it("the original geographic registry's own count is still 25 (Grange is a separate later discovery)", () => {
    expect(MET_EIREANN_STATION_REGISTRY_SOURCE.officialStationCount).toBe(25);
  });

  it("the full registry (25 original + Grange) has 26 records", () => {
    expect(MET_EIREANN_STATIONS).toHaveLength(26);
  });

  it("has no duplicate ids", () => {
    const ids = MET_EIREANN_STATIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every station with known coordinates sits within Ireland's real geographic bounds", () => {
    for (const s of MET_EIREANN_STATIONS.filter(hasGeographicCoordinates)) {
      expect(s.latitude).toBeGreaterThan(51);
      expect(s.latitude).toBeLessThan(56);
      expect(s.longitude).toBeGreaterThan(-11);
      expect(s.longitude).toBeLessThan(-5.5);
    }
  });

  it("carries no county/region field — selection can only ever use geometry", () => {
    for (const s of MET_EIREANN_STATIONS) {
      expect((s as unknown as Record<string, unknown>).county).toBeUndefined();
    }
  });

  it("is confirmed A-OFFICIAL, per the user-supplied registry", () => {
    expect(MET_EIREANN_STATION_REGISTRY_SOURCE.evidenceClass).toBe("A-OFFICIAL");
    expect(MET_EIREANN_STATION_REGISTRY_SOURCE.verificationStatus).toBe("confirmed");
    expect(MET_EIREANN_STATION_REGISTRY_SOURCE.sourceOrganisation).toBe("Met Éireann");
  });
});

describe("edrStationId — no guessed ids", () => {
  it("Athenry, Valentia and Claremorris have real, officially-confirmed EDR station ids", () => {
    expect(station("athenry").edrStationId).toBe("0018");
    expect(station("valentia").edrStationId).toBe("0102");
    expect(station("claremorris").edrStationId).toBe("0103");
  });

  it("every other station's edrStationId is null, not a guessed value", () => {
    const confirmedIds = new Set(["athenry", "valentia", "claremorris"]);
    const others = MET_EIREANN_STATIONS.filter((s) => !confirmedIds.has(s.id));
    expect(others.length).toBe(23);
    for (const s of others) {
      expect(s.edrStationId).toBeNull();
    }
  });

  it("no id is inferred sequentially from a known one (0018/0102/0103 aren't consecutive, and none of 0019/0101/0104 etc. appear anywhere)", () => {
    const allIds = MET_EIREANN_STATIONS.map((s) => s.edrStationId).filter((id): id is string => id !== null);
    expect(allIds.sort()).toEqual(["0018", "0102", "0103"]);
  });

  it("matches all 3 confirmed examples cited in MET_EIREANN_EDR_STATION_ID_SOURCE", () => {
    expect(MET_EIREANN_EDR_STATION_ID_SOURCE.confirmedExamples).toHaveLength(3);
    for (const example of MET_EIREANN_EDR_STATION_ID_SOURCE.confirmedExamples) {
      expect(station(example.stationId).edrStationId).toBe(example.edrStationId);
    }
  });

  it("stationIdVerification is VERIFIED only for the 3 confirmed stations", () => {
    for (const s of MET_EIREANN_STATIONS) {
      const expected = s.edrStationId !== null ? "VERIFIED" : "UNVERIFIED";
      expect(s.stationIdVerification).toBe(expected);
    }
  });
});

describe("Open Observations Archive reconciliation", () => {
  it("reports exactly 21 named archive directories as its own source count", () => {
    expect(MET_EIREANN_OPEN_OBSERVATIONS_ARCHIVE_SOURCE.namedDirectoryCount).toBe(21);
  });

  it("20 of the original 25 stations are present in the archive (9 identical names + 11 aliased)", () => {
    const original25Ids = new Set(
      MET_EIREANN_STATIONS.filter((s) => s.id !== "grange").map((s) => s.id),
    );
    const presentAmongOriginal25 = MET_EIREANN_STATIONS.filter(
      (s) => original25Ids.has(s.id) && s.presentInOpenObservationsArchive,
    );
    expect(presentAmongOriginal25).toHaveLength(20);
  });

  it("Dunsany, Casement, Cork Airport, Dublin Airport and Shannon Airport are confirmed absent from the archive, not deleted", () => {
    const absentIds = ["dunsany", "casement", "cork_airport", "dublin_airport", "shannon_airport"];
    for (const id of absentIds) {
      const s = station(id);
      expect(s.presentInOpenObservationsArchive).toBe(false);
      expect(s.openDataArchiveName).toBeNull();
      // Still a real, retained record — never removed from the registry.
      expect(MET_EIREANN_STATIONS.some((st) => st.id === id)).toBe(true);
    }
    expect(absentIds).toHaveLength(5);
  });

  it("preserves both naming conventions via aliases where they differ", () => {
    expect(station("carlow_oak_park").canonicalName).toBe("Carlow Oak Park");
    expect(station("carlow_oak_park").aliases).toContain("OakPark");
    expect(station("carlow_oak_park").openDataArchiveName).toBe("OakPark");

    expect(station("knock_airport").aliases).toContain("Knock");
    expect(station("fermoy_moore_park").aliases).toContain("Moorepark");
    expect(station("johnstown_castle").aliases).toContain("JohnstownCastleII");
    expect(station("mace_head").aliases).toContain("MaceHead");
    expect(station("malin_head").aliases).toContain("MalinHead");
    expect(station("markree").aliases).toContain("MarkreeCastle");
    expect(station("mount_dillon").aliases).toContain("MountDillon");
    expect(station("phoenix_park").aliases).toContain("PhoenixPark");
    expect(station("roches_point").aliases).toContain("RochesPoint");
    expect(station("sherkin_island").aliases).toContain("SherkinIsland");
  });

  it("identically-named matches carry no redundant alias", () => {
    expect(station("athenry").aliases).toEqual([]);
    expect(station("valentia").aliases).toEqual([]);
    expect(station("claremorris").aliases).toEqual([]);
  });

  it("Grange is added as a real archive discovery with unverified geography, never invented coordinates", () => {
    const grange = station("grange");
    expect(grange.presentInOpenObservationsArchive).toBe(true);
    expect(grange.openDataArchiveName).toBe("Grange");
    expect(grange.latitude).toBeNull();
    expect(grange.longitude).toBeNull();
    expect(grange.elevationM).toBeNull();
    expect(grange.metadataVerification).toBe("PARTIAL");
    expect(grange.edrStationId).toBeNull();
  });

  it("does not treat the archive's 'Unknown' directory as a station", () => {
    expect(MET_EIREANN_STATIONS.some((s) => s.canonicalName === "Unknown" || s.id === "unknown")).toBe(false);
  });
});
