import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { PageHeader } from "./PageHeader";

/**
 * Strict Visual Reproduction phase (2026-09-03): `PageHeader.weather`
 * used to default to a hardcoded `"12°C · Light Rain"` shown as if real
 * on every one of this header's callers, none of which ever passed a
 * real override. These tests guard the fix — real weather from the same
 * Met Éireann pipeline every other consumer uses, or honestly no chip
 * at all, never that fabricated string.
 */

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

function renderHeader() {
  return render(
    <FarmProvider>
      <PageHeader title="Some screen" />
    </FarmProvider>,
  );
}

describe("PageHeader", () => {
  it("never shows the old hard-coded fake reading, whatever the real API returns", async () => {
    mockFetchOnce({ status: "UNAVAILABLE", station: null, nearestGeographicStation: null, observations: [], rollingRainfall: [] });
    renderHeader();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(/12°C/)).toBeNull();
    expect(screen.queryByText(/Light Rain/i)).toBeNull();
  });

  it("shows a real fetched temperature and station, not a fabricated one", async () => {
    const distinctiveTemp = 9.4; // couldn't plausibly appear by coincidence in placeholder copy
    mockFetchOnce({
      status: "LIVE",
      station: { canonicalName: "Cork Airport", distanceKm: 5.9 },
      nearestGeographicStation: null,
      observations: [{ airTemperatureC: distinctiveTemp }],
      rollingRainfall: [],
    });

    renderHeader();

    expect(await screen.findByText(`${distinctiveTemp.toFixed(1)}°C`)).toBeTruthy();
    expect(screen.getByText(/Cork Airport/)).toBeTruthy();
  });

  it("renders no weather chip at all when the real pipeline has no data, rather than a fallback fake reading", async () => {
    mockFetchOnce({ status: "UNAVAILABLE", station: null, nearestGeographicStation: null, observations: [], rollingRainfall: [] });

    renderHeader();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(/°C/)).toBeNull();
  });
});
