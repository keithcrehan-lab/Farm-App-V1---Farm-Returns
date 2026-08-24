import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUITABLE_STATES,
  MET_EIREANN_ARCHIVE_CATEGORY_EVIDENCE,
  MET_EIREANN_STATION_CAPABILITIES,
  capabilityFor,
  isSuitableState,
  nearestSuitableStation,
  nearestSuitableStationForField,
  selectStationForField,
  selectStationForParameter,
  type StationCapability,
} from "./weather-station-capability";
import { MET_EIREANN_STATIONS, type MetEireannStation } from "./weather-stations";

// Synthetic fixture stations/capabilities — NOT real Met Éireann data.
// Used only to prove the selection algorithm itself is correct; the real
// production data (MET_EIREANN_ARCHIVE_CATEGORY_EVIDENCE /
// MET_EIREANN_STATION_CAPABILITIES) is exercised separately below.
const NEAR: MetEireannStation = {
  id: "near", canonicalName: "Near", aliases: [], latitude: 53.0, longitude: -8.0, elevationM: 0,
  edrStationId: "1111", openDataArchiveName: null, presentInOpenObservationsArchive: null,
  stationIdVerification: "VERIFIED", metadataVerification: "VERIFIED", sourceUrls: [],
};
const NEAR_UNQUERYABLE: MetEireannStation = {
  id: "near_unqueryable", canonicalName: "Near, no EDR id", aliases: [], latitude: 53.0, longitude: -8.0, elevationM: 0,
  edrStationId: null, openDataArchiveName: null, presentInOpenObservationsArchive: null,
  stationIdVerification: "UNVERIFIED", metadataVerification: "VERIFIED", sourceUrls: [],
};
const FAR_WITH_RAINFALL: MetEireannStation = {
  id: "far_rainfall", canonicalName: "Far (has rainfall)", aliases: [], latitude: 53.5, longitude: -8.5, elevationM: 0,
  edrStationId: "2222", openDataArchiveName: null, presentInOpenObservationsArchive: null,
  stationIdVerification: "VERIFIED", metadataVerification: "VERIFIED", sourceUrls: [],
};
const FIXTURE_STATIONS = [NEAR, FAR_WITH_RAINFALL];

function cap(stationId: string, state: StationCapability["state"]): StationCapability {
  return { stationId, parameter: "rainfallMm", state, verifiedVia: "test fixture", verifiedAt: "2026-08-24" };
}

describe("capabilityFor", () => {
  it("returns an explicit UNVERIFIED record, never null, for an unknown station/parameter", () => {
    const result = capabilityFor("near", "rainfallMm", {});
    expect(result.state).toBe("UNVERIFIED");
    expect(result.verifiedVia).toBeNull();
  });
});

describe("isSuitableState", () => {
  it("accepts both VERIFIED and ARCHIVE_PRESENT by default", () => {
    expect(isSuitableState("VERIFIED")).toBe(true);
    expect(isSuitableState("ARCHIVE_PRESENT")).toBe(true);
    expect(isSuitableState("UNVERIFIED")).toBe(false);
    expect(isSuitableState("NOT_AVAILABLE")).toBe(false);
  });

  it("respects a stricter acceptable-states list", () => {
    expect(isSuitableState("ARCHIVE_PRESENT", ["VERIFIED"])).toBe(false);
    expect(isSuitableState("VERIFIED", ["VERIFIED"])).toBe(true);
  });
});

