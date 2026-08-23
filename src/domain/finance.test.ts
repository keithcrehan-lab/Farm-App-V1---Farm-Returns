import { describe, expect, it } from "vitest";
import {
  calculateFarmConcentrateFeedCostEur,
  calculateFarmFertiliserCostEur,
  calculateLivestockPortfolioValueEur,
  FINANCE_ENGINE_VERSION,
} from "./finance";
import { calculateFinishingBudget, calculateWeanlingConcentrateStrategies } from "./livestock";
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

function makeLivestockGroup(id: string, category: LivestockGroup["category"], count: number, avgWeightKg?: number): LivestockGroup {
  return {
    id,
    farmId: "farm-test",
    category,
    label: id,
    count: tracked(count, "verified", "Keith"),
    avgWeightKg: avgWeightKg !== undefined ? tracked(avgWeightKg, "estimated", "Farm Return assumption") : undefined,
    system: "housed",
    value: tracked(0, "estimated", "Farm Return assumption"),
  };
}

describe("calculateFarmConcentrateFeedCostEur", () => {
  it("continental steers: matches calculateFinishingBudget's own per-head cost times headcount", () => {
    const group = makeLivestockGroup("lg-continental-steers", "steer", 20, 520);
    const result = calculateFarmConcentrateFeedCostEur([group]);

    const budget = calculateFinishingBudget({
      animalType: "finishing_steer",
      currentWeightKg: 520,
      targetWeightKg: 650,
      silageDMD: 72,
      concentratePriceEurPerTonne: 350,
    });
    expect(result.value).toBe(Math.round(budget.feedCostPerHeadEur * 20));
    expect(result.calculationVersion).toBe(FINANCE_ENGINE_VERSION);
  });

  it("weanlings: matches the Balanced strategy's own total cost times headcount", () => {
    const group = makeLivestockGroup("lg-weanlings", "weanling", 18, 335);
    const result = calculateFarmConcentrateFeedCostEur([group]);

    const strategies = calculateWeanlingConcentrateStrategies({
      currentWeightKg: 335,
      targetWeightKg: 420,
      concentratePriceEurPerTonne: 350,
    });
    const balanced = strategies.find((s) => s.id === "balanced")!;
    expect(result.value).toBe(Math.round(balanced.totalCostPerHeadEur * 18));
  });

  it("suckler cows: a real sourced zero (dry spring-calving rule), not an omission", () => {
    const group = makeLivestockGroup("lg-suckler-cows", "suckler_cow", 32, 612);
    const result = calculateFarmConcentrateFeedCostEur([group]);
    expect(result.value).toBe(0);
    expect(result.source).toContain("lg-suckler-cows");
  });

  it("a group with no real concentrate model contributes nothing and isn't cited as a source", () => {
    const modelled = makeLivestockGroup("lg-continental-steers", "steer", 20, 520);
    const unmodelled = makeLivestockGroup("lg-heifers", "heifer", 10, 400);

    const withOnlyModelled = calculateFarmConcentrateFeedCostEur([modelled]);
    const withBoth = calculateFarmConcentrateFeedCostEur([modelled, unmodelled]);

    expect(withBoth.value).toBe(withOnlyModelled.value);
    expect(withBoth.source).not.toContain("lg-heifers");
  });

  it("sums multiple real-modelled groups together", () => {
    const steers = makeLivestockGroup("lg-continental-steers", "steer", 20, 520);
    const weanlings = makeLivestockGroup("lg-weanlings", "weanling", 18, 335);
    const sucklerCows = makeLivestockGroup("lg-suckler-cows", "suckler_cow", 32, 612);

    const combined = calculateFarmConcentrateFeedCostEur([steers, weanlings, sucklerCows]);
    const steersOnly = calculateFarmConcentrateFeedCostEur([steers]);
    const weanlingsOnly = calculateFarmConcentrateFeedCostEur([weanlings]);
    const sucklerOnly = calculateFarmConcentrateFeedCostEur([sucklerCows]);

    expect(combined.value).toBe(steersOnly.value + weanlingsOnly.value + sucklerOnly.value);
  });

  it("returns 0 for an empty herd", () => {
    expect(calculateFarmConcentrateFeedCostEur([]).value).toBe(0);
  });
});
