import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { GrassWedgeChart } from "./GrassWedgeChart";
import type { WedgeBar } from "@/domain/grass-wedge-target";

const bars: Array<WedgeBar & { currentCoverKgDmHa?: number }> = [
  { fieldId: "gain", name: "Meadow", areaHa: 2, coverKgDmHa: 2000, currentCoverKgDmHa: 1700, x: 0, width: .33, centre: .165 },
  { fieldId: "loss", name: "Hill", areaHa: 2, coverKgDmHa: 1400, currentCoverKgDmHa: 1750, x: .33, width: .34, centre: .5 },
  { fieldId: "unknown", name: "Other", areaHa: 1, x: .67, width: .33, centre: .835 },
];
const selection = vi.fn();
const renderChart = (days: number, b = bars) => render(
  <GrassWedgeChart bars={b} horizonDays={days} onSelect={selection} occupiedFieldIds={new Set(["loss"])} />,
);
afterEach(() => { cleanup(); selection.mockClear(); });

describe("Grass wedge projected portions", () => {
  it("keeps Now bars solid and has no forecast legend or hatched portions", () => {
    const { container } = renderChart(0);
    expect(container.querySelectorAll("[data-wedge-forecast-gain], [data-wedge-forecast-loss]")).toHaveLength(0);
    expect(screen.queryByText("Projected gain")).toBeNull();
    expect(screen.queryByText("Projected loss")).toBeNull();
    expect(screen.getByRole("button", { name: /Meadow: 2,000 kg DM\/ha/ })).toBeInTheDocument();
  });
  it("shows light-hatched forecast gains and amber outlined losses over the true projected bars", () => {
    const { container } = renderChart(7);
    const gain = container.querySelector('[data-wedge-forecast-gain="gain"]')!;
    const loss = container.querySelector('[data-wedge-forecast-loss="loss"]')!;
    expect(gain).toBeTruthy();
    expect(loss).toBeTruthy();
    expect(gain.querySelectorAll("rect")).toHaveLength(2);
    expect(loss.querySelectorAll("rect")).toHaveLength(2);
    expect(container.querySelector('[data-wedge-current="gain"]')).toBeTruthy();
    expect(container.querySelector('[data-wedge-current="loss"]')).toBeTruthy();
    // SVG geometry uses the engine's current and projected values; no new growth maths.
    const yMax = 2500;
    const plotH = 300 - 12 - 4;
    const gainH = (300 / yMax) * plotH;
    const lossH = (350 / yMax) * plotH;
    expect(Number(gain.querySelector("rect")!.getAttribute("height"))).toBeCloseTo(gainH, 5);
    expect(Number(loss.querySelector("rect")!.getAttribute("height"))).toBeCloseTo(lossH, 5);
    expect(Number(container.querySelector('[data-wedge-current="loss"]')!.getAttribute("height"))).toBeCloseTo((1400 / yMax) * plotH, 5);
    expect(screen.getByText("Current cover (measured/est.)")).toBeInTheDocument();
    expect(screen.getByText("Projected gain")).toBeInTheDocument();
    expect(screen.getByText("Projected loss")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Meadow: current 1,700 kg DM\/ha, projected 2,000 kg DM\/ha after 7 days/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hill: current 1,750 kg DM\/ha, projected 1,400 kg DM\/ha after 7 days/ })).toBeInTheDocument();
  });
  it("uses the same display at 3 days and preserves per-field selection", () => {
    renderChart(3);
    fireEvent.click(screen.getByRole("button", { name: /Meadow: current/ }));
    expect(selection).toHaveBeenCalledWith("gain");
    expect(screen.getByText("Projected gain")).toBeInTheDocument();
  });
  it("does not invent a forecast segment for unknown baseline or unknown projected cover", () => {
    const { container } = renderChart(7, [
      { fieldId: "missing-current", name: "Unmeasured baseline", areaHa: 1, coverKgDmHa: 1900, x: 0, width: .5, centre: .25 },
      { fieldId: "missing-projection", name: "No projection", areaHa: 1, currentCoverKgDmHa: 1650, x: .5, width: .5, centre: .75 },
    ]);
    expect(container.querySelectorAll("[data-wedge-forecast-gain], [data-wedge-forecast-loss]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-wedge-current]")).toHaveLength(0);
    expect(screen.queryByText("Projected gain")).toBeNull();
  });
});