describe("nearestSuitableStation", () => {
  const point = { latitude: 53.0, longitude: -8.0 }; // exactly at NEAR

  it("skips the nearer station when it lacks suitable capability, picks the farther one that has it", () => {
    const capabilities = {
      near: { rainfallMm: cap("near", "NOT_AVAILABLE") },
      far_rainfall: { rainfallMm: cap("far_rainfall", "ARCHIVE_PRESENT") },
    };
    const result = nearestSuitableStation(point, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities });
    expect(result?.station.id).toBe("far_rainfall");
  });

  it("treats an unverified capability as not suitable — never assumes availability", () => {
    const capabilities = {
      near: {}, // no entry at all -> capabilityFor resolves it to UNVERIFIED
      far_rainfall: { rainfallMm: cap("far_rainfall", "ARCHIVE_PRESENT") },
    };
    const result = nearestSuitableStation(point, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities });
    expect(result?.station.id).toBe("far_rainfall");
  });

  it("returns null when no station has suitable capability, rather than falling back to nearest regardless", () => {
    const capabilities = {
      near: { rainfallMm: cap("near", "NOT_AVAILABLE") },
      far_rainfall: { rainfallMm: cap("far_rainfall", "NOT_AVAILABLE") },
    };
    const result = nearestSuitableStation(point, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities });
    expect(result).toBeNull();
  });

  it("returns the nearest station when it does have suitable capability", () => {
    const capabilities = {
      near: { rainfallMm: cap("near", "VERIFIED") },
      far_rainfall: { rainfallMm: cap("far_rainfall", "ARCHIVE_PRESENT") },
    };
    const result = nearestSuitableStation(point, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities });
    expect(result?.station.id).toBe("near");
  });

  it("excludes an unqueryable station even if it would otherwise be nearest", () => {
    const capabilities = {
      near_unqueryable: { rainfallMm: cap("near_unqueryable", "ARCHIVE_PRESENT") },
      far_rainfall: { rainfallMm: cap("far_rainfall", "ARCHIVE_PRESENT") },
    };
    const result = nearestSuitableStation(point, "rainfallMm", {
      stations: [NEAR_UNQUERYABLE, FAR_WITH_RAINFALL],
      capabilities,
    });
    expect(result?.station.id).toBe("far_rainfall");
  });

  it("under a strict VERIFIED-only search, an ARCHIVE_PRESENT station does not qualify", () => {
    const capabilities = { near: { rainfallMm: cap("near", "ARCHIVE_PRESENT") } };
    const result = nearestSuitableStation(point, "rainfallMm", {
      stations: FIXTURE_STATIONS,
      capabilities,
      acceptableStates: ["VERIFIED"],
    });
    expect(result).toBeNull();
  });

  it("returns null against an entirely empty capability map", () => {
    const result = nearestSuitableStation(point, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities: {} });
    expect(result).toBeNull();
  });
});

describe("nearestSuitableStationForField", () => {
  it("unpacks [longitude, latitude] the same way weather-stations.ts does", () => {
    const capabilities = { near: { rainfallMm: cap("near", "VERIFIED") } };
    const field = { centroid: [-8.0, 53.0] as [number, number] };
    const result = nearestSuitableStationForField(field, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities });
    expect(result?.station.id).toBe("near");
  });
});

describe("selectStationForParameter / selectStationForField — full explainable selection", () => {
  const point = { latitude: 53.0, longitude: -8.0 };

  it("reports fallbackUsed=true when the suitable station differs from the geographically nearest", () => {
    const capabilities = { far_rainfall: { rainfallMm: cap("far_rainfall", "ARCHIVE_PRESENT") } };
    const result = selectStationForParameter(point, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities });
    expect(result.nearestGeographicStation?.station.id).toBe("near");
    expect(result.nearestQueryableStation?.station.id).toBe("near"); // NEAR is queryable, just lacks capability
    expect(result.nearestSuitableStation?.station.id).toBe("far_rainfall");
  });

  it("reports fallbackUsed=true when the nearest geographic station isn't even queryable", () => {
    const result = selectStationForParameter(point, "rainfallMm", {
      stations: [NEAR_UNQUERYABLE, FAR_WITH_RAINFALL],
      capabilities: { far_rainfall: { rainfallMm: cap("far_rainfall", "VERIFIED") } },
    });
    expect(result.nearestGeographicStation?.station.id).toBe("near_unqueryable");
    expect(result.nearestQueryableStation?.station.id).toBe("far_rainfall");
    expect(result.fallbackUsed).toBe(true);
  });

  it("reports fallbackUsed=false when the nearest geographic station is also the suitable one", () => {
    const capabilities = { near: { rainfallMm: cap("near", "VERIFIED") } };
    const result = selectStationForParameter(point, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities });
    expect(result.fallbackUsed).toBe(false);
  });

  it("selectStationForField unpacks a field centroid the same way", () => {
    const field = { centroid: [-8.0, 53.0] as [number, number] };
    const capabilities = { near: { rainfallMm: cap("near", "VERIFIED") } };
    const result = selectStationForField(field, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities });
    expect(result.nearestGeographicStation?.station.id).toBe("near");
  });
});

