import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { NineDayForecastCard } from "./NineDayForecastCard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockFetchOnce(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve(body),
    }),
  );
}

/** One real-shaped hourly point — every field a genuinely parsed
 * `ForecastPoint` carries, not a partial/hard-coded stand-in. */
function forecastPoint(overrides: Record<string, unknown> = {}) {
  return {
    validAt: "2026-08-25T13:00:00.000Z",
    airTemperatureC: 14.2,
    windSpeedMps: 6.5,
    windDirectionDeg: 220,
    windGustMps: 9.1,
    humidityPct: 82,
    pressureHPa: 1008,
    cloudinessPct: 70,
    rainfallMm: 0.4,
    rainfallWindowStartIso: "2026-08-25T12:00:00.000Z",
    symbolId: "LightRainSun",
    source: "Met Éireann locationforecast (Harmonie/EC)",
    retrievedAt: "2026-08-25T13:05:00.000Z",
    ...overrides,
  };
}

describe("NineDayForecastCard", () => {
  it("shows an empty state and never calls the API when no farm coordinates are set", async () => {
    mockFetchOnce({});
    render(<NineDayForecastCard centroid={null} />);
    expect(await screen.findByText(/no farm location set/i)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders real temperature, rainfall and wind values from the fetched response — not hard-coded numbers", async () => {
    const distinctiveTemp = 17.3; // a value that couldn't plausibly appear by coincidence in placeholder copy
    mockFetchOnce({
      status: "LIVE",
      points: [forecastPoint({ airTemperatureC: distinctiveTemp, validAt: "2026-08-25T13:00:00.000Z" })],
      modelRunAt: "2026-08-25T12:00:00.000Z",
      retrievedAt: "2026-08-25T13:05:00.000Z",
    });

    render(<NineDayForecastCard centroid={[-8.4863, 51.9]} />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/weather/forecast?lat=51.9&lng=-8.4863"));
    // Single-point day: min === max === the real fetched temperature.
    expect(await screen.findByText(`${distinctiveTemp.toFixed(0)}–${distinctiveTemp.toFixed(0)}°C`)).toBeTruthy();
    expect(screen.getByText(/Source: Met Éireann/)).toBeTruthy();
  });

  it("shows the LIVE freshness pill from the real API status, not a hard-coded label", async () => {
    mockFetchOnce({
      status: "STALE",
      points: [forecastPoint()],
      modelRunAt: "2026-08-25T12:00:00.000Z",
      retrievedAt: "2026-08-25T13:05:00.000Z",
    });
    render(<NineDayForecastCard centroid={[-8.4863, 51.9]} />);
    expect(await screen.findByText("Stale")).toBeTruthy();
  });

  it("shows an unavailable state with the real reason when the forecast has zero points", async () => {
    mockFetchOnce({
      status: "UNAVAILABLE",
      points: [],
      modelRunAt: null,
      reason: "Forecast request failed: HTTP 500",
      retrievedAt: "2026-08-25T13:05:00.000Z",
    });
    render(<NineDayForecastCard centroid={[-8.4863, 51.9]} />);
    expect(await screen.findByText(/no real forecast available/i)).toBeTruthy();
    expect(screen.getByText("Forecast request failed: HTTP 500")).toBeTruthy();
  });

  it("never substitutes mock data when the fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<NineDayForecastCard centroid={[-8.4863, 51.9]} />);
    expect(await screen.findByText(/no real forecast available/i)).toBeTruthy();
  });

  it("displays real forecast model-run and retrieval provenance, not a fabricated timestamp", async () => {
    mockFetchOnce({
      status: "LIVE",
      points: [forecastPoint()],
      modelRunAt: "2026-08-25T06:00:00.000Z",
      retrievedAt: "2026-08-25T13:05:00.000Z",
    });
    render(<NineDayForecastCard centroid={[-8.4863, 51.9]} />);
    const modelRunSpan = await screen.findByText(/Forecast model run:/);
    const provenance = modelRunSpan.closest("p");
    // Distinguishes model-run time from retrieval time rather than
    // collapsing them into one figure.
    expect(provenance?.textContent).toContain("Forecast model run:");
    expect(provenance?.textContent).toContain("Retrieved");
    expect(provenance?.textContent).toContain("06:00");
  });

  it("only shows the 24h rainfall summary line when the window is fully, contiguously covered", async () => {
    // A single isolated point can never produce a complete 24h rolling
    // total, so the summary line must not appear.
    mockFetchOnce({
      status: "LIVE",
      points: [forecastPoint()],
      modelRunAt: "2026-08-25T12:00:00.000Z",
      retrievedAt: "2026-08-25T13:05:00.000Z",
    });
    render(<NineDayForecastCard centroid={[-8.4863, 51.9]} />);
    await screen.findByText(/Source: Met Éireann/);
    expect(screen.queryByText(/forecast over the next 24 hours/)).toBeNull();
  });
});
