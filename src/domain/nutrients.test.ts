import { describe, expect, it } from "vitest";
import {
  calculateGrasslandStockingRateKgHa,
  calculateNutrientPlan,
  kGrazingKgHa,
  kIndexFromMgL,
  kSilageKgHa,
  LIVESTOCK_UNITS_PER_HEAD,
  napMaxAvailableNCutOnlyKgHa,
  napMaxAvailableNGrazingKgHa,
  napMaxAvailablePCutOnlyKgHa,
  napMaxAvailablePGrazingKgHa,
  nGrazingSucklerToBeefKgHa,
  nSilageKgHa,
  pBuildUpKgHa,
  pIndexFromMgL,
  pMaintenanceGrazingKgHa,
  pMaintenanceSilageKgHa,
  slurryAvailableKgHa,
  totalLivestockUnits,
} from "./nutrients";
import { tracked } from "./types";
import type { Field, LivestockGroup } from "./types";

// Every expected value below is transcribed directly from the named Green
// Book table (see file header comments in nutrients.ts and
// docs/evidence-register.md) — these tests are the "known test cases
// independently validated" Phase 3 exit gate
// (docs/product-requirements.md § Delivery phases).

describe("Soil index classification (Table 6-4/13-1, 6-5)", () => {
  it("P index boundaries", () => {
    expect(pIndexFromMgL(0)).toBe(1);
    expect(pIndexFromMgL(3.0)).toBe(1);
    expect(pIndexFromMgL(3.1)).toBe(2);
    expect(pIndexFromMgL(5.0)).toBe(2);
    expect(pIndexFromMgL(5.1)).toBe(3);
    expect(pIndexFromMgL(8.0)).toBe(3);
    expect(pIndexFromMgL(8.1)).toBe(4);
  });

  it("K index boundaries", () => {
    expect(kIndexFromMgL(0)).toBe(1);
    expect(kIndexFromMgL(50)).toBe(1);
    expect(kIndexFromMgL(51)).toBe(2);
    expect(kIndexFromMgL(100)).toBe(2);
    expect(kIndexFromMgL(101)).toBe(3);
    expect(kIndexFromMgL(150)).toBe(3);
    expect(kIndexFromMgL(151)).toBe(4);
  });
});

describe("P requirement (Tables 13-2, 13-3, 13-4)", () => {
  it("build-up rates by index", () => {
    expect(pBuildUpKgHa(1)).toBe(20);
    expect(pBuildUpKgHa(2)).toBe(10);
    expect(pBuildUpKgHa(3)).toBe(0);
    expect(pBuildUpKgHa(4)).toBe(0);
  });

  it("grazing maintenance bands, drystock", () => {
    expect(pMaintenanceGrazingKgHa(100, "drystock")).toBe(4);
    expect(pMaintenanceGrazingKgHa(130, "drystock")).toBe(7);
    expect(pMaintenanceGrazingKgHa(170, "drystock")).toBe(10);
    expect(pMaintenanceGrazingKgHa(210, "drystock")).toBe(13);
    expect(pMaintenanceGrazingKgHa(250, "drystock")).toBe(16);
  });

  it("grazing maintenance bands, dairy", () => {
    expect(pMaintenanceGrazingKgHa(100, "dairy")).toBe(6);
    expect(pMaintenanceGrazingKgHa(210, "dairy")).toBe(19);
    expect(pMaintenanceGrazingKgHa(300, "dairy")).toBe(23);
  });

  it("silage maintenance at the 5t DM/ha baseline yield", () => {
    expect(pMaintenanceSilageKgHa(1, 3, 5)).toBe(20); // index 1-3, first cut
    expect(pMaintenanceSilageKgHa(2, 3, 5)).toBe(10); // second cut
    expect(pMaintenanceSilageKgHa(1, 4, 5)).toBe(0); // index 4: none
  });

  it("silage maintenance adjusts \xb14kg/t DM away from the 5t/ha baseline", () => {
    expect(pMaintenanceSilageKgHa(1, 3, 6)).toBe(24); // +1 t/ha => +4kg
    expect(pMaintenanceSilageKgHa(1, 3, 4)).toBe(16); // -1 t/ha => -4kg
  });
});

