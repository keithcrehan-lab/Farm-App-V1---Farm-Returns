import { describe, expect, it } from "vitest";
import {
  calculateBasicFodderDemandFreshWeightT,
  calculateWholeFarmFodderDemand,
  FODDER_COEFFICIENT_T_PER_HEAD_MONTH,
  resolveFodderAnimalClass,
} from "./fodder-budget";
import { tracked } from "./types";
import type { LivestockGroup } from "./types";

function group(overrides: Partial<LivestockGroup> & Pick<LivestockGroup, "category">): LivestockGroup {
  return {
    id: "g1",
    farmId: "f",
    label: "Test group",
    count: tracked(1, "verified", "Keith"),
    system: "grazing",
    value: tracked(0, "estimated", "x"),
    ...overrides,
  };
}

describe("FODDER_COEFFICIENT_T_PER_HEAD_MONTH", () => {
  it("matches advisory_teagasc/fodder_budget_current_2026_08_26.csv exactly", () => {
    expect(FODDER_COEFFICIENT_T_PER_HEAD_MONTH).toEqual({
      dairy_cow: 1.6,
      suckler_cow: 1.4,
      cattle_0_1: 0.7,
      cattle_1_2: 1.3,
      cattle_2plus: 1.3,
      ewe: 0.15,
    });
  });
});

