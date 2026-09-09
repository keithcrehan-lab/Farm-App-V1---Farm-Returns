import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NutrientRequirementCard } from "./NutrientRequirementCard";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { tracked } from "@/domain/types";
import type { Field } from "@/domain/types";

afterEach(() => {
  cleanup();
});

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Field 1",
    areaHa: 10,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "farmer_adjusted", "Farmer"),
    fertility: { pIndex: tracked(3, "farmer_adjusted", "Farmer"), kIndex: tracked(3, "farmer_adjusted", "Farmer") },
    history: [],
    ...overrides,
  } as Field;
}

// Codex audit CRITICAL (round 27): this card used to gate only on
// `fertilityEvidence` — a field blocked for round 26's new silage-
// evidence reason (a real silage-cut field with no real cut/yield plan)
// had fertilityEvidence.status === "OK" but requirement.status ===
// "unavailable", rendering N/P/K as "0" and "Total for field 0 kg" as
// if genuinely nothing were needed.
describe("NutrientRequirementCard", () => {
  it("shows the real N/P/K requirement when it is genuinely calculable", () => {
    const f = field();
    const plan = calculateNutrientPlan({ field: f, farmGrasslandAreaHa: f.areaHa, livestockGroups: [], slurryAllocation: undefined });
    render(<NutrientRequirementCard plan={plan} field={f} />);
    expect(screen.queryByText(/insufficient evidence/i)).toBeNull();
    expect(screen.getByText(/total for field/i)).toBeTruthy();
  });

  it("discloses the real reason instead of a false zero when the P/K Soil Index is missing", () => {
    const f = field({ fertility: {} });
    const plan = calculateNutrientPlan({ field: f, farmGrasslandAreaHa: f.areaHa, livestockGroups: [], slurryAllocation: undefined });
    render(<NutrientRequirementCard plan={plan} field={f} />);
    expect(screen.getByText(/insufficient evidence/i)).toBeTruthy();
    expect(screen.getByText(/p\/k soil index has not been recorded/i)).toBeTruthy();
  });

  it("discloses the real silage-evidence reason instead of a false zero for a silage field with no real cut/yield plan", () => {
    const f = field({ plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Farmer") });
    const plan = calculateNutrientPlan({ field: f, farmGrasslandAreaHa: f.areaHa, livestockGroups: [], slurryAllocation: undefined });
    render(<NutrientRequirementCard plan={plan} field={f} />);
    expect(screen.getByText(/insufficient evidence/i)).toBeTruthy();
    expect(screen.getByText(/silage cut but has no real cut\/yield plan/i)).toBeTruthy();
    expect(screen.queryByText(/total for field 0/i)).toBeNull();
  });

  it("computes the real silage plan normally once a matching real silage input is supplied", () => {
    const f = field({ plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Farmer") });
    const plan = calculateNutrientPlan({
      field: f,
      farmGrasslandAreaHa: f.areaHa,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    render(<NutrientRequirementCard plan={plan} field={f} />);
    expect(screen.queryByText(/insufficient evidence/i)).toBeNull();
    expect(screen.getByText(/total for field/i)).toBeTruthy();
  });
});
