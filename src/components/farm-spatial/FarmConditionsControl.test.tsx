import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FarmConditionsControl } from "./FarmConditionsControl";
import { farmConditionsSummary, spreadingCalendarEntry } from "@/lib/farm-conditions-summary";

const CENTROID: [number, number] = [-8.75, 53.29];

function stubWeather(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ json: () => Promise.resolve(body) })));
}

function weather(overrides: Record<string, unknown> = {}) {
  return {
    status: "STALE",
    station: { canonicalName: "Athenry", distanceKm: 4.2 },
    nearestGeographicStation: null,
    observations: [{ airTemperatureC: 12.9 }],
    rollingRainfall: [],
    ...overrides,
  };
}

const bothClosed = farmConditionsSummary([
  spreadingCalendarEntry({ id: "chemical", label: "Chemical fertiliser", openCount: 0, prohibitedCount: 3, assessedCount: 3 }),
  spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: 0, prohibitedCount: 3, assessedCount: 3 }),
]);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FarmConditionsControl (Farm Home visual refresh v1)", () => {
  it("shows the real station temperature, name and freshness with the derived restriction count", async () => {
    stubWeather(weather());
    render(<FarmConditionsControl centroid={CENTROID} summary={bothClosed} ready />);
    const trigger = screen.getByRole("button", { name: /^conditions:/i });
    await waitFor(() => expect(within(trigger).getByText("12.9°")).toBeTruthy());
    expect(within(trigger).getByText("Athenry")).toBeTruthy();
    expect(within(trigger).getByText(/stale/i)).toBeTruthy();
    expect(within(trigger).getByText("2 restrictions")).toBeTruthy();
    expect(trigger.getAttribute("aria-label")).toMatch(/12\.9°C, Athenry station, stale\. 2 restrictions/);
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
  });

  it("discloses the regulatory calendar separately from weather freshness, and closes predictably", async () => {
    stubWeather(weather());
    render(<FarmConditionsControl centroid={CENTROID} summary={bothClosed} ready />);
    const trigger = screen.getByRole("button", { name: /^conditions:/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("group", { name: "Farm conditions" })).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("group", { name: "Farm conditions" });
    expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
    const calendar = panel.querySelector("[data-conditions-calendar]") as HTMLElement;
    expect(within(calendar).getByText("Chemical fertiliser").nextElementSibling?.textContent).toBe("Closed period");
    expect(within(calendar).getByText("Slurry").nextElementSibling?.textContent).toBe("Closed period");
    expect(within(calendar).queryByText(/stale/i)).toBeNull();
    await waitFor(() => expect(panel.querySelector("[data-conditions-station]")).toBeTruthy());
    const station = panel.querySelector("[data-conditions-station]") as HTMLElement;
    expect(within(station).getByText("Stale")).toBeTruthy();
    expect(within(station).getByText(/not an in-field sensor/i)).toBeTruthy();
    expect(within(panel).queryByText(/suitable/i)).toBeNull();

    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Farm conditions" })).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close conditions" }));
    expect(screen.queryByRole("group", { name: "Farm conditions" })).toBeNull();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("group", { name: "Farm conditions" })).toBeNull();
  });

  it("keeps Escape local so it never reaches document-level handlers (e.g. field deselection)", () => {
    stubWeather(weather());
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    try {
      render(<FarmConditionsControl centroid={CENTROID} summary={bothClosed} ready />);
      fireEvent.click(screen.getByRole("button", { name: /^conditions:/i }));
      fireEvent.keyDown(screen.getByRole("group", { name: "Farm conditions" }), { key: "Escape" });
      expect(documentEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", documentEscape);
    }
  });

  it("is honest when nothing is known: no reading, no calendar — never a zero or a fabricated value", async () => {
    stubWeather({ status: "UNAVAILABLE", station: null, nearestGeographicStation: null, observations: [], rollingRainfall: [] });
    render(<FarmConditionsControl centroid={CENTROID} summary={farmConditionsSummary([undefined, undefined])} ready />);
    const trigger = screen.getByRole("button", { name: /^conditions:/i });
    expect(within(trigger).getByText("Calendar not assessed")).toBeTruthy();
    fireEvent.click(trigger);
    const panel = screen.getByRole("group", { name: "Farm conditions" });
    expect(within(panel).getByText(/no mapped field has a spreading-calendar status yet/i)).toBeTruthy();
    await waitFor(() => expect(within(panel).getByText(/no station reading is available/i)).toBeTruthy());
    expect(within(trigger).queryByText(/°/)).toBeNull();
    expect(within(panel).queryByText(/\b0\b/)).toBeNull();
  });

  it("an unknown temperature stays a dash, never 0°", async () => {
    stubWeather(weather({ status: "LIVE", observations: [{ airTemperatureC: null }] }));
    render(<FarmConditionsControl centroid={CENTROID} summary={bothClosed} ready />);
    const trigger = screen.getByRole("button", { name: /^conditions:/i });
    await waitFor(() => expect(within(trigger).getByText("—")).toBeTruthy());
    expect(within(trigger).queryByText(/0°/)).toBeNull();
  });

  it("does not claim a calendar result before the screen has computed one", () => {
    stubWeather(weather());
    render(<FarmConditionsControl centroid={CENTROID} summary={farmConditionsSummary([])} ready={false} />);
    const trigger = screen.getByRole("button", { name: /^conditions:/i });
    expect(within(trigger).getByText("Checking calendar")).toBeTruthy();
    expect(within(trigger).queryByText(/restriction|not assessed/i)).toBeNull();
  });
});