describe("resolveFodderAnimalClass", () => {
  it("resolves dairy_cow and suckler_cow directly, age-independent", () => {
    const dairy = resolveFodderAnimalClass(group({ category: "dairy_cow" }));
    const suckler = resolveFodderAnimalClass(group({ category: "suckler_cow" }));
    expect(dairy.status === "OK" && dairy.value).toBe("dairy_cow");
    expect(suckler.status === "OK" && suckler.value).toBe("suckler_cow");
  });

  it("blocks an age-dependent category when avgAgeMonths is absent", () => {
    const outcome = resolveFodderAnimalClass(group({ category: "weanling" }));
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("buckets cattle into the real 0-1/1-2/2+ year bands", () => {
    expect(resolveFodderAnimalClass(group({ category: "calf", avgAgeMonths: 6 }))).toMatchObject({ status: "OK", value: "cattle_0_1" });
    expect(resolveFodderAnimalClass(group({ category: "weanling", avgAgeMonths: 18 }))).toMatchObject({ status: "OK", value: "cattle_1_2" });
    expect(resolveFodderAnimalClass(group({ category: "steer", avgAgeMonths: 30 }))).toMatchObject({ status: "OK", value: "cattle_2plus" });
  });
});

describe("calculateBasicFodderDemandFreshWeightT", () => {
  it("GFT091: dairy_cow, 20 head, 5 months -> 160.0t", () => {
    expect(calculateBasicFodderDemandFreshWeightT({ animalClass: "dairy_cow", headcount: 20, plannedMonths: 5 })).toMatchObject({ status: "OK", value: 160 });
  });

  it("GFT092: suckler_cow, 30 head, 5 months -> 210.0t", () => {
    expect(calculateBasicFodderDemandFreshWeightT({ animalClass: "suckler_cow", headcount: 30, plannedMonths: 5 })).toMatchObject({ status: "OK", value: 210 });
  });

  it("GFT093: cattle_0_1, 40 head, 5 months -> 140.0t", () => {
    expect(calculateBasicFodderDemandFreshWeightT({ animalClass: "cattle_0_1", headcount: 40, plannedMonths: 5 })).toMatchObject({ status: "OK", value: 140 });
  });

  it("GFT094: cattle_1_2, 15 head, 5 months -> 97.5t", () => {
    expect(calculateBasicFodderDemandFreshWeightT({ animalClass: "cattle_1_2", headcount: 15, plannedMonths: 5 })).toMatchObject({ status: "OK", value: 97.5 });
  });

  it("GFT095: cattle_2plus, 10 head, 5 months -> 65.0t", () => {
    expect(calculateBasicFodderDemandFreshWeightT({ animalClass: "cattle_2plus", headcount: 10, plannedMonths: 5 })).toMatchObject({ status: "OK", value: 65 });
  });

  it("GFT096: ewe, 100 head, 4 months -> 60.0t", () => {
    expect(calculateBasicFodderDemandFreshWeightT({ animalClass: "ewe", headcount: 100, plannedMonths: 4 })).toMatchObject({ status: "OK", value: 60 });
  });

  it("GFT099: farmer-planned months override (6, not a hard-coded default) -> 252.0t", () => {
    const outcome = calculateBasicFodderDemandFreshWeightT({ animalClass: "suckler_cow", headcount: 30, plannedMonths: 6 });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBeCloseTo(252, 10);
  });

  it("GFT100: no planned winter period -> BLOCK_MISSING_PERIOD, never a guessed default", () => {
    const outcome = calculateBasicFodderDemandFreshWeightT({ animalClass: "suckler_cow", headcount: 30, plannedMonths: undefined });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(outcome.reasonCode).toBe("BLOCK_MISSING_PERIOD");
  });
});

describe("calculateWholeFarmFodderDemand", () => {
  it("GFT097 (cattle classes): mixed-herd total across the 5 cattle classes this app can represent -> 672.5t", () => {
    // GFT097's own scenario spans all 6 fodder classes including "ewe",
    // but this app's LivestockCategory union has no sheep category at
    // all (no reachable path to "ewe" through a real LivestockGroup) —
    // the ewe contribution (100 head x 4 months x 0.15t = 60.0t) is
    // exercised directly in calculateBasicFodderDemandFreshWeightT's own
    // GFT096 test above instead; this test covers the 5 cattle classes'
    // aggregation, 672.5t = 732.5t (GFT097's full total) - 60.0t (ewe).
    const inputs = [
      { group: { id: "g1", label: "Dairy", category: "dairy_cow" as const, count: { value: 20 } }, plannedMonths: 5 },
      { group: { id: "g2", label: "Suckler", category: "suckler_cow" as const, count: { value: 30 } }, plannedMonths: 5 },
      { group: { id: "g3", label: "Calves", category: "calf" as const, avgAgeMonths: 6, count: { value: 40 } }, plannedMonths: 5 },
      { group: { id: "g4", label: "Yearlings", category: "weanling" as const, avgAgeMonths: 18, count: { value: 15 } }, plannedMonths: 5 },
      { group: { id: "g5", label: "Steers", category: "steer" as const, avgAgeMonths: 30, count: { value: 10 } }, plannedMonths: 5 },
    ];
    const outcome = calculateWholeFarmFodderDemand(inputs);
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value.totalFreshWeightT).toBeCloseTo(160 + 210 + 140 + 97.5 + 65, 5);
      expect(outcome.value.totalFreshWeightT).toBeCloseTo(672.5, 5);
      expect(outcome.value.byGroup).toHaveLength(5);
    }
  });

  it("blocks the WHOLE total, not a silent partial sum, when any group can't be categorised", () => {
    const inputs = [
      { group: { id: "g1", label: "Dairy", category: "dairy_cow" as const, count: { value: 20 } }, plannedMonths: 5 },
      { group: { id: "g2", label: "Weanlings", category: "weanling" as const, count: { value: 18 } }, plannedMonths: 5 }, // no avgAgeMonths
    ];
    const outcome = calculateWholeFarmFodderDemand(inputs);
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("MISSING_FODDER_CATEGORISATION");
      expect(outcome.missingInputs[0]).toContain("g2");
    }
  });

  it("blocks the WHOLE total when any group has no planned winter months", () => {
    const inputs = [{ group: { id: "g1", label: "Dairy", category: "dairy_cow" as const, count: { value: 20 } }, plannedMonths: undefined }];
    const outcome = calculateWholeFarmFodderDemand(inputs);
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });
});
