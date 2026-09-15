import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LivestockGroupCard } from "./LivestockGroupCard";
import { tracked } from "@/domain/types";
import type { LivestockGroup } from "@/domain/types";

afterEach(() => {
  cleanup();
});

function group(overrides: Partial<LivestockGroup> = {}): LivestockGroup {
  return {
    id: "g1",
    farmId: "farm-1",
    category: "suckler_cow",
    label: "weanlings",
    count: tracked(20, "verified", "Farmer"),
    system: "grazing",
    value: tracked(30000, "estimated", "Farm Return estimate"),
    ...overrides,
  };
}

// Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
// F9) — the real audited case reproduced on the main Livestock list
// card: a group labelled "weanlings" stored with category
// "suckler_cow" must show that real category, not just the label.
describe("LivestockGroupCard", () => {
  it("exposes the real category actually driving calculations on the main livestock list card", () => {
    render(<LivestockGroupCard group={group()} />);
    expect(screen.getByText("weanlings")).toBeTruthy();
    expect(screen.getByText(/calculated as Suckler cow/i)).toBeTruthy();
  });

  it("shows the real category alongside the existing avg-weight figure, never replacing it", () => {
    render(<LivestockGroupCard group={group({ avgWeightKg: tracked(320, "estimated", "Farm Return estimate") })} />);
    expect(screen.getByText(/calculated as Suckler cow · Avg 320 kg/i)).toBeTruthy();
  });
});
