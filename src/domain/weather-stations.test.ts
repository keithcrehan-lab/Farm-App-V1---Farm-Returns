import { describe, expect, it } from "vitest";
import {
  MET_EIREANN_STATIONS,
  MET_EIREANN_STATION_REGISTRY_SOURCE,
  centroidToPoint,
  haversineDistanceKm,
  nearestStation,
  nearestStations,
  nearestStationsForField,
} from "./weather-stations";

function station(id: string) {
  const s = MET_EIREANN_STATIONS.find((st) => st.id === id);
  if (!s) throw new Error(`fixture station not found: ${id}`);
  return s;
}

describe("haversineDistanceKm", () => {
  it("is zero for a point against itself", () => {
    expect(haversineDistanceKm(station("cork_airport"), station("cork_airport"))).toBe(0);
  });

  it("is symmetric", () => {
    const a = station("dublin_airport");
    const b = station("valentia");
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 9);
  });

  it("matches real distances between real Met Éireann stations (independently computed)", () => {
    // Dublin Airport <-> Casement: two Dublin-area stations, real distance.
    expect(haversineDistanceKm(station("dublin_airport"), station("casement"))).toBeCloseTo(18.9, 1);
    // Malin Head (far north) <-> Cork Airport (south): roughly the length of Ireland.
    expect(haversineDistanceKm(station("malin_head"), station("cork_airport"))).toBeCloseTo(399.2, 1);
    // Cork Airport <-> Roches Point: both real Cork-area stations, short real distance.
    expect(haversineDistanceKm(station("cork_airport"), station("roches_point"))).toBeCloseTo(17.7, 1);
  });
});

describe("nearestStations / nearestStation", () => {
  it("ranks by real geographic distance only, never by county", () => {
    // A point sitting exactly on a real station's own coordinates must
    // rank that station first, distance 0 — a pure geometry check.
    const cork = station("cork_airport");
    const ranked = nearestStations(cork, MET_EIREANN_STATIONS, 3);
    expect(ranked[0].station.id).toBe("cork_airport");
    expect(ranked[0].distanceKm).toBe(0);
    // Next real-nearest to Cork Airport is Roches Point, not (say) Dublin
    // Airport's Casement neighbour — confirms it isn't grouping by county
    // name or any administrative label (none exists on the type at all).
    expect(ranked[1].station.id).toBe("roches_point");
  });

  it("returns the requested count, sorted ascending by distance", () => {
    const ranked = nearestStations(station("cork_airport"), MET_EIREANN_STATIONS, 5);
    expect(ranked).toHaveLength(5);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].distanceKm).toBeGreaterThanOrEqual(ranked[i - 1].distanceKm);
    }
  });

  it("nearestStation returns just the top result", () => {
    const top = nearestStation(station("valentia"));
    expect(top?.station.id).toBe("valentia");
    expect(top?.distanceKm).toBe(0);
  });

  it("returns null for an empty station registry rather than throwing", () => {
    expect(nearestStation(station("cork_airport"), [])).toBeNull();
    expect(nearestStations(station("cork_airport"), [], 3)).toEqual([]);
  });
});

describe("centroidToPoint / nearestStationsForField", () => {
  it("unpacks [longitude, latitude] centroids correctly, not swapped", () => {
    // mock-farm.ts's real farm centroid: Co. Cork, ~51.9degN / -8.5degW.
    const point = centroidToPoint([-8.4863, 51.8985]);
    expect(point.latitude).toBeCloseTo(51.8985, 6);
    expect(point.longitude).toBeCloseTo(-8.4863, 6);
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
});

describe("MET_EIREANN_STATIONS registry integrity", () => {
  it("has exactly the 25 stations Met Éireann publishes daily data for", () => {
    expect(MET_EIREANN_STATIONS).toHaveLength(MET_EIREANN_STATION_REGISTRY_SOURCE.officialStationCount);
  });

  it("has no duplicate ids", () => {
    const ids = MET_EIREANN_STATIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every station sits within Ireland's real geographic bounds", () => {
    for (const s of MET_EIREANN_STATIONS) {
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
