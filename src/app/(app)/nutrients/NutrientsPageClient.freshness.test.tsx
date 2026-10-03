import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * Campaign B closure audit HIGH — a saved declaration whose re-read failed
 * leaves the cached regulatory evidence (or slurry plan) `stale`. Nutrients
 * must not pass that cached neat-slurry quantity into
 * `calculateNutrientPlan`: the NAP check stays blocked until a re-read
 * succeeds.
 */
const freshness = vi.hoisted(() => ({ evidence: "current" as "current" | "stale", plan: "current" as "current" | "stale" }));
const KNOWN_NEAT = vi.hoisted(() => ({ volumeM3: 60, status: "farmer_adjusted" as const, source: "Farmer declaration" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/app/actions/fertiliser-plan", async () => {
  const { aggregateFarmFertiliserPurchasing, buildFarmFertiliserQuoteBasket } = await import("@/domain/fertiliser-plan");
  const aggregation = aggregateFarmFertiliserPurchasing([]);
  return {
    getMatchablePlanForFieldAction: vi.fn().mockResolvedValue({ status: "none" }),
    getFieldFertiliserStatusAction: vi.fn().mockResolvedValue({ status: "not_applicable" }),
    getFarmFertiliserDemandAction: vi.fn().mockResolvedValue({
      demand: [],
      purchaseRequirementTonnes: [],
      truncated: false,
      applicationsWithUnknownComposition: 0,
      fieldsWithBlockedEvidence: 0,
      aggregation,
      basket: buildFarmFertiliserQuoteBasket(aggregation, { farmId: "farm-1", createdAt: "2026-10-03T00:00:00.000Z" }),
    }),
    getFarmLimeRequirementAction: vi.fn().mockResolvedValue({ fields: [], farmTotalTonnes: 0, fieldsWithoutLimeEvidence: 0 }),
  };
});
vi.mock("@/app/actions/decisions", () => ({ submitPromptDecisionAction: vi.fn() }));
vi.mock("@/store/farm-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/store/farm-store")>()),
  useRegulatoryEvidenceFreshness: () => freshness.evidence,
  useSlurryPlanFreshness: () => freshness.plan,
}));
// The evidence on file resolves to a known neat quantity; only freshness varies.
vi.mock("@/domain/slurry-regulatory-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domain/slurry-regulatory-context")>()),
  plannedRegulatoryNeatSlurryForNutrientPlan: () => KNOWN_NEAT,
}));
vi.mock("@/domain/nutrients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/nutrients")>();
  return { ...actual, calculateNutrientPlan: vi.fn(actual.calculateNutrientPlan) };
});

import { FarmProvider } from "@/store/farm-store";
import { NutrientsPageClient } from "./NutrientsPageClient";
import { calculateNutrientPlan } from "@/domain/nutrients";
import type { Farm, Field, LivestockGroup } from "@/domain/types";

const FARM: Farm = { id: "farm-1", name: "Test Farm", location: { county: "Cork", centroid: [0, 0] }, primaryEnterprises: ["suckler_beef"], units: "metric", ownerName: "Farmer" };
const FIELD = {
  id: "field-1",
  farmId: "farm-1",
  name: "Field 1",
  areaHa: 4,
  centroid: [0, 0],
  fertility: { pIndex: { value: 1, status: "verified", source: "Soil test" }, kIndex: { value: 1, status: "verified", source: "Soil test" } },
} as Field;

function neatSlurryPassedToPlans() {
  vi.mocked(calculateNutrientPlan).mockClear();
  render(
    <FarmProvider remote initialState={{ farm: FARM, fields: [FIELD], livestockGroups: [], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}>
      <NutrientsPageClient />
    </FarmProvider>,
  );
  const calls = vi.mocked(calculateNutrientPlan).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls.map(([input]) => input.plannedRegulatoryNeatSlurry);
}

afterEach(() => {
  cleanup();
  freshness.evidence = "current";
  freshness.plan = "current";
});

describe("NutrientsPageClient — stale regulatory evidence never backs a NAP verdict", () => {
  it("passes the canonical neat-slurry quantity while evidence is current", () => {
    expect(neatSlurryPassedToPlans().every((v) => v === KNOWN_NEAT)).toBe(true);
  });

  it("withholds it when the regulatory evidence re-read failed (stale)", () => {
    freshness.evidence = "stale";
    expect(neatSlurryPassedToPlans().every((v) => v === undefined)).toBe(true);
  });

  it("withholds it when the slurry plan re-read failed (stale)", () => {
    freshness.plan = "stale";
    expect(neatSlurryPassedToPlans().every((v) => v === undefined)).toBe(true);
  });
});

describe("NutrientsPageClient — stale cached empty allocation never backs a NAP verdict", () => {
  // An allocation moved onto this field whose re-read failed: the cache
  // still holds no allocation for it, which the plan itself reads as zero
  // manure and can return a verdict for.
  const GROUP: LivestockGroup = {
    id: "group-1",
    farmId: "farm-1",
    category: "suckler_cow",
    label: "Sucklers",
    count: { value: 20, status: "farmer_adjusted", source: "Farmer" },
    system: "grazing",
    value: { value: 0, status: "estimated", source: "test" },
  };
  const STALE_TEXT = /couldn't reload your latest slurry plan/;

  function renderWithNoCachedAllocation() {
    return render(
      <FarmProvider remote initialState={{ farm: FARM, fields: [FIELD], livestockGroups: [GROUP], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}>
        <NutrientsPageClient />
      </FarmProvider>,
    );
  }

  it("shows the NAP check normally while the slurry plan is current", () => {
    const { queryByText, getByText } = renderWithNoCachedAllocation();
    expect(getByText("NAP compliance")).toBeTruthy();
    expect(queryByText(STALE_TEXT)).toBeNull();
  });

  it("blocks the displayed NAP outcome when the slurry plan re-read failed", () => {
    freshness.plan = "stale";
    const { getByText } = renderWithNoCachedAllocation();
    expect(getByText(STALE_TEXT)).toBeTruthy();
  });

  it("blocks the displayed NAP outcome when the regulatory evidence re-read failed", () => {
    freshness.evidence = "stale";
    const { getByText } = renderWithNoCachedAllocation();
    expect(getByText(STALE_TEXT)).toBeTruthy();
  });
});
