import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { tracked } from "@/domain/types";
import type { Farm, LivestockGroup } from "@/domain/types";
import { LivestockEconomicsView } from "./LivestockEconomicsView";

/**
 * Authenticated Real-Data Stabilisation Phase, Codex audit round 3
 * (MEDIUM): "no regression tests accompany the new real-mode safety
 * boundary in either changed screen... it should be component-tested
 * rather than relying only on manual source inspection." Covers exactly
 * the four cases that boundary distinguishes: a real steer/heifer group
 * (mock-price path suppressed), a real weanling group (real CSO pricing
 * unaffected), demo/mock mode (unchanged — the mock price still shows,
 * since there is no real farmer to protect from it there), and a
 * genuinely unsupported group (falls through to `notFound()`, never
 * mislabelled as merely lacking market data).
 */

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  // `MobileDetailHeader` (rendered by every branch of this view) reads
  // this for its back-button — not under test here, a plain stub is
  // enough.
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

function group(overrides: Partial<LivestockGroup> = {}): LivestockGroup {
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
    ...overrides,
  };
}

function renderRemote(el: ReactElement, groups: LivestockGroup[]) {
  return render(
    <FarmProvider remote initialState={{ farm, fields: [], livestockGroups: groups, housing: [], slurryAllocations: [] }}>
      {el}
    </FarmProvider>,
  );
}

function renderDemo(el: ReactElement, groups: LivestockGroup[]) {
  // `FarmProvider`'s own `initialState` prop seeds `useState` regardless
  // of `remote` — passing it here (without `remote`) gives this test its
  // own group fixture while keeping `isRemote: false`, exactly the
  // "unaffected in demo mode" case under test; using the real
  // `mockFarm`/mock-farm seed data instead would tie this test to
  // whichever demo group ids happen to exist there today.
  return render(
    <FarmProvider initialState={{ farm, fields: [], livestockGroups: groups, housing: [], slurryAllocations: [] }}>
      {el}
    </FarmProvider>,
  );
}

describe("LivestockEconomicsView — real-mode market-data safety boundary", () => {
  it("real mode + a real steer group: shows the honest unavailable state, never a margin computed from the mock cattle price", () => {
    renderRemote(<LivestockEconomicsView groupId="group-1" />, [group()]);
    expect(screen.getByText("Market data is currently unavailable")).toBeTruthy();
    expect(screen.queryByText(/Bord Bia/)).toBeNull();
  });

  it("real mode + a real weanling group: the real CSO live-mart pricing path is unaffected", () => {
    renderRemote(
      <LivestockEconomicsView groupId="group-1" />,
      [group({ category: "weanling", goal: undefined, avgWeightKg: tracked(320, "verified", "A Real Farmer") })],
    );
    expect(screen.queryByText("Market data is currently unavailable")).toBeNull();
    // The real pricing assumption (real CSO live-mart prices, distinct
    // from the mock per-kg-carcass path) surfaces in the disabled
    // "Market assumptions" button's own `title` attribute — not visible
    // text content — so it's checked there directly.
    expect(screen.getByTitle(/real CSO live-mart prices/)).toBeTruthy();
  });

  it("demo/mock mode: the mock cattle price still renders — this boundary only ever protects a real authenticated farmer", () => {
    renderDemo(<LivestockEconomicsView groupId="group-1" />, [group()]);
    expect(screen.queryByText("Market data is currently unavailable")).toBeNull();
    expect(screen.getByTitle(/Bord Bia/)).toBeTruthy();
  });

  it("real mode + a genuinely unsupported group (no finish_slaughter goal): falls through to notFound(), never mislabelled as merely lacking market data — Codex audit round 2's own fix", () => {
    expect(() =>
      renderRemote(<LivestockEconomicsView groupId="group-1" />, [group({ goal: undefined })]),
    ).toThrow("NEXT_NOT_FOUND");
  });
});
