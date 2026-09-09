import { describe, expect, it } from "vitest";
import {
  calculateFarmConcentrateFeedCostBreakdown,
  calculateFarmConcentrateFeedCostEur,
  calculateFarmConcentrateFeedRequirement,
  calculateFarmFertiliserCostEur,
  calculateFarmFertiliserRequirement,
  calculateFarmGrassAndSilageCostEur,
  calculateFarmMineralCostEur,
  calculateFarmSlurryNutrientValueEur,
  calculateLivestockPortfolioValueEur,
  withRealBuyingOpportunityRequirement,
  withRealInputRequirements,
  FINANCE_ENGINE_VERSION,
} from "./finance";
import {
  calculateGrazedGrassCostEur,
  calculateSilageCostEur,
  calculateSucklerCowMineralCostEur,
  FEED_COST_ENGINE_VERSION,
} from "./feed-cost";
import { calculateFinishingBudget, calculateWeanlingConcentrateStrategies } from "./livestock";
import { calculateNutrientPlan } from "./nutrients";
import { tracked } from "./types";
import type { BuyingOpportunity, Field, Housing, InputRequirement, LivestockGroup, SilagePlan, SlurryAllocation } from "./types";

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

    expect(result.value.value).toBe(Math.round(manualSum));
    expect(result.value.status).toBe("estimated");
    expect(result.value.calculationVersion).toBe(FINANCE_ENGINE_VERSION);
    expect(result.fieldsWithBlockedEvidence).toBe(0);
  });

  it("changes when a field's P index changes — proving the whole-farm total is live, not cached", () => {
    const lowIndexField = makeField("f1", { fertility: { pIndex: tracked(1, "estimated", "x"), kIndex: tracked(3, "estimated", "x") } });
    const highIndexField = makeField("f1", { fertility: { pIndex: tracked(4, "estimated", "x"), kIndex: tracked(3, "estimated", "x") } });
    const livestockGroups = [makeGroup("g1", 20, 20_000)];

    const lowResult = calculateFarmFertiliserCostEur({ fields: [lowIndexField], livestockGroups, slurryAllocations: [], silagePlans: [] });
    const highResult = calculateFarmFertiliserCostEur({ fields: [highIndexField], livestockGroups, slurryAllocations: [], silagePlans: [] });

    // Index 1 needs P build-up (Table 13-2: +20kg/ha); Index 4 needs none —
    // so the low-index field must cost strictly more to fertilise.
    expect(lowResult.value.value).toBeGreaterThan(highResult.value.value);
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

    expect(result.value.value).toBe(Math.round(directPlan.estimatedFieldCostEur));
  });
});

