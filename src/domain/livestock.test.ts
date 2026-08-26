import { describe, expect, it } from "vitest";
import {
  calculateFinishingBudget,
  calculateLivestockEconomics,
  calculateSellNowVsFinish,
  calculateSteerConcentrateStrategies,
  calculateWeanlingConcentrateStrategies,
  calculateWeanlingFirstWinterBudget,
  concentrateIngredientsKgDay,
  concentrateKgPerDay,
  CONCENTRATE_FORMULATION_PCT,
  FINISHING_KILL_OUT_PCT,
  FINISHING_OPTIONS,
  LIVESTOCK_ENGINE_VERSION,
  steerADGForConcentrateKgDay,
  sucklerCowConcentrateKgPerDay,
  STEER_CONCENTRATE_PRICE_EUR_PER_TONNE,
  STEER_VARIABLE_ADG_POINTS,
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

// V3 FIX (SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md §2.7, conflict #2):
// this describe block used to assert that concentrateKgPerDay both
// interpolates between adjacent DMD breakpoints AND clamps outside the
// published range — both directly contradict calculation_contracts.csv's
// DMD_CONCENTRATE_GUIDANCE row ("exact lookup only... No interpolation")
// and FARM_RETURN_SCIENTIFIC_CALCULATION_SPEC.md §I5's own DMD-73 example.
// REWRITTEN per "do not preserve an existing test expectation... if V3
// evidence demonstrates the behaviour is wrong" — the exact-match
// assertions below were already correct and are kept; the interpolation
// and clamping assertions are replaced with the BLOCK_EXACT_LOOKUP
// behaviour GFT115 requires.
describe("concentrateKgPerDay (DMD-Concentrate sheet) — exact lookup only", () => {
  it("published breakpoints, finishing steer — exact match returns OK", () => {
    expect(concentrateKgPerDay("finishing_steer", 66)).toEqual({ status: "OK", value: 7, evidenceState: "MEASURED" });
    expect(concentrateKgPerDay("finishing_steer", 68)).toEqual({ status: "OK", value: 6, evidenceState: "MEASURED" }); // GFT112
    expect(concentrateKgPerDay("finishing_steer", 70)).toEqual({ status: "OK", value: 5.5, evidenceState: "MEASURED" });
    expect(concentrateKgPerDay("finishing_steer", 72)).toEqual({ status: "OK", value: 5, evidenceState: "MEASURED" });
    expect(concentrateKgPerDay("finishing_steer", 74)).toEqual({ status: "OK", value: 4, evidenceState: "MEASURED" }); // GFT113
    expect(concentrateKgPerDay("finishing_steer", 76)).toEqual({ status: "OK", value: 4, evidenceState: "MEASURED" });
  });

  it("published breakpoints, weanling — exact match returns OK (GFT109, GFT110, GFT111)", () => {
    expect(concentrateKgPerDay("weanling", 66)).toEqual({ status: "OK", value: 1.8, evidenceState: "MEASURED" }); // GFT109
    expect(concentrateKgPerDay("weanling", 72)).toEqual({ status: "OK", value: 0.9, evidenceState: "MEASURED" }); // GFT110
    expect(concentrateKgPerDay("weanling", 74)).toEqual({ status: "OK", value: 0.6, evidenceState: "MEASURED" });
    expect(concentrateKgPerDay("weanling", 76)).toEqual({ status: "OK", value: 0.4, evidenceState: "MEASURED" }); // GFT111
  });

  it("published breakpoints, finishing heifer — exact match returns OK (GFT114)", () => {
    expect(concentrateKgPerDay("finishing_heifer", 70)).toEqual({ status: "OK", value: 5.5, evidenceState: "MEASURED" }); // GFT114
  });

  // GFT116 (wrong animal class rejected): not a runtime test — see
  // concentrateKgPerDay's own doc comment. FinishingAnimalType is a
  // closed 3-value union, so GFT116's literal "suckler_cow" scenario
  // cannot type-check at all, the same compile-time guarantee GFT098
  // documents for sheep in fodder-budget.ts.

  it("GFT115: DMD 73 (between 72 and 74) is BLOCK_EXACT_LOOKUP, never silently interpolated to 0.75", () => {
    const outcome = concentrateKgPerDay("finishing_steer", 73);
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("BLOCK_EXACT_LOOKUP");
    }
  });

  it("a DMD outside the published range is equally BLOCK_EXACT_LOOKUP, never clamped/extrapolated", () => {
    expect(concentrateKgPerDay("finishing_steer", 50).status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(concentrateKgPerDay("finishing_steer", 90).status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
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
    const outcome = calculateFinishingBudget({
      animalType: "finishing_steer",
      currentWeightKg: 520,
      targetWeightKg: 650,
      silageDMD: 72,
      concentratePriceEurPerTonne: 350,
    });

    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") throw new Error("expected OK");
    const result = outcome.value;

    expect(result.daysToFinish).toBe(130);
    expect(result.concentrateKgPerHeadDay).toBe(5);
    expect(result.totalConcentrateKgPerHead).toBe(650);
    expect(result.feedCostPerHeadEur).toBeCloseTo(227.5, 5);

    const headCount = 20;
    const totalGroupCostEur = result.feedCostPerHeadEur * headCount;
    expect(totalGroupCostEur).toBeCloseTo(4_550, 5);
  });

  it("never returns a negative gain when already at/above target", () => {
    const outcome = calculateFinishingBudget({
      animalType: "finishing_steer",
      currentWeightKg: 700,
      targetWeightKg: 650,
      silageDMD: 72,
      concentratePriceEurPerTonne: 350,
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.daysToFinish).toBe(0);
    expect(outcome.value.totalConcentrateKgPerHead).toBe(0);
  });

  it("V3 fix (audit conflict #2): fails closed when silageDMD isn't an exact published row, propagated from concentrateKgPerDay", () => {
    const outcome = calculateFinishingBudget({
      animalType: "finishing_steer",
      currentWeightKg: 520,
      targetWeightKg: 650,
      silageDMD: 73, // between 72 and 74 — not on the table
      concentratePriceEurPerTonne: 350,
    });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("BLOCK_EXACT_LOOKUP");
    }
  });
});

describe("calculateSellNowVsFinish", () => {
  it("per_kg_carcass: matches docs/feed-engine.md's definition: sell-now value vs (forecast sale value - remaining feed cost)", () => {
    const result = calculateSellNowVsFinish({
      currentWeightKg: 520,
      targetWeightKg: 650,
      pricing: { kind: "per_kg_carcass", cattlePriceEurPerKgCarcass: 5.42, killOutPct: FINISHING_KILL_OUT_PCT },
      remainingFeedCostToFinishEurPerHead: 227.5,
    });
    expect(result.sellNowValueEurPerHead).toBeCloseTo(520 * 0.55 * 5.42, 5);
    expect(result.forecastSaleValueEurPerHead).toBeCloseTo(650 * 0.55 * 5.42, 5);
    expect(result.finishNetValueEurPerHead).toBeCloseTo(650 * 0.55 * 5.42 - 227.5, 5);
  });

  it("per_kg_carcass: defaults killOutPct to FINISHING_KILL_OUT_PCT when omitted", () => {
    const result = calculateSellNowVsFinish({
      currentWeightKg: 520,
      targetWeightKg: 650,
      pricing: { kind: "per_kg_carcass", cattlePriceEurPerKgCarcass: 5.42 },
      remainingFeedCostToFinishEurPerHead: 0,
    });
    expect(result.sellNowValueEurPerHead).toBeCloseTo(520 * FINISHING_KILL_OUT_PCT * 5.42, 5);
  });

  it("mart_price_per_head: uses the two real head prices directly, no weight/kill-out multiplication", () => {
    const result = calculateSellNowVsFinish({
      currentWeightKg: 335,
      targetWeightKg: 420,
      pricing: { kind: "mart_price_per_head", sellNowValueEurPerHead: 1308, forecastSaleValueEurPerHead: 1568 },
      remainingFeedCostToFinishEurPerHead: 200,
    });
    expect(result.sellNowValueEurPerHead).toBe(1308);
    expect(result.forecastSaleValueEurPerHead).toBe(1568);
    expect(result.finishNetValueEurPerHead).toBe(1568 - 200);
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
    expect(strategies[1].daysToFinish).toBe(Math.ceil(85 / 0.664));
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
  it("FINISHING_OPTIONS has exactly the continental steers and weanling entries", () => {
    expect(Object.keys(FINISHING_OPTIONS).sort()).toEqual(["lg-continental-steers", "lg-weanlings"]);
  });

  it("the weanling FINISHING_OPTIONS entry matches the real Optimiser_Calculator target/price", () => {
    expect(FINISHING_OPTIONS["lg-weanlings"]).toEqual({
      animalType: "weanling",
      targetWeightKg: WEANLING_STRATEGY_TARGET_WEIGHT_KG,
      silageDMD: 72,
      concentratePriceEurPerTonne: WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE,
    });
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

// Expected values below are transcribed from the v4 workbook's
// Steer_Trial_Evidence and Steer_3_Strategy sheets — see
// docs/evidence-register.md.

describe("steerADGForConcentrateKgDay (Steer_Trial_Evidence sheet)", () => {
  it("matches the three published trial observations exactly", () => {
    expect(steerADGForConcentrateKgDay(0)).toBeCloseTo(0.655, 5);
    expect(steerADGForConcentrateKgDay(5)).toBeCloseTo(0.968, 5);
    expect(steerADGForConcentrateKgDay(6)).toBeCloseTo(1.101, 5);
  });

  it("interpolates between adjacent trial points", () => {
    // 2.5 is halfway between 0 (0.655) and 5 (0.968).
    expect(steerADGForConcentrateKgDay(2.5)).toBeCloseTo((0.655 + 0.968) / 2, 5);
  });

  it("clamps to the observed 0-6kg range rather than extrapolating", () => {
    expect(steerADGForConcentrateKgDay(-1)).toBeCloseTo(0.655, 5);
    expect(steerADGForConcentrateKgDay(10)).toBeCloseTo(1.101, 5);
  });

  it("the exported evidence points carry their own trial citation", () => {
    expect(STEER_VARIABLE_ADG_POINTS.map((p) => p.concentrateKgDay)).toEqual([0, 5, 6]);
    expect(STEER_VARIABLE_ADG_POINTS[1].trial).toContain("Pattern trial");
  });
});

describe("calculateSteerConcentrateStrategies", () => {
  it("reproduces the workbook's own Steer_3_Strategy worked example exactly (days-to-target)", () => {
    // 590kg -> 712kg, the sheet's own Starting/Target liveweight inputs.
    const strategies = calculateSteerConcentrateStrategies({
      currentWeightKg: 590,
      targetWeightKg: 712,
      concentratePriceEurPerTonne: STEER_CONCENTRATE_PRICE_EUR_PER_TONNE,
    });
    expect(strategies.map((s) => s.daysToFinish)).toEqual([187, 127, 111]);
  });

  it("group concentrate cost (per-head x 20 head) is within a euro or two of the sheet's own figures", () => {
    // Sheet's own "Concentrate cost €" column for 20 head: Economy 0,
    // Balanced 4445, Fast 4662 — small drift expected since the sheet
    // multiplies an unrounded per-head cost, while this engine rounds
    // totalCostPerHeadEur to the nearest euro first (same convention
    // calculateFarmConcentrateFeedCostEur already uses everywhere else).
    const strategies = calculateSteerConcentrateStrategies({
      currentWeightKg: 590,
      targetWeightKg: 712,
      concentratePriceEurPerTonne: STEER_CONCENTRATE_PRICE_EUR_PER_TONNE,
    });
    const headCount = 20;
    expect(strategies[0].totalCostPerHeadEur * headCount).toBe(0);
    expect(Math.abs(strategies[1].totalCostPerHeadEur * headCount - 4445)).toBeLessThanOrEqual(10);
    expect(Math.abs(strategies[2].totalCostPerHeadEur * headCount - 4662)).toBeLessThanOrEqual(10);
  });

  it("on this farm's real 520kg -> 650kg profile, faster strategies genuinely finish sooner", () => {
    const strategies = calculateSteerConcentrateStrategies({
      currentWeightKg: 520,
      targetWeightKg: 650,
      concentratePriceEurPerTonne: STEER_CONCENTRATE_PRICE_EUR_PER_TONNE,
    });
    expect(strategies[0].daysToFinish).toBeGreaterThan(strategies[1].daysToFinish);
    expect(strategies[1].daysToFinish).toBeGreaterThan(strategies[2].daysToFinish);
    expect(strategies[0].dailyGainKg).toBeCloseTo(0.655, 5);
    expect(strategies[1].dailyGainKg).toBeCloseTo(0.968, 5);
    expect(strategies[2].dailyGainKg).toBeCloseTo(1.101, 5);
  });

  it("zero concentrate costs zero, per head and total", () => {
    const strategies = calculateSteerConcentrateStrategies({
      currentWeightKg: 520,
      targetWeightKg: 650,
      concentratePriceEurPerTonne: STEER_CONCENTRATE_PRICE_EUR_PER_TONNE,
    });
    expect(strategies[0].feedCostPerHeadDayEur).toBe(0);
    expect(strategies[0].totalCostPerHeadEur).toBe(0);
  });

  it("only the balanced strategy is marked recommended", () => {
    const strategies = calculateSteerConcentrateStrategies({
      currentWeightKg: 520,
      targetWeightKg: 650,
      concentratePriceEurPerTonne: STEER_CONCENTRATE_PRICE_EUR_PER_TONNE,
    });
    expect(strategies.filter((s) => s.recommended)).toHaveLength(1);
    expect(strategies.find((s) => s.recommended)?.id).toBe("balanced");
  });

  it("every strategy shows a single Concentrate ingredient line, not a fabricated silage split", () => {
    const strategies = calculateSteerConcentrateStrategies({
      currentWeightKg: 520,
      targetWeightKg: 650,
      concentratePriceEurPerTonne: STEER_CONCENTRATE_PRICE_EUR_PER_TONNE,
    });
    for (const strategy of strategies) {
      expect(strategy.ingredientsKgDay).toHaveLength(1);
      expect(strategy.ingredientsKgDay[0].label).toBe("Concentrate");
    }
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
    pricing: { kind: "per_kg_carcass" as const, cattlePriceEurPerKgCarcass: 5.42 },
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

  it("mart_price_per_head: a weanling group's sellNowEur/forecastSaleValueEur are exactly the two real head prices, not weight x price", () => {
    const weanlingGroup: LivestockGroup = {
      id: "lg-weanlings",
      farmId: "farm-test",
      category: "weanling",
      label: "Weanlings",
      count: tracked(18, "verified", "Keith"),
      avgWeightKg: tracked(335, "estimated", "Farm Return assumption"),
      system: "grazing",
      value: tracked(0, "estimated", "Farm Return assumption"),
    };
    const weanlingOptions = {
      animalType: "weanling" as const,
      targetWeightKg: 420,
      silageDMD: 72,
      concentratePriceEurPerTonne: 350,
      pricing: {
        kind: "mart_price_per_head" as const,
        sellNowValueEurPerHead: 1308,
        forecastSaleValueEurPerHead: 1568,
      },
      today: new Date("2026-08-23T00:00:00Z"),
    };

    const result = calculateLivestockEconomics(weanlingGroup, weanlingOptions)!;
    expect(result).toBeDefined();
    expect(result.currentValueEur.value).toBe(1308);
    expect(result.performanceForecast.forecastSaleValueEur).toBe(1568);
    expect(result.marginOutlook.sellNowEur).toBe(1308);
    // finishEur = forecastSaleValueEur - remaining concentrate cost, never
    // weight x killOutPct x a per-kg-carcass rate for this pricing kind.
    expect(result.marginOutlook.finishEur).toBeLessThan(1568);
    expect(result.marginOutlook.finishEur).toBeGreaterThan(1568 - 500);
  });
});
