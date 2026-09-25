import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TodayControlRoomRail } from "./TodayControlRoomRail";
import type { TodayOpportunity } from "@/orchestration/prompt/today-opportunities";

afterEach(() => {
  cleanup();
});

function opportunity(overrides: Partial<TodayOpportunity> = {}): TodayOpportunity {
  return {
    category: "slurry",
    categoryLabel: "Slurry",
    priority: "HIGH",
    priorityLabel: "High priority",
    priorityReasons: [],
    blockers: [],
    headline: "Spreading open on 10 fields",
    metrics: [{ label: "Volume available to allocate", value: "116 m³" }],
    affectedFieldCount: 10,
    affectedFieldIds: Array.from({ length: 10 }, (_, i) => `field-${i}`),
    fields: [],
    ...overrides,
  };
}

describe("TodayControlRoomRail", () => {
  it("renders exactly one row per opportunity, using its own real data", () => {
    const opportunities = [
      opportunity(),
      opportunity({ category: "lime", categoryLabel: "Lime", priority: "MEDIUM", priorityLabel: "Medium priority", headline: "4 fields have a verified lime requirement", metrics: [{ label: "Total requirement", value: "42.5 t" }], affectedFieldCount: 4 }),
    ];
    render(<TodayControlRoomRail opportunities={opportunities} onSelectOpportunity={vi.fn()} />);
    expect(screen.getAllByText("Slurry")).toHaveLength(1);
    expect(screen.getAllByText("Lime")).toHaveLength(1);
    expect(screen.getByText("10 fields · 116 m³")).toBeTruthy();
    expect(screen.getByText("4 fields · 42.5 t")).toBeTruthy();
    expect(screen.getByText("Spreading open on 10 fields")).toBeTruthy();
  });

  it("calls onSelectOpportunity with the real opportunity object when a row is clicked", () => {
    const onSelectOpportunity = vi.fn();
    const slurry = opportunity();
    render(<TodayControlRoomRail opportunities={[slurry]} onSelectOpportunity={onSelectOpportunity} />);
    fireEvent.click(screen.getByText("Slurry").closest("button")!);
    expect(onSelectOpportunity).toHaveBeenCalledWith(slurry);
  });

  it("marks the selected category's row as pressed", () => {
    const slurry = opportunity();
    const lime = opportunity({ category: "lime", categoryLabel: "Lime" });
    render(<TodayControlRoomRail opportunities={[slurry, lime]} selectedCategory="slurry" onSelectOpportunity={vi.fn()} />);
    expect(screen.getByText("Slurry").closest("button")?.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Lime").closest("button")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("omits the metric segment when an opportunity has no real metric", () => {
    render(<TodayControlRoomRail opportunities={[opportunity({ metrics: [] })]} onSelectOpportunity={vi.fn()} />);
    expect(screen.getByText("10 fields")).toBeTruthy();
  });
});