describe("calculateFarmFertiliserRequirement", () => {
  it("totalCostEur agrees with calculateFarmFertiliserCostEur for the same inputs", () => {
    const fields = [makeField("f1"), makeField("f2", { areaHa: 8 })];
    const livestockGroups = [makeGroup("g1", 20, 20_000)];
    const input = { fields, livestockGroups, slurryAllocations: [], silagePlans: [] };

    const requirement = calculateFarmFertiliserRequirement(input);
    const cost = calculateFarmFertiliserCostEur(input);

    expect(requirement.totalCostEur).toBe(cost.value.value);
  });

  it("byProduct sums to the same totals, and merges the same product across fields into one line", () => {
    const fields = [makeField("f1"), makeField("f2", { areaHa: 8 })];
    const livestockGroups = [makeGroup("g1", 20, 20_000)];
    const requirement = calculateFarmFertiliserRequirement({ fields, livestockGroups, slurryAllocations: [], silagePlans: [] });

    expect(requirement.byProduct.length).toBeGreaterThan(0);
    // No duplicate product names — two fields both needing e.g. Protected
    // Urea must merge into one line, not appear twice.
    const names = requirement.byProduct.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);

    const sumTonnes = Math.round(requirement.byProduct.reduce((s, p) => s + p.totalTonnes, 0) * 100) / 100;
    const sumCost = requirement.byProduct.reduce((s, p) => s + p.costEur, 0);
    expect(sumTonnes).toBe(requirement.totalTonnes);
    expect(sumCost).toBe(requirement.totalCostEur);
  });

  it("zero fields requires nothing", () => {
    const requirement = calculateFarmFertiliserRequirement({ fields: [], livestockGroups: [], slurryAllocations: [], silagePlans: [] });
    expect(requirement.totalTonnes).toBe(0);
    expect(requirement.totalCostEur).toBe(0);
    expect(requirement.byProduct).toEqual([]);
  });

  // Codex audit CRITICAL (round 10): this whole-farm aggregation is a
  // fifth independent path computing a real fertiliser recommendation
  // without this campaign's own tillage/missing-livestock fail-closed
  // gates — this app has no tillage N/P/K table at all.
  it("excludes a tillage field from the whole-farm requirement entirely", () => {
    const tillageField = makeField("f1", { plannedUse: tracked("tillage", "verified", "Farmer") });
    const livestockGroups = [makeGroup("g1", 20, 20_000)];
    const requirement = calculateFarmFertiliserRequirement({ fields: [tillageField], livestockGroups, slurryAllocations: [], silagePlans: [] });
    expect(requirement).toEqual({ byProduct: [], totalTonnes: 0, totalCostEur: 0, fieldsWithBlockedEvidence: 0 });
  });

  // An empty livestockGroups read is genuinely ambiguous between
  // "confirmed zero" and "never entered" — never the clamped,
  // presented-as-real 35 kg N/ha `nGrazingSucklerToBeefKgHa` would
  // otherwise produce for a grazing field.
  it("excludes a grazing field from the whole-farm requirement when the farm has no recorded livestock", () => {
    const field = makeField("f1");
    const requirement = calculateFarmFertiliserRequirement({ fields: [field], livestockGroups: [], slurryAllocations: [], silagePlans: [] });
    // Codex audit HIGH (round 22): this exclusion is a real, blocked-
    // evidence gap in these totals, not a genuine "no fertiliser
    // needed" farm — `fieldsWithBlockedEvidence` must disclose it.
    expect(requirement).toEqual({ byProduct: [], totalTonnes: 0, totalCostEur: 0, fieldsWithBlockedEvidence: 1 });
  });

  // Codex audit HIGH (round 23): the missing-livestock exclusion was
  // the only real evidence gap `fieldsWithBlockedEvidence` counted — a
  // grazing field WITH recorded livestock but no recorded P/K Soil
  // Index still silently contributed zero products with nothing
  // disclosing it, the exact undercounting round 22 was meant to close.
  it("discloses a grazing field excluded for missing P/K Soil Index via fieldsWithBlockedEvidence, even with real livestock recorded", () => {
    const field = makeField("f1", { fertility: {} });
    const livestockGroups = [makeGroup("g1", 20, 20_000)];
    const requirement = calculateFarmFertiliserRequirement({ fields: [field], livestockGroups, slurryAllocations: [], silagePlans: [] });
    expect(requirement).toEqual({ byProduct: [], totalTonnes: 0, totalCostEur: 0, fieldsWithBlockedEvidence: 1 });
  });

  it("never counts a field with genuinely complete P/K fertility evidence toward fieldsWithBlockedEvidence, regardless of its own real recommendation", () => {
    const field = makeField("f1", { fertility: { pIndex: tracked(4, "estimated", "x"), kIndex: tracked(4, "estimated", "x") } });
    const livestockGroups = [makeGroup("g1", 20, 20_000)];
    const requirement = calculateFarmFertiliserRequirement({ fields: [field], livestockGroups, slurryAllocations: [], silagePlans: [] });
    expect(requirement.fieldsWithBlockedEvidence).toBe(0);
  });

  it("still includes a silage field with no recorded livestock — silage N/P/K never depends on livestockGroups", () => {
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
    const requirement = calculateFarmFertiliserRequirement({ fields: [field], livestockGroups: [], slurryAllocations: [], silagePlans });
    expect(requirement.byProduct.length).toBeGreaterThan(0);
  });

  it("excludes tillage area from the real grassland stocking-rate denominator, matching farmGrasslandAggregates", () => {
    const grassField = makeField("f1", { areaHa: 10 });
    const tillageField = makeField("f2", { areaHa: 5, plannedUse: tracked("tillage", "verified", "Farmer") });
    const livestockGroups = [makeGroup("g1", 20, 20_000)];
    const requirement = calculateFarmFertiliserRequirement({ fields: [grassField, tillageField], livestockGroups, slurryAllocations: [], silagePlans: [] });

    const directPlan = calculateNutrientPlan({
      field: grassField,
      farmGrasslandAreaHa: 10, // 15 ha total - 5 ha tillage, never 15
      livestockGroups,
      slurryAllocation: undefined,
      silage: undefined,
    });
    expect(requirement.totalCostEur).toBe(Math.round(directPlan.estimatedFieldCostEur));
  });
});

