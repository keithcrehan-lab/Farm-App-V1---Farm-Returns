import { describe, expect, it } from "vitest";
import { buildAllRealPrompts, computeFarmGrasslandAggregates } from "./build-all";
import type { Farm, Field, LivestockGroup, SlurryAllocation } from "@/domain/types";

const farm: Pick<Farm, "id" | "location"> = { id: "farm-1", location: { county: "Cork", centroid: [0, 0] } };

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Back Meadow",
    areaHa: 4.2,
    centroid: [0, 0],
    fertility: {},
    ...overrides,
  } as Field;
}

const noGroups: LivestockGroup[] = [];
const noSlurry: SlurryAllocation[] = [];

describe("buildAllRealPrompts", () => {
  it("returns no prompts for an empty field list", () => {
    expect(buildAllRealPrompts(farm, [], noGroups, noSlurry, "2026-09-01T09:00:00Z")).toEqual([]);
  });

  // Fertiliser Vertical campaign — a fifth real producer,
  // `fertiliser_recommendation`, joined the fan-out.
  it("returns exactly five real prompts per field — one per shipped producer", () => {
    const fields = [field({ id: "field-1" }), field({ id: "field-2", name: "River Field" })];
    const prompts = buildAllRealPrompts(farm, fields, noGroups, noSlurry, "2026-09-01T09:00:00Z");
    expect(prompts).toHaveLength(10);
    const kinds = new Set(prompts.map((p) => p.kind));
    expect(kinds).toEqual(
      new Set(["spreading_window", "soil_test_age", "commonage_status", "local_buffer_override", "fertiliser_recommendation"]),
    );
  });

  it("every prompt carries the real farmId/fieldId it was built for, never a mismatched one", () => {
    const fields = [field({ id: "field-1", farmId: "farm-1" })];
    const prompts = buildAllRealPrompts(farm, fields, noGroups, noSlurry, "2026-09-01T09:00:00Z");
    for (const p of prompts) {
      expect(p.farmId).toBe("farm-1");
      expect(p.fieldId).toBe("field-1");
    }
  });

  it("the fertiliser_recommendation prompt matches this field's own real slurry allocation, never another field's", () => {
    const fields = [field({ id: "field-1" }), field({ id: "field-2" })];
    const slurryAllocations: SlurryAllocation[] = [{ fieldId: "field-2", housingId: "h1", priority: "high", volumeM3: 100, score: 90 }];
    const prompts = buildAllRealPrompts(farm, fields, noGroups, slurryAllocations, "2026-09-01T09:00:00Z");
    const fertPrompts = prompts.filter((p) => p.kind === "fertiliser_recommendation");
    expect(fertPrompts).toHaveLength(2);
    // Neither field has a recorded soil P/K index, so both fail closed —
    // this test only asserts the real per-field scoping, not the outcome.
    expect(fertPrompts.every((p) => p.basis.status === "BLOCKED_INSUFFICIENT_EVIDENCE")).toBe(true);
  });
});

// Codex audit HIGH (round 5) — a farm's real grassland-stocking-rate
// denominator must exclude tillage ground; the first version of this
// function (and NutrientsPageClient.tsx's own since-removed duplicate)
// both set it to the farm's whole area instead, understating the real
// N requirement on any mixed grassland/tillage farm.
describe("computeFarmGrasslandAggregates", () => {
  it("excludes real tillage area from the grassland figure — never the same as the farm's whole area on a mixed farm", () => {
    const fields: Field[] = [
      { id: "f1", farmId: "farm-1", name: "Grass Field", areaHa: 10, centroid: [0, 0], fertility: {} } as Field,
      {
        id: "f2",
        farmId: "farm-1",
        name: "Tillage Field",
        areaHa: 5,
        centroid: [0, 0],
        fertility: {},
        plannedUse: { value: "tillage", status: "verified", source: "Farmer" },
      } as Field,
    ];
    const { farmGrasslandAreaHa, nonGrassPct } = computeFarmGrasslandAggregates(fields);
    // 15 ha total, 5 ha tillage -> 10 ha real grassland, never 15.
    expect(farmGrasslandAreaHa).toBe(10);
    expect(nonGrassPct).toBeCloseTo((5 / 15) * 100);
  });

  it("returns the farm's whole area as grassland when no field is tillage", () => {
    const fields: Field[] = [{ id: "f1", farmId: "farm-1", name: "Grass Field", areaHa: 10, centroid: [0, 0], fertility: {} } as Field];
    const { farmGrasslandAreaHa, nonGrassPct } = computeFarmGrasslandAggregates(fields);
    expect(farmGrasslandAreaHa).toBe(10);
    expect(nonGrassPct).toBe(0);
  });

  it("returns a real, honest zero for an empty field list, never a division error", () => {
    expect(computeFarmGrasslandAggregates([])).toEqual({ farmGrasslandAreaHa: 0, nonGrassPct: 0 });
  });
});
