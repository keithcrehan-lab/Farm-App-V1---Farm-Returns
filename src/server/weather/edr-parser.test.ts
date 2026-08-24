import { describe, expect, it } from "vitest";
import { parseEdrObservationsResponse, type CoverageJsonResponse } from "./edr-parser";
import { ATHENRY_HOURLY_FIXTURE } from "./edr-parser.fixtures";

const context = {
  stationId: "athenry",
  stationName: "Athenry",
  source: "Met Éireann EDR observations-swob-nrt-60min",
  retrievedAt: "2026-08-24T12:00:00Z",
};

describe("parseEdrObservationsResponse", () => {
  it("produces one observation per timestamp, mapping matched parameters", () => {
    const { observations } = parseEdrObservationsResponse(ATHENRY_HOURLY_FIXTURE, context);
    expect(observations).toHaveLength(3);
    expect(observations[0].observedAt).toBe("2026-04-23T00:00:00Z");
    expect(observations[0].rainfallMm).toBe(0);
    expect(observations[1].rainfallMm).toBeCloseTo(0.2, 5);
    expect(observations[0].airTemperatureC).toBeCloseTo(8.1, 5);
  });

  it("never substitutes zero for a null reading in the response", () => {
    const { observations } = parseEdrObservationsResponse(ATHENRY_HOURLY_FIXTURE, context);
    expect(observations[2].rainfallMm).toBeNull();
  });

  it("leaves unmapped fields null rather than guessing", () => {
    const { observations } = parseEdrObservationsResponse(ATHENRY_HOURLY_FIXTURE, context);
    for (const obs of observations) {
      expect(obs.relativeHumidityPct).toBeNull();
      expect(obs.windSpeedMps).toBeNull();
      expect(obs.soilTemperatureC).toBeNull();
    }
  });

  it("carries the station/source context onto every observation", () => {
    const { observations } = parseEdrObservationsResponse(ATHENRY_HOURLY_FIXTURE, context);
    for (const obs of observations) {
      expect(obs.stationId).toBe("athenry");
      expect(obs.stationName).toBe("Athenry");
      expect(obs.source).toBe(context.source);
      expect(obs.retrievedAt).toBe(context.retrievedAt);
    }
  });

  it("reports diagnostics: which parameter keys matched, and which response keys went unmapped", () => {
    const { diagnostics } = parseEdrObservationsResponse(ATHENRY_HOURLY_FIXTURE, context);
    expect(diagnostics.matchedKeys.rainfallMm).toBe("rainfall");
    expect(diagnostics.matchedKeys.airTemperatureC).toBe("temperature");
    expect(diagnostics.unmatchedRangeKeys).toContain("visibility");
  });

  it("preserves each matched parameter's original unit symbol for traceability", () => {
    const { diagnostics } = parseEdrObservationsResponse(ATHENRY_HOURLY_FIXTURE, context);
    expect(diagnostics.matchedUnits.rainfallMm).toBe("mm");
    expect(diagnostics.matchedUnits.airTemperatureC).toBe("Cel");
  });

  it("stamps each observation's dataStatus from its own freshness at retrieval time", () => {
    const { observations } = parseEdrObservationsResponse(ATHENRY_HOURLY_FIXTURE, context);
    // The fixture's observedAt values (Apr 2026) are long before the
    // context's retrievedAt (Aug 2026) -> STALE at the moment of retrieval.
    for (const obs of observations) {
      expect(obs.dataStatus).toBe("STALE");
    }
  });

  it("degrades gracefully (empty observations, no throw) on a malformed/unexpected shape", () => {
    const malformed = {} as CoverageJsonResponse;
    const result = parseEdrObservationsResponse(malformed, context);
    expect(result.observations).toEqual([]);
    expect(result.diagnostics.matchedKeys).toEqual({});
  });

  it("tries the next candidate key when the first alias isn't present", () => {
    const body: CoverageJsonResponse = {
      domain: { axes: { t: { values: ["2026-04-23T00:00:00Z"] } } },
      ranges: {
        // "rainfall" absent; "precipitation" (2nd alias) present instead.
        precipitation: { axisNames: ["t"], shape: [1], values: [1.4] },
      },
    };
    const { observations, diagnostics } = parseEdrObservationsResponse(body, context);
    expect(observations[0].rainfallMm).toBeCloseTo(1.4, 5);
    expect(diagnostics.matchedKeys.rainfallMm).toBe("precipitation");
  });
});
