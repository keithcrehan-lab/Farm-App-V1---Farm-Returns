import { describe, expect, it } from "vitest";
import {
  calculateFinishingBudget,
  calculateLivestockEconomics,
  calculateSellNowVsFinish,
  calculateWeanlingConcentrateStrategies,
  calculateWeanlingFirstWinterBudget,
  concentrateIngredientsKgDay,
  concentrateKgPerDay,
  CONCENTRATE_FORMULATION_PCT,
  FINISHING_KILL_OUT_PCT,
  FINISHING_OPTIONS,
  LIVESTOCK_ENGINE_VERSION,
  sucklerCowConcentrateKgPerDay,
  SUCKLER_COW_WINTER_RULES,
  targetADGForAnimalType,
  weanlingADGForConcentrateKgDay,
  weanlingFirstWinterConcentrateKgPerDay,
  WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE,
  WEANLING_STRATEGY_TARGET_WEIGHT_KG,
  WEANLING_VARIABLE_ADG_POINTS,
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

// Expected values transcribed from the v3 workbook's new sheets
// (Optimiser_ADG_Evidence, Concentrate_Formulation, Weanling_DMD_ADG,
// Optimiser_Calculator) — see docs/evidence-register.md.

describe("weanlingADGForConcentrateKgDay (Optimiser_ADG_Evidence sheet)", () => {
  it("matches the three published trial observations exactly", () => {
    expect(weanlingADGForConcentrateKgDay(0)).toBeCloseTo(0.176, 5);
    expect(weanlingADGForConcentrateKgDay(1.5)).toBeCloseTo(0.664, 5);
    expect(weanlingADGForConcentrateKgDay(3)).toBeCloseTo(0.859, 5);
  });

  it("interpolates between adjacent trial points", () => {
    // 0.75 is halfway between 0 (0.176) and 1.5 (0.664).
    expect(weanlingADGForConcentrateKgDay(0.75)).toBeCloseTo((0.176 + 0.664) / 2, 5);
  });

  it("clamps to the observed 0-3kg range rather than extrapolating", () => {
    expect(weanlingADGForConcentrateKgDay(-1)).toBeCloseTo(0.176, 5);
    expect(weanlingADGForConcentrateKgDay(5)).toBeCloseTo(0.859, 5);
  });

  it("the exported evidence points match the sheet's own values", () => {
    expect(WEANLING_VARIABLE_ADG_POINTS).toEqual([
      [0, 0.176],
      [1.5, 0.664],
      [3, 0.859],
    ]);
  });
});

describe("concentrateIngredientsKgDay (Concentrate_Formulation sheet)", () => {
  it("published percentages sum to 100%", () => {
    const total =
      CONCENTRATE_FORMULATION_PCT.rolledBarley +
      CONCENTRATE_FORMULATION_PCT.soyaBeanMeal +
      CONCENTRATE_FORMULATION_PCT.molasses +
      CONCENTRATE_FORMULATION_PCT.mineralsVitamins;
    expect(total).toBeCloseTo(1, 5);
  });

  it("splits a total kg/day rate into the standard ration exactly", () => {
    const ingredients = concentrateIngredientsKgDay(3);
    expect(ingredients).toEqual([
      { label: "Rolled Barley", kgDay: 3 * 0.862 },
      { label: "Soya Bean Meal", kgDay: 3 * 0.06 },
      { label: "Molasses", kgDay: 3 * 0.05 },
      { label: "Minerals & Vitamins", kgDay: 3 * 0.028 },
    ]);
    const sumKgDay = ingredients.reduce((sum, i) => sum + i.kgDay, 0);
    expect(sumKgDay).toBeCloseTo(3, 5);
  });
});

describe("calculateWeanlingConcentrateStrategies", () => {
  // Farm's real weanling group: 335kg average weight (mock-farm.ts
  // "lg-weanlings"). Target weight + concentrate price from the
  // workbook's own Optimiser_Calculator example, which was built around
  // this exact starting weight.
  const strategies = calculateWeanlingConcentrateStrategies({
    currentWeightKg: 335,
    targetWeightKg: 420,
    concentratePriceEurPerTonne: 350,
  });

  it("returns exactly the three strategy ids in order", () => {
    expect(strategies.map((s) => s.id)).toEqual(["lowest_cost", "balanced", "faster_finish"]);
  });

  it("each strategy's daily gain matches its evidence point exactly", () => {
    expect(strategies[0].dailyGainKg).toBeCloseTo(0.176, 5);
    expect(strategies[1].dailyGainKg).toBeCloseTo(0.664, 5);
    expect(strategies[2].dailyGainKg).toBeCloseTo(0.859, 5);
  });

  it("faster strategies genuinely finish sooner, not on a shared fixed day count", () => {
    expect(strategies[0].daysToFinish).toBeGreaterThan(strategies[1].daysToFinish);
    expect(strategies[1].daysToFinish).toBeGreaterThan(strategies[2].daysToFinish);
    // 85kg gain / 0.664 kg/day ADG.
    expect(strategies[1].daysToFinish).toBe(Math.round(85 / 0.664));
  });

  it("zero concentrate costs zero, per head and total", () => {
    expect(strategies[0].feedCostPerHeadDayEur).toBe(0);
    expect(strategies[0].totalCostPerHeadEur).toBe(0);
  });

  it("only the balanced strategy is marked recommended", () => {
    expect(strategies.filter((s) => s.recommended)).toHaveLength(1);
    expect(strategies.find((s) => s.recommended)?.id).toBe("balanced");
  });
});

describe("weanlingFirstWinterConcentrateKgPerDay (Weanling_DMD_ADG sheet)", () => {
  it("published midpoints by DMD", () => {
    expect(weanlingFirstWinterConcentrateKgPerDay(60)).toBeCloseTo(2.5, 5);
    expect(weanlingFirstWinterConcentrateKgPerDay(65)).toBeCloseTo(1.75, 5);
    expect(weanlingFirstWinterConcentrateKgPerDay(70)).toBeCloseTo(1.25, 5);
    expect(weanlingFirstWinterConcentrateKgPerDay(75)).toBeCloseTo(0.5, 5);
  });

  it("clamps outside the published 60-75 DMD range", () => {
    expect(weanlingFirstWinterConcentrateKgPerDay(50)).toBeCloseTo(2.5, 5);
    expect(weanlingFirstWinterConcentrateKgPerDay(90)).toBeCloseTo(0.5, 5);
  });
});

describe("calculateWeanlingFirstWinterBudget", () => {
  it("reproduces the workbook's Optimiser_Calculator worked example exactly", () => {
    // 335kg -> 420kg weanling, 130-day winter, 70 DMD, EUR350/t concentrate.
    const result = calculateWeanlingFirstWinterBudget({
      currentWeightKg: 335,
      targetWeightKg: 420,
      targetDays: 130,
      silageDMD: 70,
      concentratePriceEurPerTonne: 350,
    });

    expect(result.requiredADGKgDay).toBeCloseTo(0.6538461538461539, 10);
    expect(result.concentrateKgPerHeadDay).toBeCloseTo(1.25, 5);
    expect(result.totalConcentrateKgPerHead).toBeCloseTo(162.5, 5);
    expect(result.feedCostPerHeadEur).toBeCloseTo(56.875, 5);

    const headCount = 32;
    const totalConcentrateKg = result.totalConcentrateKgPerHead * headCount;
    const totalConcentrateTonnes = totalConcentrateKg / 1000;
    const totalCostEur = result.feedCostPerHeadEur * headCount;
    expect(totalConcentrateKg).toBeCloseTo(5_200, 5);
    expect(totalConcentrateTonnes).toBeCloseTo(5.2, 5);
    expect(totalCostEur).toBeCloseTo(1_820, 5);
  });
});

describe("shared per-farm assumption registries", () => {
  it("FINISHING_OPTIONS still has exactly the continental steers entry", () => {
    expect(Object.keys(FINISHING_OPTIONS)).toEqual(["lg-continental-steers"]);
  });

  it("weanling strategy target/price match the Optimiser_Calculator worked example", () => {
    expect(WEANLING_STRATEGY_TARGET_WEIGHT_KG).toBe(420);
    expect(WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE).toBe(350);
  });
});

describe("sucklerCowConcentrateKgPerDay (Suckler_Cow_Rules sheet)", () => {
  it("autumn-calving cows get the published fixed rate", () => {
    expect(sucklerCowConcentrateKgPerDay("autumn_calving_cow")).toBeCloseTo(1.5, 5);
  });

  it("autumn-calving calves get the midpoint of the published creep-feed range", () => {
    expect(sucklerCowConcentrateKgPerDay("autumn_calving_calf")).toBeCloseTo(0.75, 5);
  });

  it("dry spring-calving cows get zero — a real sourced result, not a missing table", () => {
    expect(sucklerCowConcentrateKgPerDay("dry_spring_calving_cow")).toBe(0);
  });

  it("the exported rules match the sheet's own values", () => {
    expect(SUCKLER_COW_WINTER_RULES.autumn_calving_cow.concentrateCPPct).toBe(14);
    expect(SUCKLER_COW_WINTER_RULES.dry_spring_calving_cow.silageDMDTarget).toBe("67-68");
    expect(SUCKLER_COW_WINTER_RULES.dry_spring_calving_cow.concentrateCPPct).toBeNull();
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