describe("calculateFarmSlurryNutrientValueEur", () => {
  it("equals the real cost difference between the same field with and without its slurry allocation", () => {
    const field = makeField("field-back");
    const livestockGroups = [makeGroup("g1", 20, 20_000)];
    const slurryAllocations: SlurryAllocation[] = [
      { fieldId: "field-back", housingId: "h1", priority: "high", volumeM3: 950, score: 91 },
    ];
    const input = { fields: [field], livestockGroups, slurryAllocations, silagePlans: [] };

    const result = calculateFarmSlurryNutrientValueEur(input);

    const withSlurry = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: field.areaHa,
      livestockGroups,
      slurryAllocation: slurryAllocations[0],
      silage: undefined,
    });
    const withoutSlurry = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: field.areaHa,
      livestockGroups,
      slurryAllocation: undefined,
      silage: undefined,
    });
    expect(result.value.value).toBe(Math.round(withoutSlurry.estimatedFieldCostEur - withSlurry.estimatedFieldCostEur));
    // Applying real slurry can only reduce or match the purchased cost,
    // never increase it — so the value is always non-negative, and for a
    // meaningfully-sized real allocation like this one, strictly positive.
    expect(result.value.value).toBeGreaterThan(0);
    expect(result.value.calculationVersion).toBe(FINANCE_ENGINE_VERSION);
    expect(result.fieldsWithBlockedEvidence).toBe(0);
  });

  it("a not_suitable allocation contributes nothing, even with a nonzero volumeM3", () => {
    const field = makeField("field-river");
    const livestockGroups = [makeGroup("g1", 20, 20_000)];
    const slurryAllocations: SlurryAllocation[] = [
      { fieldId: "field-river", housingId: "h1", priority: "not_suitable", volumeM3: 0, score: 0 },
    ];
    const result = calculateFarmSlurryNutrientValueEur({ fields: [field], livestockGroups, slurryAllocations, silagePlans: [] });
    expect(result.value.value).toBe(0);
    // A real field with no applicable slurry allocation is genuinely
    // "not applicable", never "cannot calculate".
    expect(result.fieldsWithBlockedEvidence).toBe(0);
  });

  it("a field with no matching slurry allocation contributes nothing", () => {
    const field = makeField("field-unallocated");
    const result = calculateFarmSlurryNutrientValueEur({ fields: [field], livestockGroups: [], slurryAllocations: [], silagePlans: [] });
    expect(result.value.value).toBe(0);
  });

  it("sums both fields' real savings, each computed against the same whole-farm grassland area", () => {
    const fieldA = makeField("fa");
    const fieldB = makeField("fb", { areaHa: 8 });
    const livestockGroups = [makeGroup("g1", 20, 20_000)];
    const slurryAllocations: SlurryAllocation[] = [
      { fieldId: "fa", housingId: "h1", priority: "high", volumeM3: 950, score: 91 },
      { fieldId: "fb", housingId: "h1", priority: "medium", volumeM3: 700, score: 86 },
    ];

    const combined = calculateFarmSlurryNutrientValueEur({ fields: [fieldA, fieldB], livestockGroups, slurryAllocations, silagePlans: [] });

    // Not aOnly + bOnly: isolating a field also shrinks the grassland-area
    // denominator its own N requirement is calculated against (grazing
    // stocking rate is a whole-farm concept), so an isolated single-field
    // call isn't comparable to that same field's contribution inside the
    // combined farm-wide call. Reproduce the combined figure directly
    // instead, at the real combined farmGrasslandAreaHa both fields share.
    const farmGrasslandAreaHa = fieldA.areaHa + fieldB.areaHa;
    let manualTotal = 0;
    for (const [field, allocation] of [
      [fieldA, slurryAllocations[0]],
      [fieldB, slurryAllocations[1]],
    ] as const) {
      const withSlurry = calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation: allocation, silage: undefined });
      const withoutSlurry = calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation: undefined, silage: undefined });
      manualTotal += withoutSlurry.estimatedFieldCostEur - withSlurry.estimatedFieldCostEur;
    }
    expect(combined.value.value).toBe(Math.round(manualTotal));
  });

  it("returns 0 for zero fields", () => {
    const result = calculateFarmSlurryNutrientValueEur({ fields: [], livestockGroups: [], slurryAllocations: [], silagePlans: [] });
    expect(result.value.value).toBe(0);
  });

  // Codex audit CRITICAL (round 10): the identical tillage/missing-
  // livestock gate as calculateFarmFertiliserRequirement — a tillage
  // field, or a grazing field with no recorded livestock, must never
  // contribute a real, presented-as-real slurry-offset €.
  it("excludes a tillage field even with a real slurry allocation", () => {
    const tillageField = makeField("f1", { plannedUse: tracked("tillage", "verified", "Farmer") });
    const livestockGroups = [makeGroup("g1", 20, 20_000)];
    const slurryAllocations: SlurryAllocation[] = [{ fieldId: "f1", housingId: "h1", priority: "high", volumeM3: 950, score: 91 }];
    const result = calculateFarmSlurryNutrientValueEur({ fields: [tillageField], livestockGroups, slurryAllocations, silagePlans: [] });
    expect(result.value.value).toBe(0);
    // Tillage is genuinely NOT_APPLICABLE — never counted as blocked.
    expect(result.fieldsWithBlockedEvidence).toBe(0);
  });

  it("excludes a grazing field with a real slurry allocation when the farm has no recorded livestock", () => {
    const field = makeField("f1");
    const slurryAllocations: SlurryAllocation[] = [{ fieldId: "f1", housingId: "h1", priority: "high", volumeM3: 950, score: 91 }];
    const result = calculateFarmSlurryNutrientValueEur({ fields: [field], livestockGroups: [], slurryAllocations, silagePlans: [] });
    expect(result.value.value).toBe(0);
    // Codex audit HIGH (round 24): this real exclusion must be
    // disclosed, not left indistinguishable from a genuine €0 saving.
    expect(result.fieldsWithBlockedEvidence).toBe(1);
  });

  // Codex audit HIGH (round 24): missing P/K Soil Index evidence wasn't
  // checked at all before this fix — a field with real, recorded
  // livestock but no soil index silently contributed a real €0 with
  // nothing disclosing it.
  it("discloses a field excluded for missing P/K Soil Index evidence via fieldsWithBlockedEvidence, even with real livestock and a real slurry allocation", () => {
    const field = makeField("f1", { fertility: {} });
    const livestockGroups = [makeGroup("g1", 20, 20_000)];
    const slurryAllocations: SlurryAllocation[] = [{ fieldId: "f1", housingId: "h1", priority: "high", volumeM3: 950, score: 91 }];
    const result = calculateFarmSlurryNutrientValueEur({ fields: [field], livestockGroups, slurryAllocations, silagePlans: [] });
    expect(result.value.value).toBe(0);
    expect(result.fieldsWithBlockedEvidence).toBe(1);
  });

  it("still includes a silage field with no recorded livestock — silage N/P/K never depends on livestockGroups", () => {
    const field = makeField("f1");
    const slurryAllocations: SlurryAllocation[] = [{ fieldId: "f1", housingId: "h1", priority: "high", volumeM3: 950, score: 91 }];
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
    const result = calculateFarmSlurryNutrientValueEur({ fields: [field], livestockGroups: [], slurryAllocations, silagePlans });
    expect(result.fieldsWithBlockedEvidence).toBe(0);
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

function makeLivestockGroup(
  id: string,
  category: LivestockGroup["category"],
  count: number,
  avgWeightKg?: number,
  goal?: LivestockGroup["goal"],
): LivestockGroup {
  return {
    id,
    farmId: "farm-test",
    category,
    label: id,
    count: tracked(count, "verified", "Keith"),
    avgWeightKg: avgWeightKg !== undefined ? tracked(avgWeightKg, "estimated", "Farm Return assumption") : undefined,
    system: "housed",
    value: tracked(0, "estimated", "Farm Return assumption"),
    ...(goal ? { goal } : {}),
  };
}

describe("calculateFarmConcentrateFeedCostEur", () => {
  it("continental steers: matches calculateFinishingBudget's own per-head cost times headcount", () => {
    const group = makeLivestockGroup("lg-continental-steers", "steer", 20, 520, "finish_slaughter");
    const result = calculateFarmConcentrateFeedCostEur([group]);

    const budgetOutcome = calculateFinishingBudget({
      animalType: "finishing_steer",
      currentWeightKg: 520,
      targetWeightKg: 650,
      silageDMD: 72,
      concentratePriceEurPerTonne: 350,
    });
    expect(budgetOutcome.status).toBe("OK");
    if (budgetOutcome.status !== "OK") throw new Error("expected OK");
    expect(result.value).toBe(Math.round(budgetOutcome.value.feedCostPerHeadEur * 20));
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
    const modelled = makeLivestockGroup("lg-continental-steers", "steer", 20, 520, "finish_slaughter");
    const unmodelled = makeLivestockGroup("lg-heifers", "heifer", 10, 400);

    const withOnlyModelled = calculateFarmConcentrateFeedCostEur([modelled]);
    const withBoth = calculateFarmConcentrateFeedCostEur([modelled, unmodelled]);

    expect(withBoth.value).toBe(withOnlyModelled.value);
    expect(withBoth.source).not.toContain("lg-heifers");
  });

  it("sums multiple real-modelled groups together", () => {
    const steers = makeLivestockGroup("lg-continental-steers", "steer", 20, 520, "finish_slaughter");
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

// Real Mode Completion Phase 15 — "How was this calculated?" drill-down.
describe("calculateFarmConcentrateFeedCostBreakdown", () => {
  it("total matches calculateFarmConcentrateFeedCostEur exactly (same computation, shared)", () => {
    const steers = makeLivestockGroup("lg-continental-steers", "steer", 20, 520, "finish_slaughter");
    const weanlings = makeLivestockGroup("lg-weanlings", "weanling", 18, 335);
    const legacyTotal = calculateFarmConcentrateFeedCostEur([steers, weanlings]);
    const breakdown = calculateFarmConcentrateFeedCostBreakdown([steers, weanlings]);
    expect(breakdown.total).toEqual(legacyTotal);
  });

  it("byGroup sums to the same total, one row per contributing group", () => {
    const steers = makeLivestockGroup("lg-continental-steers", "steer", 20, 520, "finish_slaughter");
    const weanlings = makeLivestockGroup("lg-weanlings", "weanling", 18, 335);
    const sucklerCows = makeLivestockGroup("lg-suckler-cows", "suckler_cow", 32, 612);
    const breakdown = calculateFarmConcentrateFeedCostBreakdown([steers, weanlings, sucklerCows]);

    expect(breakdown.byGroup).toHaveLength(3);
    const sum = breakdown.byGroup.reduce((s, g) => s + g.costEur, 0);
    expect(sum).toBe(breakdown.total.value);
    expect(breakdown.byGroup.map((g) => g.groupId)).toEqual(["lg-continental-steers", "lg-weanlings", "lg-suckler-cows"]);
  });

  it("omits a group with no real concentrate model from byGroup, same as the total", () => {
    const modelled = makeLivestockGroup("lg-continental-steers", "steer", 20, 520, "finish_slaughter");
    const unmodelled = makeLivestockGroup("lg-heifers", "heifer", 10, 400);
    const breakdown = calculateFarmConcentrateFeedCostBreakdown([modelled, unmodelled]);
    expect(breakdown.byGroup).toHaveLength(1);
    expect(breakdown.byGroup[0].groupId).toBe("lg-continental-steers");
  });

  // Real Mode Completion follow-up — a real farmer-entered
  // concentrate_feed_price_eur_per_t assumption must actually change the
  // total, not just display alongside it (FINANCIAL_RECONCILIATION.md's
  // named gap).
  it("with no priceOverride, behaves exactly as before (existing call sites unaffected)", () => {
    const steers = makeLivestockGroup("lg-continental-steers", "steer", 20, 520, "finish_slaughter");
    const weanlings = makeLivestockGroup("lg-weanlings", "weanling", 18, 335);
    const withoutArg = calculateFarmConcentrateFeedCostBreakdown([steers, weanlings]);
    const withUndefined = calculateFarmConcentrateFeedCostBreakdown([steers, weanlings], undefined);
    expect(withUndefined).toEqual(withoutArg);
  });

  it("a priceOverride changes the total and is reflected in status/source", () => {
    const weanlings = makeLivestockGroup("lg-weanlings", "weanling", 18, 335);
    const baseline = calculateFarmConcentrateFeedCostBreakdown([weanlings]);
    const overridden = calculateFarmConcentrateFeedCostBreakdown([weanlings], {
      valueEurPerTonne: 700, // double the ~€350/t code-constant benchmark
      source: "Keith Crehan",
    });

    expect(overridden.total.value).toBeGreaterThan(baseline.total.value);
    expect(overridden.total.status).toBe("farmer_adjusted");
    expect(overridden.total.source).toContain("Keith Crehan");
    expect(baseline.total.status).toBe("estimated");
  });

  it("a priceOverride of 0 still overrides (falsy value, not just truthy)", () => {
    const sucklerCows = makeLivestockGroup("lg-suckler-cows", "suckler_cow", 32, 612);
    const overridden = calculateFarmConcentrateFeedCostBreakdown([sucklerCows], {
      valueEurPerTonne: 0,
      source: "Keith Crehan",
    });
    // Dry spring-calving suckler cows already contribute 0 concentrate
    // kg/day, so this mainly proves the override object itself (not its
    // numeric value) gates the farmer_adjusted status/source.
    expect(overridden.total.status).toBe("farmer_adjusted");
  });
});

describe("calculateFarmConcentrateFeedRequirement", () => {
  it("totalCostEur agrees with calculateFarmConcentrateFeedCostEur for the same herd", () => {
    const steers = makeLivestockGroup("lg-continental-steers", "steer", 20, 520, "finish_slaughter");
    const weanlings = makeLivestockGroup("lg-weanlings", "weanling", 18, 335);
    const sucklerCows = makeLivestockGroup("lg-suckler-cows", "suckler_cow", 32, 612);
    const herd = [steers, weanlings, sucklerCows];

    const requirement = calculateFarmConcentrateFeedRequirement(herd);
    const cost = calculateFarmConcentrateFeedCostEur(herd);

    expect(requirement.totalCostEur).toBe(cost.value);
    expect(requirement.sourceGroupLabels).toEqual(["lg-continental-steers", "lg-weanlings", "lg-suckler-cows"]);
  });

  it("continental steers: totalTonnes matches calculateFinishingBudget's own totalConcentrateKgPerHead x headcount", () => {
    const group = makeLivestockGroup("lg-continental-steers", "steer", 20, 520, "finish_slaughter");
    const requirement = calculateFarmConcentrateFeedRequirement([group]);

    const budgetOutcome = calculateFinishingBudget({
      animalType: "finishing_steer",
      currentWeightKg: 520,
      targetWeightKg: 650,
      silageDMD: 72,
      concentratePriceEurPerTonne: 350,
    });
    expect(budgetOutcome.status).toBe("OK");
    if (budgetOutcome.status !== "OK") throw new Error("expected OK");
    const expectedTonnes = Math.round(((budgetOutcome.value.totalConcentrateKgPerHead * 20) / 1000) * 100) / 100;
    expect(requirement.totalTonnes).toBe(expectedTonnes);
  });

  it("suckler cows alone: real sourced zero tonnes, not an omission", () => {
    const group = makeLivestockGroup("lg-suckler-cows", "suckler_cow", 32, 612);
    const requirement = calculateFarmConcentrateFeedRequirement([group]);
    expect(requirement.totalTonnes).toBe(0);
    expect(requirement.totalCostEur).toBe(0);
    expect(requirement.sourceGroupLabels).toEqual(["lg-suckler-cows"]);
  });

  it("returns 0 for an empty herd", () => {
    const requirement = calculateFarmConcentrateFeedRequirement([]);
    expect(requirement.totalTonnes).toBe(0);
    expect(requirement.totalCostEur).toBe(0);
    expect(requirement.sourceGroupLabels).toEqual([]);
  });
});

function makeSilagePlan(fieldId: string, expectedYieldTDMha: number): SilagePlan {
  return {
    id: `sp-${fieldId}`,
    fieldId,
    cutNumber: 1,
    harvestSystem: "bale",
    targetCutWindow: tracked({ start: "2026-05-01", end: "2026-05-10" }, "estimated", "x"),
    expectedYieldTDMha: tracked(expectedYieldTDMha, "estimated", "x"),
    intendedUse: "own_livestock",
    productionCost: { fertiliserSlurry: 0, contractor: 0, wrapBales: 0, other: 0 },
    chemicalFertiliserKgNpk: 0,
    estimatedFieldCost: 0,
  };
}

describe("calculateFarmGrassAndSilageCostEur", () => {
  it("grass cost matches calculateGrazedGrassCostEur for the real grazing hectares only", () => {
    const grazingField = makeField("f1", { areaHa: 20.2, plannedUse: tracked("grazing", "estimated", "x") });
    const silageField = makeField("f2", { areaHa: 6.8, plannedUse: tracked("silage_1st_cut", "estimated", "x") });

    const result = calculateFarmGrassAndSilageCostEur(
      { fields: [grazingField, silageField], silagePlans: [] },
      "cash",
    );
    expect(result.grassCostEur.value).toBe(Math.round(calculateGrazedGrassCostEur(20.2, "cash")));
  });

  it("silage cost is summed from each plan's own field area x DM yield", () => {
    const silageField = makeField("f2", { areaHa: 6.8, plannedUse: tracked("silage_1st_cut", "estimated", "x") });
    const silagePlans = [makeSilagePlan("f2", 10.4)];

    const result = calculateFarmGrassAndSilageCostEur({ fields: [silageField], silagePlans }, "cash");
    const expectedDmTonnes = 6.8 * 10.4;
    expect(result.silageCostEur.value).toBe(Math.round(calculateSilageCostEur(expectedDmTonnes, "cash")));
  });

  it("economic basis always costs at least as much as cash, for both grass and silage", () => {
    const grazingField = makeField("f1", { areaHa: 20.2, plannedUse: tracked("grazing", "estimated", "x") });
    const silageField = makeField("f2", { areaHa: 6.8, plannedUse: tracked("silage_1st_cut", "estimated", "x") });
    const silagePlans = [makeSilagePlan("f2", 10.4)];
    const fields = [grazingField, silageField];

    const cash = calculateFarmGrassAndSilageCostEur({ fields, silagePlans }, "cash");
    const economic = calculateFarmGrassAndSilageCostEur({ fields, silagePlans }, "economic");

    expect(economic.grassCostEur.value).toBeGreaterThan(cash.grassCostEur.value);
    expect(economic.silageCostEur.value).toBeGreaterThan(cash.silageCostEur.value);
  });

  it("carries the feed-cost engine version and basis in its source", () => {
    const result = calculateFarmGrassAndSilageCostEur({ fields: [], silagePlans: [] }, "economic");
    expect(result.grassCostEur.calculationVersion).toBe(FEED_COST_ENGINE_VERSION);
    expect(result.grassCostEur.source).toContain("economic");
  });

  it("zero fields/plans costs zero, not an error", () => {
    const result = calculateFarmGrassAndSilageCostEur({ fields: [], silagePlans: [] }, "cash");
    expect(result.grassCostEur.value).toBe(0);
    expect(result.silageCostEur.value).toBe(0);
  });
});

function makeHousing(id: string, linkedGroupIds: string[], housingPeriod: { start: string; end: string }): Housing {
  return {
    id,
    farmId: "farm-test",
    shedName: id,
    shedType: "slatted",
    linkedGroupIds,
    housingPeriod,
    slurryEstimate: {
      volumeM3: tracked(0, "estimated", "x"),
      availableN: tracked(0, "estimated", "x"),
      availableP: tracked(0, "estimated", "x"),
      availableK: tracked(0, "estimated", "x"),
      ruleSetVersion: "test",
    },
    storageCapacityM3: 0,
    storageFillPct: 0,
  };
}

describe("calculateFarmMineralCostEur", () => {
  it("matches calculateSucklerCowMineralCostEur for the real headcount x real housing-period days", () => {
    const sucklerCows = makeGroup("lg-suckler-cows", 32, 0);
    const housing = makeHousing("h1", ["lg-suckler-cows"], { start: "2026-11-01", end: "2027-03-15" });

    const result = calculateFarmMineralCostEur({ livestockGroups: [sucklerCows], housingList: [housing] });

    // 1 Nov -> 15 Mar inclusive = 135 days.
    const expectedDays = 135;
    expect(result.value).toBe(Math.round(calculateSucklerCowMineralCostEur(32, expectedDays)));
    expect(result.calculationVersion).toBe(FEED_COST_ENGINE_VERSION);
    expect(result.source).toContain("MB-002");
  });

  it("returns 0 when there is no suckler cow group", () => {
    const result = calculateFarmMineralCostEur({ livestockGroups: [], housingList: [] });
    expect(result.value).toBe(0);
  });

  it("returns 0 when the suckler cow group has no matching housing record", () => {
    const sucklerCows = makeGroup("lg-suckler-cows", 32, 0);
    const result = calculateFarmMineralCostEur({ livestockGroups: [sucklerCows], housingList: [] });
    expect(result.value).toBe(0);
  });
});

function makeMockInputRequirements(): InputRequirement[] {
  return [
    {
      id: "input-fertiliser",
      category: "fertiliser",
      label: "Fertiliser",
      requiredQty: tracked(13.6, "estimated", "Farm Return assumption"),
      unit: "t",
      stockOnHandQty: 0,
      purchaseQty: 13.6,
      estCost: tracked(6_960, "estimated", "Farm Return assumption"),
      requiredByWindow: { start: "2027-02-01", end: "2027-04-30" },
      confidencePct: 91,
      demandState: "forecast",
    },
    {
      id: "input-feed",
      category: "feed",
      label: "Feed",
      requiredQty: tracked(24.8, "estimated", "Farm Return assumption"),
      unit: "t",
      stockOnHandQty: 3.2,
      purchaseQty: 21.6,
      estCost: tracked(8_420, "estimated", "Farm Return assumption"),
      requiredByWindow: { start: "2026-10-01", end: "2027-03-31" },
      confidencePct: 74,
      demandState: "forecast",
    },
    {
      id: "input-lime",
      category: "lime",
      label: "Lime",
      requiredQty: tracked(42.0, "estimated", "Farm Return assumption"),
      unit: "t",
      stockOnHandQty: 0,
      purchaseQty: 42.0,
      estCost: tracked(2_100, "estimated", "Farm Return assumption"),
      requiredByWindow: { start: "2027-01-01", end: "2027-03-31" },
      confidencePct: 52,
      demandState: "forecast",
    },
  ];
}

describe("withRealInputRequirements", () => {
  it("overrides only the fertiliser and feed rows, leaving lime (and any other row) untouched", () => {
    const mock = makeMockInputRequirements();
    const fertiliserRequirement = { byProduct: [], totalTonnes: 10, totalCostEur: 5_000, fieldsWithBlockedEvidence: 0 };
    const feedRequirement = { totalTonnes: 4, totalCostEur: 1_400, sourceGroupLabels: ["lg-weanlings"] };

    const result = withRealInputRequirements(mock, fertiliserRequirement, feedRequirement);

    const lime = result.find((r) => r.id === "input-lime")!;
    expect(lime).toEqual(mock.find((r) => r.id === "input-lime"));
  });

  it("real fertiliser/feed rows carry the real values, a real source, and a recomputed purchaseQty", () => {
    const mock = makeMockInputRequirements();
    const fertiliserRequirement = { byProduct: [], totalTonnes: 10, totalCostEur: 5_000, fieldsWithBlockedEvidence: 0 };
    const feedRequirement = { totalTonnes: 4, totalCostEur: 1_400, sourceGroupLabels: ["lg-weanlings"] };

    const result = withRealInputRequirements(mock, fertiliserRequirement, feedRequirement);

    const fertiliser = result.find((r) => r.id === "input-fertiliser")!;
    expect(fertiliser.requiredQty.value).toBe(10);
    expect(fertiliser.estCost.value).toBe(5_000);
    expect(fertiliser.requiredQty.source).toBe("Farm Return nutrient engine");
    // stockOnHandQty (0) is untouched; purchaseQty recomputed from the new requiredQty.
    expect(fertiliser.stockOnHandQty).toBe(0);
    expect(fertiliser.purchaseQty).toBe(10);

    const feed = result.find((r) => r.id === "input-feed")!;
    expect(feed.requiredQty.value).toBe(4);
    expect(feed.estCost.value).toBe(1_400);
    expect(feed.requiredQty.source).toBe("Farm Return feed cost engine (lg-weanlings)");
    // stockOnHandQty (3.2) is untouched; purchaseQty recomputed from the new requiredQty.
    expect(feed.stockOnHandQty).toBe(3.2);
    expect(feed.purchaseQty).toBeCloseTo(0.8, 5);
  });

  it("never lets purchaseQty go negative when real requirement drops below existing stock on hand", () => {
    const mock = makeMockInputRequirements();
    const feedRequirement = { totalTonnes: 1, totalCostEur: 350, sourceGroupLabels: ["lg-weanlings"] };

    const result = withRealInputRequirements(mock, { byProduct: [], totalTonnes: 0, totalCostEur: 0, fieldsWithBlockedEvidence: 0 }, feedRequirement);

    const feed = result.find((r) => r.id === "input-feed")!;
    expect(feed.purchaseQty).toBe(0);
  });

  it("fields this app has no real model for (requiredByWindow, confidencePct, demandState) stay exactly the mock's", () => {
    const mock = makeMockInputRequirements();
    const result = withRealInputRequirements(
      mock,
      { byProduct: [], totalTonnes: 10, totalCostEur: 5_000, fieldsWithBlockedEvidence: 0 },
      { totalTonnes: 4, totalCostEur: 1_400, sourceGroupLabels: [] },
    );

    const fertiliser = result.find((r) => r.id === "input-fertiliser")!;
    expect(fertiliser.requiredByWindow).toEqual(mock[0].requiredByWindow);
    expect(fertiliser.confidencePct).toBe(mock[0].confidencePct);
    expect(fertiliser.demandState).toBe(mock[0].demandState);
  });

  // Codex remediation Priority 3 — `includeUnmodelledRows: false` (a real
  // signed-in farm account) drops every row this app has no real model
  // for (everything except Fertiliser/Feed), never showing the demo
  // farm's fabricated Lime/Minerals/Silage-inputs/Contractor/Other
  // quantity/cost/confidence/timing.
  it("includeUnmodelledRows: false keeps only the real Fertiliser/Feed rows", () => {
    const mock = makeMockInputRequirements();
    const result = withRealInputRequirements(
      mock,
      { byProduct: [], totalTonnes: 10, totalCostEur: 5_000, fieldsWithBlockedEvidence: 0 },
      { totalTonnes: 4, totalCostEur: 1_400, sourceGroupLabels: ["lg-weanlings"] },
      false,
    );
    expect(result.map((r) => r.id).sort()).toEqual(["input-feed", "input-fertiliser"]);
    expect(result.find((r) => r.id === "input-lime")).toBeUndefined();
  });
});

describe("withRealBuyingOpportunityRequirement", () => {
  const mockOpportunities: BuyingOpportunity[] = [
    {
      id: "buy-fertiliser",
      category: "fertiliser",
      userRequirementQty: 13.6,
      regionalConfirmedQty: 620,
      regionalCommittedQty: 410,
      targetPrice: 470,
      currentPrice: 512,
      potentialSavingPerUnit: 42,
    },
    {
      id: "buy-bale-wrap",
      category: "silage_inputs",
      userRequirementQty: 165,
      regionalConfirmedQty: 5400,
      regionalCommittedQty: 3900,
      targetPrice: 9.2,
      currentPrice: 10.0,
      potentialSavingPerUnit: 0.8,
    },
  ];

  it("overrides only buy-fertiliser's userRequirementQty, matching the real Input Planner Fertiliser row", () => {
    const fertiliserRequirement = { byProduct: [], totalTonnes: 14.1, totalCostEur: 7_713, fieldsWithBlockedEvidence: 0 };
    const result = withRealBuyingOpportunityRequirement(mockOpportunities, fertiliserRequirement);

    const fertiliser = result.find((o) => o.id === "buy-fertiliser")!;
    expect(fertiliser.userRequirementQty).toBe(14.1);
    // Everything else on that row (regional/pricing figures — still needs
    // a live supplier source) stays exactly the mock's.
    expect(fertiliser.regionalConfirmedQty).toBe(620);
    expect(fertiliser.currentPrice).toBe(512);
  });

  it("leaves every other opportunity (buy-bale-wrap) untouched", () => {
    const result = withRealBuyingOpportunityRequirement(mockOpportunities, { byProduct: [], totalTonnes: 14.1, totalCostEur: 7_713, fieldsWithBlockedEvidence: 0 });
    const baleWrap = result.find((o) => o.id === "buy-bale-wrap")!;
    expect(baleWrap).toEqual(mockOpportunities.find((o) => o.id === "buy-bale-wrap"));
  });

  // Codex remediation Priority 3 — `includeRows: false` (a real signed-in
  // farm account) drops every bulk-buy opportunity, including
  // "buy-fertiliser" — its regional/pricing figures are still 100%
  // fabricated even though userRequirementQty is real.
  it("includeRows: false drops every opportunity, including buy-fertiliser", () => {
    const fertiliserRequirement = { byProduct: [], totalTonnes: 14.1, totalCostEur: 7_713, fieldsWithBlockedEvidence: 0 };
    const result = withRealBuyingOpportunityRequirement(mockOpportunities, fertiliserRequirement, false);
    expect(result).toEqual([]);
  });
});
