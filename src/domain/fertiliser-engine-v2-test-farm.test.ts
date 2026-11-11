import { describe, expect, it } from "vitest";
import { calculateGrassFertiliserV2, GRASS_ENGINE_V2_VERSION, type GrassFertiliserEngineInput } from "./grass-fertiliser-engine-v2";
import { createFarmerEvidence, type FieldProductionCycle } from "./fertiliser-field-evidence";
import { calculateFieldGrazingPressure, type GrazingFieldSession } from "./grazing-field-pressure";
import { calculateStatutoryGrasslandStockingRateKgHa } from "./statutory-excretion";
import { tracked, type LivestockGroup } from "./types";

/**
 * Fertiliser engine test plan — the assumed Co Clare suckler test farm run
 * through the canonical v2 engine (fertiliser close-out, 2026-11-11). Expected
 * values are worked by hand from the Teagasc Green Book 2020 (Tables 12-3,
 * 13-2, 13-3, 14-1), the Teagasc 2026 first-cut guidance and the Teagasc 2026
 * drystock clover strategy, as transcribed in the repository. They are
 * provisional until an agronomist signs them off.
 *
 * Holding grassland stocking rate: the statutory S.I. 588/2025 Table 7
 * excretion of the herd (with ages) over 40 ha grassland = 100.325 kg N/ha.
 */

const farmId = "farm-test-clare";

function group(id: string, category: LivestockGroup["category"], count: number, avgAgeMonths: number, sex: LivestockGroup["sex"]): LivestockGroup {
  return { id, farmId, category, label: id, count: tracked(count, "farmer_adjusted", "test farm"), avgAgeMonths, sex, system: "grazing", value: tracked(0, "estimated", "test farm") };
}

const herd: LivestockGroup[] = [
  group("cows", "suckler_cow", 40, 60, "female"),
  group("bull", "bull", 1, 48, "male"),
  group("weanlings", "weanling", 38, 9, "mixed"),
  group("heifers", "heifer", 10, 18, "female"),
];
const LU: Record<string, number> = { cows: 0.9, bull: 1.0, weanlings: 0.3, heifers: 0.7 };
const HEAD: Record<string, number> = { cows: 40, bull: 1, weanlings: 38, heifers: 10 };
const CATEGORY: Record<string, LivestockGroup["category"]> = { cows: "suckler_cow", bull: "bull", weanlings: "weanling", heifers: "heifer" };

const holding = calculateStatutoryGrasslandStockingRateKgHa(herd, 40);
const HOLDING_GSR = holding.status === "OK" ? holding.value.gsrKgNHa : Number.NaN;

function field(id: string, p: 1 | 2 | 3 | 4, k: 1 | 2 | 3 | 4): GrassFertiliserEngineInput["field"] {
  return {
    id,
    fertility: {
      pIndex: tracked(p, "verified", "Lab, Feb 2026"),
      kIndex: tracked(k, "verified", "Lab, Feb 2026"),
      verifiedTest: { sampleDate: "2026-02-01", laboratory: "Lab", sampleRef: id, p: 3, k: 80, pH: 6.2 },
    },
  };
}