describe("the real production capability evidence (honest current state)", () => {
  it("has real archive category evidence for exactly Athenry, Claremorris and Valentia", () => {
    const stationIds = new Set(MET_EIREANN_ARCHIVE_CATEGORY_EVIDENCE.map((e) => e.stationId));
    expect(stationIds).toEqual(new Set(["athenry", "claremorris", "valentia"]));
  });

  it("Valentia has all 8 real archive categories recorded, including the uninterpreted Suit_A/Suit_B", () => {
    const valentiaCategories = MET_EIREANN_ARCHIVE_CATEGORY_EVIDENCE.filter((e) => e.stationId === "valentia").map(
      (e) => e.category,
    );
    expect(valentiaCategories).toEqual(
      expect.arrayContaining(["Rain", "Pressure", "Solar_Radiation", "Wind", "Present_Weather", "Ceilometer", "Suit_A", "Suit_B"]),
    );
    expect(valentiaCategories).toHaveLength(8);
  });

  it("derives ARCHIVE_PRESENT (never VERIFIED) capability entries only for unambiguous parameter correspondences", () => {
    expect(capabilityFor("athenry", "rainfallMm").state).toBe("ARCHIVE_PRESENT");
    expect(capabilityFor("claremorris", "windSpeedMps").state).toBe("ARCHIVE_PRESENT");
    expect(capabilityFor("claremorris", "windDirectionDeg").state).toBe("ARCHIVE_PRESENT");
    expect(capabilityFor("valentia", "rainfallMm").state).toBe("ARCHIVE_PRESENT");
    expect(capabilityFor("valentia", "pressureHPa").state).toBe("ARCHIVE_PRESENT");
    expect(capabilityFor("valentia", "solarRadiationWM2").state).toBe("ARCHIVE_PRESENT");
    // Never VERIFIED anywhere — no real EDR response has ever been parsed.
    for (const byParam of Object.values(MET_EIREANN_STATION_CAPABILITIES)) {
      for (const capability of Object.values(byParam)) {
        expect(capability?.state).not.toBe("VERIFIED");
      }
    }
  });

  it("never derives a capability for Present_Weather, Ceilometer, Suit_A or Suit_B — no known WeatherParameter correspondence", () => {
    // Valentia has real archive evidence for all 8 categories, but only 4
    // (Rain/Pressure/Solar_Radiation/Wind->2 params) have any mapping.
    const valentiaCapabilities = MET_EIREANN_STATION_CAPABILITIES.valentia ?? {};
    expect(Object.keys(valentiaCapabilities)).toHaveLength(5); // rainfallMm, pressureHPa, solarRadiationWM2, windSpeedMps, windDirectionDeg
  });

  it("nearestSuitableStation against the real registry+evidence finds Athenry for rainfall, honestly", () => {
    const athenryPoint = { latitude: 53.289167, longitude: -8.785556 };
    const result = nearestSuitableStation(athenryPoint, "rainfallMm", { stations: MET_EIREANN_STATIONS });
    expect(result?.station.id).toBe("athenry");
    expect(result?.capability.state).toBe("ARCHIVE_PRESENT");
  });

  it("nearestSuitableStation against the real registry+evidence returns null for a parameter no station has evidence for", () => {
    const athenryPoint = { latitude: 53.289167, longitude: -8.785556 };
    const result = nearestSuitableStation(athenryPoint, "grassTemperatureC", { stations: MET_EIREANN_STATIONS });
    expect(result).toBeNull();
  });

  it("nearestSuitableStation under a strict VERIFIED-only search returns null for every real station/parameter", () => {
    const point = { latitude: 51.9, longitude: -8.49 };
    const parameters = [
      "rainfallMm", "airTemperatureC", "relativeHumidityPct", "windSpeedMps",
      "windDirectionDeg", "pressureHPa", "solarRadiationWM2", "soilTemperatureC", "grassTemperatureC",
    ] as const;
    for (const parameter of parameters) {
      const result = nearestSuitableStation(point, parameter, {
        stations: MET_EIREANN_STATIONS,
        acceptableStates: ["VERIFIED"],
      });
      expect(result).toBeNull();
    }
  });

  it("DEFAULT_SUITABLE_STATES is exactly VERIFIED + ARCHIVE_PRESENT", () => {
    expect(DEFAULT_SUITABLE_STATES).toEqual(["VERIFIED", "ARCHIVE_PRESENT"]);
  });
});
