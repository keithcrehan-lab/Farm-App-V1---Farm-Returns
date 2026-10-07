import { describe, expect, it } from "vitest";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { tracked, type Field, type LivestockGroup, type SlurryAllocation } from "@/domain/types";

/**
 * Farm Spatial V2 Phase 4 — pins the engine behaviour the field nutrient
 * plan presentation tests rely on, so a fixture that silently stops
 * exercising the intended branch fails here rather than passing vacuously:
 * splash plate (Table 9-8) resolves a slurry credit at the national-average
 * DM%, while spring LESS at that DM% has no published row and stays
 * unassessed (the credit is never floored into a real-looking value).
 */
const FIELD = {
  id: "field-1",
  farmId: "farm-1",
  name: "Field 1",
  areaHa: 4,
  centroid: [0, 0],
  fertility: { pIndex: tracked(1, "verified", "Soil test"), kIndex: tracked(1, "verified", "Soil test") },
} as Field;

const HERD = [
  { id: "g1", farmId: "farm-1", category: "suckler_cow", label: "Cows", count: { value: 20, status: "verified", source: "Farmer" }, system: "grazing", value: { value: 30000, status: "estimated", source: "Farm Return estimate" } },
] as LivestockGroup[];

function planFor(method: "LESS" | "splashplate") {
  const slurryAllocation: SlurryAllocation = { fieldId: "field-1", housingId: "h1", volumeM3: 100, priority: "high", applicationMethod: tracked(method, "farmer_adjusted", "Farmer") };
  return calculateNutrientPlan({ field: FIELD, farmGrasslandAreaHa: 4, livestockGroups: HERD, nonGrassPct: 0, slurryAllocation });
}

describe("field nutrient plan fixtures — engine branches the presentation tests exercise", () => {
  it("splash plate gives a fully known credit, remaining requirement and a recommended blend", () => {
    const plan = planFor("splashplate");
    for (const key of ["n", "p", "k"] as const) {
      expect(plan.fieldRequirement[key].status).toBe("KNOWN");
      expect(plan.organicApplication.availableNutrientByNutrient[key].status).toBe("OK");
      expect(plan.fieldRemainingRequirement[key].status).toBe("KNOWN");
    }
    expect(plan.purchaseStatus.status).toBe("RECOMMENDED");
  });

  it("spring LESS at the national-average DM% leaves the credit unassessed and the blend provisional", () => {
    const plan = planFor("LESS");
    for (const key of ["n", "p", "k"] as const) {
      expect(plan.organicApplication.availableNutrientByNutrient[key]).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "BLOCK_NO_INTERPOLATION" });
      expect(plan.fieldRemainingRequirement[key]).toMatchObject({ status: "UNKNOWN", cause: "SLURRY_CREDIT_UNKNOWN" });
    }
    expect(plan.purchaseStatus.status).toBe("RECOMMENDED_CREDIT_NOT_COUNTED");
  });
});