function cycle(cropSystem: FieldProductionCycle["cropSystem"], evidence: FieldProductionCycle["evidence"] = {}): FieldProductionCycle {
  return {
    id: `cycle-${cropSystem}`,
    fieldId: "x",
    season: "2026",
    cropSystem,
    status: "active",
    evidence: {
      cropSystem: createFarmerEvidence(cropSystem, "Test farm"),
      chemicalNAppliedKgHa: createFarmerEvidence(0, "Test farm"),
      chemicalPAppliedKgHa: createFarmerEvidence(0, "Test farm"),
      chemicalKAppliedKgHa: createFarmerEvidence(0, "Test farm"),
      ...evidence,
    },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function grazing(id: string, p: 1 | 2 | 3 | 4, k: 1 | 2 | 3 | 4, extra: Partial<GrassFertiliserEngineInput> = {}) {
  return calculateGrassFertiliserV2({
    field: field(id, p, k),
    cycle: cycle("GRASS_GRAZING"),
    grazingProductionSystem: "SUCKLER_CALF_TO_BEEF",
    annualOrganicNStockingRateKgHa: HOLDING_GSR,
    grazingStockingEvidence: { basis: "HOLDING_GSR" },
    ...extra,
  });
}

// Hand-worked at 100.325 kg organic N/ha:
//   N  (Table 12-3)  53 + (100.325 − 99) / (118 − 99) × (75 − 53) = 54.534
//   P maintenance (Table 13-3, drystock, 101–130 band) = 7
//   K adjustment (Table 14-1 fn 2) (100.325 − 170) / 40 × 5 = −8.709
const N_HOLDING = 53 + ((100.325 - 99) / 19) * 22;
const K_ADJ = ((100.325 - 170) / 40) * 5;

describe(`fertiliser engine test farm through v2 (${GRASS_ENGINE_V2_VERSION})`, () => {
  it("holding grassland stocking rate is the statutory excretion over 40 ha grassland: 100.325 kg N/ha", () => {
    expect(HOLDING_GSR).toBeCloseTo(100.325, 3);
  });

  it("scenario 1 — F1 grazing, P1 K1: N 54.5, P 27, K 66.3", () => {
    const r = grazing("F1", 1, 1);
    expect(r.status).toBe("READY");
    expect(r.grossRequirementKgHa?.n).toBeCloseTo(N_HOLDING, 6);
    expect(r.grossRequirementKgHa?.p).toBe(27);
    expect(r.grossRequirementKgHa?.k).toBeCloseTo(75 + K_ADJ, 6);
  });

  it("scenario 2 — F2 grazing, P3 K3: maintenance only (P 7, K 6.3)", () => {
    const r = grazing("F2", 3, 3);
    expect(r.grossRequirementKgHa?.p).toBe(7);
    expect(r.grossRequirementKgHa?.k).toBeCloseTo(15 + K_ADJ, 6);
  });

  it("scenario 2 — slurry credit is subtracted only after the gross requirement", () => {
    const r = grazing("F2", 3, 3, { organicCreditsKgHa: { n: 23, p: 15, k: 95 } });
    expect(r.remainingRequirementKgHa?.p).toBe(0);
    expect(r.remainingRequirementKgHa?.k).toBe(0);
    expect(r.remainingRequirementKgHa?.n).toBeCloseTo(N_HOLDING - 23, 6);
  });

  it("scenario 3a — F3 first-cut silage at 5 t DM/ha, P2 K2: N 100, P 30, K 155 (Teagasc 2026 first-cut table)", () => {
    const r = calculateGrassFertiliserV2({ field: field("F3", 2, 2), cycle: cycle("GRASS_FIRST_CUT_SILAGE", { productionTargetTDMHa: createFarmerEvidence(5, "Test farm") }) });
    expect(r.grossRequirementKgHa).toEqual({ n: 100, p: 30, k: 155 });
  });

  it("scenario 3b — second cut fails closed on the unresolved Teagasc source conflict", () => {
    const r = calculateGrassFertiliserV2({ field: field("F3", 2, 2), cycle: cycle("GRASS_SECOND_CUT_SILAGE", { productionTargetTDMHa: createFarmerEvidence(3.5, "Test farm") }) });
    expect(r.status).toBe("SOURCE_CONFLICT");
  });

  it("scenario 4 — F4 grazing at P Index 4: no P", () => {
    const r = grazing("F4", 4, 3);
    expect(r.grossRequirementKgHa?.p).toBe(0);
  });

  it("scenario 5 — F5 white-clover grazing (April ~10%): no clover N rate at 100 kg organic N/ha (Teagasc publishes it only at 170)", () => {
    const r = calculateGrassFertiliserV2({
      field: field("F5", 3, 3),
      cycle: cycle("GRASS_WHITE_CLOVER_GRAZING", { whiteCloverPct: createFarmerEvidence(10, "Test farm") }),
      annualOrganicNStockingRateKgHa: HOLDING_GSR,
    });
    expect(r.status).toBe("UNSUPPORTED_PATHWAY");
    expect(r.grossRequirementKgHa).toBeUndefined();
  });

  it("scenario 6 — F6 spring barley: no tillage rule pack yet (fails closed)", () => {
    const r = calculateGrassFertiliserV2({ field: field("F6", 2, 2), cycle: cycle("CEREAL_OTHER") });
    expect(r.status).toBe("UNSUPPORTED_PATHWAY");
  });

  describe("scenario 7 — cattle moving between fields (April–October rotation)", () => {
    let n = 0;
    const s = (groupId: string, fieldId: string, from: string, to: string): GrazingFieldSession => ({
      id: `s${n++}`,
      farmId,
      livestockGroupId: groupId,
      fieldId,
      startedAt: `${from}T00:00:00.000Z`,
      endedAt: `${to}T00:00:00.000Z`,
      headCountSnapshot: HEAD[groupId],
      livestockCategorySnapshot: CATEGORY[groupId],
      livestockUnitsPerHeadSnapshot: LU[groupId],
      source: "Test farm",
      createdAt: `${from}T00:00:00.000Z`,
    });
    // Cows, bull and calves rotate F1 (70 days) → F2 (60) → F5 (80); the
    // weanlings spend 40 days on F3 aftergrass from mid-August; the
    // replacement heifers stay on F4.
    const sessions: GrazingFieldSession[] = [
      ...["cows", "bull"].flatMap((g) => [s(g, "F1", "2026-04-01", "2026-06-10"), s(g, "F2", "2026-06-10", "2026-08-09"), s(g, "F5", "2026-08-09", "2026-10-28")]),
      s("weanlings", "F1", "2026-04-01", "2026-06-10"),
      s("weanlings", "F2", "2026-06-10", "2026-08-09"),
      s("weanlings", "F5", "2026-08-09", "2026-08-15"),
      s("weanlings", "F3", "2026-08-15", "2026-09-24"),
      s("weanlings", "F5", "2026-09-24", "2026-10-28"),
      s("heifers", "F4", "2026-04-01", "2026-10-28"),
    ];
    const area: Record<string, number> = { F1: 8, F2: 8, F3: 10, F4: 6, F5: 8 };
    const pressure = (fieldId: string) =>
      calculateFieldGrazingPressure({ fieldId, fieldAreaHa: area[fieldId], livestockGroups: herd, sessions, seasonStart: "2026-01-01T00:00:00.000Z", asOf: "2026-10-28T00:00:00.000Z" });

    it("allocates recorded grazing to each field by LU-days (hand-worked)", () => {
      // F1: (36 + 1 + 11.4) LU × 70 d = 3,388 LU-days over 8 ha × 210 d = 2.017 LU/ha
      // F2: 48.4 × 60 = 2,904 → 1.729 · F5: 37 × 80 + 11.4 × 40 = 3,416 → 2.033
      // F3: 11.4 × 40 = 456 → 0.217 · F4: 7 × 210 = 1,470 over 6 ha → 1.167
      const expected: Record<string, [number, number]> = { F1: [3388, 2.0167], F2: [2904, 1.7286], F3: [456, 0.2171], F4: [1470, 1.1667], F5: [3416, 2.0333] };
      let totalLuDays = 0;
      for (const [fieldId, [luDays, luHa]] of Object.entries(expected)) {
        const p = pressure(fieldId);
        expect(p.status).toBe("READY");
        expect(p.trackingDays).toBe(210);
        expect(p.livestockUnitDays).toBeCloseTo(luDays, 6);
        expect(p.averageStockingRateLUHa).toBeCloseTo(luHa, 4);
        totalLuDays += p.livestockUnitDays ?? 0;
      }
      // Every grazing day is allocated to exactly one field: 55.4 LU × 210 days.
      expect(totalLuDays).toBeCloseTo(55.4 * 210, 6);
    });

    it("keys every grazing field's table row on the holding rate — the rotation never changes the farm's fertiliser totals", () => {
      for (const fieldId of ["F1", "F2", "F5"]) {
        const p = pressure(fieldId);
        const withContext = grazing(fieldId, 2, 2, {
          grazingStockingEvidence: {
            basis: "HOLDING_GSR",
            fieldGrazingContext: { averageStockingRateLUHa: p.averageStockingRateLUHa!, sourceSessionCount: p.sourceSessionIds.length },
          },
        });
        const without = grazing(fieldId, 2, 2);
        expect(withContext.grossRequirementKgHa).toEqual(without.grossRequirementKgHa);
        expect(withContext.traces.n?.inputs.fieldAverageStockingRateLUHa).toBeCloseTo(p.averageStockingRateLUHa!, 10);
        expect(withContext.limitations.join(" ")).toMatch(/does not change the table row/);
      }
    });
  });
});
