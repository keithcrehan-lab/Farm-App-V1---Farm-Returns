import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NutrientRequirementCard } from "./NutrientRequirementCard";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { tracked } from "@/domain/types";
import { requirementCardPresentation } from "@/lib/nutrient-card-presentation";
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

  // Mobile overflow fix: the header badges overflowed the card at 390 px
  // because the shared CardHeader does not wrap and the badge group was
  // shrink-0. Layout itself is checked visually; this pins the wrap classes.
  describe("header wraps its badges on narrow viewports", () => {
    function headerOf(title: HTMLElement): HTMLElement {
      const header = title.closest("h3")?.parentElement?.parentElement;
      if (!header) throw new Error("card header not found");
      return header;
    }

    it.each([
      ["paired", field()],
      ["mixed", field({ fertility: { pIndex: tracked(3, "farmer_adjusted", "Farmer") } })],
    ] as const)("%s state: header and badge group wrap, badge group can shrink", (kind, f) => {
      const plan = calculateNutrientPlan({ field: f, farmGrasslandAreaHa: f.areaHa, livestockGroups: [], slurryAllocation: undefined });
      expect(requirementCardPresentation(plan).kind).toBe(kind);
      const { container } = render(<NutrientRequirementCard plan={plan} field={f} />);
      const header = headerOf(screen.getByText("Nutrient requirement"));
      expect(header.className).toContain("flex-wrap");
      const badges = container.querySelector<HTMLElement>('[title^="Calculation version"]');
      expect(badges).not.toBeNull();
      expect(badges!.parentElement).toBe(header);
      expect(badges!.className).toContain("flex-wrap");
      expect(badges!.className).toContain("min-w-0");
      expect(badges!.className).not.toContain("shrink-0");
    });

    it("insufficient-evidence state: header wraps", () => {
      const f = field({ fertility: {} });
      const plan = calculateNutrientPlan({ field: f, farmGrasslandAreaHa: f.areaHa, livestockGroups: [], slurryAllocation: undefined });
      render(<NutrientRequirementCard plan={plan} field={f} />);
      expect(headerOf(screen.getByText("Nutrient requirement")).className).toContain("flex-wrap");
    });
  });
});

// Codex audit F008: a clover sward's N is from the 2026 Teagasc clover
// strategy, and the card's source badge says so.
describe("NutrientRequirementCard — clover provenance", () => {
  it("names the clover strategy as the N source for a 10% April clover sward at 170 kg organic N/ha", () => {
    // 34 suckler cows (65 kg N each, S.I. 588/2025 Table 7) on 13 ha = 170.0.
    const f = field({ areaHa: 13, grazingSward: { kind: "WHITE_CLOVER", aprilWhiteCloverPct: 10 } });
    const cows = [
      { id: "g1", farmId: "farm-1", category: "suckler_cow" as const, label: "Cows", count: tracked(34, "verified", "Farmer"), avgAgeMonths: 60, sex: "female" as const, system: "grazing" as const, value: tracked(0, "estimated", "x") },
    ];
    const plan = calculateNutrientPlan({ field: f, farmGrasslandAreaHa: 13, livestockGroups: cows, slurryAllocation: undefined, nonGrassPct: 0 });
    expect(plan.requirement.status).toBe("estimated");
    expect(plan.requirement.value.n).toBe(75);
    expect(plan.requirement.source).toMatch(/clover/i);
    expect(plan.netRequirement.source).toMatch(/clover/i);
    render(<NutrientRequirementCard plan={plan} field={f} />);
    expect(screen.getAllByText(/clover/i).length).toBeGreaterThan(0);
  });
});
