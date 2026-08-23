import { describe, expect, it } from "vitest";
import { calculateFarmFertiliserCostEur, calculateLivestockPortfolioValueEur, FINANCE_ENGINE_VERSION } from "./finance";
import { calculateNutrientPlan } from "./nutrients";
import { tracked } from "./types";
import type { Field, LivestockGroup, SilagePlan, SlurryAllocation } from "./types";

function makeField(id: string, overrides: Partial<Field> = {}): Field {
  return {
    id,
    farmId: "farm-test",
    name: id,
    areaHa: 5,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "estimated", "Farm Return assumption"),
    mappedSoil: {
      soilAssociation: "Fermoy",
      dominantSeries: "Brown Earth",
      texture: "Loam",
      drainage: "moderately_drained",
      coveragePct: 90,
      datasetVersion: "test",
      source: "test",
    },
    fertility: {
      pIndex: tracked(3, "estimated", "Farm Return assumption"),
      kIndex: tracked(3, "estimated", "Farm Return assumption"),
    },
    history: [],
    ...overrides,
  };
}

function makeGroup(id: string, count: number, valueEur: number): LivestockGroup {
  return {
    id,
    farmId: "farm-test",
    category: "suckler_cow",
    label: id,
    count: tracked(count, "verified", "Keith"),
    system: "grazing",
    value: tracked(valueEur, "estimated", "Farm Return assumption"),
  };
}

describe("calculateFarmFertiliserCostEur", () => {
  it("sums the real nutrient-engine cost across every field, matching a manual per-field sum", () => {
    const fields = [makeField("f1"), makeField("f2", { areaHa: 8 })];
    const livestockGroups = [makeGroup("g1", 20, 20_000)];
    const slurryAllocations: SlurryAllocation[] = [];
    const silagePlans: SilagePlan[] = [];

    const result = calculateFarmFertiliserCostEur({ fields, livestockGroups, slurryAllocations, silagePlans });

    const farmGrasslandAreaHa = fields.reduce((s, f) => s + f.areaHa, 0);
    const manualSum = fields.reduce((sum, field) => {
      const plan = calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation: undefined, silage: undefined });
      return sum + plan.estimatedFieldCostEur;
    }, 0);

    expect(result.value).toBe(Math.round(manualSum));
    expect(result.status).toBe("estimated");
    expect(result.calculationVersion).toBe(FINANCE_ENGINE_VERSION);
  });

  it("changes when a field's P index changes — proving the whole-farm total is live, not cached", () => {
    const lowIndexField = makeField("f1", { fertility: { pIndex: tracked(1, "estimated", "x"), kIndex: tracked(3, "estimated", "x") } });
    const highIndexField = makeField("f1", { fertility: { pIndex: tracked(4, "estimated", "x"), kIndex: tracked(3, "estimated", "x") } });
    const livestockGroups = [makeGroup("g1", 20, 20_000)];

    const lowResult = calculateFarmFertiliserCostEur({ fields: [lowIndexField], livestockGroups, slurryAllocations: [], silagePlans: [] });
    const highResult = calculateFarmFertiliserCostEur({ fields: [highIndexField], livestockGroups, slurryAllocations: [], silagePlans: [] });

    // Index 1 needs P build-up (Table 13-2: +20kg/ha); Index 4 needs none —
    // so the low-index field must cost strictly more to fertilise.
    expect(lowResult.value).toBeGreaterThan(highResult.value);
  });

  it("routes a field with a matching silage plan through the silage cost path, not grazing", () => {
    const field = makeField("f1");
    const silagePlans: SilagePlan[] = [
      {
        id: "sp1",
        fieldId: "f1",
        cutNumber: 1,
        harvestSystem: "bale",
        targetCutWindow: tracked({ start: "2026-05-01", end: "2026-05-10" }, "estimated", "x"),
        expectedYieldTDMha: tracked(5, "estimated", "x"),
        intendedUse: "own_livestock",
        productionCost: { fertiliserSlurry: 0, contractor: 0, wrapBales: 0, other: 0 },
        chemicalFertiliserKgNpk: 0,
        estimatedFieldCost: 0,
      },
    ];

    const result = calculateFarmFertiliserCostEur({ fields: [field], livestockGroups: [], slurryAllocations: [], silagePlans });
    const directPlan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: field.areaHa,
      livestockGroups: [],
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });

    expect(result.value).toBe(Math.round(directPlan.estimatedFieldCostEur));
  });
});

describe("calculateLivestockPortfolioValueEur", () => {
  it("sums each group's tracked value", () => {
    const groups = [makeGroup("g1", 20, 20_000), makeGroup("g2", 5, 7_500)];
    const result = calculateLivestockPortfolioValueEur(groups);
    expect(result.value).toBe(27_500);
    expect(result.calculationVersion).toBe(FINANCE_ENGINE_VERSION);
  });

  it("returns 0 for an empty herd", () => {
    expect(calculateLivestockPortfolioValueEur([]).value).toBe(0);
  });
});
