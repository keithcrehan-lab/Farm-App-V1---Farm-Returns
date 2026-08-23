import { describe, expect, it } from "vitest";
import {
  BALE_SILAGE_BENCHMARK,
  calculateGrazedGrassCostEur,
  calculateSilageCostEur,
  calculateSucklerCowMineralCostEur,
  GRAZED_GRASS_BENCHMARK,
  SUCKLER_DRY_COW_MINERAL_BENCHMARK,
} from "./feed-cost";

// Expected values transcribed directly from the "Farm Return Core Data v4"
// workbook's Feed_Cost_2026 sheet (Teagasc Spring 2026 Feed Cost
// Benchmarks) — see docs/evidence-register.md.

describe("GRAZED_GRASS_BENCHMARK / calculateGrazedGrassCostEur", () => {
  it("published DM yield and €/t DM utilised", () => {
    expect(GRAZED_GRASS_BENCHMARK.dmYieldTHa).toBe(13);
    expect(GRAZED_GRASS_BENCHMARK.eurPerTonneDmUtilised.economic).toBe(140);
    expect(GRAZED_GRASS_BENCHMARK.eurPerTonneDmUtilised.cash).toBe(69);
  });

  it("scales linearly with grazing area, on each basis", () => {
    // 20.2ha x 13 t DM/ha = 262.6 t DM.
    expect(calculateGrazedGrassCostEur(20.2, "cash")).toBeCloseTo(262.6 * 69, 5);
    expect(calculateGrazedGrassCostEur(20.2, "economic")).toBeCloseTo(262.6 * 140, 5);
  });

  it("economic (incl. land) always costs more than cash (excl. land)", () => {
    expect(calculateGrazedGrassCostEur(20.2, "economic")).toBeGreaterThan(
      calculateGrazedGrassCostEur(20.2, "cash"),
    );
  });

  it("zero grazing area costs zero", () => {
    expect(calculateGrazedGrassCostEur(0, "cash")).toBe(0);
  });
});

describe("BALE_SILAGE_BENCHMARK / calculateSilageCostEur", () => {
  it("published €/t DM utilised", () => {
    expect(BALE_SILAGE_BENCHMARK.eurPerTonneDmUtilised.economic).toBe(341);
    expect(BALE_SILAGE_BENCHMARK.eurPerTonneDmUtilised.cash).toBe(286);
  });

  it("scales linearly with silage DM tonnage, on each basis", () => {
    // 6.8ha x 10.4 t DM/ha (mock-farm.ts's "silage-back-1" plan) = 70.72 t DM.
    expect(calculateSilageCostEur(70.72, "cash")).toBeCloseTo(70.72 * 286, 5);
    expect(calculateSilageCostEur(70.72, "economic")).toBeCloseTo(70.72 * 341, 5);
  });

  it("economic (incl. land) always costs more than cash (excl. land)", () => {
    expect(calculateSilageCostEur(70.72, "economic")).toBeGreaterThan(
      calculateSilageCostEur(70.72, "cash"),
    );
  });
});

// Expected values below are transcribed from the "Farm Return Gap Closure
// Data v5" workbook's Minerals_Bedding sheet — see docs/evidence-register.md.

describe("SUCKLER_DRY_COW_MINERAL_BENCHMARK / calculateSucklerCowMineralCostEur", () => {
  it("published €/head/day rate (MB-002)", () => {
    expect(SUCKLER_DRY_COW_MINERAL_BENCHMARK.eurPerHeadPerDay).toBe(0.15);
    expect(SUCKLER_DRY_COW_MINERAL_BENCHMARK.costId).toBe("MB-002");
  });

  it("scales linearly with headcount and days", () => {
    // 32 head over a 135-day winter (this farm's real housing period).
    expect(calculateSucklerCowMineralCostEur(32, 135)).toBeCloseTo(32 * 135 * 0.15, 5);
  });

  it("zero head or zero days costs zero", () => {
    expect(calculateSucklerCowMineralCostEur(0, 135)).toBe(0);
    expect(calculateSucklerCowMineralCostEur(32, 0)).toBe(0);
  });

  it("never goes negative for a negative day count", () => {
    expect(calculateSucklerCowMineralCostEur(32, -10)).toBe(0);
  });
});
