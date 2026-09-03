import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { tracked } from "@/domain/types";
import type { Farm, LivestockGroup } from "@/domain/types";
import FeedOptimiserPage from "./page";

/**
 * Authenticated Real-Data Stabilisation Phase, Codex audit round 4
 * (MEDIUM): "the only added tests exercise `LivestockEconomicsView`;
 * `/feed-optimiser` has no corresponding regression test... a future
 * change could therefore restore its mock cattle-price calculation for
 * authenticated users unnoticed." Covers the same real-mode safety
 * boundary this screen shares with `LivestockEconomicsView.tsx` (a real
 * steer group's margin is suppressed for a real authenticated farmer;
 * demo mode is unaffected), plus the round-4 contradictory-copy fix.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

const farm: Farm = {
  id: "farm-1",
  name: "Test Farm",
  location: { county: "Cork", centroid: [-8.48, 51.9] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "A Real Farmer",
};

function steerGroup(): LivestockGroup {
  return {
    id: "group-1",
    farmId: "farm-1",
    category: "steer",
    label: "Steers",
    count: tracked(10, "verified", "A Real Farmer"),
    avgWeightKg: tracked(450, "verified", "A Real Farmer"),
    system: "grazing",
    goal: "finish_slaughter",
    value: tracked(5000, "estimated", "Farm Return assumption"),
  };
}

function renderRemote(groups: LivestockGroup[]) {
  return render(
    <FarmProvider remote initialState={{ farm, fields: [], livestockGroups: groups, housing: [], slurryAllocations: [] }}>
      <FeedOptimiserPage />
    </FarmProvider>,
  );
}

function renderDemo(groups: LivestockGroup[]) {
  return render(
    <FarmProvider initialState={{ farm, fields: [], livestockGroups: groups, housing: [], slurryAllocations: [] }}>
      <FeedOptimiserPage />
    </FarmProvider>,
  );
}

describe("FeedOptimiserPage — real-mode market-data safety boundary", () => {
  it("real mode + a real steer group: shows the honest unavailable card, never a margin computed from the mock cattle price", () => {
    renderRemote([steerGroup()]);
    expect(screen.getByText(/Market data is currently unavailable/)).toBeTruthy();
    expect(screen.queryByText(/optimise forecast margin/)).toBeNull();
  });

  it("demo/mock mode: the mock cattle price still renders — this boundary only ever protects a real authenticated farmer", () => {
    renderDemo([steerGroup()]);
    expect(screen.queryByText(/Market data is currently unavailable/)).toBeNull();
    expect(screen.getByText(/optimise forecast margin/)).toBeTruthy();
  });
});
