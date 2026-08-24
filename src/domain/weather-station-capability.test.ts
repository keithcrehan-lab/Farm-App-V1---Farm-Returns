import { describe, expect, it } from "vitest";
import {
  MET_EIREANN_STATION_CAPABILITIES,
  capabilityFor,
  isConfirmedAvailable,
  nearestSuitableStation,
  nearestSuitableStationForField,
  type StationCapability,
} from "./weather-station-capability";
import { MET_EIREANN_STATIONS, type MetEireannStation } from "./weather-stations";

// Synthetic fixture stations/capabilities — NOT real Met Éireann data.
// Used only to prove the selection algorithm itself is correct; the real
// production matrix (MET_EIREANN_STATION_CAPABILITIES) is deliberately
// empty until real capability evidence exists (see that module's doc
// comment).
const NEAR: MetEireannStation = {
  id: "near", name: "Near", latitude: 53.0, longitude: -8.0, elevationM: 0,
  edrStationId: "1111", collections: null, active: null, verifiedAt: null,
};
const FAR_WITH_RAINFALL: MetEireannStation = {
  id: "far_rainfall", name: "Far (has rainfall)", latitude: 53.5, longitude: -8.5, elevationM: 0,
  edrStationId: "2222", collections: null, active: null, verifiedAt: null,
};
const FIXTURE_STATIONS = [NEAR, FAR_WITH_RAINFALL];

function cap(stationId: string, parameter: "rainfallMm", available: boolean | null): StationCapability {
  return { stationId, parameter, available, verifiedVia: "test fixture", verifiedAt: "2026-08-24" };
}

describe("nearestSuitableStation", () => {
  const point = { latitude: 53.0, longitude: -8.0 }; // exactly at NEAR

  it("skips the nearer station when it lacks confirmed capability, picks the farther one that has it", () => {
    const capabilities = {
      near: { rainfallMm: cap("near", "rainfallMm", false) },
      far_rainfall: { rainfallMm: cap("far_rainfall", "rainfallMm", true) },
    };
    const result = nearestSuitableStation(point, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities });
    expect(result?.station.id).toBe("far_rainfall");
  });

  it("treats an unverified (null) capability as not suitable — never assumes availability", () => {
    const capabilities = {
      near: { rainfallMm: cap("near", "rainfallMm", null) }, // not yet verified
      far_rainfall: { rainfallMm: cap("far_rainfall", "rainfallMm", true) },
    };
    const result = nearestSuitableStation(point, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities });
    expect(result?.station.id).toBe("far_rainfall");
  });

  it("returns null when no station has confirmed capability, rather than falling back to nearest regardless", () => {
    const capabilities = {
      near: { rainfallMm: cap("near", "rainfallMm", false) },
      far_rainfall: { rainfallMm: cap("far_rainfall", "rainfallMm", false) },
    };
    const result = nearestSuitableStation(point, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities });
    expect(result).toBeNull();
  });

  it("returns the nearest station when it does have confirmed capability", () => {
    const capabilities = {
      near: { rainfallMm: cap("near", "rainfallMm", true) },
      far_rainfall: { rainfallMm: cap("far_rainfall", "rainfallMm", true) },
    };
    const result = nearestSuitableStation(point, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities });
    expect(result?.station.id).toBe("near");
  });

  it("returns null against an entirely empty capability map", () => {
    const result = nearestSuitableStation(point, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities: {} });
    expect(result).toBeNull();
  });
});

describe("nearestSuitableStationForField", () => {
  it("unpacks [longitude, latitude] the same way weather-stations.ts does", () => {
    const capabilities = { near: { rainfallMm: cap("near", "rainfallMm", true) } };
    const field = { centroid: [-8.0, 53.0] as [number, number] };
    const result = nearestSuitableStationForField(field, "rainfallMm", { stations: FIXTURE_STATIONS, capabilities });
    expect(result?.station.id).toBe("near");
  });
});

describe("capabilityFor / isConfirmedAvailable", () => {
  it("returns null for a station/parameter combination with no entry", () => {
    expect(capabilityFor("near", "rainfallMm")).toBeNull();
    expect(isConfirmedAvailable("near", "rainfallMm")).toBe(false);
  });
});

describe("the real production capability matrix (honest current state)", () => {
  it("is empty — no real Met Éireann capability evidence exists in this runtime yet", () => {
    expect(Object.keys(MET_EIREANN_STATION_CAPABILITIES)).toHaveLength(0);
  });

  it("nearestSuitableStation against real stations + the real (empty) matrix returns null for every parameter, honestly", () => {
    const point = { latitude: 51.9, longitude: -8.49 }; // this farm's real area
    const parameters = [
      "rainfallMm", "airTemperatureC", "relativeHumidityPct", "windSpeedMps",
      "windDirectionDeg", "pressureHPa", "solarRadiationWM2", "soilTemperatureC", "grassTemperatureC",
    ] as const;
    for (const parameter of parameters) {
      expect(nearestSuitableStation(point, parameter, { stations: MET_EIREANN_STATIONS })).toBeNull();
    }
  });
});
