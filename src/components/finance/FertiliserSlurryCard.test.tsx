import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { FertiliserSlurryCard } from "./FertiliserSlurryCard";
import type { Farm, Field, LivestockGroup, SlurryAllocation } from "@/domain/types";

afterEach(() => {
  cleanup();
});

const FARM: Farm = {
  id: "farm-1",
  name: "Test Farm",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Farmer",
};

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Field 1",
    areaHa: 4,
    centroid: [0, 0],
    fertility: { pIndex: { value: 1, status: "verified", source: "Soil test" }, kIndex: { value: 1, status: "verified", source: "Soil test" } },
    ...overrides,
  } as Field;
}

const LIVESTOCK_GROUPS: LivestockGroup[] = [
  { id: "g1", farmId: "farm-1", category: "suckler_cow", label: "Cows", count: { value: 20, status: "verified", source: "Farmer" }, system: "grazing", value: { value: 30000, status: "estimated", source: "Farm Return estimate" } },
];

function renderCard(fields: Field[], livestockGroups: LivestockGroup[], slurryAllocations: SlurryAllocation[] = []) {
  return render(
    <FarmProvider remote initialState={{ farm: FARM, fields, livestockGroups, housing: [], slurryAllocations }}>
      <FertiliserSlurryCard />
    </FarmProvider>,
  );
}

// Codex audit HIGH (round 22): a grazing field excluded from the whole-
// farm fertiliser requirement purely because the farm has no recorded
// livestock used to leave "Estimated fertiliser spend €0" indistinguishable
// from a genuinely complete zero-requirement farm.
describe("FertiliserSlurryCard", () => {
  it("discloses when a real grazing field was excluded from the fertiliser spend total because the farm has no recorded livestock", () => {
    renderCard([field()], []);
    // Codex audit HIGH (round 24): the count also includes a field
    // excluded for missing P/K Soil Index evidence — the copy is now an
    // accurate umbrella covering both real reasons.
    expect(screen.getByText(/1 field excluded/i)).toBeTruthy();
    expect(screen.getByText(/missing livestock or soil evidence/i)).toBeTruthy();
  });

  it("never shows the exclusion disclosure when every real field's evidence is complete", () => {
    renderCard([field()], LIVESTOCK_GROUPS);
    expect(screen.queryByText(/excluded/i)).toBeNull();
  });

  it("never shows the exclusion disclosure for a tillage field — that is a genuine not-applicable case, not blocked evidence", () => {
    renderCard([field({ plannedUse: { value: "tillage", status: "verified", source: "Farmer" } })], []);
    expect(screen.queryByText(/excluded/i)).toBeNull();
  });

  // Codex audit HIGH (round 24): `calculateFarmSlurryNutrientValueEur`
  // had the identical blocked-evidence disclosure gap as
  // `calculateFarmFertiliserRequirement` — a real grazing field with a
  // real, applicable slurry allocation but no recorded livestock left
  // "Slurry nutrient value €0" indistinguishable from a genuine zero
  // saving.
  it("discloses when a real field with a real slurry allocation was excluded from the slurry value total", () => {
    const slurryAllocations: SlurryAllocation[] = [{ fieldId: "field-1", housingId: "h1", priority: "high", volumeM3: 950, score: 91 }];
    renderCard([field()], [], slurryAllocations);
    expect(screen.getByText(/understates the real value/i)).toBeTruthy();
  });

  it("never shows the slurry-value exclusion disclosure when every real field's evidence is complete", () => {
    const slurryAllocations: SlurryAllocation[] = [{ fieldId: "field-1", housingId: "h1", priority: "high", volumeM3: 950, score: 91 }];
    renderCard([field()], LIVESTOCK_GROUPS, slurryAllocations);
    expect(screen.queryByText(/understates the real value/i)).toBeNull();
  });
});
