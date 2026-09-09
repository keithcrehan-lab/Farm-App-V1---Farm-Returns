import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { InputSummaryCard } from "./InputSummaryCard";
import type { Farm, Field, LivestockGroup } from "@/domain/types";
import { tracked } from "@/domain/types";

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

function renderCard(fields: Field[], livestockGroups: LivestockGroup[]) {
  return render(
    <FarmProvider remote initialState={{ farm: FARM, fields, livestockGroups, housing: [], slurryAllocations: [] }}>
      <InputSummaryCard />
    </FarmProvider>,
  );
}

// Codex audit HIGH (round 25): this card used to discard
// `calculateFarmFertiliserRequirement`'s own `fieldsWithBlockedEvidence`
// entirely — a real excluded field left its Fertiliser row/Total looking
// complete when it understated the truth. (`withRealInputRequirements`
// always keeps the Fertiliser/Feed rows regardless of field state, so
// this card's own list is never genuinely empty in real mode — the
// disclosure only ever needs to render alongside that always-present
// row, never replace an empty-state message.)
describe("InputSummaryCard", () => {
  it("discloses a blocked field alongside a real, non-empty Fertiliser row", () => {
    const blockedField = field({ id: "field-2", fertility: {} });
    renderCard([field(), blockedField], LIVESTOCK_GROUPS);
    expect(screen.getByText(/1 field excluded/i)).toBeTruthy();
    expect(screen.getByText(/understates the real requirement/i)).toBeTruthy();
  });

  it("never shows the exclusion disclosure when every real field's evidence is complete", () => {
    renderCard([field()], LIVESTOCK_GROUPS);
    expect(screen.queryByText(/excluded/i)).toBeNull();
  });
});
