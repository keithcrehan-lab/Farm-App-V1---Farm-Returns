import { describe, expect, it } from "vitest";
import { parseEdrObservationsResponse, extractCoverageMetadata, type CoverageJsonResponse } from "./edr-parser";
import { ATHENRY_HOURLY_FIXTURE } from "./edr-parser.fixtures";
import { VALENTIA_EMPTY_REAL_RESPONSE } from "./edr-parser.real-fixtures";

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

// Parser verified against a real, externally captured Met Éireann EDR
// response (VALENTIA_EMPTY_REAL_RESPONSE) — see that fixture's own doc
// comment for full provenance. This is NOT live runtime connectivity —
// this environment still cannot reach opendata2.met.ie itself.
describe("parseEdrObservationsResponse / extractCoverageMetadata — real Met Éireann response", () => {
  const valentiaContext = {
    stationId: "valentia",
    stationName: "Valentia",
    source: "Met Éireann EDR observations-swob-nrt-10min",
    retrievedAt: "2026-08-24T12:00:00Z",
  };

  it("accepts the real response's Coverage/PointSeries envelope without throwing", () => {
    expect(() => parseEdrObservationsResponse(VALENTIA_EMPTY_REAL_RESPONSE, valentiaContext)).not.toThrow();
    expect(VALENTIA_EMPTY_REAL_RESPONSE.type).toBe("Coverage");
    expect(VALENTIA_EMPTY_REAL_RESPONSE.domain?.domainType).toBe("PointSeries");
  });

  it("returns an explicit empty observation list for a genuine zero-observation response — never fake data, never a fake rainfall of 0", () => {
    const { observations } = parseEdrObservationsResponse(VALENTIA_EMPTY_REAL_RESPONSE, valentiaContext);
    // No observation returned at all — not one observation with
    // rainfallMm coerced to 0. There is nothing here to read a rainfall
    // value FROM (this response has no rainfall parameter — see below),
    // so there is no rainfall reading of any kind, present or absent.
    expect(observations).toEqual([]);
  });

  it("degrades gracefully on the one populated (but empty) range, air_pressure_max — matches no field, since it isn't one of EDR_PARAMETER_ALIASES's guessed keys", () => {
    const { diagnostics } = parseEdrObservationsResponse(VALENTIA_EMPTY_REAL_RESPONSE, valentiaContext);
    // Real finding, not a bug to silently fix: Met Éireann's real key is
    // "air_pressure_max" (a 10-minute-max aggregate), which doesn't match
    // any of pressureHPa's guessed aliases ("pressure", "msl_pressure",
    // "station_pressure") — an instantaneous-reading assumption this
    // response shows may not hold. Left unmatched deliberately.
    expect(diagnostics.matchedKeys.pressureHPa).toBeUndefined();
    expect(diagnostics.unmatchedRangeKeys).toContain("air_pressure_max");
  });

  it("extracts real station/collection metadata via extractCoverageMetadata", () => {
    const meta = extractCoverageMetadata(VALENTIA_EMPTY_REAL_RESPONSE);
    expect(meta.collectionId).toBe("observations-swob-nrt-10min");
    expect(meta.stationName).toBe("Valentia Observatory");
    // The real API serialises this as a JSON number, not this app's
    // zero-padded registry string "0102" — kept exactly as given, never
    // silently coerced. See the weather-stations.ts normalisation tests
    // for how the two representations are reconciled where needed.
    expect(meta.stationIdRaw).toBe(102);
    expect(typeof meta.stationIdRaw).toBe("number");
  });

  it("extracts the real coordinates from domain.axes.x/y — never swapped, never fabricated", () => {
    const meta = extractCoverageMetadata(VALENTIA_EMPTY_REAL_RESPONSE);
    expect(meta.coordinates).toEqual({ longitude: -10.240833, latitude: 51.938333 });
  });

  it("extracts the real result counts — all genuinely zero, not absent/undefined", () => {
    const meta = extractCoverageMetadata(VALENTIA_EMPTY_REAL_RESPONSE);
    expect(meta.resultCounts).toEqual({ total: 0, returned: 0, matched: 0 });
  });

  it("identifies the real 21 parameter names Met Éireann's API actually returns", () => {
    const meta = extractCoverageMetadata(VALENTIA_EMPTY_REAL_RESPONSE);
    expect(meta.parameterNames).toHaveLength(21);
    expect(meta.parameterNames).toContain("air_pressure_max");
    expect(meta.parameterNames).toContain("visibility");
  });

  it("parses real generic unit metadata (label.en) for pressure/temperature/humidity/visibility — proves the generic unit parser, not rainfall units", () => {
    const params = VALENTIA_EMPTY_REAL_RESPONSE.parameters ?? {};
    expect(params.air_pressure_max?.unit?.label?.en).toBe("hPa");
    expect(params.air_temperature_max?.unit?.label?.en).toBe("°C");
    expect(params.relative_humidity_max?.unit?.label?.en).toBe("%RH");
    expect(params.visibility?.unit?.label?.en).toBe("m");
  });

  it("this real response contains no rainfall parameter at all — rainfall stays unverified, nothing here promotes it", () => {
    const meta = extractCoverageMetadata(VALENTIA_EMPTY_REAL_RESPONSE);
    const rainfallLike = meta.parameterNames.filter((name) =>
      /rain|precip/i.test(name),
    );
    expect(rainfallLike).toEqual([]);
  });
});
