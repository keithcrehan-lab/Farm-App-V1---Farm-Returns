import { describe, expect, it } from "vitest";
import {
  carryCycleForwardForPlanningSeason,
  isCarriedForwardPlanningCycle,
  resolvePlanningSeasonCycles,
  slurryAllocationsForPlanningSeason,
} from "./fertiliser-planning-season";
import type { FieldProductionCycle } from "@/domain/fertiliser-field-evidence";

const cycle = (
  fieldId: string,
  season: string,
  appliedN: number,
): FieldProductionCycle => ({
  id: `${fieldId}-${season}`,
  fieldId,
  season,
  cropSystem: "GRASS_GRAZING",
  status: "active",
  evidence: {
    chemicalNAppliedKgHa: {
      value: appliedN,
      method: "FARMER_DECLARED",
      source: "Farmer",
    },
    chemicalPAppliedKgHa: { value: 5, method: "FARMER_DECLARED", source: "Farmer" },
    chemicalKAppliedKgHa: { value: 5, method: "FARMER_DECLARED", source: "Farmer" },
  },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("fertiliser planning season contract", () => {
  it("uses the season's own saved cycles unchanged for the current season", () => {
    const current = [cycle("f1", "2026", 40)];
    expect(
      resolvePlanningSeasonCycles({
        targetCycles: current,
        currentCycles: current,
        planningSeason: "2026",
        currentSeason: "2026",
      }),
    ).toEqual(current);
  });

  it("prefers a saved future cycle, carries the rest forward, and zeroes prior chemical N/P/K for both", () => {
    const resolved = resolvePlanningSeasonCycles({
      targetCycles: [cycle("f1", "2027", 30), cycle("f3", "2027", 10)],
      currentCycles: [cycle("f1", "2026", 40), cycle("f2", "2026", 60)],
      planningSeason: "2027",
      currentSeason: "2026",
    });

    expect(resolved.map((c) => [c.fieldId, c.id])).toEqual([
      ["f1", "f1-2027"],
      ["f2", "f2-2026:quote:2027"],
      ["f3", "f3-2027"],
    ]);
    for (const resolvedCycle of resolved) {
      expect(resolvedCycle.season).toBe("2027");
      expect(resolvedCycle.evidence.chemicalNAppliedKgHa).toMatchObject({
        value: 0,
        method: "ASSUMED",
      });
      expect(resolvedCycle.evidence.chemicalPAppliedKgHa?.value).toBe(0);
      expect(resolvedCycle.evidence.chemicalKAppliedKgHa?.value).toBe(0);
    }
    expect(isCarriedForwardPlanningCycle(resolved[1])).toBe(true);
    expect(isCarriedForwardPlanningCycle(resolved[0])).toBe(false);
  });

  it("marks a carried-forward cycle as planned for the target season", () => {
    const carried = carryCycleForwardForPlanningSeason(
      cycle("f1", "2026", 40),
      "2027",
    );
    expect(carried).toMatchObject({ season: "2027", status: "planned" });
  });

  it("keeps only slurry planned for the planning season", () => {
    const allocations = [
      { fieldId: "f1", housingId: "h", volumeM3: 1, applicationDate: { value: "2026-03-01", status: "estimated" as const, source: "Farmer" } },
      { fieldId: "f1", housingId: "h", volumeM3: 2, applicationDate: { value: "2027-03-01", status: "estimated" as const, source: "Farmer" } },
      { fieldId: "f1", housingId: "h", volumeM3: 3 },
    ];
    expect(
      slurryAllocationsForPlanningSeason(allocations, "2027").map((a) => a.volumeM3),
    ).toEqual([2]);
  });
});
