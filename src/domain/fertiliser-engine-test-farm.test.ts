import { describe, expect, it } from "vitest";
import { calculateNutrientPlan, knownFertiliserProductComposition, NUTRIENT_ENGINE_VERSION } from "./nutrients";
import { calculateGrazingGrossRequirement, grazingSwardForCycle, type GrazingSward } from "./grass-fertiliser-engine-v2";
import { createFarmerEvidence, type FieldProductionCycle } from "./fertiliser-field-evidence";
import { calculateStatutoryGrasslandStockingRateKgHa } from "./statutory-excretion";
import { tracked } from "./types";
import type { Field, LivestockGroup, SlurryAllocation } from "./types";

/**
 * Fertiliser engine test plan — the assumed Co Clare suckler test farm run
 * through the Nutrients engine (`calculateNutrientPlan`, the engine behind
 * Today prompts, the Nutrients and field pages, reports, finance and alerts).
 *
 * Fertiliser close-out ("align both", 2026-11-11): from nutrient_engine_v1.7.0
 * the grazing N/P/K requirement comes from the shared
 * `calculateGrazingGrossRequirement`, the same calculation as the Fertiliser
 * Plan engine (`grass-fertiliser-engine-v2`), on the statutory grassland
 * stocking rate. The "both engines agree" block below proves it.
 *
 * Expected values are worked by hand from the Teagasc Green Book 2020 (Tables
 * 12-3, 12-7, 13-2, 13-3, 13-4, 14-1, 14-2) and S.I. 588/2025, as transcribed
 * in the repository. The test farm (herd, areas, soil indices, slurry rate)
 * is ASSUMED, not real farm data. Expected values are provisional until an
 * agronomist signs them off.
 *
 * Herd: 40 suckler cows, 1 bull, 38 weanlings, 10 replacement heifers (ages
 * recorded) on 40 ha grassland. Statutory grassland stocking rate (S.I.
 * 588/2025 Table 7 excretion / 40 ha) = 100.325 kg organic N/ha.
 *   Grazing N (Table 12-3, between the 99 and 118 kg organic-N rows):
 *     53 + (100.325 − 99) / 19 × (75 − 53) = 54.53 → 55 kg/ha.
 *   P maintenance, drystock (Table 13-3, 101–130 band) = 7 kg/ha.
 *   K (Table 14-1, ±5 per 40 kg organic N from 170): base − 8.71.
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

const herd: LivestockGroup[] = [
  group("cows", "suckler_cow", 40, 60, "female"),
  group("bull", "bull", 1, 48, "male"),
  group("weanlings", "weanling", 38, 9, "mixed"),
  group("heifers", "heifer", 10, 18, "female"),
];

const herdWithoutAges: LivestockGroup[] = [
  group("cows", "suckler_cow", 40),
  group("bull", "bull", 1),
  group("weanlings", "weanling", 38),
  group("heifers", "heifer", 10),
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

function grazingPlan(field: Field, livestockGroups: LivestockGroup[] = herd, extra: Partial<Parameters<typeof calculateNutrientPlan>[0]> = {}) {
  return calculateNutrientPlan({ ...base, field, livestockGroups, ...extra });
}

function productPhosphorusPct(name: string): number {
  const composition = knownFertiliserProductComposition(name);
  if (composition === undefined) throw new Error(`unknown product ${name}`);
  return composition.pPct;
}

const holding = calculateStatutoryGrasslandStockingRateKgHa(herd, GRASSLAND_HA);
const HOLDING_GSR = holding.status === "OK" ? holding.value.gsrKgNHa : Number.NaN;

describe("fertiliser engine test farm (Teagasc Green Book 2020) — Nutrients engine", () => {
  it("runs on the aligned engine version", () => {
    expect(NUTRIENT_ENGINE_VERSION).toBe("nutrient_engine_v1.7.0");
    expect(HOLDING_GSR).toBeCloseTo(100.325, 3);
  });

  it("scenario 1 — low-fertility grazing field (P1 K1): N 55, P 27, K 66", () => {
    const plan = grazingPlan(testField("F1", 8, "grazing", 1, 1));
    expect(plan.requirement.value).toEqual({ n: 55, p: 27, k: 66 });
    expect(plan.calculationTrace?.grazing).toMatchObject({ organicNStockingRateKgHa: HOLDING_GSR, stockingBasis: "STATUTORY_GSR" });
    expect(plan.calculationTrace?.grazing?.p).toMatchObject({ buildUpKgHa: 20, maintenanceKgHa: 7, resultKgHa: 27 });
  });

  it("scenario 2 — P3 K3 grazing with 33 m³/ha cattle slurry: gross P 7, K 6; slurry covers P and K; buy N 32", () => {
    const field = testField("F2", 8, "grazing", 3, 3);
    const plan = grazingPlan(field, herd, { slurryAllocation: slurry(field, 33) });
    expect(plan.requirement.value).toEqual({ n: 55, p: 7, k: 6 });
    expect(plan.organicApplication).toMatchObject({ offsetN: 23, offsetP: 15, offsetK: 95 });
    expect(plan.netRequirement.value).toEqual({ n: 32, p: 0, k: 0 });
  });

  it("scenario 3a — first-cut silage, P2 K2, grazed last year: N 100, P 30, K 155 (Tables 12-7 fn 4, 13-2, 13-4, 14-2)", () => {
    const field = testField("F3", 10, "silage_1st_cut", 2, 2);
    const plan = calculateNutrientPlan({
      ...base,
      field,
      livestockGroups: herd,
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
        livestockGroups: herd,
        silage: { cutNumber: 2, expectedYieldTDMha: 3.5, wasGrazedPreviousYear: true },
      });
    const atIndex2 = secondCut(2);
    expect(atIndex2.requirement.value.n).toBe(85);
    expect(atIndex2.requirement.value.k).toBe(88);
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

    it("is within the statutory P ceiling (Index 4 ceiling 0)", () => {
      const plan = grazingPlan(field);
      expect(plan.napCompliance.status).toBe("OK");
      if (plan.napCompliance.status !== "OK") throw new Error("expected OK");
      expect(plan.napCompliance.value.pCeilingKgHa).toBe(0);
      expect(plan.napCompliance.value.pWithinCeiling).toBe(true);
    });
  });

  it("other P indices still use the default product blend (the P-free allocation is Index 4 only)", () => {
    const plan = grazingPlan(testField("F1", 8, "grazing", 1, 1));
    expect(plan.purchasedProducts.some((product) => productPhosphorusPct(product.name) > 0)).toBe(true);
  });

  describe("scenario 5 — white clover sward", () => {
    it("never uses the grass-only N table: outside Teagasc's 170 kg organic N/ha strategy no grazing requirement is given", () => {
      const plan = grazingPlan(testField("F5", 8, "grazing", 3, 3), herd, { grazingSward: { kind: "WHITE_CLOVER", aprilWhiteCloverPct: 10 } });
      expect(plan.requirement.status).toBe("unavailable");
      expect(plan.requirement.source).toMatch(/only for farms stocked at 170 kg organic N\/ha/);
      expect(plan.fieldRequirement.n).toMatchObject({ status: "UNKNOWN", reasonCode: "GRAZING_PATHWAY_NOT_SUPPORTED" });
      expect(plan.purchaseStatus.status).toBe("UNKNOWN");
    });

    it("at the strategy's 170 kg organic N/ha, a 10% April clover sward gets the Teagasc clover N total, not the grass table", () => {
      // Teagasc publishes the drystock clover strategy only at 170 kg organic
      // N/ha exactly (GFT140), which a whole-number herd rarely lands on, so
      // the shared calculation is pinned there directly.
      const clover = calculateGrazingGrossRequirement({
        pIndex: 3,
        kIndex: 3,
        annualOrganicNStockingRateKgHa: 170,
        grazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
        sward: { kind: "WHITE_CLOVER", aprilWhiteCloverPct: 10 },
      });
      const grass = calculateGrazingGrossRequirement({
        pIndex: 3,
        kIndex: 3,
        annualOrganicNStockingRateKgHa: 170,
        grazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
        sward: { kind: "GRASS" },
      });
      expect(clover.status).toBe("READY");
      expect(grass.status).toBe("READY");
      if (clover.status !== "READY" || grass.status !== "READY") throw new Error("expected READY");
      expect(clover.grossRequirementKgHa.n).toBeLessThan(grass.grossRequirementKgHa.n);
      expect(clover.grossRequirementKgHa.p).toBe(grass.grossRequirementKgHa.p);
      expect(clover.grossRequirementKgHa.k).toBe(grass.grossRequirementKgHa.k);
    });
  });

  describe("the field's own production-cycle sward reaches the Nutrients engine (listFieldsForFarm → Field.grazingSward)", () => {
    const cycleOf = (cropSystem: FieldProductionCycle["cropSystem"], whiteCloverPct?: number): FieldProductionCycle => ({
      id: "cycle",
      fieldId: "F5",
      season: "2026",
      cropSystem,
      status: "active",
      evidence: {
        cropSystem: createFarmerEvidence(cropSystem, "Test farm"),
        ...(whiteCloverPct !== undefined ? { whiteCloverPct: createFarmerEvidence(whiteCloverPct, "Test farm") } : {}),
      },
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });

    it("maps production cycles to grazing swards", () => {
      expect(grazingSwardForCycle(undefined)).toBeUndefined();
      expect(grazingSwardForCycle(cycleOf("GRASS_GRAZING"))).toEqual({ kind: "GRASS" });
      expect(grazingSwardForCycle(cycleOf("GRASS_WHITE_CLOVER_GRAZING", 10))).toEqual({ kind: "WHITE_CLOVER", aprilWhiteCloverPct: 10 });
      expect(grazingSwardForCycle(cycleOf("GRASS_WHITE_CLOVER_GRAZING"))).toEqual({ kind: "WHITE_CLOVER" });
      expect(grazingSwardForCycle(cycleOf("GRASS_FIRST_CUT_SILAGE"))).toBeUndefined();
    });

    it("a field recorded as a white-clover sward is never given the grass-only N table", () => {
      const cloverField: Field = { ...testField("F5", 8, "grazing", 3, 3), grazingSward: grazingSwardForCycle(cycleOf("GRASS_WHITE_CLOVER_GRAZING", 10)) };
      const plan = grazingPlan(cloverField);
      expect(plan.requirement.status).toBe("unavailable");
      expect(plan.fieldRequirement.n).toMatchObject({ status: "UNKNOWN", reasonCode: "GRAZING_PATHWAY_NOT_SUPPORTED" });
    });

    it("a clover sward at exactly 170 kg organic N/ha cites the clover strategy, not Table 12-3, and keeps its class and timings (audit F008)", () => {
      // 34 suckler cows (65 kg N each, S.I. 588/2025 Table 7) on 13 ha = 170.0 exactly.
      const cows = [group("cows", "suckler_cow", 34, 60, "female")];
      const cloverField: Field = { ...testField("F5", 13, "grazing", 3, 3), grazingSward: grazingSwardForCycle(cycleOf("GRASS_WHITE_CLOVER_GRAZING", 10)) };
      const plan = grazingPlan(cloverField, cows, { farmGrasslandAreaHa: 13, nonGrassPct: 0 });
      const n = plan.fieldRequirement.n;
      if (n.status !== "KNOWN") throw new Error(`expected KNOWN, got ${JSON.stringify(n)}`);
      expect(n.source).toMatch(/clover/i);
      expect(n.source).not.toMatch(/Green Book/);
      expect(n.ruleRefs).toEqual(["TEAGASC_CLOVER_BEEF_2026_TABLE_1_DRYSTOCK"]);
      const trace = plan.calculationTrace?.grazing?.n;
      expect(trace?.ruleId).toBe("TEAGASC_CLOVER_BEEF_2026_TABLE_1_DRYSTOCK");
      expect(trace?.source).toMatch(/clover/i);
      expect(trace?.inputs).toMatchObject({ aprilWhiteCloverPct: 10, referenceOrganicNKgHa: 170, annualOrganicNStockingRateKgHa: 170 });
      expect(Object.keys(trace?.inputs ?? {}).some((key) => key.startsWith("n_"))).toBe(true);
      // P and K stay on the Green Book tables.
      expect(plan.fieldRequirement.p).toMatchObject({ status: "KNOWN", source: "Teagasc Green Book (5th Ed., 2020)" });
    });

    it("each grazing production system's requirement cites its own table: 12-3 calf-to-beef, 12-2 calf-to-weaning (audit F008)", () => {
      const field = testField("F1", 8, "grazing", 1, 1);
      const beef = grazingPlan(field).fieldRequirement.n;
      const weaning = grazingPlan(field, herd, { grazingProductionSystem: "SUCKLER_CALF_TO_WEANING" }).fieldRequirement.n;
      if (beef.status !== "KNOWN" || weaning.status !== "KNOWN") throw new Error("expected KNOWN");
      expect(beef.ruleRefs).toEqual(["Teagasc Green Book Table 12-3"]);
      expect(weaning.ruleRefs).toEqual(["Teagasc Green Book Table 12-2"]);
      expect(grazingPlan(field, herd, { grazingProductionSystem: "SUCKLER_CALF_TO_WEANING" }).calculationTrace?.grazing?.n.ruleId).toBe("TEAGASC_GREEN_BOOK_2020_TABLE_12_2_SUCKLER_CALF_TO_WEANING");
    });

    it("a clover sward with no recorded April clover content asks for it", () => {
      const cloverField: Field = { ...testField("F5", 8, "grazing", 3, 3), grazingSward: { kind: "WHITE_CLOVER" } };
      expect(grazingPlan(cloverField).fieldRequirement.n).toMatchObject({ status: "UNKNOWN", reasonCode: "MISSING_WHITE_CLOVER_CONTENT" });
    });
  });

  it("an unknown statutory stocking rate (ages missing) gives no grazing requirement and asks for the ages", () => {
    const plan = grazingPlan(testField("F1", 8, "grazing", 1, 1), herdWithoutAges);
    expect(plan.requirement.status).toBe("unavailable");
    expect(plan.fieldRequirement.n).toMatchObject({ status: "UNKNOWN", reasonCode: "MISSING_LIVESTOCK_CATEGORISATION_FOR_GSR" });
    expect(plan.purchasedProducts).toEqual([]);
  });

  it("fails closed above the last published Table 12-3 row — no requirement, no products (Keith, 2026-11-11)", () => {
    // 20 suckler cows on 4 ha = 325 kg organic N/ha; the table stops at 235.
    const plan = calculateNutrientPlan({ ...base, farmGrasslandAreaHa: 4, field: testField("FX", 4, "grazing", 2, 2), livestockGroups: [group("cows", "suckler_cow", 20)] });
    expect(plan.requirement.status).toBe("unavailable");
    for (const nutrient of ["n", "p", "k"] as const) {
      expect(plan.fieldRequirement[nutrient]).toMatchObject({ status: "UNKNOWN", reasonCode: "STOCKING_RATE_BEYOND_PUBLISHED_TABLE" });
    }
    expect(plan.purchaseStatus.status).toBe("UNKNOWN");
    expect(plan.purchasedProducts).toEqual([]);
  });

  describe("both engines agree on grazing N/P/K (fertiliser close-out, 'align both')", () => {
    const cases: [string, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4, GrazingSward][] = [
      ["P1 K1 grass", 1, 1, { kind: "GRASS" }],
      ["P2 K2 grass", 2, 2, { kind: "GRASS" }],
      ["P3 K3 grass", 3, 3, { kind: "GRASS" }],
      ["P4 K3 grass", 4, 3, { kind: "GRASS" }],
      ["P4 K4 grass", 4, 4, { kind: "GRASS" }],
    ];
    for (const [label, p, k, sward] of cases) {
      it(label, () => {
        const plan = grazingPlan(testField("FA", 8, "grazing", p, k), herd, { grazingSward: sward });
        const shared = calculateGrazingGrossRequirement({
          pIndex: p,
          kIndex: k,
          annualOrganicNStockingRateKgHa: HOLDING_GSR,
          grazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
          sward,
          grazingStockingEvidence: { basis: "HOLDING_GSR" },
        });
        expect(shared.status).toBe("READY");
        if (shared.status !== "READY") throw new Error("expected READY");
        expect(plan.requirement.value).toEqual({
          n: Math.round(shared.grossRequirementKgHa.n),
          p: Math.round(shared.grossRequirementKgHa.p),
          k: Math.round(shared.grossRequirementKgHa.k),
        });
      });
    }
  });

  it.todo("scenario 6 — spring barley: crop-table N/P/K (tillage is NOT_APPLICABLE today — fails closed; out of scope for the fertiliser close-out)");
});
