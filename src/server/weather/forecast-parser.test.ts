import { describe, expect, it } from "vitest";
import { parseLocationForecastResponse, extractForecastModelRuns } from "./forecast-parser";
import { MINIMAL_FORECAST_FIXTURE } from "./forecast-parser.fixtures";
import { LOCATION_FORECAST_LIVE_REAL_RESPONSE } from "./forecast-parser.real-fixtures";

const context = { source: "Met Éireann locationforecast (Harmonie/EC)", retrievedAt: "2026-08-24T17:00:00Z" };

describe("parseLocationForecastResponse — hand-built structural fixture", () => {
  it("pairs an instant entry with the window entry whose `to` matches its own timestamp", () => {
    const { points } = parseLocationForecastResponse(MINIMAL_FORECAST_FIXTURE, context);
    const at18 = points.find((p) => p.validAt === "2026-08-24T18:00:00Z");
    expect(at18).toBeDefined();
    expect(at18?.airTemperatureC).toBeCloseTo(19.0, 5);
    expect(at18?.rainfallMm).toBeCloseTo(0.2, 5);
    expect(at18?.rainfallWindowStartIso).toBe("2026-08-24T17:00:00Z");
    expect(at18?.symbolId).toBe("LightRain");
  });

  it("leaves rainfall/symbol null (never 0 or fabricated) when an instant has no paired window", () => {
    const { points, diagnostics } = parseLocationForecastResponse(MINIMAL_FORECAST_FIXTURE, context);
    const at19 = points.find((p) => p.validAt === "2026-08-24T19:00:00Z");
    expect(at19?.rainfallMm).toBeNull();
    expect(at19?.rainfallWindowStartIso).toBeNull();
    expect(at19?.symbolId).toBeNull();
    expect(diagnostics.unpairedInstantTimestamps).toContain("2026-08-24T19:00:00Z");
  });

  it("sorts points by time even though the real response interleaves instant/window entries", () => {
    const { points } = parseLocationForecastResponse(MINIMAL_FORECAST_FIXTURE, context);
    const validAts = points.map((p) => p.validAt);
    expect(validAts).toEqual([...validAts].sort());
  });

  it("carries source/retrievedAt onto every point", () => {
    const { points } = parseLocationForecastResponse(MINIMAL_FORECAST_FIXTURE, context);
    for (const p of points) {
      expect(p.source).toBe(context.source);
      expect(p.retrievedAt).toBe(context.retrievedAt);
    }
  });

  it("degrades gracefully (empty points, no throw) on a non-XML/malformed body", () => {
    const result = parseLocationForecastResponse("not xml at all {{{", context);
    expect(result.points).toEqual([]);
  });
});

describe("extractForecastModelRuns — hand-built structural fixture", () => {
  it("reads the real model run metadata", () => {
    const runs = extractForecastModelRuns(MINIMAL_FORECAST_FIXTURE);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual({
      name: "harmonie",
      termin: "2026-08-24T12:00:00Z",
      runEnded: "2026-08-24T15:34:41Z",
      nextRun: "2026-08-24T22:00:00Z",
      coversFrom: "2026-08-24T18:00:00Z",
      coversTo: "2026-08-26T18:00:00Z",
    });
  });

  it("degrades to an empty array on malformed input, never throws", () => {
    expect(extractForecastModelRuns("not xml")).toEqual([]);
  });
});

// Parser verified against a real response this session fetched LIVE from
// openaccess.pf.api.met.ie (not externally captured — see
// LOCATION_FORECAST_LIVE_REAL_RESPONSE's own doc comment).
describe("parseLocationForecastResponse — live-fetched real response (this farm's own Co. Cork coordinates)", () => {
  const liveContext = { source: "Met Éireann locationforecast (Harmonie/EC)", retrievedAt: "2026-08-24T17:45:08Z" };

  it("parses every real instant entry in the excerpt into a point", () => {
    const { points, diagnostics } = parseLocationForecastResponse(LOCATION_FORECAST_LIVE_REAL_RESPONSE, liveContext);
    expect(diagnostics.instantEntryCount).toBe(22);
    expect(diagnostics.windowEntryCount).toBe(22);
    expect(points).toHaveLength(22);
  });

  it("pairs every real instant with its real window — no unpaired entries in this excerpt", () => {
    const { diagnostics } = parseLocationForecastResponse(LOCATION_FORECAST_LIVE_REAL_RESPONSE, liveContext);
    expect(diagnostics.unpairedInstantTimestamps).toEqual([]);
  });

  it("finds the real first point with genuine values", () => {
    const { points } = parseLocationForecastResponse(LOCATION_FORECAST_LIVE_REAL_RESPONSE, liveContext);
    const first = points[0];
    expect(first.validAt).toBe("2026-08-24T18:00:00Z");
    expect(first.airTemperatureC).toBeCloseTo(19.0, 5);
    expect(first.humidityPct).toBeCloseTo(53.2, 5);
    expect(first.pressureHPa).toBeCloseTo(1014.8, 5);
  });

  it("finds the real genuine nonzero rainfall reading in this window, not a fabricated one", () => {
    const { points } = parseLocationForecastResponse(LOCATION_FORECAST_LIVE_REAL_RESPONSE, liveContext);
    const withRain = points.filter((p) => p.rainfallMm !== null && p.rainfallMm > 0);
    expect(withRain.length).toBeGreaterThan(0);
    expect(withRain[0].symbolId).toBeTruthy();
  });

  it("reads the real four model runs (harmonie + three EC tiers)", () => {
    const runs = extractForecastModelRuns(LOCATION_FORECAST_LIVE_REAL_RESPONSE);
    expect(runs.map((r) => r.name)).toEqual(["harmonie", "ec_n1280_1hr", "ec_n1280_3hr", "ec_n1280_6hr"]);
    expect(runs[0].termin).toBe("2026-08-24T12:00:00Z");
    expect(runs[0].nextRun).toBe("2026-08-24T22:00:00Z");
  });
});
