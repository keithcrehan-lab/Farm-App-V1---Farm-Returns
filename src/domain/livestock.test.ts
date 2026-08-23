import { describe, expect, it } from "vitest";
import {
  calculateFinishingBudget,
  calculateLivestockEconomics,
  calculateSellNowVsFinish,
  concentrateKgPerDay,
  FINISHING_KILL_OUT_PCT,
  LIVESTOCK_ENGINE_VERSION,
  targetADGForAnimalType,
} from "./livestock";
import { tracked } from "./types";
import type { LivestockGroup } from "./types";

// Expected values transcribed directly from the Farm Return Teagasc Animal
// Nutrition Database (v2) the user supplied — sheets DMD-Concentrate,
// Manual-Finishing, System-Benchmarks and the workbook's own worked
// "Feed-Calculator" example, all Teagasc-sourced (see
// docs/evidence-register.md).

describe("concentrateKgPerDay (DMD-Concentrate sheet)", () => {
  it("published breakpoints, finishing steer", () => {
    expect(concentrateKgPerDay("finishing_steer", 66)).toBe(7);
    expect(concentrateKgPerDay("finishing_steer", 70)).toBe(5.5);
    expect(concentrateKgPerDay("finishing_steer", 72)).toBe(5);
    expect(concentrateKgPerDay("finishing_steer", 76)).toBe(4);
  });

  it("published breakpoints, weanling", () => {
    expect(concentrateKgPerDay("weanling", 66)).toBe(1.8);
    expect(concentrateKgPerDay("weanling", 74)).toBe(0.6);
  });

  it("interpolates between adjacent breakpoints", () => {
    // 69 is halfway between 68 (6) and 70 (5.5).
    expect(concentrateKgPerDay("finishing_steer", 69)).toBeCloseTo(5.75, 5);
  });

  it("clamps outside the published range rather than extrapolating", () => {
    expect(concentrateKgPerDay("finishing_steer", 50)).toBe(7);
    expect(concentrateKgPerDay("finishing_steer", 90)).toBe(4);
  });
});

describe("targetADGForAnimalType", () => {
  it("matches each sheet's own stated target ADG", () => {
    expect(targetADGForAnimalType("weanling")).toBe(0.6);
    expect(targetADGForAnimalType("finishing_steer")).toBe(1.0);
    expect(targetADGForAnimalType("finishing_heifer")).toBe(0.9);
  });
});

describe("calculateFinishingBudget", () => {
  it("reproduces the workbook's own Feed-Calculator worked example exactly", () => {
    // Sheet "Feed-Calculator": 520kg -> 650kg continental steer, ADG 1.0,
    // 72 DMD, EUR350/t => 130 days, 5kg/head/day, 650kg total concentrate/head,
    // 13t for 20 head, EUR4,550 total group cost.
    const result = calculateFinishingBudget({
      animalType: "finishing_steer",
      currentWeightKg: 520,
      targetWeightKg: 650,
      silageDMD: 72,
      concentratePriceEurPerTonne: 350,
    });

    expect(result.daysToFinish).toBe(130);
    expect(result.concentrateKgPerHeadDay).toBe(5);
    expect(result.totalConcentrateKgPerHead).toBe(650);
    expect(result.feedCostPerHeadEur).toBeCloseTo(227.5, 5);

    const headCount = 20;
    const totalGroupCostEur = result.feedCostPerHeadEur * headCount;
    expect(totalGroupCostEur).toBeCloseTo(4_550, 5);
  });

  it("never returns a negative gain when already at/above target", () => {
    const result = calculateFinishingBudget({
      animalType: "finishing_steer",
      currentWeightKg: 700,
      targetWeightKg: 650,
      silageDMD: 72,
      concentratePriceEurPerTonne: 350,
    });
    expect(result.daysToFinish).toBe(0);
    expect(result.totalConcentrateKgPerHead).toBe(0);
  });
});

describe("calculateSellNowVsFinish", () => {
  it("matches docs/feed-engine.md's definition: sell-now value vs (forecast sale value - remaining feed cost)", () => {
    const result = calculateSellNowVsFinish({
      currentWeightKg: 520,
      targetWeightKg: 650,
      killOutPct: FINISHING_KILL_OUT_PCT,
      cattlePriceEurPerKgCarcass: 5.42,
      remainingFeedCostToFinishEurPerHead: 227.5,
    });
    expect(result.sellNowValueEurPerHead).toBeCloseTo(520 * 0.55 * 5.42, 5);
    expect(result.forecastSaleValueEurPerHead).toBeCloseTo(650 * 0.55 * 5.42, 5);
    expect(result.finishNetValueEurPerHead).toBeCloseTo(650 * 0.55 * 5.42 - 227.5, 5);
  });
});

describe("calculateLivestockEconomics", () => {
  const group: LivestockGroup = {
    id: "lg-continental-steers",
    farmId: "farm-test",
    category: "steer",
    label: "Continental Steers",
    count: tracked(18, "verified", "Keith"),
    avgWeightKg: tracked(520, "estimated", "Farm Return assumption"),
    system: "housed",
    value: tracked(7_380, "estimated", "Farm Return assumption"),
  };

  const options = {
    animalType: "finishing_steer" as const,
    targetWeightKg: 650,
    silageDMD: 72,
    concentratePriceEurPerTonne: 350,
    cattlePriceEurPerKgCarcass: 5.42,
    today: new Date("2026-08-23T00:00:00Z"),
  };

  it("returns undefined when the group has no tracked average weight", () => {
    const noWeight: LivestockGroup = { ...group, avgWeightKg: undefined };
    expect(calculateLivestockEconomics(noWeight, options)).toBeUndefined();
  });

  it("assembles a full LivestockEconomics object with correct provenance and version", () => {
    const result = calculateLivestockEconomics(group, options)!;
    expect(result).toBeDefined();
    expect(result.groupId).toBe("lg-continental-steers");
    expect(result.targetWeightKg).toBe(650);
    expect(result.currentValueEur.status).toBe("estimated");
    expect(result.currentValueEur.calculationVersion).toBe(LIVESTOCK_ENGINE_VERSION);
    expect(result.performanceForecast.avgDailyGainKg).toBe(1.0);
    expect(result.performanceForecast.daysToFinish).toBe(130);
    expect(result.costBreakdown).toHaveLength(1);
    expect(result.costBreakdown[0].label).toBe("Concentrates");
    // Target date = today + 130 days.
    expect(result.targetDate).toBe("2026-12-31");
  });

  it("scales group feed cost by headcount, not per-head", () => {
    const result = calculateLivestockEconomics(group, options)!;
    const perHeadDaily = result.currentFeedCost.perHeadPerDayEur;
    expect(result.currentFeedCost.totalGroupPerDayEur).toBeCloseTo(perHeadDaily * 18, 2);
  });

  it("recommends finishing when the net finish value beats sell-now (the common case at these prices)", () => {
    const result = calculateLivestockEconomics(group, options)!;
    expect(result.marginOutlook.finishEur).toBeGreaterThan(result.marginOutlook.sellNowEur);
    expect(result.recommendation.title).toContain("Finishing");
  });
});
