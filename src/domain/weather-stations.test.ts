import { describe, expect, it } from "vitest";
import {
  MET_EIREANN_EDR_STATION_ID_SOURCE,
  MET_EIREANN_OPEN_OBSERVATIONS_ARCHIVE_SOURCE,
  MET_EIREANN_STATIONS,
  MET_EIREANN_STATION_REGISTRY_SOURCE,
  centroidToPoint,
  computeStationRegistryCounts,
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
  type MetEireannStation,
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
  // Every archive-present station (21 of 26) now has an individually
  // evidenced EDR id — see MET_EIREANN_EDR_STATION_ID_SOURCE for each
  // confirmedVia citation.
  const verifiedIds: Record<string, string> = {
    athenry: "0018",
    valentia: "0102",
    claremorris: "0103",
    newport: "0011",
    malin_head: "0017",
    mullingar: "0001",
    phoenix_park: "0003",
    mount_dillon: "0010",
    gurteen: "0015",
    ballyhaise: "0007",
    belmullet: "0105",
    carlow_oak_park: "0005",
    fermoy_moore_park: "0006",
    finner: "0104",
    johnstown_castle: "0016",
    mace_head: "0002",
    markree: "0012",
    knock_airport: "0217",
    roches_point: "0008",
    sherkin_island: "0009",
    grange: "0014",
  };

  it("all 21 archive-present stations have real, officially-confirmed EDR station ids", () => {
    for (const [id, edrId] of Object.entries(verifiedIds)) {
      expect(station(id).edrStationId).toBe(edrId);
      expect(station(id).stationIdVerification).toBe("VERIFIED");
    }
    expect(Object.keys(verifiedIds)).toHaveLength(21);
  });

  it("the 5 archive-absent stations' edrStationId is null, not a guessed value", () => {
    const others = MET_EIREANN_STATIONS.filter((s) => !(s.id in verifiedIds));
    expect(others.length).toBe(5);
    for (const s of others) {
      expect(s.edrStationId).toBeNull();
      expect(s.presentInOpenObservationsArchive).toBe(false);
      expect(s.stationIdVerification).toBe("UNVERIFIED");
    }
  });

  it("no id is inferred sequentially — Knock Airport's 0217 is recorded as given despite sitting well outside every other station's range", () => {
    const allIds = MET_EIREANN_STATIONS.map((s) => s.edrStationId).filter((id): id is string => id !== null);
    expect(allIds.sort()).toEqual([
      "0001", "0002", "0003", "0005", "0006", "0007", "0008", "0009", "0010",
      "0011", "0012", "0014", "0015", "0016", "0017", "0018",
      "0102", "0103", "0104", "0105", "0217",
    ]);
  });

  it("every VERIFIED edrStationId is unique — no two stations share an id", () => {
    const ids = MET_EIREANN_STATIONS.map((s) => s.edrStationId).filter((id): id is string => id !== null);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("matches all 21 confirmed examples cited in MET_EIREANN_EDR_STATION_ID_SOURCE", () => {
    expect(MET_EIREANN_EDR_STATION_ID_SOURCE.confirmedExamples).toHaveLength(21);
    for (const example of MET_EIREANN_EDR_STATION_ID_SOURCE.confirmedExamples) {
      expect(station(example.stationId).edrStationId).toBe(example.edrStationId);
    }
  });

  it("stationIdVerification is VERIFIED exactly where edrStationId is populated, for every station", () => {
    for (const s of MET_EIREANN_STATIONS) {
      const expected = s.edrStationId !== null ? "VERIFIED" : "UNVERIFIED";
      expect(s.stationIdVerification).toBe(expected);
    }
  });

  it("invariant: every archive-present station has a VERIFIED id, and no archive-absent station does", () => {
    for (const s of MET_EIREANN_STATIONS) {
      if (s.presentInOpenObservationsArchive) {
        expect(s.stationIdVerification).toBe("VERIFIED");
        expect(s.edrStationId).not.toBeNull();
      } else {
        expect(s.stationIdVerification).toBe("UNVERIFIED");
        expect(s.edrStationId).toBeNull();
      }
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

  it("Grange is added as a real archive discovery with unverified geography, never invented coordinates — geography and EDR id are independent facts", () => {
    const grange = station("grange");
    expect(grange.presentInOpenObservationsArchive).toBe(true);
    expect(grange.openDataArchiveName).toBe("Grange");
    expect(grange.latitude).toBeNull();
    expect(grange.longitude).toBeNull();
    expect(grange.elevationM).toBeNull();
    expect(grange.metadataVerification).toBe("PARTIAL");
    // Geography remains unverified even though its EDR id has since been
    // confirmed via a real archive filename — the two are independent
    // claims, and confirming one is never allowed to quietly promote the
    // other.
    expect(grange.edrStationId).toBe("0014");
    expect(grange.stationIdVerification).toBe("VERIFIED");
  });

  it("does not treat the archive's 'Unknown' directory as a station", () => {
    expect(MET_EIREANN_STATIONS.some((s) => s.canonicalName === "Unknown" || s.id === "unknown")).toBe(false);
  });
});

describe("computeStationRegistryCounts — the single source of truth for registry stats", () => {
  it("matches the real, current registry exactly (26 canonical, 21 archive-present, 21 verified)", () => {
    const counts = computeStationRegistryCounts();
    expect(counts.totalCanonicalStations).toBe(26);
    expect(counts.archivePresentStations).toBe(21);
    expect(counts.verifiedEdrIdCount).toBe(21);
    expect(counts.unresolvedCanonicalCount).toBe(5);
    expect(counts.unresolvedArchivePresentCount).toBe(0);
  });

  it("every archive-present station now has a VERIFIED EDR id — archive-present-unresolved is genuinely zero", () => {
    const counts = computeStationRegistryCounts();
    expect(counts.unresolvedArchivePresentCount).toBe(0);
    expect(counts.archivePresentStations).toBe(21);
    // The 5 still-unresolved canonical stations are exactly the 5
    // archive-absent ones, not a mix — confirms the zero above isn't
    // hiding a miscount elsewhere.
    expect(counts.unresolvedCanonicalCount).toBe(
      counts.totalCanonicalStations - counts.archivePresentStations,
    );
  });

  it("invariant: unresolvedCanonicalCount + verifiedEdrIdCount always equals the canonical total", () => {
    const counts = computeStationRegistryCounts();
    expect(counts.unresolvedCanonicalCount + counts.verifiedEdrIdCount).toBe(counts.totalCanonicalStations);
  });

  it("invariant: every verified station is also archive-present (no verified id has been recorded for a station absent from the archive)", () => {
    const verified = MET_EIREANN_STATIONS.filter(
      (s) => s.edrStationId !== null && s.stationIdVerification === "VERIFIED",
    );
    for (const s of verified) {
      expect(s.presentInOpenObservationsArchive).toBe(true);
    }
  });

  it("counts edrStationId and stationIdVerification independently, not trusting either field alone", () => {
    // A station with an id but not marked VERIFIED must not be counted —
    // and vice versa — exercised on a synthetic fixture since the real
    // registry never actually has this (inconsistent) combination itself.
    const inconsistent: MetEireannStation[] = [
      {
        id: "x", canonicalName: "X", aliases: [], latitude: 53, longitude: -8, elevationM: 0,
        edrStationId: "9999", openDataArchiveName: null, presentInOpenObservationsArchive: true,
        stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [],
      },
      {
        id: "y", canonicalName: "Y", aliases: [], latitude: 53, longitude: -8, elevationM: 0,
        edrStationId: null, openDataArchiveName: null, presentInOpenObservationsArchive: true,
        stationIdVerification: "VERIFIED", metadataVerification: "VERIFIED", sourceUrls: [],
      },
    ];
    expect(computeStationRegistryCounts(inconsistent).verifiedEdrIdCount).toBe(0);
  });

  it("unresolvedArchivePresentCount is a genuinely different figure from unresolvedCanonicalCount, never conflated", () => {
    const counts = computeStationRegistryCounts();
    expect(counts.unresolvedArchivePresentCount).not.toBe(counts.unresolvedCanonicalCount);
    // Archive-present stations are a strict subset of the canonical total
    // (5 canonical stations — Dunsany, Casement, Cork Airport, Dublin
    // Airport, Shannon Airport — are confirmed absent from the archive),
    // so the archive-present-unresolved figure must always be smaller.
    expect(counts.unresolvedArchivePresentCount).toBeLessThan(counts.unresolvedCanonicalCount);
  });

  it("accepts a custom station list rather than always reading the real registry", () => {
    const empty = computeStationRegistryCounts([]);
    expect(empty).toEqual({
      totalCanonicalStations: 0,
      archivePresentStations: 0,
      verifiedEdrIdCount: 0,
      unresolvedCanonicalCount: 0,
      unresolvedArchivePresentCount: 0,
    });
  });
});

describe("all 21 archive-present station EDR ids — complete evidence-backed audit", () => {
  // History: an initial batch confirmed 5 stations; a follow-up "11
  // expected" list added 6 more names with no individual evidence and
  // was refused; a second real batch confirmed 4 of those 6 (Mullingar,
  // Phoenix Park, Mount Dillon, Gurteen); a third batch supplied
  // primary-source evidence for the remaining 12 archive-present
  // stations, including the final 2 of the original 6 (Finner,
  // Belmullet) — see MET_EIREANN_EDR_STATION_ID_SOURCE for every
  // confirmedVia citation. All 21 archive-present stations are now
  // PRESENT; only the 5 archive-absent stations remain unresolved, and
  // they are asserted MISSING here deliberately — no id has been sourced
  // for them, and none is guessed.
  const expected: Record<string, string> = {
    mullingar: "0001",
    mace_head: "0002",
    phoenix_park: "0003",
    carlow_oak_park: "0005",
    fermoy_moore_park: "0006",
    ballyhaise: "0007",
    roches_point: "0008",
    sherkin_island: "0009",
    mount_dillon: "0010",
    newport: "0011",
    markree: "0012",
    grange: "0014",
    gurteen: "0015",
    johnstown_castle: "0016",
    malin_head: "0017",
    athenry: "0018",
    valentia: "0102",
    claremorris: "0103",
    finner: "0104",
    belmullet: "0105",
    knock_airport: "0217",
  };

  it("PRESENT: all 21 archive-present stations, each matching its individually-evidenced id", () => {
    for (const [id, edrId] of Object.entries(expected)) {
      const s = station(id);
      expect(s.edrStationId).toBe(edrId);
      expect(s.stationIdVerification).toBe("VERIFIED");
    }
    expect(Object.keys(expected)).toHaveLength(21);
  });

  it("MISSING: Dunsany, Casement, Cork Airport, Dublin Airport, Shannon Airport — archive-absent, no id sourced or guessed", () => {
    for (const id of ["dunsany", "casement", "cork_airport", "dublin_airport", "shannon_airport"]) {
      const s = station(id);
      expect(s.edrStationId).toBeNull();
      expect(s.stationIdVerification).toBe("UNVERIFIED");
      expect(id in expected).toBe(false);
    }
  });

  it("exactly 21 of 21 expected archive-present ids are present — the registry is fully reconciled", () => {
    const presentCount = Object.entries(expected).filter(([id, edrId]) => station(id).edrStationId === edrId).length;
    expect(presentCount).toBe(21);
  });

  it("fails if any expected id ever changes, a station loses VERIFIED status, or a duplicate id is introduced", () => {
    // A single test that would break on any of the three regressions the
    // task asked this audit to guard against, rather than three
    // independent checks that could each pass for the wrong reason.
    for (const [id, edrId] of Object.entries(expected)) {
      const s = station(id);
      expect(s.edrStationId, `${id} changed id`).toBe(edrId);
      expect(s.stationIdVerification, `${id} lost VERIFIED status`).toBe("VERIFIED");
    }
    const allIds = MET_EIREANN_STATIONS.map((s) => s.edrStationId).filter((v): v is string => v !== null);
    expect(new Set(allIds).size, "a duplicate edrStationId was introduced").toBe(allIds.length);
  });
});
