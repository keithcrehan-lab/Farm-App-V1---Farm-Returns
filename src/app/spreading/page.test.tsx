import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import SpreadingPage from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A generic "no live data yet" response shape both the observations and
 * forecast API routes can return — enough for CurrentConditionsCard/
 * NineDayForecastCard to render their real UNAVAILABLE state without
 * erroring, since this test isn't about those cards' own fetch logic
 * (covered by their own test files) but about what the mock spreading
 * score no longer shows. */
function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          status: "UNAVAILABLE",
          points: [],
          observations: [],
          rollingRainfall: [],
          station: null,
          nearestGeographicStation: null,
          fallbackUsed: false,
          modelRunAt: null,
          reason: "test stub",
          retrievedAt: new Date().toISOString(),
        }),
    }),
  );
}

function renderSpreadingPage() {
  return render(
    <FarmProvider>
      <SpreadingPage />
    </FarmProvider>,
  );
}

describe("SpreadingPage — mock score neutralisation", () => {
  it("never shows a numeric X/100 score anywhere on the page", async () => {
    stubFetch();
    renderSpreadingPage();
    await screen.findByText("Spreading suitability score");
    expect(screen.queryByText(/\/100/)).toBeNull();
  });

  it("never shows recommendation-like band labels from the mock score", async () => {
    stubFetch();
    renderSpreadingPage();
    await screen.findByText("Spreading suitability score");
    expect(screen.queryByText(/very good/i)).toBeNull();
    expect(screen.queryByText(/marginal/i)).toBeNull();
    expect(screen.queryByText(/^good$/i)).toBeNull();
    expect(screen.queryByText(/^poor$/i)).toBeNull();
  });

  it("never shows the old hard-stop safety wording for any field, including the one mock hard-stop entry", async () => {
    stubFetch();
    renderSpreadingPage();
    await screen.findByText("Spreading suitability score");
    // River Field was the mock hard-stop entry ("Heavy rainfall > 20mm
    // forecast, Saturated ground... Hard stop — do not spread").
    expect(screen.getAllByText("River Field").length).toBeGreaterThan(0);
    expect(screen.queryByText(/hard stop/i)).toBeNull();
    expect(screen.queryByText(/do not spread/i)).toBeNull();
    expect(screen.queryByText(/saturated ground/i)).toBeNull();
  });

  it("shows the neutral 'under validation' state only on the hero card — real per-field rows now show a real statutory calendar status instead", async () => {
    // V3 closure pass (second pass) — the four field rows previously
    // showed the same unconditional "Under validation" placeholder as
    // the hero card. They now show a real, deterministic
    // checkClosedPeriodCalendar result (S.I. 588/2025), so this assertion
    // is deliberately NOT pinned to today's real date (which would make
    // this test flaky as the calendar boundary passes) — only that the
    // hero's placeholder is unaffected and each field row shows one of
    // the two real calendar outcomes, never the placeholder.
    stubFetch();
    renderSpreadingPage();
    await screen.findByText("Spreading suitability score");
    const notices = await screen.findAllByText("Under validation");
    expect(notices.length).toBe(1); // hero card only
    const openOrClosed = [...screen.queryAllByText("Open"), ...screen.queryAllByText("Closed period")];
    expect(openOrClosed.length).toBe(4); // one real status per mock field row
  });

  it("still renders CurrentConditionsCard", async () => {
    stubFetch();
    renderSpreadingPage();
    expect(await screen.findByText("Current conditions")).toBeTruthy();
  });

  it("still renders NineDayForecastCard", async () => {
    stubFetch();
    renderSpreadingPage();
    expect(await screen.findByText("9-Day Farm Forecast")).toBeTruthy();
  });

  it("fetches from both the observations and forecast APIs, unaffected by the score change", async () => {
    stubFetch();
    renderSpreadingPage();
    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
      expect(calls.some((url) => url.includes("/api/weather/observations"))).toBe(true);
      expect(calls.some((url) => url.includes("/api/weather/forecast"))).toBe(true);
    });
  });

  it("still renders all four field rows by name", async () => {
    stubFetch();
    renderSpreadingPage();
    await screen.findByText("Spreading suitability score");
    // getAllByText, not getByText: field names also legitimately appear
    // in the (unrelated) Planned Applications card further down the page.
    expect(screen.getAllByText("Back Field").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Home Field").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Road Field").length).toBeGreaterThan(0);
    expect(screen.getAllByText("River Field").length).toBeGreaterThan(0);
  });
});