describe("K requirement (Tables 14-1, 14-2)", () => {
  it("grazing base rates at the 170kg Org N (2 LU/ha) baseline, drystock", () => {
    expect(kGrazingKgHa(1, "drystock", 170)).toBe(75);
    expect(kGrazingKgHa(2, "drystock", 170)).toBe(45);
    expect(kGrazingKgHa(3, "drystock", 170)).toBe(15);
    expect(kGrazingKgHa(4, "drystock", 170)).toBe(0);
  });

  it("grazing K steps \xb15kg/ha per 40kg/ha of Org N away from 170", () => {
    expect(kGrazingKgHa(3, "drystock", 210)).toBe(20); // +40 => +5
    expect(kGrazingKgHa(3, "drystock", 130)).toBe(10); // -40 => -5
  });

  it("silage base rates at baseline yields (5t/ha cut1, 3t/ha cut2+)", () => {
    expect(kSilageKgHa(1, 1)).toBe(185);
    expect(kSilageKgHa(1, 3)).toBe(125);
    expect(kSilageKgHa(2, 3)).toBe(75);
    expect(kSilageKgHa(1, 4)).toBe(0);
  });

  it("silage K adjusts \xb125kg/ha per extra t/ha DM", () => {
    expect(kSilageKgHa(1, 3, 6)).toBe(150); // +1 t/ha => +25
    expect(kSilageKgHa(1, 3, 4)).toBe(100); // -1 t/ha => -25
  });
});

describe("N requirement (Tables 12-3, 12-7)", () => {
  it("grazing N at published stocking-rate rows (suckler calf-to-beef)", () => {
    expect(nGrazingSucklerToBeefKgHa(1.0)).toBe(35);
    expect(nGrazingSucklerToBeefKgHa(2.0)).toBe(132);
    expect(nGrazingSucklerToBeefKgHa(3.0)).toBe(241);
  });

  it("grazing N interpolates between adjacent rows", () => {
    // 2.0 -> 132, 2.25 -> 162; midpoint (2.125) should sit halfway between.
    expect(nGrazingSucklerToBeefKgHa(2.125)).toBeCloseTo((132 + 162) / 2, 5);
  });

  it("grazing N clamps outside the table's range", () => {
    expect(nGrazingSucklerToBeefKgHa(0.5)).toBe(35);
    expect(nGrazingSucklerToBeefKgHa(5.0)).toBe(241);
  });

  it("silage N, established sward (not grazed the previous year)", () => {
    expect(nSilageKgHa(1, false)).toBe(125);
    expect(nSilageKgHa(2, false)).toBe(100);
  });

  it("silage N, field grazed the previous year", () => {
    expect(nSilageKgHa(1, true)).toBe(100);
    expect(nSilageKgHa(2, true)).toBe(85);
  });
});

