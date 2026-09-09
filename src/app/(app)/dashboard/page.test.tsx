import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { tracked } from "@/domain/types";
import type { Farm, Field, LivestockGroup } from "@/domain/types";
import DashboardPage from "./page";

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
    areaHa: 10,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "farmer_adjusted", "Farmer"),
    fertility: { pIndex: tracked(1, "farmer_adjusted", "Farmer"), kIndex: tracked(1, "farmer_adjusted", "Farmer") },
    history: [],
    ...overrides,
  } as Field;
}

const LIVESTOCK_GROUPS: LivestockGroup[] = [
  { id: "g1", farmId: "farm-1", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
];

function renderPage(fields: Field[], livestockGroups: LivestockGroup[]) {
  return render(
    <FarmProvider remote initialState={{ farm: FARM, fields, livestockGroups, housing: [], slurryAllocations: [] }}>
      <DashboardPage />
    </FarmProvider>,
  );
}

// Codex audit HIGH (round 25): the mobile Fertiliser cost KPI used to
// discard `calculateFarmFertiliserCostEur`'s own `fieldsWithBlockedEvidence`
// entirely — a real excluded field left the tile looking like a complete
// total when it understated the truth.
describe("DashboardPage — Fertiliser cost KPI", () => {
  it("discloses a blocked field on the Fertiliser cost tile", () => {
    renderPage([field()], []);
    expect(screen.getByText(/field\(s\) excluded — understates total/i)).toBeTruthy();
  });

  it("never shows the exclusion caption when every real field's evidence is complete", () => {
    renderPage([field()], LIVESTOCK_GROUPS);
    expect(screen.queryByText(/excluded — understates total/i)).toBeNull();
  });
});
