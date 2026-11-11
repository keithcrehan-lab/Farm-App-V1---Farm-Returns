import { describe, expect, it } from "vitest";
import {
  calculateGrasslandStockingRateKgHa,
  calculateNutrientPlan,
  knownFertiliserProductComposition,
  NUTRIENT_ENGINE_VERSION,
} from "./nutrients";
import { organicNStockingRateFromLUHa } from "./grazing-field-pressure";
import { tracked } from "./types";
import type { Field, LivestockGroup, SlurryAllocation } from "./types";

/**
 * Fertiliser engine test plan — run 1 (2026-11-11). A scripted test farm
 * run straight through `calculateNutrientPlan`, with each expected value
 * worked by hand from the Teagasc Green Book (5th ed., 2020) as transcribed
 * in `docs/scientific-engine/v3/reference_greenbook_2020/` and S.I.
 * 588/2025. The test farm itself (herd, areas, soil indices, slurry rate)
 * is an ASSUMED typical Co Clare suckler farm, not real farm data.
 *
 * Expected values are provisional until signed off by an agronomist
 * (evidence register, 2026-11-11 entry). Scenarios the engine does not yet
 * support (clover, tillage, lime from pH, per-field grazing allocation)
 * are recorded as `it.todo`, not as passing tests.
 *
 * Herd: 40 suckler cows (0.9 LU), 1 bull (1.0), 38 weanlings (0.3),
 * 10 replacement heifers (0.7) = 55.4 LU on 40 ha grassland = 1.385 LU/ha
 * (Table 12-3 footnote 2 LU factors).
 * Organic-N stocking rate (Table 12-3 kg/ha N column):
 *   99 + (1.385 − 1.25) / 0.25 × (118 − 99) = 109.26 kg N/ha.
 * Grazing N (Table 12-3 Total N column):
 *   53 + (1.385 − 1.25) / 0.25 × (75 − 53) = 64.88 → 65 kg/ha.
 * P maintenance, drystock (Table 13-3, 101–130 band) = 7 kg/ha.
 * K adjustment (Table 14-1 fn 2, ±5 per 40 kg org N from 170):
 *   (109.26 − 170) / 40 × 5 = −7.59 kg/ha.
 */

const farmId = "farm-test-clare";
const GRASSLAND_HA = 40;
const AS_OF = "2026-03-01";

function group(id: string, category: LivestockGroup["category"], count: number, avgAgeMonths?: number, sex?: LivestockGroup["sex"]): LivestockGroup {
  return {
    id,
    farmId,
    category,
    label: category,
    count: tracked(count, "farmer_adjusted", "test farm"),
    ...(avgAgeMonths !== undefined ? { avgAgeMonths } : {}),
    ...(sex !== undefined ? { sex } : {}),
    system: "grazing",
    value: tracked(0, "estimated", "test farm"),
  };
}

const herdWithoutAges: LivestockGroup[] = [
  group("cows", "suckler_cow", 40),
  group("bull", "bull", 1),
  group("weanlings", "weanling", 38),
  group("heifers", "heifer", 10),
];

const herdWithAges: LivestockGroup[] = [
  group("cows", "suckler_cow", 40, 60, "female"),
  group("bull", "bull", 1, 48, "male"),
  group("weanlings", "weanling", 38, 9, "mixed"),
  group("heifers", "heifer", 10, 18, "female"),
];

function testField(id: string, areaHa: number, plannedUse: NonNullable<Field["plannedUse"]>["value"], pIndex: 1 | 2 | 3 | 4, kIndex: 1 | 2 | 3 | 4): Field {
  return {
    id,
    farmId,
    name: id,
    areaHa,
    centroid: [-8.9, 52.8],
    plannedUse: tracked(plannedUse, "farmer_adjusted", "test farm"),
    mappedSoil: {
      soilAssociation: "test",
      dominantSeries: "Brown Earth",
      texture: "Loam",
      drainage: "moderately_drained",
      coveragePct: 90,
      datasetVersion: "test",
      source: "test",
    },
    fertility: { pIndex: tracked(pIndex, "verified", "Lab, Feb 2026"), kIndex: tracked(kIndex, "verified", "Lab, Feb 2026") },
    history: [],
  };
}