describe("Livestock units (Table 12-3 footnote 2)", () => {
  it("per-category LU values", () => {
    expect(LIVESTOCK_UNITS_PER_HEAD.suckler_cow).toBe(0.9);
    expect(LIVESTOCK_UNITS_PER_HEAD.weanling).toBe(0.3);
    expect(LIVESTOCK_UNITS_PER_HEAD.bull).toBe(1.0);
  });

  it("sums headcount x LU across groups", () => {
    const groups: LivestockGroup[] = [
      { id: "a", farmId: "f", category: "suckler_cow", label: "Cows", count: tracked(10, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
      { id: "b", farmId: "f", category: "bull", label: "Bull", count: tracked(1, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    expect(totalLivestockUnits(groups)).toBeCloseTo(10 * 0.9 + 1 * 1.0, 5);
  });
});

describe("Slurry organic offset (Table 9-8, low-index adjustment per footnote 3)", () => {
  it("matches the exact published grid point: 33 t/ha at 6% DM, Index 3/4", () => {
    const result = slurryAvailableKgHa(33, 6, 3, 3);
    expect(result.n).toBeCloseTo(23, 5);
    expect(result.p).toBeCloseTo(15, 5);
    expect(result.k).toBeCloseTo(95, 5);
  });

  it("applies the 50%/90% low-index availability factors (footnote 3)", () => {
    const highIndex = slurryAvailableKgHa(33, 6, 3, 3);
    const lowIndex = slurryAvailableKgHa(33, 6, 1, 1);
    expect(lowIndex.n).toBeCloseTo(highIndex.n, 5); // N availability doesn't depend on index
    expect(lowIndex.p).toBeCloseTo(highIndex.p * 0.5, 5);
    expect(lowIndex.k).toBeCloseTo(highIndex.k * 0.9, 5);
  });

  it("interpolates between published rate breakpoints", () => {
    // Halfway between 22 t/ha (N=15) and 33 t/ha (N=23) at 6% DM.
    const result = slurryAvailableKgHa(27.5, 6, 3, 3);
    expect(result.n).toBeCloseTo((15 + 23) / 2, 5);
  });
});

describe("NAP ceilings (Tables 12-9/12-10 N, 13-6/13-7 P — planning_advice, see caveat in nutrients.ts)", () => {
  it("N grazing ceiling bands", () => {
    expect(napMaxAvailableNGrazingKgHa(170)).toBe(206);
    expect(napMaxAvailableNGrazingKgHa(200)).toBe(282);
    expect(napMaxAvailableNGrazingKgHa(230)).toBe(250);
  });

  it("N cut-only ceiling", () => {
    expect(napMaxAvailableNCutOnlyKgHa(1)).toBe(125);
    expect(napMaxAvailableNCutOnlyKgHa(2)).toBe(100);
    expect(napMaxAvailableNCutOnlyKgHa("hay")).toBe(80);
  });

  it("P grazing ceiling bands by index", () => {
    expect(napMaxAvailablePGrazingKgHa(85, 1)).toBe(27);
    expect(napMaxAvailablePGrazingKgHa(85, 3)).toBe(7);
    expect(napMaxAvailablePGrazingKgHa(250, 4)).toBe(0);
  });

  it("P cut-only ceiling by index", () => {
    expect(napMaxAvailablePCutOnlyKgHa(1, 1)).toBe(40);
    expect(napMaxAvailablePCutOnlyKgHa(2, 1)).toBe(10);
    expect(napMaxAvailablePCutOnlyKgHa(1, 4)).toBe(0);
  });
});

describe("calculateGrasslandStockingRateKgHa", () => {
  it("derives organic-N stocking rate from headcount and area", () => {
    // 56.2 LU over 27 ha => ~2.081 LU/ha => interpolated N between 2.0(132) and 2.25(162).
    const groups: LivestockGroup[] = [
      { id: "a", farmId: "f", category: "suckler_cow", label: "Cows", count: tracked(32, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
      { id: "b", farmId: "f", category: "weanling", label: "Weanlings", count: tracked(18, "verified", "Keith"), system: "housed", value: tracked(0, "estimated", "x") },
      { id: "c", farmId: "f", category: "heifer", label: "Heifers", count: tracked(12, "verified", "Keith"), system: "housed", value: tracked(0, "estimated", "x") },
      { id: "d", farmId: "f", category: "bull", label: "Bull", count: tracked(1, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
      { id: "e", farmId: "f", category: "steer", label: "Steers", count: tracked(18, "verified", "Keith"), system: "housed", value: tracked(0, "estimated", "x") },
    ];
    const luHa = totalLivestockUnits(groups) / 27;
    const result = calculateGrasslandStockingRateKgHa(groups, 27);
    expect(result).toBeCloseTo(nGrazingSucklerToBeefKgHa(luHa), 5);
    expect(result).toBeGreaterThan(132);
    expect(result).toBeLessThan(162);
  });

  it("returns 0 for zero grassland area rather than dividing by zero", () => {
    expect(calculateGrasslandStockingRateKgHa([], 0)).toBe(0);
  });
});

describe("calculateNutrientPlan (orchestration)", () => {
  const field: Field = {
    id: "field-test",
    farmId: "farm-test",
    name: "Test Field",
    areaHa: 6.8,
    centroid: [0, 0],
    plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Keith"),
    mappedSoil: {
      soilAssociation: "Fermoy",
      dominantSeries: "Brown Earth",
      texture: "Loam",
      drainage: "moderately_drained",
      coveragePct: 88,
      datasetVersion: "test",
      source: "test",
    },
    fertility: {
      pIndex: tracked(3, "farmer_adjusted", "Keith"),
      kIndex: tracked(3, "farmer_adjusted", "Keith"),
    },
    history: [],
  };

  it("computes a silage plan with organic offset and carries provenance/version metadata", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: { fieldId: field.id, housingId: "h1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 },
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
    });

    expect(plan.fieldId).toBe(field.id);
    expect(plan.calculationVersion).toBe("nutrient_engine_v1.0.0");
    expect(plan.requirement.status).toBe("estimated");
    expect(plan.requirement.source).toContain("Teagasc");
    // Gross: N=125 (Table 12-7), P=0(buildup,idx3)+20(maint)=20, K=125 (Table 14-2, idx3 cut1).
    expect(plan.requirement.value).toEqual({ n: 125, p: 20, k: 125 });
    // Slurry at 33 t/ha, ~6.3% DM (nearest col 6%), idx 3/3 => matches the 33t/ha@6%DM grid point.
    expect(plan.organicApplication.offsetN).toBe(23);
    expect(plan.organicApplication.offsetP).toBe(15);
    expect(plan.organicApplication.offsetK).toBe(95);
    // Remaining after offset: N=102, P=5, K=30 — purchased products should be non-empty and costed.
    expect(plan.purchasedProducts.length).toBeGreaterThan(0);
    expect(plan.estimatedFieldCostEur).toBeGreaterThan(0);
  });

  it("applies no organic offset when the field has no (or an unsuitable) slurry allocation", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: { fieldId: field.id, housingId: "h1", priority: "not_suitable", volumeM3: 0, score: 0 },
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.organicApplication.rateM3ha).toBe(0);
    expect(plan.organicApplication.offsetN).toBe(0);
  });
});
