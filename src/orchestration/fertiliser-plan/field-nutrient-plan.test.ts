import { describe, expect, it } from "vitest";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { tracked, type Farm, type Field, type LivestockGroup, type SlurryAllocation } from "@/domain/types";
import { buildFieldNutrientPlan, type FieldNutrientPlanInput } from "./field-nutrient-plan";

const FARM: Farm = {
  id: "farm-1",
  name: "Test Farm",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Farmer",
};

const HERD: LivestockGroup[] = [
  {
    id: "g1",
    farmId: "farm-1",
    category: "suckler_cow",
    label: "Cows",
    count: { value: 20, status: "verified", source: "Farmer" },
    system: "grazing",
    value: { value: 30000, status: "estimated", source: "Farm Return estimate" },
  } as LivestockGroup,
];

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Field 1",
    areaHa: 4,
    centroid: [0, 0],
    fertility: { pIndex: tracked(2, "verified", "Soil test"), kIndex: tracked(2, "verified", "Soil test") },
    ...overrides,
  } as Field;
}

const ALLOCATION: SlurryAllocation = { fieldId: "field-1", housingId: "h1", volumeM3: 100, priority: "high", applicationMethod: tracked("LESS", "farmer_adjusted", "Farmer") };

function input(overrides: Partial<FieldNutrientPlanInput> = {}): FieldNutrientPlanInput {
  const f = overrides.field ?? field();
  return {
    farm: FARM,
    field: f,
    fields: [f],
    allFields: [f],
    livestockGroups: HERD,
    slurryAllocations: [ALLOCATION],
    slurryCompositionRecords: [],
    housing: [],
    slurryAllocationRecords: [],
    neatSlurryEvidenceRecords: [],
    spreadableAreaRecords: [],
    slurryOriginEvidenceRecords: [],
    regulatoryEvidenceStale: false,
    silagePlan: undefined,
    asOfDate: "2026-03-01",
    ...overrides,
  };
}

describe("buildFieldNutrientPlan — the shared Nutrients/Farm Spatial plan assembly", () => {
  it("returns the engine's own plan for the assembled input, unchanged", () => {
    const result = buildFieldNutrientPlan(input());
    const direct = calculateNutrientPlan({ field: field(), farmGrasslandAreaHa: 4, livestockGroups: HERD, slurryAllocation: ALLOCATION, nonGrassPct: 0 });
    expect(result.plan.fieldRequirement).toEqual(direct.fieldRequirement);
    expect(result.plan.organicApplication.availableNutrientByNutrient).toEqual(direct.organicApplication.availableNutrientByNutrient);
    expect(result.plan.fieldRemainingRequirement).toEqual(direct.fieldRemainingRequirement);
    expect(result.plan.purchasedProducts).toEqual(direct.purchasedProducts);
    expect(result.grazingOnlyPlan).toBe(result.plan);
    expect(result.slurryAllocation).toEqual(ALLOCATION);
    expect(result.showFertiliserRecommendation).toBe(true);
    expect(result.displayedNapCompliance).toBe(result.plan.napCompliance);
  });

  it("blocks the NAP verdict while regulatory evidence is stale", () => {
    const result = buildFieldNutrientPlan(input({ regulatoryEvidenceStale: true }));
    expect(result.displayedNapCompliance).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "REGULATORY_EVIDENCE_STALE" });
    expect(result.grazingOnlyNapCompliance).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "REGULATORY_EVIDENCE_STALE" });
  });

  it("hides the recommendation for tillage and for a farm with no recorded livestock", () => {
    const tillage = field({ plannedUse: tracked("tillage", "farmer_adjusted", "Farmer") });
    expect(buildFieldNutrientPlan(input({ field: tillage, fields: [tillage], allFields: [tillage] }))).toMatchObject({ tillage: true, showFertiliserRecommendation: false, canPlanFertiliserApplication: false });
    expect(buildFieldNutrientPlan(input({ livestockGroups: [] }))).toMatchObject({ noLivestock: true, showFertiliserRecommendation: false, canPlanFertiliserApplication: false });
  });
});