function slurry(field: Field, rateM3Ha: number): SlurryAllocation {
  return { fieldId: field.id, housingId: "shed-1", priority: "high", volumeM3: rateM3Ha * field.areaHa, score: 90 };
}

const base = { farmGrasslandAreaHa: GRASSLAND_HA, asOfDate: AS_OF, nonGrassPct: (8 / 48) * 100 };

function grazingPlan(field: Field, livestockGroups: LivestockGroup[] = herdWithoutAges, extra: Partial<Parameters<typeof calculateNutrientPlan>[0]> = {}) {
  return calculateNutrientPlan({ ...base, field, livestockGroups, ...extra });
}

function productPhosphorusPct(name: string): number {
  const composition = knownFertiliserProductComposition(name);
  if (composition === undefined) throw new Error(`unknown product ${name}`);
  return composition.pPct;
}

describe("fertiliser engine test farm — run 1 (Teagasc Green Book 2020)", () => {
  it("runs on the corrected engine version", () => {
    expect(NUTRIENT_ENGINE_VERSION).toBe("nutrient_engine_v1.6.0");
  });

  describe("organic-N stocking rate reads Table 12-3's kg/ha N (excreted) column", () => {
    it("matches every published row exactly", () => {
      expect(organicNStockingRateFromLUHa(1.0)).toBe(80);
      expect(organicNStockingRateFromLUHa(1.25)).toBe(99);
      expect(organicNStockingRateFromLUHa(1.5)).toBe(118);
      expect(organicNStockingRateFromLUHa(2.0)).toBe(158);
      expect(organicNStockingRateFromLUHa(2.5)).toBe(196);
      expect(organicNStockingRateFromLUHa(3.0)).toBe(235);
    });

    it("is never the fertiliser Total N column (the v1.5.0 defect)", () => {
      // Total N at 1.5 LU/ha is 75; organic N excreted is 118.
      expect(organicNStockingRateFromLUHa(1.5)).not.toBe(75);
    });

    it("never extrapolates: outside the printed rows the end row is held, as the Total N column already is", () => {
      expect(organicNStockingRateFromLUHa(0.5)).toBe(80);
      expect(organicNStockingRateFromLUHa(0)).toBe(0);
      expect(organicNStockingRateFromLUHa(3.3)).toBe(235);
    });

    it("gives 109.3 kg N/ha for the test farm herd", () => {
      expect(calculateGrasslandStockingRateKgHa(herdWithoutAges, GRASSLAND_HA)).toBeCloseTo(109.26, 2);
    });
  });

  it("scenario 1 — low-fertility grazing field (P1 K1): N 65, P 27, K 67", () => {
    const plan = grazingPlan(testField("F1", 8, "grazing", 1, 1));
    expect(plan.requirement.value).toEqual({ n: 65, p: 27, k: 67 });
    expect(plan.calculationTrace?.grazing?.p).toMatchObject({ buildUpKgHa: 20, maintenanceKgHa: 7, resultKgHa: 27 });
    expect(plan.calculationTrace?.grazing?.k.adjustmentKgHa).toBeCloseTo(-7.59, 2);
  });

  it.todo("scenario 1 — lime advice for pH 5.6 (engine only uses a laboratory lime requirement; no pH-only advice yet)");

  it("scenario 2 — P3 K3 grazing with 33 m³/ha cattle slurry: gross P 7, K 7; slurry covers P and K; buy N 42 only", () => {
    const field = testField("F2", 8, "grazing", 3, 3);
    const plan = grazingPlan(field, herdWithoutAges, { slurryAllocation: slurry(field, 33) });
    expect(plan.requirement.value).toEqual({ n: 65, p: 7, k: 7 });
    expect(plan.organicApplication).toMatchObject({ offsetN: 23, offsetP: 15, offsetK: 95 });
    expect(plan.netRequirement.value).toEqual({ n: 42, p: 0, k: 0 });
  });

  it("scenario 3a — first-cut silage, P2 K2, grazed last year: N 100, P 30, K 155 (Tables 12-7 fn 4, 13-2, 13-4, 14-2)", () => {
    const field = testField("F3", 10, "silage_1st_cut", 2, 2);
    const plan = calculateNutrientPlan({
      ...base,
      field,
      livestockGroups: herdWithoutAges,
      slurryAllocation: slurry(field, 33),
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: true },
    });
    expect(plan.requirement.value).toEqual({ n: 100, p: 30, k: 155 });
  });

  it("scenario 3b — second cut: N 85, K 88, and P build-up is NOT added again (Green Book §13: build-up before the first cut only)", () => {
    const secondCut = (pIndex: 1 | 2 | 3) =>
      calculateNutrientPlan({
        ...base,
        field: testField("F3", 10, "silage_2nd_cut", pIndex, 2),
        livestockGroups: herdWithoutAges,
        silage: { cutNumber: 2, expectedYieldTDMha: 3.5, wasGrazedPreviousYear: true },
      });
    const atIndex2 = secondCut(2);
    expect(atIndex2.requirement.value.n).toBe(85);
    expect(atIndex2.requirement.value.k).toBe(88);
    // Same second-cut P whatever the build-up index: maintenance only.
    expect(atIndex2.requirement.value.p).toBe(secondCut(3).requirement.value.p);
    expect(secondCut(1).requirement.value.p).toBe(secondCut(3).requirement.value.p);
  });

  describe("scenario 4 — P Index 4 grazing field", () => {
    const field = testField("F4", 6, "grazing", 4, 3);

    it("advises no P (Green Book §13; S.I. 588/2025 Table 15a Index 4 maximum is 0)", () => {
      const plan = grazingPlan(field);
      expect(plan.requirement.value.p).toBe(0);
      expect(plan.calculationTrace?.grazing?.p).toMatchObject({ buildUpKgHa: 0, maintenanceKgHa: 0, resultKgHa: 0 });
    });

    it("proposes no P-bearing product, even to meet the K requirement", () => {
      const plan = grazingPlan(field);
      expect(plan.requirement.value.k).toBeGreaterThan(0);
      expect(plan.purchasedProducts.length).toBeGreaterThan(0);
      for (const product of plan.purchasedProducts) expect(productPhosphorusPct(product.name)).toBe(0);
      expect(plan.deliveredKgHa?.p ?? 0).toBe(0);
    });

    it("is within the statutory P ceiling once the herd's ages are known", () => {
      const plan = grazingPlan(field, herdWithAges);
      expect(plan.napCompliance.status).toBe("OK");
      if (plan.napCompliance.status !== "OK") throw new Error("expected OK");
      expect(plan.napCompliance.value.pCeilingKgHa).toBe(0);
      expect(plan.napCompliance.value.pWithinCeiling).toBe(true);
    });
  });

  it.todo("above 3.0 LU/ha: hold Table 12-3's last row (current) or fail grazing P/K closed — open decision (Codex audit F001)");

  it("a lightly stocked farm (≤1.0 LU/ha) still gets a recommendation, on the published first row", () => {
    // 20 suckler cows (18 LU) on 40 ha = 0.45 LU/ha → organic N read as 80 (P band ≤100).
    const cows = [group("cows", "suckler_cow", 20)];
    const plan = calculateNutrientPlan({ ...base, field: testField("FL", 8, "grazing", 1, 1), livestockGroups: cows });
    expect(plan.fieldRequirement.p.status).toBe("KNOWN");
    expect(plan.calculationTrace?.grazing?.p).toMatchObject({ buildUpKgHa: 20, maintenanceKgHa: 4, resultKgHa: 24 });
    expect(plan.calculationTrace?.grazing?.k.stockingRateKgNHa).toBe(80);
  });

  it("other P indices still use the default product blend (the P-free allocation is Index 4 only)", () => {
    const plan = grazingPlan(testField("F1", 8, "grazing", 1, 1));
    expect(plan.purchasedProducts.some((product) => productPhosphorusPct(product.name) > 0)).toBe(true);
  });

  it.todo("scenario 5 — clover sward: N per Teagasc drystock clover schedule (clover-n.ts exists but is not wired into calculateNutrientPlan)");
  it.todo("scenario 6 — spring barley: crop-table N/P/K (tillage is NOT_APPLICABLE today — fails closed)");
  it.todo("scenario 7 — cattle moving between fields: organic N allocated by grazing days (no per-field grazing input today)");
});
