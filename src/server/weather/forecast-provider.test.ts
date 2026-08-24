import { afterEach, describe, expect, it, vi } from "vitest";
import { meteireannLocationForecastProvider, notImplementedForecastProvider } from "./forecast-provider";
import * as forecastClient from "./forecast-client";
import { MINIMAL_FORECAST_FIXTURE } from "./forecast-parser.fixtures";

describe("notImplementedForecastProvider", () => {
  it("always reports UNAVAILABLE with a real, honest reason, never fabricated points", async () => {
    const result = await notImplementedForecastProvider.getForecastForField({ centroid: [-8.5, 51.9] });
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.points).toEqual([]);
    expect(result.modelRunAt).toBeNull();
    expect(result.reason).toMatch(/no-op stub/i);
  });
});

describe("meteireannLocationForecastProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns UNAVAILABLE (never throws, never fabricates) when the fetch fails", async () => {
    vi.spyOn(forecastClient, "fetchLocationForecast").mockResolvedValue({
      status: "unavailable",
      reason: "simulated network failure",
      retrievedAt: "2026-08-24T17:00:00Z",
      url: null,
    });

    const result = await meteireannLocationForecastProvider.getForecastForField({ centroid: [-8.4863, 51.9] });
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.points).toEqual([]);
    expect(result.reason).toBe("simulated network failure");
  });

  it("parses a successful response and reports LIVE using the model's own nextrun schedule", async () => {
    vi.spyOn(forecastClient, "fetchLocationForecast").mockResolvedValue({
      status: "ok",
      xmlText: MINIMAL_FORECAST_FIXTURE,
      retrievedAt: "2026-08-24T17:00:00Z", // before harmonie's real nextrun (22:00Z)
      url: "http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat=51.9&long=-8.4863",
    });

    const result = await meteireannLocationForecastProvider.getForecastForField({ centroid: [-8.4863, 51.9] });
    expect(result.status).toBe("LIVE");
    expect(result.modelRunAt).toBe("2026-08-24T12:00:00Z");
    expect(result.points.length).toBeGreaterThan(0);
  });

  it("reports STALE once now is past the model's own stated nextrun time", async () => {
    vi.spyOn(forecastClient, "fetchLocationForecast").mockResolvedValue({
      status: "ok",
      xmlText: MINIMAL_FORECAST_FIXTURE,
      retrievedAt: "2026-08-25T01:00:00Z", // after harmonie's real nextrun (22:00Z the prior day)
      url: "http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat=51.9&long=-8.4863",
    });

    const result = await meteireannLocationForecastProvider.getForecastForField({ centroid: [-8.4863, 51.9] });
    expect(result.status).toBe("STALE");
  });

  it("returns UNAVAILABLE when the response parses to zero points", async () => {
    vi.spyOn(forecastClient, "fetchLocationForecast").mockResolvedValue({
      status: "ok",
      xmlText: "<weatherdata></weatherdata>",
      retrievedAt: "2026-08-24T17:00:00Z",
      url: "http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat=51.9&long=-8.4863",
    });

    const result = await meteireannLocationForecastProvider.getForecastForField({ centroid: [-8.4863, 51.9] });
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.reason).toMatch(/no usable time points/i);
  });
});
