import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  calculateGrasslandStockingRateKgHa,
  calculateNutrientPlan,
  NUTRIENT_ENGINE_VERSION,
  checkNapCompliance,
  cropGroupForFieldUse,
  farmGrasslandAggregates,
  HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT,
  isEligibleForElevatedNRate,
  kGrazingKgHa,
  kIndexFromMgL,
  knownFertiliserProductComposition,
  kSilageKgHa,
  LIVESTOCK_UNITS_PER_HEAD,
  napEnhancedPBuildUpKgHa,
  napMaxAvailableNCutOnlyKgHa,
  napMaxAvailableNGrazingKgHa,
  napMaxAvailableNGrazingKgHaEligibilityGated,
  napMaxAvailablePCutOnlyKgHa,
  napMaxAvailablePGrazingKgHa,
  NAP_N_CATCHMENT_AMENDMENT_2028,
  NATIONAL_AVG_SLURRY_DM_PCT,
  nGrazingSucklerToBeefKgHa,
  nSilageKgHa,
  pBuildUpKgHa,
  pIndexFromMgL,
  pMaintenanceGrazingKgHa,
  pMaintenanceSilageKgHa,
  reconcileDeliveredSupply,
  resolveAvailableSlurryNutrients,
  resolveEffectiveSlurryComposition,
  resolveFieldSlurryAllocation,
  resolvePIndexConservatively,
  slurryAvailableKgHa,
  slurryAvailableSpringLessKgHa,
  slurryAvailableSummerLessKgHa,
  soilMaterialForOrganicCarbonStatus,
  totalLivestockUnits,
  yearsBetweenIsoDates,
} from "./nutrients";
import { tracked } from "./types";
import type { Field, LivestockGroup, NutrientPlan, SlurryAllocation } from "./types";
import fertilityEvidenceBaseline from "./nutrients.fertility-evidence-baseline.json";
import { calculateStatutoryGrasslandStockingRateKgHa } from "./statutory-excretion";
import type { SlurryComposition } from "./slurry-composition";

// Every expected value below is transcribed directly from the named Green
// Book table (see file header comments in nutrients.ts and
// docs/evidence-register.md) — these tests are the "known test cases
// independently validated" Phase 3 exit gate
// (docs/product-requirements.md § Delivery phases).

/** Unwraps an `"OK"` EngineOutcome's value for terser boundary-table
 * assertions below — every call site that uses this has its own separate
 * assertion (elsewhere in this file) confirming the non-"OK" branches are
 * reachable and correctly shaped, so this helper never hides a status
 * check that matters for the specific thing that test is verifying. */
function okValue<T>(outcome: { status: string; value?: T }): T {
  if (outcome.status !== "OK") throw new Error(`Expected "OK", got "${outcome.status}"`);
  return outcome.value as T;
}

describe("Soil P index classification — real statutory ranges, both crop groups (rules_statutory/soil_phosphorus_index_2026.csv)", () => {
  // V3 FIX (SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md §2.1, conflict #3):
  // the old test asserted pIndexFromMgL(8.1) === 4 as a plain number —
  // still correct (8.1 is outside the ambiguous (8.00, 8.01] micro-gap),
  // but the function now returns an EngineOutcome and the ambiguous case
  // itself (8.01 exactly) was never tested at all. Rewritten, not merely
  // extended, per the V3 evidence.
  it("grassland: definite Index 1-3 boundaries at the statutory Table 12 precision (GFT001-GFT005)", () => {
    expect(okValue(pIndexFromMgL(0))).toBe(1);
    expect(okValue(pIndexFromMgL(3.04))).toBe(1); // GFT001
    expect(okValue(pIndexFromMgL(3.05))).toBe(2); // GFT002
    expect(okValue(pIndexFromMgL(5.04))).toBe(2); // GFT003
    expect(okValue(pIndexFromMgL(5.05))).toBe(3); // GFT004
    expect(okValue(pIndexFromMgL(8.0))).toBe(3); // GFT005
  });

  it("grassland: the literal (8.00, 8.01] micro-gap is AMBIGUOUS, never silently Index 4 (GFT006)", () => {
    const outcome = pIndexFromMgL(8.01);
    expect(outcome.status).toBe("AMBIGUOUS");
    if (outcome.status === "AMBIGUOUS") {
      expect(outcome.reasonCode).toBe("AMBIGUOUS_STATUTORY_BOUNDARY");
      expect(outcome.detail).toContain("8.01");
    }
  });

  it("grassland: definite Index 4 resumes strictly above the ambiguous gap (GFT007)", () => {
    expect(okValue(pIndexFromMgL(8.02))).toBe(4);
    expect(okValue(pIndexFromMgL(8.1))).toBe(4);
  });

  it("other_crop: wider Index 2/3 bands and its own (10.00, 10.01] ambiguous gap (GFT008, GFT009, GFT010)", () => {
    expect(okValue(pIndexFromMgL(6.04, "other_crop"))).toBe(2); // GFT008
    expect(okValue(pIndexFromMgL(10.0, "other_crop"))).toBe(3);
    expect(pIndexFromMgL(10.01, "other_crop").status).toBe("AMBIGUOUS"); // GFT009
    expect(okValue(pIndexFromMgL(10.02, "other_crop"))).toBe(4); // GFT010
  });

  it("defaults to grassland when no crop group is given (backward-compatible default)", () => {
    expect(okValue(pIndexFromMgL(3.0))).toBe(okValue(pIndexFromMgL(3.0, "grassland")));
  });
});

describe("resolvePIndexConservatively", () => {
  it("passes a definite classification through unchanged, conservativeTreatment: false", () => {
    expect(resolvePIndexConservatively(pIndexFromMgL(3.0))).toEqual({ index: 1, conservativeTreatment: false });
  });

  it("applies the conservative Index-4 allowance treatment for an ambiguous result, flagged explicitly", () => {
    expect(resolvePIndexConservatively(pIndexFromMgL(8.01))).toEqual({ index: 4, conservativeTreatment: true });
  });
});

describe("yearsBetweenIsoDates", () => {
  it("computes a real ISO date difference in years", () => {
    expect(yearsBetweenIsoDates("2025-08-29", "2026-08-29")).toBeCloseTo(1, 2);
    expect(yearsBetweenIsoDates("2022-08-29", "2026-08-29")).toBeCloseTo(4, 2);
  });

  it("returns NaN for a malformed date string", () => {
    expect(Number.isNaN(yearsBetweenIsoDates("not-a-date", "2026-08-29"))).toBe(true);
  });

  it("returns a negative number when fromIso is after toIso", () => {
    expect(yearsBetweenIsoDates("2026-08-29", "2025-08-29")).toBeLessThan(0);
  });

  // Codex audit HIGH (audit-logs/20260829T094314Z.md) questioned whether
  // this function correctly evaluates a genuine 4-calendar-year
  // anniversary to >= 4 — real, worth a direct test, not just a doc
  // comment's rebuttal (see this function's own doc comment for the full
  // analysis, including why the audit's own worked example wasn't
  // actually a same-month/day 4-year anniversary).
  it("evaluates a real 4-calendar-year, same-month/day anniversary to exactly 4 (matches GFT012's own ageYears: 4.0 boundary)", () => {
    expect(yearsBetweenIsoDates("2020-02-29", "2024-02-29")).toBe(4);
    expect(yearsBetweenIsoDates("2022-08-29", "2026-08-29")).toBe(4);
    expect(yearsBetweenIsoDates("2021-03-01", "2025-03-01")).toBe(4);
  });

  it("a date one day short of the true 4-year anniversary is correctly just under 4, not a misclassification", () => {
    // 2024-02-29 is 2020-02-29's real 4-year anniversary (2024 is also a
    // leap year); 2024-02-28 is one day earlier than that, so this
    // genuinely is under 4 years old, not exactly 4.
    expect(yearsBetweenIsoDates("2020-02-29", "2024-02-28")).toBeLessThan(4);
  });
});

describe("cropGroupForFieldUse", () => {
  it("maps tillage to other_crop and every other use to grassland", () => {
    expect(cropGroupForFieldUse("tillage")).toBe("other_crop");
    expect(cropGroupForFieldUse("grazing")).toBe("grassland");
    expect(cropGroupForFieldUse("silage_1st_cut")).toBe("grassland");
    expect(cropGroupForFieldUse("mixed")).toBe("grassland");
    expect(cropGroupForFieldUse("other")).toBe("grassland");
  });
});

// Fertiliser Vertical campaign, Codex audit CRITICAL (round 10) — the
// one real, authoritative home for the farm-wide grassland-area/non-
// grass-% aggregation; `build-all.ts`'s `computeFarmGrasslandAggregates`
// and `finance.ts`'s own whole-farm fertiliser aggregates both now call
// this instead of keeping independently-drifting copies.
describe("farmGrasslandAggregates", () => {
  it("excludes real tillage area from the grassland figure — never the same as the farm's whole area on a mixed farm", () => {
    const fields = [
      { areaHa: 10, plannedUse: undefined },
      { areaHa: 5, plannedUse: { value: "tillage" as const, status: "verified" as const, source: "Farmer" } },
    ];
    const { farmGrasslandAreaHa, nonGrassPct } = farmGrasslandAggregates(fields);
    expect(farmGrasslandAreaHa).toBe(10);
    expect(nonGrassPct).toBeCloseTo((5 / 15) * 100);
  });

  it("returns the farm's whole area as grassland when no field is tillage", () => {
    const fields = [{ areaHa: 10, plannedUse: undefined }];
    const { farmGrasslandAreaHa, nonGrassPct } = farmGrasslandAggregates(fields);
    expect(farmGrasslandAreaHa).toBe(10);
    expect(nonGrassPct).toBe(0);
  });

  it("returns a real, honest zero for an empty field list, never a division error", () => {
    expect(farmGrasslandAggregates([])).toEqual({ farmGrasslandAreaHa: 0, nonGrassPct: 0 });
  });
});

describe("Soil K index classification (Table 6-5, advisory_teagasc/soil_K_index_current.csv)", () => {
  it("mineral soil boundaries (default)", () => {
    expect(kIndexFromMgL(0)).toBe(1);
    expect(kIndexFromMgL(50)).toBe(1);
    expect(kIndexFromMgL(51)).toBe(2);
    expect(kIndexFromMgL(100)).toBe(2);
    expect(kIndexFromMgL(101)).toBe(3);
    expect(kIndexFromMgL(150)).toBe(3);
    expect(kIndexFromMgL(151)).toBe(4);
  });

  it("V3 FIX (audit §2.1): peat soil uses its own, wider bands, not the mineral bands", () => {
    expect(kIndexFromMgL(100, "peat")).toBe(1);
    expect(kIndexFromMgL(101, "peat")).toBe(2);
    expect(kIndexFromMgL(175, "peat")).toBe(2);
    expect(kIndexFromMgL(176, "peat")).toBe(3);
    expect(kIndexFromMgL(250, "peat")).toBe(3);
    expect(kIndexFromMgL(251, "peat")).toBe(4);
    // The same 101 mg/L reading is Index 3 on a mineral soil but Index 2
    // on a peat soil — confirming the two band sets are genuinely
    // different, not the same table applied twice.
    expect(kIndexFromMgL(101, "mineral")).toBe(3);
    expect(kIndexFromMgL(101, "peat")).toBe(2);
  });
});

describe("soilMaterialForOrganicCarbonStatus", () => {
  it("maps peat to peat and everything else (including undefined) to mineral", () => {
    expect(soilMaterialForOrganicCarbonStatus("peat")).toBe("peat");
    expect(soilMaterialForOrganicCarbonStatus("mineral")).toBe("mineral");
    expect(soilMaterialForOrganicCarbonStatus("high_organic")).toBe("mineral");
    expect(soilMaterialForOrganicCarbonStatus(undefined)).toBe("mineral");
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

describe("resolveEffectiveSlurryComposition (Slurry Evidence & Composition V1)", () => {
  const farmerRecord: SlurryComposition = {
    id: "comp-1",
    farmId: "farm-1",
    housingId: "housing-1",
    slurryType: "cattle_slurry",
    status: "farmer_adjusted",
    dmPct: 8,
    sampleDate: "2026-06-01",
    source: "Farmer estimate",
    recordedAt: "2026-06-01T09:00:00.000Z",
  };
  const labRecord: SlurryComposition = {
    id: "comp-2",
    farmId: "farm-1",
    housingId: "housing-1",
    slurryType: "cattle_slurry",
    status: "verified",
    dmPct: 9.4,
    nPerM3: 2.8,
    pPerM3: 0.6,
    kPerM3: 3.2,
    sampleDate: "2026-06-10",
    source: "Southern Agri Labs report",
    laboratory: "Southern Agri Labs",
    sampleRef: "SAL-2026-991",
    recordedAt: "2026-06-12T09:00:00.000Z",
  };

  it("test 1/2: with no composition record, uses the unchanged Teagasc national-average DM% and reports it as ASSUMED (estimated)", () => {
    const effective = resolveEffectiveSlurryComposition(undefined);
    expect(effective.dmPct).toBe(NATIONAL_AVG_SLURRY_DM_PCT);
    expect(effective.status).toBe("estimated");
    expect(effective.source).toContain("Teagasc");
    expect(effective.compositionRecordId).toBeUndefined();
  });

  it("test 3: a real farmer-provided record takes precedence over the assumption", () => {
    const effective = resolveEffectiveSlurryComposition(farmerRecord);
    expect(effective.dmPct).toBe(8);
    expect(effective.status).toBe("farmer_adjusted");
    expect(effective.compositionRecordId).toBe("comp-1");
  });

  it("test 3: a real measured (laboratory) record takes precedence over the assumption", () => {
    const effective = resolveEffectiveSlurryComposition(labRecord);
    expect(effective.dmPct).toBe(9.4);
    expect(effective.status).toBe("verified");
    expect(effective.sourceDate).toBe("2026-06-10");
    expect(effective.compositionRecordId).toBe("comp-2");
  });

  it("deliberately does NOT surface the composition's own recorded N/P/K — only dmPct is used by the engine (no Teagasc rule converts measured total N/P/K into an available-nutrient figure)", () => {
    const effective = resolveEffectiveSlurryComposition(labRecord);
    expect(effective).not.toHaveProperty("nPerM3");
    expect(effective).not.toHaveProperty("pPerM3");
    expect(effective).not.toHaveProperty("kPerM3");
  });
});

describe("slurryAvailableSpringLessKgHa (advisory_teagasc/cattle_slurry_available_npk_spring_LESS.csv)", () => {
  it("GFT047: 10 m3 at 6% DM, spring, LESS -> N=10, P=5, K=35", () => {
    const outcome = slurryAvailableSpringLessKgHa(10, 6);
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.n).toBeCloseTo(10, 5);
    expect(outcome.value.p).toBeCloseTo(5, 5);
    expect(outcome.value.k).toBeCloseTo(35, 5);
  });

  it("fails closed (no interpolation) for a DM% not one of the 4 published points", () => {
    const outcome = slurryAvailableSpringLessKgHa(10, 5);
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("BLOCK_NO_INTERPOLATION");
    }
  });
});

// Slurry Timing Evidence Patch V1 — Teagasc Signpost Fact Sheet 07,
// "Getting the Most From Your Slurry", Table 2 (directly read, verbatim):
// Spring N 1.0/P 0.5/K 3.5 kg/m3, Summer N 0.6/P 0.5/K 3.5 kg/m3, both at
// 6% DM only (Table 2 publishes no DM breakdown of its own).
describe("slurryAvailableSummerLessKgHa (Signpost Fact Sheet 07, Table 2)", () => {
  it("10 m3 at 6% DM, summer, LESS -> N=6, P=5, K=35", () => {
    const outcome = slurryAvailableSummerLessKgHa(10, 6);
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.n).toBeCloseTo(6, 5);
    expect(outcome.value.p).toBeCloseTo(5, 5);
    expect(outcome.value.k).toBeCloseTo(35, 5);
  });

  it("summer N is lower than spring N at the identical rate/DM% — the real, evidenced timing difference", () => {
    const spring = slurryAvailableSpringLessKgHa(10, 6);
    const summer = slurryAvailableSummerLessKgHa(10, 6);
    expect(spring.status).toBe("OK");
    expect(summer.status).toBe("OK");
    if (spring.status !== "OK" || summer.status !== "OK") return;
    expect(summer.value.n).toBeLessThan(spring.value.n);
    // P and K are timing-invariant per the same source table — only N
    // differs between spring and summer.
    expect(summer.value.p).toBeCloseTo(spring.value.p, 5);
    expect(summer.value.k).toBeCloseTo(spring.value.k, 5);
  });

  it("fails closed (no interpolation) for any DM% other than the one published summer point (6%)", () => {
    const outcome = slurryAvailableSummerLessKgHa(10, 7);
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("BLOCK_NO_INTERPOLATION");
    }
  });
});

// Slurry Application Context V1 — brief §13's own focused test list
// (items 1-6, 9), directly against the canonical resolver rather than
// through the full `calculateNutrientPlan` orchestration (that coverage
// is separate, in the `calculateNutrientPlan (orchestration)` describe
// block below — item 7).
describe("resolveAvailableSlurryNutrients (Slurry Application Context V1)", () => {
  it("test 1: spring + splashplate selects the existing Table 9-8 rule", () => {
    const outcome = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 33,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.ruleId).toBe("SLURRY_TABLE_9_8");
    expect(outcome.value.applicationMethod).toBe("splashplate");
    expect(outcome.value.assumedDefault).toBe(false);
    // Exactly the same published grid point slurryAvailableKgHa(33,6,3,3) uses.
    expect(outcome.value.n).toBeCloseTo(23, 5);
    expect(outcome.value.p).toBeCloseTo(15, 5);
    expect(outcome.value.k).toBeCloseTo(95, 5);
  });

  it("test 2: spring + supported LESS selects the existing spring/LESS rule", () => {
    const outcome = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 10,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.ruleId).toBe("SPRING_LESS_SLURRY_TABLE");
    expect(outcome.value.applicationMethod).toBe("LESS");
    // Exactly the same published point slurryAvailableSpringLessKgHa(10,6) uses.
    expect(outcome.value.n).toBeCloseTo(10, 5);
    expect(outcome.value.p).toBeCloseTo(5, 5);
    expect(outcome.value.k).toBeCloseTo(35, 5);
  });

  it("test 3: the identical DM% and application rate yield a different available-nutrient result when the captured method changes (splashplate vs LESS)", () => {
    const splashplate = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 10,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    const less = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 10,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(splashplate.status).toBe("OK");
    expect(less.status).toBe("OK");
    if (splashplate.status !== "OK" || less.status !== "OK") return;
    expect(splashplate.value.ruleId).not.toBe(less.value.ruleId);
    expect(splashplate.value.n).not.toBe(less.value.n);
  });

  it("test 4: low P/K Soil Index adjustment (Table 9-8 footnote 3) still applies on the splashplate path", () => {
    const highIndex = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 33,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    const lowIndex = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 33,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 1,
      kIndex: 1,
    });
    expect(highIndex.status).toBe("OK");
    expect(lowIndex.status).toBe("OK");
    if (highIndex.status !== "OK" || lowIndex.status !== "OK") return;
    expect(lowIndex.value.p).toBeCloseTo(highIndex.value.p * 0.5, 5);
    expect(lowIndex.value.k).toBeCloseTo(highIndex.value.k * 0.9, 5);
    expect(lowIndex.value.soilIndexAdjustmentApplied).toEqual({ p: true, k: true });
    expect(highIndex.value.soilIndexAdjustmentApplied).toEqual({ p: false, k: false });
  });

  it("test 5a: an unsupported captured method (incorporate_24h) never fabricates a value", () => {
    const outcome = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("incorporate_24h", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 33,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("SLURRY_APPLICATION_CONTEXT_UNSUPPORTED_METHOD");
    }
  });

  it("test 5a: an unsupported captured method (other) never fabricates a value", () => {
    const outcome = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("other", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 33,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("SLURRY_APPLICATION_CONTEXT_UNSUPPORTED_METHOD");
    }
  });

  it("test 5b: LESS with a DM% that has no exact published spring/LESS match fails closed, never interpolated", () => {
    const outcome = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 10,
      dmPct: 6.3, // the app's own national-average default — not one of 2/4/6/7%
      dmPctStatus: "estimated",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("BLOCK_NO_INTERPOLATION");
    }
  });

  it("test 5c: genuinely conflicting captured methods across a field's contributing allocations are never guessed", () => {
    const outcome = resolveAvailableSlurryNutrients({
      allocation: { applicationMethodConflict: true },
      applicationRateM3ha: 33,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("AMBIGUOUS");
    if (outcome.status === "AMBIGUOUS") {
      expect(outcome.reasonCode).toBe("CONFLICTING_SLURRY_METHODS");
    }
  });

  it("test 5d: no slurry applied this run is NOT_APPLICABLE, not a fabricated zero result", () => {
    const outcome = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 0,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("NOT_APPLICABLE");
  });

  it("test 6/8: no method captured at all reproduces Farm Return's pre-existing spring/splashplate ASSUMED default, honestly disclosed", () => {
    const outcome = resolveAvailableSlurryNutrients({
      applicationRateM3ha: 33,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.ruleId).toBe("SLURRY_TABLE_9_8");
    expect(outcome.value.assumedDefault).toBe(true);
    expect(outcome.value.applicationMethod).toBeUndefined();
    // Identical figures to the real, captured-splashplate case — proves
    // this is the same pre-existing assumption, not a new number.
    expect(outcome.value.n).toBeCloseTo(23, 5);
    expect(outcome.value.p).toBeCloseTo(15, 5);
    expect(outcome.value.k).toBeCloseTo(95, 5);
  });

  it("test 6: provenance identifies exactly which Teagasc rule produced the result, on both the splashplate and LESS paths", () => {
    const splashplate = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 33,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    const less = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 10,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(splashplate.status).toBe("OK");
    expect(less.status).toBe("OK");
    if (splashplate.status !== "OK" || less.status !== "OK") return;
    expect(splashplate.value.source).toContain("Table 9-8");
    expect(less.value.source).toContain("LESS");
    // Both honestly disclose the same real, disclosed spring-scope gap.
    expect(splashplate.value.scientificBasisNote).toContain("spring");
    expect(less.value.scientificBasisNote).toContain("spring");
  });

  it("a real spring application date is carried through for disclosure and confirms (not assumes) the spring timing", () => {
    const withDate = resolveAvailableSlurryNutrients({
      allocation: {
        applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith"),
        applicationDate: tracked("2026-03-15", "farmer_adjusted", "Keith"), // a REAL spring date on file
      },
      applicationRateM3ha: 33,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(withDate.status).toBe("OK");
    if (withDate.status !== "OK") return;
    expect(withDate.value.applicationDate).toBe("2026-03-15");
    expect(withDate.value.ruleId).toBe("SLURRY_TABLE_9_8");
    expect(withDate.value.n).toBeCloseTo(23, 5);
    expect(withDate.value.timingCategory).toBe("SPRING");
    // A real captured date, not the assumed default — even though it
    // happens to land in SPRING too.
    expect(withDate.value.timingAssumed).toBe(false);
  });

  // Slurry Timing Evidence Patch V1 — brief §2/§4: splashplate has no
  // official, engine-compatible evidenced summer table (this campaign's
  // own source search), so a real August date must NOT silently reuse
  // Table 9-8's spring-only figures (the pre-existing, now-corrected
  // behaviour this exact scenario used to exercise).
  it("splashplate with a real LATE_SUMMER date (August) is genuinely unsupported, never silently computed via the spring table", () => {
    const outcome = resolveAvailableSlurryNutrients({
      allocation: {
        applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith"),
        applicationDate: tracked("2026-08-15", "farmer_adjusted", "Keith"),
      },
      applicationRateM3ha: 33,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status !== "BLOCKED_INSUFFICIENT_EVIDENCE") return;
    expect(outcome.reasonCode).toBe("SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED");
  });

  it("LESS with a real SUMMER date (June) selects the new summer/LESS rule, genuinely different from spring", () => {
    const outcome = resolveAvailableSlurryNutrients({
      allocation: {
        applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"),
        applicationDate: tracked("2026-06-10", "farmer_adjusted", "Keith"),
      },
      applicationRateM3ha: 10,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.ruleId).toBe("SUMMER_LESS_SLURRY_TABLE");
    expect(outcome.value.timingCategory).toBe("SUMMER");
    expect(outcome.value.timingAssumed).toBe(false);
    expect(outcome.value.n).toBeCloseTo(6, 5); // 0.6 kg/m3 * 10 m3/ha
    expect(outcome.value.p).toBeCloseTo(5, 5);
    expect(outcome.value.k).toBeCloseTo(35, 5);
  });

  it("LESS with a real SPRING date (March) still selects the existing spring/LESS rule, confirming the timing rather than assuming it", () => {
    const outcome = resolveAvailableSlurryNutrients({
      allocation: {
        applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"),
        applicationDate: tracked("2026-03-01", "farmer_adjusted", "Keith"),
      },
      applicationRateM3ha: 10,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.ruleId).toBe("SPRING_LESS_SLURRY_TABLE");
    expect(outcome.value.timingCategory).toBe("SPRING");
    expect(outcome.value.timingAssumed).toBe(false);
    expect(outcome.value.n).toBeCloseTo(10, 5);
  });

  // Brief §5 — "This is especially important for September": a
  // late-summer/September date must never be silently treated as SUMMER.
  it("LESS with a real September date (LATE_SUMMER) is genuinely unsupported, never silently treated as SUMMER", () => {
    const outcome = resolveAvailableSlurryNutrients({
      allocation: {
        applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"),
        applicationDate: tracked("2026-09-12", "farmer_adjusted", "Keith"),
      },
      applicationRateM3ha: 10,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status !== "BLOCKED_INSUFFICIENT_EVIDENCE") return;
    expect(outcome.reasonCode).toBe("SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED");
    // Proves this is NOT the SUMMER figure silently reused — an
    // unsupported result carries no n/p/k at all.
    expect((outcome as { value?: unknown }).value).toBeUndefined();
  });

  it("LESS with a real December date (outside every Carbon Navigator period) is genuinely unsupported, never coerced into the nearest period", () => {
    const outcome = resolveAvailableSlurryNutrients({
      allocation: {
        applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"),
        applicationDate: tracked("2026-12-05", "farmer_adjusted", "Keith"),
      },
      applicationRateM3ha: 10,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status !== "BLOCKED_INSUFFICIENT_EVIDENCE") return;
    expect(outcome.reasonCode).toBe("SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED");
  });

  it("no application date captured at all preserves the pre-existing SPRING assumption, honestly flagged as assumed", () => {
    const outcome = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 10,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 3,
      kIndex: 3,
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.ruleId).toBe("SPRING_LESS_SLURRY_TABLE");
    expect(outcome.value.timingCategory).toBe("SPRING");
    expect(outcome.value.timingAssumed).toBe(true);
    // Byte-identical to the pre-existing, unchanged spring figure.
    expect(outcome.value.n).toBeCloseTo(10, 5);
  });
});

// CC-B2 / RISK-01 — the Teagasc LESS table's own Index 1/2 note ("reduce P
// by 50% and K by 10%", `CLM-OM-T2-NOTE`, agreeing with Green Book Table
// 9-8 fn3 `CLM-GB-9-8-FN3`) was not applied on either LESS path. Pre-fix,
// every low-index case below returned the unadjusted Index 3/4 figure with
// `soilIndexAdjustmentApplied: { p: false, k: false }`.
describe("CC-B2: low P/K Soil Index availability on the LESS paths", () => {
  // 1 m³/ha so kg/ha equals the published kg/m³ row (6% DM: N 1.0, P 0.5, K 3.5).
  const springLess = (pIndex: 1 | 2 | 3 | 4, kIndex: 1 | 2 | 3 | 4) =>
    resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 1,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex,
      kIndex,
    });
  const summerLess = (pIndex: 1 | 2 | 3 | 4, kIndex: 1 | 2 | 3 | 4) =>
    resolveAvailableSlurryNutrients({
      allocation: {
        applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"),
        applicationDate: tracked("2026-06-10", "farmer_adjusted", "Keith"),
      },
      applicationRateM3ha: 1,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex,
      kIndex,
    });
  const valueOf = (outcome: ReturnType<typeof resolveAvailableSlurryNutrients>) => {
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") throw new Error("expected OK");
    return outcome.value;
  };

  it.each([1, 2] as const)("spring LESS P Index %i => 50% P", (pIndex) => {
    const v = valueOf(springLess(pIndex, 3));
    expect(v.ruleId).toBe("SPRING_LESS_SLURRY_TABLE");
    expect(v.p).toBeCloseTo(0.25, 10);
    expect(v.p).not.toBeCloseTo(0.5, 10); // the pre-fix, unadjusted figure
    expect(v.soilIndexAdjustmentApplied.p).toBe(true);
  });

  it.each([3, 4] as const)("spring LESS P Index %i => unchanged P", (pIndex) => {
    const v = valueOf(springLess(pIndex, 3));
    expect(v.p).toBeCloseTo(0.5, 10);
    expect(v.soilIndexAdjustmentApplied.p).toBe(false);
  });

  it.each([1, 2] as const)("spring LESS K Index %i => 90% K", (kIndex) => {
    const v = valueOf(springLess(3, kIndex));
    expect(v.k).toBeCloseTo(3.15, 10);
    expect(v.k).not.toBeCloseTo(3.5, 10); // the pre-fix, unadjusted figure
    expect(v.soilIndexAdjustmentApplied.k).toBe(true);
  });

  it.each([3, 4] as const)("spring LESS K Index %i => unchanged K", (kIndex) => {
    const v = valueOf(springLess(3, kIndex));
    expect(v.k).toBeCloseTo(3.5, 10);
    expect(v.soilIndexAdjustmentApplied.k).toBe(false);
  });

  it.each([
    [1, 1, 0.25, 3.15],
    [1, 3, 0.25, 3.5],
    [3, 1, 0.5, 3.15],
    [3, 3, 0.5, 3.5],
  ] as const)("spring LESS P%i/K%i applies P and K independently and never alters N", (pIndex, kIndex, p, k) => {
    const v = valueOf(springLess(pIndex, kIndex));
    expect(v.n).toBeCloseTo(1.0, 10);
    expect(v.p).toBeCloseTo(p, 10);
    expect(v.k).toBeCloseTo(k, 10);
    expect(v.soilIndexAdjustmentApplied).toEqual({ p: pIndex <= 2, k: kIndex <= 2 });
  });

  it.each([
    [1, 1, 0.25, 3.15],
    [2, 4, 0.25, 3.5],
    [4, 2, 0.5, 3.15],
    [3, 3, 0.5, 3.5],
  ] as const)("summer LESS P%i/K%i applies the equivalent P/K adjustments and never alters N", (pIndex, kIndex, p, k) => {
    const v = valueOf(summerLess(pIndex, kIndex));
    expect(v.ruleId).toBe("SUMMER_LESS_SLURRY_TABLE");
    expect(v.n).toBeCloseTo(0.6, 10);
    expect(v.p).toBeCloseTo(p, 10);
    expect(v.k).toBeCloseTo(k, 10);
    expect(v.soilIndexAdjustmentApplied).toEqual({ p: pIndex <= 2, k: kIndex <= 2 });
  });

  it("scales with application rate without rounding inside the calculation", () => {
    const v = valueOf(
      resolveAvailableSlurryNutrients({
        allocation: { applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
        applicationRateM3ha: 33,
        dmPct: 4,
        dmPctStatus: "verified",
        pIndex: 2,
        kIndex: 1,
      }),
    );
    expect(v.n).toBeCloseTo(0.7 * 33, 10);
    expect(v.p).toBeCloseTo(0.35 * 33 * 0.5, 10);
    expect(v.k).toBeCloseTo(2.1 * 33 * 0.9, 10);
  });

  it("does not broaden LESS applicability — unsupported DM%/timing still fail closed at low indices", () => {
    const offRow = resolveAvailableSlurryNutrients({
      allocation: { applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
      applicationRateM3ha: 10,
      dmPct: 6.3,
      dmPctStatus: "verified",
      pIndex: 1,
      kIndex: 1,
    });
    expect(offRow.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    const summerOffRow = resolveAvailableSlurryNutrients({
      allocation: {
        applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"),
        applicationDate: tracked("2026-06-10", "farmer_adjusted", "Keith"),
      },
      applicationRateM3ha: 10,
      dmPct: 4,
      dmPctStatus: "verified",
      pIndex: 1,
      kIndex: 1,
    });
    expect(summerOffRow.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    const lateSummer = resolveAvailableSlurryNutrients({
      allocation: {
        applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"),
        applicationDate: tracked("2026-09-12", "farmer_adjusted", "Keith"),
      },
      applicationRateM3ha: 10,
      dmPct: 6,
      dmPctStatus: "verified",
      pIndex: 1,
      kIndex: 1,
    });
    expect(lateSummer.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("leaves the Table 9-8 splashplate path unchanged", () => {
    const low = slurryAvailableKgHa(33, 6, 1, 1);
    expect(low.n).toBeCloseTo(23, 10);
    expect(low.p).toBeCloseTo(7.5, 10);
    expect(low.k).toBeCloseTo(85.5, 10);
    expect(slurryAvailableKgHa(33, 6, 3, 3)).toEqual({ n: 23, p: 15, k: 95 });
  });
});

// CC-FU-B: the available-nutrient assessment's evidence state reflects the
// DM% provenance — MEASURED only for a laboratory (`verified`) DM%. Labels
// only: every figure, status and reason code is identical across statuses.
describe("CC-FU-B: slurry DM% provenance on the available-nutrient assessment", () => {
  const SPRING = "2027-03-15";
  const SUMMER = "2026-06-10";
  const cases = [
    { name: "LESS spring", method: "LESS" as const, date: SPRING, ruleId: "SPRING_LESS_SLURRY_TABLE" },
    { name: "LESS summer", method: "LESS" as const, date: SUMMER, ruleId: "SUMMER_LESS_SLURRY_TABLE" },
    { name: "splashplate spring", method: "splashplate" as const, date: SPRING, ruleId: "SLURRY_TABLE_9_8" },
  ];
  const expectedState = { verified: "MEASURED", farmer_adjusted: "IRISH_DEFAULT", estimated: "IRISH_DEFAULT" } as const;
  const statuses = ["verified", "farmer_adjusted", "estimated"] as const;

  describe("resolveAvailableSlurryNutrients", () => {
    const resolve = (method: "LESS" | "splashplate", date: string, dmPctStatus: (typeof statuses)[number]) =>
      resolveAvailableSlurryNutrients({
        allocation: {
          applicationMethod: tracked(method, "farmer_adjusted", "Keith"),
          applicationDate: tracked(date, "farmer_adjusted", "Keith"),
        },
        applicationRateM3ha: 33,
        dmPct: 6,
        dmPctStatus,
        pIndex: 2,
        kIndex: 3,
      });

    for (const c of cases) {
      it(`${c.name}: verified → MEASURED, farmer_adjusted/estimated → IRISH_DEFAULT, values unchanged`, () => {
        const verified = resolve(c.method, c.date, "verified");
        expect(verified.status).toBe("OK");
        if (verified.status !== "OK") return;
        expect(verified.value.ruleId).toBe(c.ruleId);
        for (const status of statuses) {
          const outcome = resolve(c.method, c.date, status);
          expect(outcome.status).toBe("OK");
          if (outcome.status !== "OK") return;
          expect(outcome.evidenceState).toBe(expectedState[status]);
          expect(outcome.value).toEqual(verified.value);
        }
      });
    }

    it("assumed-default splashplate (no captured method) stays IRISH_DEFAULT for every DM% status", () => {
      for (const status of statuses) {
        const outcome = resolveAvailableSlurryNutrients({ applicationRateM3ha: 33, dmPct: 6, dmPctStatus: status, pIndex: 3, kIndex: 3 });
        expect(outcome.status).toBe("OK");
        if (outcome.status !== "OK") return;
        expect(outcome.evidenceState).toBe("IRISH_DEFAULT");
        expect({ n: outcome.value.n, p: outcome.value.p, k: outcome.value.k }).toEqual({ n: 23, p: 15, k: 95 });
      }
    });

    it("non-OK outcomes are unchanged by the DM% status", () => {
      for (const status of statuses) {
        const offRow = resolveAvailableSlurryNutrients({
          allocation: { applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
          applicationRateM3ha: 33,
          dmPct: 6.3,
          dmPctStatus: status,
          pIndex: 3,
          kIndex: 3,
        });
        expect(offRow.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
        if (offRow.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(offRow.reasonCode).toBe("BLOCK_NO_INTERPOLATION");
      }
    });
  });

  describe("calculateNutrientPlan", () => {
    const field: Field = {
      id: "field-ccfub",
      farmId: "farm-test",
      name: "Test Field",
      areaHa: 5,
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
      fertility: { pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab") },
      history: [],
    };
    const composition = (status: "verified" | "farmer_adjusted", dmPct: number): SlurryComposition => ({
      id: `comp-ccfub-${status}`,
      farmId: field.farmId,
      housingId: "housing-1",
      slurryType: "cattle_slurry",
      status,
      dmPct,
      sampleDate: "2026-02-01",
      source: status === "verified" ? "Lab report" : "Farmer estimate",
      ...(status === "verified" ? { laboratory: "Lab" } : {}),
      recordedAt: "2026-02-02T09:00:00.000Z",
    });
    const plan = (method: "LESS" | "splashplate", date: string, slurryComposition?: SlurryComposition) =>
      calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: {
          fieldId: field.id,
          housingId: "housing-1",
          priority: "high",
          volumeM3: 33 * field.areaHa,
          score: 90,
          applicationMethod: tracked(method, "farmer_adjusted", "Keith"),
          applicationDate: tracked(date, "farmer_adjusted", "Keith"),
        },
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
        ...(slurryComposition ? { slurryComposition } : {}),
        asOfDate: "2026-10-01",
      });
    const figures = (p: ReturnType<typeof plan>) => {
      const { offsetN, offsetP, offsetK } = p.organicApplication;
      return { offsetN, offsetP, offsetK, netRequirement: p.netRequirement, purchasedProducts: p.purchasedProducts, estimatedFieldCostEur: p.estimatedFieldCostEur };
    };

    for (const c of cases) {
      it(`${c.name}: laboratory DM is MEASURED; farmer-declared DM is IRISH_DEFAULT with identical figures`, () => {
        const lab = plan(c.method, c.date, composition("verified", 6));
        const farmer = plan(c.method, c.date, composition("farmer_adjusted", 6));
        expect(lab.organicApplication.dmPctEvidence.status).toBe("verified");
        expect(farmer.organicApplication.dmPctEvidence.status).toBe("farmer_adjusted");
        const labAssessment = lab.organicApplication.availableNutrientAssessment;
        const farmerAssessment = farmer.organicApplication.availableNutrientAssessment;
        expect(labAssessment.status).toBe("OK");
        expect(farmerAssessment.status).toBe("OK");
        if (labAssessment.status !== "OK" || farmerAssessment.status !== "OK") return;
        expect(labAssessment.evidenceState).toBe("MEASURED");
        expect(farmerAssessment.evidenceState).toBe("IRISH_DEFAULT");
        expect(farmerAssessment.value).toEqual(labAssessment.value);
        expect(figures(farmer)).toEqual(figures(lab));
      });
    }

    it("splashplate spring: national-average DM (estimated) is IRISH_DEFAULT with the same figures as a laboratory 6.3% DM", () => {
      const estimated = plan("splashplate", SPRING);
      const lab = plan("splashplate", SPRING, composition("verified", NATIONAL_AVG_SLURRY_DM_PCT));
      expect(estimated.organicApplication.dmPctEvidence.status).toBe("estimated");
      const estimatedAssessment = estimated.organicApplication.availableNutrientAssessment;
      const labAssessment = lab.organicApplication.availableNutrientAssessment;
      expect(estimatedAssessment.status).toBe("OK");
      expect(labAssessment.status).toBe("OK");
      if (estimatedAssessment.status !== "OK" || labAssessment.status !== "OK") return;
      expect(estimatedAssessment.evidenceState).toBe("IRISH_DEFAULT");
      expect(labAssessment.evidenceState).toBe("MEASURED");
      expect(estimatedAssessment.value).toEqual(labAssessment.value);
      expect(figures(estimated)).toEqual(figures(lab));
      expect({ n: estimated.organicApplication.offsetN, p: estimated.organicApplication.offsetP, k: estimated.organicApplication.offsetK }).toEqual({
        n: 23,
        p: 8,
        k: 95,
      });
    });

    for (const date of [SPRING, SUMMER]) {
      it(`LESS ${date === SPRING ? "spring" : "summer"}: national-average DM (estimated) still fails closed with the same reason and no credit`, () => {
        const estimated = plan("LESS", date);
        expect(estimated.organicApplication.dmPctEvidence.status).toBe("estimated");
        const assessment = estimated.organicApplication.availableNutrientAssessment;
        expect(assessment.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
        if (assessment.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(assessment.reasonCode).toBe("BLOCK_NO_INTERPOLATION");
        expect({ n: estimated.organicApplication.offsetN, p: estimated.organicApplication.offsetP, k: estimated.organicApplication.offsetK }).toEqual({ n: 0, p: 0, k: 0 });
      });
    }
  });
});

// Expected N/P grazing ceiling values below are transcribed directly from
// the "Farm Return Core Data v4" workbook's NAP_N_Ceilings/NAP_P_Ceilings
// sheets — a real extract of S.I. 588/2025 (see docs/evidence-register.md)
// — CONFIRMED/compliance_value, replacing the Green Book's unconfirmed
// N-ceiling estimate. The two cut-only functions stay unconfirmed
// (planning_advice) — see the caveat above each one in nutrients.ts.
describe("NAP N ceiling (S.I. 588/2025 Table 13 — CONFIRMED, compliance_value)", () => {
  it("all five stocking-rate bands, including the non-monotonic top three", () => {
    expect(napMaxAvailableNGrazingKgHa(85)).toBe(90);
    expect(napMaxAvailableNGrazingKgHa(130)).toBe(114);
    expect(napMaxAvailableNGrazingKgHa(170)).toBe(185);
    expect(napMaxAvailableNGrazingKgHa(210)).toBe(241);
    expect(napMaxAvailableNGrazingKgHa(300)).toBe(214);
  });

  it("bands are ≤-inclusive at each boundary", () => {
    expect(napMaxAvailableNGrazingKgHa(84)).toBe(90);
    expect(napMaxAvailableNGrazingKgHa(86)).toBe(114);
  });
});

describe("NAP N ceiling — S.I. 119/2026 catchment amendment (dormant, dated, not applied by default)", () => {
  it("is exposed but does not affect napMaxAvailableNGrazingKgHa's own output", () => {
    expect(napMaxAvailableNGrazingKgHa(200)).toBe(241);
    const band = NAP_N_CATCHMENT_AMENDMENT_2028.bands.find((b) => b.stockingRateBand === "171-210");
    expect(band?.ceilingKgHa).toBe(229);
    expect(NAP_N_CATCHMENT_AMENDMENT_2028.effectiveFrom).toBe("2028-01-01");
  });
});

describe("NAP N ceiling — cut-only (S.I. 588/2025 Table 16 — CONFIRMED, compliance_value)", () => {
  it("N cut-only ceiling by cut number", () => {
    expect(napMaxAvailableNCutOnlyKgHa(1)).toBe(85);
    expect(napMaxAvailableNCutOnlyKgHa(2)).toBe(70);
    expect(napMaxAvailableNCutOnlyKgHa(3)).toBe(30);
  });
});

describe("NAP P ceiling (S.I. 588/2025 Table 15a — CONFIRMED, compliance_value)", () => {
  it("P grazing ceiling bands by index — unchanged from the Green Book, now confirmed current", () => {
    expect(napMaxAvailablePGrazingKgHa(85, 1)).toBe(27);
    expect(napMaxAvailablePGrazingKgHa(85, 3)).toBe(7);
    expect(napMaxAvailablePGrazingKgHa(250, 4)).toBe(0);
  });
});

describe("NAP P enhanced build-up (S.I. 588/2025 Table 15b — conditional, opt-in only)", () => {
  it("returns undefined below the 131 kg/ha stocking rate the table starts at", () => {
    expect(napEnhancedPBuildUpKgHa(85, 1)).toBeUndefined();
    expect(napEnhancedPBuildUpKgHa(130, 1)).toBeUndefined();
  });

  it("published bands, higher than the standard Table 15a ceiling at the same stocking rate/index", () => {
    expect(napEnhancedPBuildUpKgHa(170, 1)).toBe(63);
    expect(napEnhancedPBuildUpKgHa(210, 2)).toBe(46);
    expect(napEnhancedPBuildUpKgHa(300, 3)).toBe(19);
    expect(napEnhancedPBuildUpKgHa(170, 1)!).toBeGreaterThan(napMaxAvailablePGrazingKgHa(170, 1));
  });

  it("Index 4 is always 0, same as the standard table", () => {
    expect(napEnhancedPBuildUpKgHa(300, 4)).toBe(0);
  });
});

describe("NAP P ceiling — cut-only (S.I. 588/2025 Table 17 — CONFIRMED, compliance_value)", () => {
  it("P cut-only ceiling by index — unchanged from the Green Book, now confirmed current", () => {
    expect(napMaxAvailablePCutOnlyKgHa(1, 1)).toBe(40);
    expect(napMaxAvailablePCutOnlyKgHa(2, 1)).toBe(10);
    expect(napMaxAvailablePCutOnlyKgHa(1, 4)).toBe(0);
  });
});

describe("checkNapCompliance", () => {
  it("grazing land always uses the general Table 13/15a ceiling", () => {
    const result = checkNapCompliance("grazing", { n: 150, p: 20 }, 130, 2);
    expect(result.landUse).toBe("grazing");
    expect(result.regulatory).toBe("compliance_value");
    expect(result.legislation).toContain("Tables 13 & 15a");
    expect(result.nCeilingKgHa).toBe(napMaxAvailableNGrazingKgHa(130));
    expect(result.pCeilingKgHa).toBe(napMaxAvailablePGrazingKgHa(130, 2));
  });

  it("flags a plan within the ceiling as compliant", () => {
    // At 130 kg/ha stocking rate the N ceiling is 114 kg/ha — 100 is under it.
    const result = checkNapCompliance("grazing", { n: 100, p: 10 }, 130, 2);
    expect(result.nWithinCeiling).toBe(true);
    expect(result.pWithinCeiling).toBe(true);
  });

  it("flags a plan exceeding the ceiling as non-compliant", () => {
    // 114 kg/ha ceiling at this stocking rate — 200 exceeds it.
    const result = checkNapCompliance("grazing", { n: 200, p: 50 }, 130, 2);
    expect(result.nWithinCeiling).toBe(false);
    expect(result.pWithinCeiling).toBe(false);
  });

  it("a cut field NOT intended for sale falls back to the general Table 13/15a ceiling, not the higher cut-only one", () => {
    // Own-use silage (this farm's real case) never qualifies for Table 16/17,
    // regardless of stocking rate.
    const result = checkNapCompliance("cut_only", { n: 100, p: 15 }, 60, 2, 1, false);
    expect(result.regulatory).toBe("compliance_value");
    expect(result.legislation).toContain("Tables 13 & 15a");
    expect(result.nCeilingKgHa).toBe(napMaxAvailableNGrazingKgHa(60));
    expect(result.pCeilingKgHa).toBe(napMaxAvailablePGrazingKgHa(60, 2));
  });

  it("a cut field intended for sale but on a high-stocking holding also falls back to Table 13/15a", () => {
    // Sold, but the holding's own stocking rate exceeds Table 16/17's own
    // 85 kg/ha eligibility ceiling.
    const result = checkNapCompliance("cut_only", { n: 100, p: 15 }, 130, 2, 1, true);
    expect(result.legislation).toContain("Tables 13 & 15a");
    expect(result.nCeilingKgHa).toBe(napMaxAvailableNGrazingKgHa(130));
  });

  // V3 FIX (SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md §2.4, conflict #5):
  // these two tests used to pass `cutIntendedForSale: true` alone and
  // assert the sale-route ceiling applied — exactly the GFT103 failure
  // mode (Table 16/17 requires WRITTEN EVIDENCE OF SALE, not intent
  // alone). REWRITTEN to pass real written-evidence confirmation, plus a
  // new test proving the fix: intent without evidence now correctly
  // falls back to the ordinary ceiling.
  it("a cut field intended for sale WITH confirmed written evidence, on a low-stocking holding, uses the real Table 16/17 ceiling", () => {
    const result = checkNapCompliance("cut_only", { n: 80, p: 35 }, 60, 1, 1, true, true);
    expect(result.landUse).toBe("cut_only");
    expect(result.regulatory).toBe("compliance_value");
    expect(result.legislation).toContain("Tables 16 & 17");
    expect(result.nCeilingKgHa).toBe(napMaxAvailableNCutOnlyKgHa(1));
    expect(result.pCeilingKgHa).toBe(napMaxAvailablePCutOnlyKgHa(1, 1));
    expect(result.saleEvidenceRequired).toBe(true);
    expect(result.saleEvidenceConfirmed).toBe(true);
  });

  it("stocking rate exactly at the 85kg/ha eligibility boundary still qualifies with confirmed evidence (≤, not <)", () => {
    const result = checkNapCompliance("cut_only", { n: 80, p: 35 }, 85, 1, 1, true, true);
    expect(result.legislation).toContain("Tables 16 & 17");
  });

  it("GFT103: sale INTENDED but written evidence NOT confirmed falls back to the ordinary Table 13/15a ceiling", () => {
    const result = checkNapCompliance("cut_only", { n: 80, p: 35 }, 60, 1, 1, true, false);
    expect(result.legislation).toContain("Tables 13 & 15a");
    expect(result.nCeilingKgHa).toBe(napMaxAvailableNGrazingKgHa(60));
    expect(result.saleEvidenceRequired).toBe(true);
    expect(result.saleEvidenceConfirmed).toBe(false);
  });

  it("own-feed silage (cutIntendedForSale: false) never requires sale evidence at all", () => {
    const result = checkNapCompliance("cut_only", { n: 80, p: 35 }, 60, 1, 1, false);
    expect(result.saleEvidenceRequired).toBe(false);
    expect(result.saleEvidenceConfirmed).toBe(false);
    expect(result.legislation).toContain("Tables 13 & 15a");
  });

  it("grazing land never requires sale evidence (saleEvidenceRequired is landUse-gated)", () => {
    const result = checkNapCompliance("grazing", { n: 100, p: 20 }, 130, 2);
    expect(result.saleEvidenceRequired).toBe(false);
  });

  // V3 closure pass, Priority 9 — GF12's own exact golden-test scenarios.
  it("GFT102: sale route with written evidence, GSR80, P Index 2, cut1 -> sale N max 85, sale P max 30", () => {
    const result = checkNapCompliance("cut_only", { n: 85, p: 30 }, 80, 2, 1, true, true);
    expect(result.legislation).toContain("Tables 16 & 17");
    expect(result.nCeilingKgHa).toBe(85);
    expect(result.pCeilingKgHa).toBe(30);
  });

  it("GFT101: own-feed silage never uses the sale table (sale_table_used: false)", () => {
    const result = checkNapCompliance("cut_only", { n: 80, p: 20 }, 60, 2, 1, false);
    expect(result.legislation).toContain("Tables 13 & 15a"); // the ordinary table, not Tables 16 & 17
  });

  it("GFT104: sale route with written evidence but GSR too high (100 > 85) does not use the sale table", () => {
    const result = checkNapCompliance("cut_only", { n: 80, p: 20 }, 100, 2, 1, true, true);
    expect(result.legislation).toContain("Tables 13 & 15a");
  });

  it("GFT105: second sale cut, GSR80, P Index 3 -> sale N max 70, sale P max 10", () => {
    const result = checkNapCompliance("cut_only", { n: 70, p: 10 }, 80, 3, 2, true, true);
    expect(result.legislation).toContain("Tables 16 & 17");
    expect(result.nCeilingKgHa).toBe(70);
    expect(result.pCeilingKgHa).toBe(10);
  });

  it("GFT106: third sale cut, GSR80, P Index 1 -> sale N max 30, sale P max 10", () => {
    const result = checkNapCompliance("cut_only", { n: 30, p: 10 }, 80, 1, 3, true, true);
    expect(result.legislation).toContain("Tables 16 & 17");
    expect(result.nCeilingKgHa).toBe(30);
    expect(result.pCeilingKgHa).toBe(10);
  });

  // GFT107 (mixed fresh/DM feed basis block) and GFT108 (ensiling-loss
  // double-count guard) are NOT built: FEED_BASIS's gate exists
  // (input-gates.ts's requireFeedBasis) but isn't wired into any actual
  // silage-balance calculation, since no such calculation exists yet in
  // this app (matches WINTER_FEED_POSITION's own "NOT IMPLEMENTED"
  // status — the supply side of the feed balance has no real calculation
  // to check a basis or ensiling-loss guard against). Real, open,
  // genuinely-blocked-on-a-missing-calculation gap, not silently missed.

  // V3 closure pass, Priority 1 (AF011) REGRESSION TEST — this is the
  // production function itself, called exactly as `calculateNutrientPlan`
  // calls it (no `nonGrassPct` argument supplied, relying on the safe
  // default), proving the previously-unsafe live behaviour — granting the
  // elevated 241 kg N/ha rate to any GSR>170 field regardless of eligibility
  // evidence — cannot recur now that the gate is wired in.
  it("GFT023 REGRESSION (live wiring): GSR 184 with NO nonGrassPct evidence supplied falls back to 185 kg/ha, never the raw table's 241", () => {
    const result = checkNapCompliance("grazing", { n: 150, p: 20 }, 184, 2);
    expect(result.nCeilingKgHa).toBe(185);
    expect(result.nCeilingKgHa).not.toBe(napMaxAvailableNGrazingKgHa(184));
    expect(result.highRateEligibilityApplicable).toBe(true);
    expect(result.highRateEligibilityConfirmed).toBe(false);
  });

  it("GFT024 (live wiring): GSR 184 WITH nonGrassPct >= 5 evidence supplied grants the real elevated 241 kg N/ha rate", () => {
    const result = checkNapCompliance("grazing", { n: 150, p: 20 }, 184, 2, 1, false, false, 5);
    expect(result.nCeilingKgHa).toBe(241);
    expect(result.highRateEligibilityApplicable).toBe(true);
    expect(result.highRateEligibilityConfirmed).toBe(true);
  });

  it("GSR at or below 170 reports the eligibility gate as not applicable at all", () => {
    const result = checkNapCompliance("grazing", { n: 100, p: 20 }, 130, 2);
    expect(result.highRateEligibilityApplicable).toBe(false);
    expect(result.highRateEligibilityConfirmed).toBe(true);
  });

  // V3 closure pass, Priority 9 (GFT025) REGRESSION TEST — the STANDARD
  // Table 15a P ceiling has the same AF011-shaped gap the N ceiling had.
  // Called exactly as `calculateNutrientPlan` calls it (no `nonGrassPct`
  // argument, relying on the safe default), proving the standard P
  // ceiling now correctly falls back rather than granting the raw
  // table's elevated 26 kg P/ha without eligibility evidence.
  it("GFT025: GSR184, P Index 2, no derogation/non-grass evidence -> 23 kg P/ha (the 131-170 band's own rate, not the raw table's 26)", () => {
    const result = checkNapCompliance("grazing", { n: 150, p: 20 }, 184, 2);
    expect(result.pCeilingKgHa).toBe(23);
    expect(result.pCeilingKgHa).not.toBe(napMaxAvailablePGrazingKgHa(184, 2));
  });

  it("GSR184, P Index 2, with >=5% non-grass evidence -> the real elevated 26 kg P/ha", () => {
    const result = checkNapCompliance("grazing", { n: 150, p: 20 }, 184, 2, 1, false, false, 5);
    expect(result.pCeilingKgHa).toBe(26);
  });

  // V3 closure pass, Priority 3 (P_BUILD_UP_ELIGIBILITY) — the production
  // function itself, proving the enhanced Table 15b ceiling is never
  // granted without an explicit `pBuildUpEligible: true` argument (the
  // safe default), and IS granted once eligibility is asserted.
  it("GSR 184 with pBuildUpEligible omitted (default) uses the standard Table 15a ceiling, not the enhanced Table 15b figure", () => {
    const result = checkNapCompliance("grazing", { n: 150, p: 20 }, 184, 2, 1, false, false, 5);
    expect(result.pCeilingKgHa).toBe(napMaxAvailablePGrazingKgHa(184, 2));
    expect(result.legislation).toContain("Tables 13 & 15a");
    expect(result.pBuildUpEligibilityApplicable).toBe(true);
    expect(result.pBuildUpEligibilityConfirmed).toBe(false);
  });

  it("GSR 184 with pBuildUpEligible: true grants the real enhanced Table 15b ceiling", () => {
    const result = checkNapCompliance("grazing", { n: 150, p: 20 }, 184, 2, 1, false, false, 5, true);
    expect(result.pCeilingKgHa).toBe(napEnhancedPBuildUpKgHa(184, 2));
    expect(result.pCeilingKgHa).not.toBe(napMaxAvailablePGrazingKgHa(184, 2));
    expect(result.legislation).toContain("Tables 13 & 15b");
    expect(result.pBuildUpEligibilityConfirmed).toBe(true);
  });

  it("GFT035: GSR150, P Index 1, all build-up conditions true -> 63 kg P/ha (enhanced Table 15b)", () => {
    const result = checkNapCompliance("grazing", { n: 100, p: 30 }, 150, 1, 1, false, false, 0, true);
    expect(result.pCeilingKgHa).toBe(63);
  });

  it("GFT036: GSR150, P Index 1, training missing (pBuildUpEligible: false) -> 33 kg P/ha (standard Table 15a)", () => {
    const result = checkNapCompliance("grazing", { n: 100, p: 30 }, 150, 1, 1, false, false, 0, false);
    expect(result.pCeilingKgHa).toBe(33);
  });

  it("GSR at or below 130 reports pBuildUpEligibilityApplicable: false — Table 15b publishes nothing there, even with pBuildUpEligible: true asserted", () => {
    const result = checkNapCompliance("grazing", { n: 100, p: 20 }, 100, 2, 1, false, false, 0, true);
    expect(result.pBuildUpEligibilityApplicable).toBe(false);
    expect(result.pBuildUpEligibilityConfirmed).toBe(false);
    expect(result.pCeilingKgHa).toBe(napMaxAvailablePGrazingKgHa(100, 2));
  });

  it("the cut-only sale-route ceiling (Tables 16/17) is never affected by pBuildUpEligible — Table 15b has no cut-only equivalent", () => {
    const result = checkNapCompliance("cut_only", { n: 80, p: 35 }, 60, 1, 1, true, true, 0, true);
    expect(result.legislation).toContain("Tables 16 & 17");
    expect(result.pBuildUpEligibilityApplicable).toBe(false);
  });
});

describe("isEligibleForElevatedNRate / napMaxAvailableNGrazingKgHaEligibilityGated (AF011 gate, migrated from the former standalone high-rate-n-eligibility module now wired directly into checkNapCompliance)", () => {
  it("real evidence threshold: 5% non-grass eligible area", () => {
    expect(HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT).toBe(5);
  });

  it("GFT023: GSR 184, 0% non-grass -> NOT eligible", () => {
    expect(isEligibleForElevatedNRate(184, 0)).toBe(false);
  });

  it("GFT024: GSR 184, 5% non-grass -> eligible", () => {
    expect(isEligibleForElevatedNRate(184, 5)).toBe(true);
  });

  it("GSR at or below 170 never needs eligibility — the ordinary bands already apply", () => {
    expect(isEligibleForElevatedNRate(170, 0)).toBe(true);
    expect(isEligibleForElevatedNRate(85, 0)).toBe(true);
  });

  it("GFT023: GSR 184, ineligible (0% non-grass) -> 185 kg/ha (the ordinary 131-170 band's own rate, NOT the raw table's 241)", () => {
    expect(napMaxAvailableNGrazingKgHaEligibilityGated(184, 0)).toBe(185);
  });

  it("GFT024: GSR 184, eligible (5% non-grass) -> 241 kg/ha (the real elevated rate)", () => {
    expect(napMaxAvailableNGrazingKgHaEligibilityGated(184, 5)).toBe(241);
  });

  it("GSR >210, ineligible -> still falls back to 185, never the raw table's 214", () => {
    expect(napMaxAvailableNGrazingKgHaEligibilityGated(250, 0)).toBe(185);
  });

  it("GSR >210, eligible -> the real elevated 214", () => {
    expect(napMaxAvailableNGrazingKgHaEligibilityGated(250, 10)).toBe(214);
  });

  it("GSR at or below 170 is completely unaffected by eligibility either way", () => {
    expect(napMaxAvailableNGrazingKgHaEligibilityGated(100, 0)).toBe(114);
    expect(napMaxAvailableNGrazingKgHaEligibilityGated(100, 50)).toBe(114);
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
    expect(plan.calculationVersion).toBe("nutrient_engine_v1.4.0");
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

  // Slurry Evidence & Composition V1 — brief §11 tests 4/5/6: the engine
  // consumes the effective composition (not an invisible assumption),
  // and changing it changes the calculated slurry nutrient contribution.
  describe("effective slurry composition (Slurry Evidence & Composition V1)", () => {
    const slurryAllocation = { fieldId: field.id, housingId: "housing-1", priority: "high" as const, volumeM3: 33 * field.areaHa, score: 90 };

    it("test 1/2: with no composition record for the contributing housing, uses the unchanged national-average DM% (6.3%, nearest column 6%) and discloses it as estimated", () => {
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation,
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      });
      expect(plan.organicApplication.dmPct).toBe(NATIONAL_AVG_SLURRY_DM_PCT);
      expect(plan.organicApplication.dmPctEvidence.status).toBe("estimated");
      expect(plan.organicApplication.dmPctEvidence.compositionRecordId).toBeUndefined();
      // Unchanged from the pre-existing "computes a silage plan..." test
      // above — proves this campaign made no change to existing
      // behaviour when no real composition exists (brief §11 test 8).
      expect(plan.organicApplication.offsetN).toBe(23);
      expect(plan.organicApplication.offsetP).toBe(15);
      expect(plan.organicApplication.offsetK).toBe(95);
    });

    it("test 4/5: a real farmer-provided/measured composition record for the contributing housing changes the calculated slurry nutrient offset", () => {
      const composition: SlurryComposition = {
        id: "comp-real-1",
        farmId: field.farmId,
        housingId: "housing-1",
        slurryType: "cattle_slurry",
        status: "verified",
        dmPct: 9.4, // nearest published column: 10%
        nPerM3: 2.8,
        pPerM3: 0.6,
        kPerM3: 3.2,
        sampleDate: "2026-06-10",
        source: "Southern Agri Labs report",
        laboratory: "Southern Agri Labs",
        recordedAt: "2026-06-12T09:00:00.000Z",
      };
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation,
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
        slurryComposition: composition,
      });
      // 33 t/ha at the nearest published 10% DM column, Index 3/3 — the
      // exact SLURRY_TABLE_9_8 grid point (n10/p10/k10 at rateTHa 33).
      expect(plan.organicApplication.dmPct).toBe(9.4);
      expect(plan.organicApplication.offsetN).toBe(37);
      expect(plan.organicApplication.offsetP).toBe(25);
      expect(plan.organicApplication.offsetK).toBe(146);
      // Genuinely different from the no-record run above — proves the
      // effective composition, not an invisible assumption, drives the
      // real calculated contribution.
      expect(plan.organicApplication.offsetN).not.toBe(23);
    });

    it("test 6: provenance stays visible/retrievable on the returned plan — which record, its status and source", () => {
      const composition: SlurryComposition = {
        id: "comp-real-2",
        farmId: field.farmId,
        housingId: "housing-1",
        slurryType: "cattle_slurry",
        status: "farmer_adjusted",
        dmPct: 8,
        sampleDate: "2026-05-01",
        source: "Farmer estimate",
        recordedAt: "2026-05-01T09:00:00.000Z",
      };
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation,
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
        slurryComposition: composition,
      });
      expect(plan.organicApplication.dmPctEvidence).toEqual({
        status: "farmer_adjusted",
        source: "Farmer estimate",
        sourceDate: "2026-05-01",
        compositionRecordId: "comp-real-2",
      });
    });
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
    expect(plan.organicApplication.availableNutrientAssessment.status).toBe("NOT_APPLICABLE");
  });

  // Slurry Application Context V1 — brief §13's own focused test list,
  // items 7/8/9/10, through the full `calculateNutrientPlan` orchestration
  // (item-1-6 coverage against the resolver directly is in the
  // `resolveAvailableSlurryNutrients` describe block above).
  describe("Slurry Application Context V1 — calculateNutrientPlan wiring", () => {
    const slurryAllocation = { fieldId: field.id, housingId: "housing-1", priority: "high" as const, volumeM3: 33 * field.areaHa, score: 90 };

    it("test 7/8: with no application method captured, calculateNutrientPlan reproduces the unchanged pre-existing spring+splashplate figures via the resolver's own ASSUMED default (not a second, independent code path)", () => {
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation,
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      });
      expect(plan.organicApplication.offsetN).toBe(23);
      expect(plan.organicApplication.offsetP).toBe(15);
      expect(plan.organicApplication.offsetK).toBe(95);
      expect(plan.organicApplication.availableNutrientAssessment.status).toBe("OK");
      if (plan.organicApplication.availableNutrientAssessment.status !== "OK") return;
      expect(plan.organicApplication.availableNutrientAssessment.value.assumedDefault).toBe(true);
      expect(plan.organicApplication.availableNutrientAssessment.value.ruleId).toBe("SLURRY_TABLE_9_8");
    });

    it("test 7: a real captured splashplate method produces the identical figures as the assumed default, via the same resolver (not a coincidence — same table, same evidenced method)", () => {
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: { ...slurryAllocation, applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") },
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      });
      expect(plan.organicApplication.offsetN).toBe(23);
      expect(plan.organicApplication.availableNutrientAssessment.status).toBe("OK");
      if (plan.organicApplication.availableNutrientAssessment.status !== "OK") return;
      expect(plan.organicApplication.availableNutrientAssessment.value.assumedDefault).toBe(false);
      expect(plan.organicApplication.availableNutrientAssessment.value.applicationMethod).toBe("splashplate");
    });

    it("test 3/7: a real captured LESS method changes the calculated offset from the splashplate default, through calculateNutrientPlan itself", () => {
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: { ...slurryAllocation, applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      });
      // 33 t/ha = 33 m3/ha at 6.3% DM (national average, no exact spring/LESS
      // match at that DM%) — this specific real field/DM% combination
      // correctly falls to UNSUPPORTED for the LESS table (no
      // interpolation), proving the offset is genuinely NOT the
      // splashplate figure it would otherwise silently default to.
      expect(plan.organicApplication.availableNutrientAssessment.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      expect(plan.organicApplication.offsetN).toBe(0);
      expect(plan.organicApplication.offsetN).not.toBe(23);
    });

    it("test 3/7: a real captured LESS method with an exact published DM% match produces a real, different evidenced figure through calculateNutrientPlan", () => {
      const composition: SlurryComposition = {
        id: "comp-less-1",
        farmId: field.farmId,
        housingId: "housing-1",
        slurryType: "cattle_slurry",
        status: "verified",
        dmPct: 6, // exact spring/LESS published point
        sampleDate: "2026-06-10",
        source: "Southern Agri Labs report",
        recordedAt: "2026-06-12T09:00:00.000Z",
      };
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: { ...slurryAllocation, applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
        slurryComposition: composition,
      });
      // 33 m3/ha at 6% DM spring/LESS: n=1.0*33=33, p=0.5*33=16.5->17, k=3.5*33=115.5->116.
      expect(plan.organicApplication.availableNutrientAssessment.status).toBe("OK");
      expect(plan.organicApplication.offsetN).toBe(33);
      expect(plan.organicApplication.offsetP).toBe(17);
      expect(plan.organicApplication.offsetK).toBe(116);
      expect(plan.organicApplication.offsetN).not.toBe(23); // genuinely different from the splashplate default
    });

    describe("CC-B2: low P/K Soil Index LESS credit through calculateNutrientPlan", () => {
      const lessComposition: SlurryComposition = {
        id: "comp-less-ccb2",
        farmId: field.farmId,
        housingId: "housing-1",
        slurryType: "cattle_slurry",
        status: "verified",
        dmPct: 6,
        sampleDate: "2026-06-10",
        source: "Southern Agri Labs report",
        recordedAt: "2026-06-12T09:00:00.000Z",
      };
      const lessPlan = (fertility: Field["fertility"]) =>
        calculateNutrientPlan({
          field: { ...field, fertility },
          farmGrasslandAreaHa: 27,
          livestockGroups: [],
          slurryAllocation: { ...slurryAllocation, applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
          silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
          slurryComposition: lessComposition,
          plannedRegulatoryNeatSlurry: { volumeM3: 33 * field.areaHa, status: "farmer_adjusted", source: "Keith" },
        });

      it("P2/K1 halves the P credit and takes 90% of the K credit (pre-fix: 17/116), leaving N unchanged", () => {
        const plan = lessPlan({ pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(1, "verified", "Lab") });
        // 33 m3/ha at 6% DM: n=33, p=0.5*33*0.5=8.25->8, k=3.5*33*0.9=103.95->104.
        expect(plan.organicApplication.offsetN).toBe(33);
        expect(plan.organicApplication.offsetP).toBe(8);
        expect(plan.organicApplication.offsetK).toBe(104);
        expect(plan.organicApplication.availableNutrientAssessment.status).toBe("OK");
        if (plan.organicApplication.availableNutrientAssessment.status !== "OK") return;
        expect(plan.organicApplication.availableNutrientAssessment.value.soilIndexAdjustmentApplied).toEqual({ p: true, k: true });
      });

      // Campaign C AI adjudication 2026-09-29 (CONF-03): the Index 1/2
      // availability factor reduces slurry SUPPLY only — the crop requirement
      // is never multiplied by it. The organic-share caps (P 50% / K 75% of
      // requirement) are AI_REVIEW_ONLY and deliberately not implemented.
      it("CONF-03: low-index availability factors never alter the crop requirement", () => {
        const plan = lessPlan({ pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(1, "verified", "Lab") });
        // Green Book: P 10 build-up + 20 maintenance (Index 2); K 185 (Index 1).
        expect(plan.requirement.value).toEqual({ n: 125, p: 30, k: 185 });
      });

      // CONF-02: the 90 kg K/ha spring guidance is an application constraint,
      // never a truncation of the calculated slurry K content.
      // Campaign C verified-rules checkpoint (2026-09-29): the Teagasc
      // low-index organic-share caps (P 50% / K 75% of crop requirement,
      // `CLM-TGC-OM-SHARE-P`/`-K`) are REPOSITORY_VERIFIED but
      // IMPLEMENTATION_DEFERRED_ARCHITECTURE — they limit how much organic
      // fertiliser to plan, and this engine has no slurry-rate/allocation
      // layer (the planned volume is an input). Capping the credit instead
      // would rely on the AI_PROVISIONAL "stacks with availability" reading.
      it("organic-share caps are not applied: an over-cap LESS credit is subtracted in full, after the unchanged availability factor", () => {
        const heavy = calculateNutrientPlan({
          field: { ...field, fertility: { pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(1, "verified", "Lab") } },
          farmGrasslandAreaHa: 27,
          livestockGroups: [],
          slurryAllocation: { ...slurryAllocation, volumeM3: 80 * field.areaHa, applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
          silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
          slurryComposition: lessComposition,
        });
        // 80 m3/ha at 6% DM: P 0.5 x 80 x 0.50 = 20 (> 50% of the 30 P requirement);
        // K 3.5 x 80 x 0.90 = 252 (> 75% of the 185 K requirement).
        expect(heavy.requirement.value).toEqual({ n: 125, p: 30, k: 185 });
        expect(heavy.organicApplication.offsetP).toBe(20);
        expect(heavy.organicApplication.offsetK).toBe(252);
        expect(heavy.netRequirement.value.p).toBe(10);
        expect(heavy.netRequirement.value.k).toBe(0);
      });

      it("CONF-02: 33 m3/ha of 6% LESS slurry at K Index 3 keeps its full 115.5 kg/ha K credit", () => {
        const plan = lessPlan({ pIndex: tracked(3, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab") });
        const assessment = plan.organicApplication.availableNutrientAssessment;
        expect(assessment.status).toBe("OK");
        if (assessment.status !== "OK") return;
        expect(assessment.value.k).toBeCloseTo(115.5, 9);
        expect(plan.organicApplication.offsetK).toBeGreaterThan(90);
      });

      it("statutory/regulatory manure quantities are unaffected by the agronomic LESS correction", () => {
        const fertility: Field["fertility"] = { pIndex: tracked(2 as const, "verified", "Lab"), kIndex: tracked(1 as const, "verified", "Lab") };
        const low = lessPlan(fertility);
        // Same field, indices and regulatory neat-slurry volume, but the
        // Table 9-8 splashplate credit instead of the corrected LESS credit.
        const splashplate = calculateNutrientPlan({
          field: { ...field, fertility },
          farmGrasslandAreaHa: 27,
          livestockGroups: [],
          slurryAllocation: { ...slurryAllocation, applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") },
          silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
          slurryComposition: lessComposition,
          plannedRegulatoryNeatSlurry: { volumeM3: 33 * field.areaHa, status: "farmer_adjusted", source: "Keith" },
        });
        expect(low.organicApplication.offsetK).not.toBe(splashplate.organicApplication.offsetK);
        expect(low.statutoryManureValue.status).toBe("OK");
        expect(low.statutoryManureValue).toEqual(splashplate.statutoryManureValue);
        expect(low.napCompliance).toEqual(splashplate.napCompliance);
      });

      it("an UNKNOWN soil index is never converted to zero or to a real LESS-adjusted recommendation", () => {
        const plan = lessPlan({});
        expect(plan.fertilityEvidence.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
        expect(plan.requirement.status).toBe("unavailable");
        expect(plan.purchasedProducts).toEqual([]);
        expect(plan.statutoryManureValue.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
        expect(plan.napCompliance.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      });

      it("F001: a missing P and/or K index never yields an OK, placeholder-adjusted LESS assessment (spring and summer)", () => {
        const verified3 = tracked(3 as const, "verified", "Lab");
        const cases: [Field["fertility"], string[]][] = [
          [{ kIndex: verified3 }, ["fertility.pIndex"]],
          [{ pIndex: verified3 }, ["fertility.kIndex"]],
          [{}, ["fertility.pIndex", "fertility.kIndex"]],
        ];
        for (const applicationDate of [undefined, tracked("2026-06-10", "farmer_adjusted", "Keith")]) {
          for (const [fertility, missing] of cases) {
            const plan = calculateNutrientPlan({
              field: { ...field, fertility },
              farmGrasslandAreaHa: 27,
              livestockGroups: [],
              slurryAllocation: { ...slurryAllocation, applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"), applicationDate },
              silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
              slurryComposition: lessComposition,
            });
            const assessment = plan.organicApplication.availableNutrientAssessment;
            expect(assessment.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
            if (assessment.status !== "BLOCKED_INSUFFICIENT_EVIDENCE") continue;
            expect(assessment.reasonCode).toBe("MISSING_SOIL_FERTILITY_INDEX");
            expect(assessment.missingInputs).toEqual(missing);
          }
        }
      });

      it("F003: a missing P and/or K index keeps the evidenced LESS N credit (spring 33, summer 20) while P/K stay uncredited", () => {
        const verified3 = tracked(3 as const, "verified", "Lab");
        const cases: Field["fertility"][] = [{ kIndex: verified3 }, { pIndex: verified3 }, {}];
        const timings: [SlurryAllocation["applicationDate"], number][] = [
          [undefined, 33],
          [tracked("2026-06-10", "farmer_adjusted", "Keith"), 20],
        ];
        for (const [applicationDate, expectedN] of timings) {
          for (const fertility of cases) {
            const plan = calculateNutrientPlan({
              field: { ...field, fertility },
              farmGrasslandAreaHa: 27,
              livestockGroups: [],
              slurryAllocation: { ...slurryAllocation, applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"), applicationDate },
              silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
              slurryComposition: lessComposition,
            });
            expect(plan.organicApplication.availableNutrientAssessment.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
            expect(plan.organicApplication.offsetN).toBe(expectedN);
            expect(plan.organicApplication.offsetP).toBe(0);
            expect(plan.organicApplication.offsetK).toBe(0);
          }
        }
      });

      it("F002: the corrected LESS behaviour carries a new engine version, distinct from the pre-fix v1.0.0", () => {
        const plan = lessPlan({ pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(1, "verified", "Lab") });
        // CC-B4A (v1.2.0) and per-nutrient P/K Increments 2 (v1.3.0) and 3 (v1.4.0) moved the engine on; the LESS correction carries forward.
        expect(NUTRIENT_ENGINE_VERSION).toBe("nutrient_engine_v1.4.0");
        expect(plan.calculationVersion).not.toBe("nutrient_engine_v1.0.0");
        expect(plan.calculationVersion).toBe(NUTRIENT_ENGINE_VERSION);
        expect(plan.requirement.calculationVersion).toBe(NUTRIENT_ENGINE_VERSION);
      });
    });

    // CC-B4A — the Index-1 placeholder used for a missing P/K Soil Index
    // must never produce an OK splashplate (Table 9-8) assessment either.
    // P and K stay withheld together (paired fertility evidence); N is kept.
    describe("CC-B4A: missing P/K Soil Index on the splashplate path through calculateNutrientPlan", () => {
      const verified = (i: 1 | 2 | 3 | 4) => tracked(i, "verified", "Lab");
      const splashplatePlan = (fertility: Field["fertility"], method: "captured" | "assumed" = "captured") =>
        calculateNutrientPlan({
          field: { ...field, fertility },
          farmGrasslandAreaHa: 27,
          livestockGroups: [],
          slurryAllocation:
            method === "captured" ? { ...slurryAllocation, applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") } : slurryAllocation,
          silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
        });
      const table98 = (pIndex: 1 | 2 | 3 | 4, kIndex: 1 | 2 | 3 | 4) => slurryAvailableKgHa(33, NATIONAL_AVG_SLURRY_DM_PCT, pIndex, kIndex);
      const missingCases: [string, Field["fertility"], string[]][] = [
        ["P missing / K known", { kIndex: verified(1) }, ["fertility.pIndex"]],
        ["P known / K missing", { pIndex: verified(1) }, ["fertility.kIndex"]],
        ["both missing", {}, ["fertility.pIndex", "fertility.kIndex"]],
      ];

      for (const method of ["captured", "assumed"] as const) {
        for (const [label, fertility, missing] of missingCases) {
          it(`${label} (${method} splashplate): assessment is blocked, not an OK placeholder-adjusted credit (pre-fix: OK with { p: true, k: true })`, () => {
            const assessment = splashplatePlan(fertility, method).organicApplication.availableNutrientAssessment;
            expect(assessment.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
            if (assessment.status !== "BLOCKED_INSUFFICIENT_EVIDENCE") return;
            expect(assessment.reasonCode).toBe("MISSING_SOIL_FERTILITY_INDEX");
            expect(assessment.missingInputs).toEqual(missing);
            // No value, so no soil-index adjustment is claimed for the placeholder.
            expect("value" in assessment).toBe(false);
          });

          it(`${label} (${method} splashplate): N credit is kept; P and K are withheld together, as unknown rather than a supported zero`, () => {
            const plan = splashplatePlan(fertility, method);
            expect(plan.organicApplication.offsetN).toBe(Math.round(table98(3, 3).n));
            expect(plan.organicApplication.offsetN).toBeGreaterThan(0);
            expect(plan.organicApplication.offsetP).toBe(0);
            expect(plan.organicApplication.offsetK).toBe(0);
            // The 0s are arithmetic floors; the evidence says unknown.
            expect(plan.fertilityEvidence.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
            expect(plan.requirement.status).toBe("unavailable");
            expect(plan.requirement.value.p).toBe(0);
            expect(plan.requirement.value.k).toBe(0);
            expect(plan.purchasedProducts).toEqual([]);
            expect(plan.statutoryManureValue.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
            expect(plan.napCompliance.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
          });
        }
      }

      const knownCases: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4][] = [
        [1, 1], [2, 2], [3, 3], [4, 4], [1, 3], [3, 1], [2, 4], [4, 2],
      ];
      for (const [pIndex, kIndex] of knownCases) {
        it(`complete data P${pIndex}/K${kIndex}: the Table 9-8 credit and its metadata are unchanged`, () => {
          const plan = splashplatePlan({ pIndex: verified(pIndex), kIndex: verified(kIndex) });
          const expected = table98(pIndex, kIndex);
          const assessment = plan.organicApplication.availableNutrientAssessment;
          expect(assessment.status).toBe("OK");
          if (assessment.status !== "OK") return;
          expect(assessment.value.ruleId).toBe("SLURRY_TABLE_9_8");
          expect(assessment.value.soilIndexAdjustmentApplied).toEqual({ p: pIndex <= 2, k: kIndex <= 2 });
          expect(plan.organicApplication.offsetN).toBe(Math.round(expected.n));
          expect(plan.organicApplication.offsetP).toBe(Math.round(expected.p));
          expect(plan.organicApplication.offsetK).toBe(Math.round(expected.k));
        });
      }

      it("the splashplate correction carries forward into engine version v1.4.0", () => {
        const plan = splashplatePlan({});
        expect(NUTRIENT_ENGINE_VERSION).toBe("nutrient_engine_v1.4.0");
        expect(plan.calculationVersion).toBe("nutrient_engine_v1.4.0");
        expect(plan.requirement.calculationVersion).toBe("nutrient_engine_v1.4.0");
      });
    });

    it("test 5/6: an unsupported captured method (incorporate_24h) never fabricates a value through calculateNutrientPlan, and the honest UNSUPPORTED state is retrievable", () => {
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: { ...slurryAllocation, applicationMethod: tracked("incorporate_24h", "farmer_adjusted", "Keith") },
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      });
      expect(plan.organicApplication.offsetN).toBe(0);
      expect(plan.organicApplication.offsetP).toBe(0);
      expect(plan.organicApplication.offsetK).toBe(0);
      expect(plan.organicApplication.availableNutrientAssessment.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      if (plan.organicApplication.availableNutrientAssessment.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
        expect(plan.organicApplication.availableNutrientAssessment.reasonCode).toBe("SLURRY_APPLICATION_CONTEXT_UNSUPPORTED_METHOD");
      }
      // The plan is still actionable — an unsupported organic-offset
      // context does not suppress the whole fertiliser recommendation,
      // it only means no organic credit was counted (a safe, never a
      // fabricated, direction).
      expect(plan.purchasedProducts.length).toBeGreaterThan(0);
      // Slurry Timing Evidence Patch V1, brief §6 — that 0 credit is
      // marked provisional, not presented as a fully resolved figure.
      expect(plan.requirementProvisional.isProvisional).toBe(true);
      expect(plan.requirementProvisional.headline).toBe("Slurry nutrient credit not included");
      expect(plan.requirementProvisional.detail).toContain("provisional");
    });

    it("test 9: measured lab N/P/K on the contributing composition record still never reaches the available-nutrient calculation, even once a real method is captured", () => {
      const composition: SlurryComposition = {
        id: "comp-measured-1",
        farmId: field.farmId,
        housingId: "housing-1",
        slurryType: "cattle_slurry",
        status: "verified",
        dmPct: 6,
        nPerM3: 99, // a deliberately extreme measured value the engine must not use
        pPerM3: 99,
        kPerM3: 99,
        sampleDate: "2026-06-10",
        source: "Southern Agri Labs report",
        recordedAt: "2026-06-12T09:00:00.000Z",
      };
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: { ...slurryAllocation, applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") },
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
        slurryComposition: composition,
      });
      // Same real DM%-driven figure as the "exact published DM% match"
      // test above (33/17/116) — the extreme measured N/P/K on the same
      // record made no difference at all.
      expect(plan.organicApplication.offsetN).toBe(33);
      expect(plan.organicApplication.offsetP).toBe(17);
      expect(plan.organicApplication.offsetK).toBe(116);
    });

    it("test 10: existing NAP/purchased-fertiliser behaviour for the unchanged (no-method, assumed default) case is byte-identical to before this campaign", () => {
      // Literally the same assertions as the pre-existing "computes a
      // silage plan with organic offset..." test earlier in this file —
      // repeated here under this campaign's own describe block as an
      // explicit regression guard tying it to Slurry Application Context
      // V1's own wiring change.
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: { fieldId: field.id, housingId: "h1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 },
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      });
      expect(plan.requirement.value).toEqual({ n: 125, p: 20, k: 125 });
      expect(plan.organicApplication.offsetN).toBe(23);
      expect(plan.organicApplication.offsetP).toBe(15);
      expect(plan.organicApplication.offsetK).toBe(95);
      expect(plan.purchasedProducts.length).toBeGreaterThan(0);
      expect(plan.estimatedFieldCostEur).toBeGreaterThan(0);
    });
  });

  // Slurry Timing Evidence Patch V1, brief §6 ("Unsupported credit
  // policy") — brief §9's own focused test list: "unsupported slurry
  // credit remains distinguishable from a genuine zero nutrient
  // contribution" and "a fertiliser recommendation affected by an
  // unsupported slurry credit is visibly/provenance-marked as
  // provisional or incomplete".
  describe("requirementProvisional (Slurry Timing Evidence Patch V1)", () => {
    const slurryAllocation = { fieldId: field.id, housingId: "housing-1", priority: "high" as const, volumeM3: 33 * field.areaHa, score: 90 };

    it("is false when no slurry is allocated at all — a genuine, evidenced zero, not an unassessed one", () => {
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      });
      expect(plan.organicApplication.offsetN).toBe(0);
      expect(plan.organicApplication.availableNutrientAssessment.status).toBe("NOT_APPLICABLE");
      expect(plan.requirementProvisional.isProvisional).toBe(false);
      expect(plan.requirementProvisional.headline).toBeUndefined();
    });

    it("is false when slurry is allocated and the available-nutrient assessment is genuinely OK", () => {
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: { ...slurryAllocation, applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") },
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      });
      expect(plan.organicApplication.availableNutrientAssessment.status).toBe("OK");
      expect(plan.organicApplication.offsetN).toBe(23);
      expect(plan.requirementProvisional.isProvisional).toBe(false);
    });

    it("is true when slurry is allocated but a real captured LESS+September (LATE_SUMMER) combination has no evidenced rule — the same 0 kg/ha offset as 'no slurry applied', but a genuinely different scientific state", () => {
      const noSlurryPlan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      });
      const unassessedPlan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: {
          ...slurryAllocation,
          applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"),
          applicationDate: tracked("2026-09-12", "farmer_adjusted", "Keith"),
        },
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      });
      // Identical numeric organic offset...
      expect(unassessedPlan.organicApplication.offsetN).toBe(noSlurryPlan.organicApplication.offsetN);
      expect(unassessedPlan.organicApplication.offsetN).toBe(0);
      // ...but the two are NOT the same scientific state.
      expect(noSlurryPlan.organicApplication.availableNutrientAssessment.status).toBe("NOT_APPLICABLE");
      expect(unassessedPlan.organicApplication.availableNutrientAssessment.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      if (unassessedPlan.organicApplication.availableNutrientAssessment.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
        expect(unassessedPlan.organicApplication.availableNutrientAssessment.reasonCode).toBe("SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED");
      }
      expect(noSlurryPlan.requirementProvisional.isProvisional).toBe(false);
      expect(unassessedPlan.requirementProvisional.isProvisional).toBe(true);
      expect(unassessedPlan.requirementProvisional.headline).toBe("Slurry nutrient credit not included");
      expect(unassessedPlan.requirementProvisional.detail).toBe(
        "Fertiliser requirement is provisional until the slurry nutrient contribution can be assessed.",
      );
      // The rest of the plan remains actionable (brief §6) — never
      // suppressed just because the slurry credit is unassessed.
      expect(unassessedPlan.purchasedProducts.length).toBeGreaterThan(0);
      expect(unassessedPlan.requirement.status).toBe("estimated");
    });

    it("is true for a real captured LESS+summer date with a DM% outside the one published summer point — unsupported for a different reason, still marked provisional", () => {
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: {
          ...slurryAllocation,
          applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"),
          applicationDate: tracked("2026-06-01", "farmer_adjusted", "Keith"),
        },
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      });
      // field's own DM% (national average 6.3%) has no exact match in the
      // one-point summer table (6% only).
      expect(plan.organicApplication.availableNutrientAssessment.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      expect(plan.requirementProvisional.isProvisional).toBe(true);
    });
  });

  // V3 FIX (SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md §2.3, conflict #1):
  // plan.napCompliance is now an EngineOutcome<NapComplianceCheck> — the
  // real statutory GSR (not the Green Book agronomic curve) must resolve
  // before a compliance ceiling can be determined. Every test below
  // either uses an empty herd (statutory GSR trivially resolves to 0 —
  // Table 7 has nothing to sum) or a suckler_cow-only herd (resolves
  // directly, no age/sex needed), so all remain "OK" — REWRITTEN to
  // unwrap `.value` rather than accessing NapComplianceCheck fields
  // directly, and the one test that compared `orgNStockingRateKgHa`
  // against the Green Book agronomic curve is corrected to compare
  // against the real statutory GSR instead — that field is now, by
  // design, the statutory figure, not the agronomic one (see
  // calculateNutrientPlan's own doc comment).
  it("a silage (cut) field with no intendedUse (defaults to own_livestock) falls back to the general grassland ceiling, not the cut-only one", () => {
    // Campaign B (B2.4): a laboratory P Index, so the ceiling can be a
    // compliance value. No slurry — see the Campaign B block below for
    // why physical slurry never feeds this check.
    const labField: Field = { ...field, fertility: { ...field.fertility, pIndex: tracked(3, "verified", "Lab") } };
    const plan = calculateNutrientPlan({
      field: labField,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
    });
    expect(plan.napCompliance.status).toBe("OK");
    if (plan.napCompliance.status !== "OK") throw new Error("expected OK");
    const compliance = plan.napCompliance.value;
    expect(compliance.landUse).toBe("cut_only");
    expect(compliance.regulatory).toBe("compliance_value");
    expect(compliance.legislation).toContain("Tables 13 & 15a");
    // A NAP ceiling limits what is actually APPLIED — with no slurry the
    // total is the chemical supply the plan proposes (audit finding F1).
    expect(compliance.nRequiredKgHa).toBe(plan.deliveredKgHa.n);
    expect(compliance.pRequiredKgHa).toBe(plan.deliveredKgHa.p);
  });

  describe("Campaign B — physical slurry is never regulatory neat slurry (B1/B2.2)", () => {
    const labField: Field = { ...field, fertility: { ...field.fertility, pIndex: tracked(3, "verified", "Lab") } };
    const allocation = { fieldId: field.id, housingId: "h1", priority: "high" as const, volumeM3: 33 * field.areaHa, score: 90 };
    const silage = { cutNumber: 1 as const, expectedYieldTDMha: 5, wasGrazedPreviousYear: false };

    it("B: planned physical slurry with no neat-slurry evidence blocks the statutory ledger and the NAP total — never computed 1:1 from physical m³, never zero", () => {
      const plan = calculateNutrientPlan({ field: labField, farmGrasslandAreaHa: 27, livestockGroups: [], slurryAllocation: allocation, silage });
      expect(plan.statutoryManureValue.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      if (plan.statutoryManureValue.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(plan.statutoryManureValue.reasonCode).toBe("REGULATORY_NEAT_SLURRY_VOLUME_UNKNOWN");
      expect(plan.napCompliance.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      if (plan.napCompliance.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(plan.napCompliance.reasonCode).toBe("REGULATORY_NEAT_SLURRY_VOLUME_UNKNOWN");
      // The physical application itself is unchanged.
      expect(plan.organicApplication.totalM3).toBe(Math.round(33 * field.areaHa));
    });

    it("C/F: evidenced neat volume feeds the statutory ledger (S.I. 588/2025 totals x availability) — kept separate from the agronomic offset", () => {
      const neatM3 = 100;
      const plan = calculateNutrientPlan({
        field: labField,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: allocation,
        silage,
        plannedRegulatoryNeatSlurry: { volumeM3: neatM3, status: "farmer_adjusted", source: "test" },
      });
      expect(plan.statutoryManureValue.status).toBe("OK");
      if (plan.statutoryManureValue.status !== "OK") throw new Error("expected OK");
      expect(plan.statutoryManureValue.value.quantity).toBe(neatM3);
      expect(plan.statutoryManureValue.value.availableNKgHa).toBeCloseTo((neatM3 * 2.4 * 0.4) / field.areaHa, 6);
      expect(plan.statutoryManureValue.value.availableNKgHa).not.toBeCloseTo(plan.organicApplication.offsetN, 0);
    });

    it("B2.2: evidenced neat slurry of unestablished origin (home-produced vs imported) blocks the NAP conclusion — neither Art. 17(8) treatment is assumed", () => {
      const plan = calculateNutrientPlan({
        field: labField,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: allocation,
        silage,
        plannedRegulatoryNeatSlurry: { volumeM3: 100, status: "farmer_adjusted", source: "test" },
      });
      expect(plan.napCompliance.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      if (plan.napCompliance.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(plan.napCompliance.reasonCode).toBe("PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED");
    });

    it("G: a non-laboratory P Index never sets the statutory manure P availability", () => {
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: allocation,
        silage,
        plannedRegulatoryNeatSlurry: { volumeM3: 100, status: "farmer_adjusted", source: "test" },
      });
      expect(plan.statutoryManureValue.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      if (plan.statutoryManureValue.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(plan.statutoryManureValue.reasonCode).toBe("COMPLIANCE_P_INDEX_NOT_LABORATORY");
    });

    it("G: a farmer override of a laboratory P Index stays the agronomic value but downgrades the NAP ceiling to planning advice", () => {
      const lab = tracked<1 | 2 | 3 | 4>(2, "verified", "Lab");
      const overridden = { ...tracked<1 | 2 | 3 | 4>(4, "farmer_adjusted", "Keith"), previous: lab };
      const overrideField: Field = { ...field, plannedUse: tracked("grazing", "farmer_adjusted", "Keith"), fertility: { ...field.fertility, pIndex: overridden } };
      const plan = calculateNutrientPlan({ field: overrideField, farmGrasslandAreaHa: 27, livestockGroups: [], slurryAllocation: undefined });
      expect(plan.fertilityEvidence.status).toBe("OK");
      if (plan.fertilityEvidence.status === "OK") expect(plan.fertilityEvidence.value.pIndex).toBe(4);
      expect(plan.napCompliance.status).toBe("OK");
      if (plan.napCompliance.status !== "OK") throw new Error("expected OK");
      expect(plan.napCompliance.value.regulatory).toBe("planning_advice");
      expect(plan.napCompliance.value.pIndexNotLaboratoryReason).toMatch(/not a laboratory soil-test result/);
    });
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F1) — real audit examples, reproduced directly.
  describe("product supply reconciliation (audit finding F1)", () => {
    const grazingField: Field = {
      id: "field-meadow-3",
      farmId: "farm-test",
      name: "Meadow 3",
      areaHa: 4,
      centroid: [0, 0],
      plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
      fertility: {
        // P Index 2 (P still needed) but K Index 4 (K requirement 0) —
        // the exact real combination the audit's own Meadow 3 example
        // names: "K requirement 0; 18-6-12 supplies about 8 kg K/ha".
        pIndex: tracked(2, "farmer_adjusted", "Keith"),
        kIndex: tracked(4, "farmer_adjusted", "Keith"),
      },
      history: [],
    };

    it("Meadow 3: 18-6-12's own real K byproduct is fully tracked in deliveredKgHa, even when K requirement is genuinely 0", () => {
      const plan = calculateNutrientPlan({
        field: grazingField,
        farmGrasslandAreaHa: 27,
        livestockGroups: [{ id: "g1", farmId: "farm-test", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") }],
        slurryAllocation: undefined,
      });
      expect(plan.requirement.value.k).toBe(0);
      // 18-6-12 was allocated for P — its own real 12% K byproduct must
      // appear in the real delivered total, never silently dropped.
      expect(plan.purchasedProducts.some((p) => p.name === "18-6-12")).toBe(true);
      expect(plan.deliveredKgHa.k).toBeGreaterThan(0);
      // The real P delivered must also reconcile — never less than the
      // real net P requirement (the waterfall's own design guarantee),
      // and the exact figure a farmer can verify against the product's
      // own real rate × its own real, sourced 6% P analysis.
      expect(plan.deliveredKgHa.p).toBeGreaterThanOrEqual(plan.netRequirement.value.p - 0.5);
    });

    it("reconciles real product supply against net requirement for every nutrient — kg/ha delivered is never silently missing a real byproduct", () => {
      const plan = calculateNutrientPlan({
        field: grazingField,
        farmGrasslandAreaHa: 27,
        livestockGroups: [{ id: "g1", farmId: "farm-test", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") }],
        slurryAllocation: undefined,
      });
      // Real delivered N/P must each be independently computed from the
      // real chosen product rates — recomputed here from the same real,
      // sourced product analyses (`0-7-30`/`18-6-12`/`Protected Urea`),
      // never trusting `deliveredKgHa` to just echo `netRequirement` back.
      const byName = Object.fromEntries(plan.purchasedProducts.map((p) => [p.name, p]));
      const npkPct: Record<string, { n: number; p: number; k: number }> = {
        "0-7-30": { n: 0, p: 0.07, k: 0.3 },
        "18-6-12": { n: 0.18, p: 0.06, k: 0.12 },
        "Protected Urea": { n: 0.46, p: 0, k: 0 },
      };
      let expectedN = 0;
      let expectedP = 0;
      let expectedK = 0;
      for (const [name, product] of Object.entries(byName)) {
        expectedN += product.rateKgHa * npkPct[name].n;
        expectedP += product.rateKgHa * npkPct[name].p;
        expectedK += product.rateKgHa * npkPct[name].k;
      }
      // Codex audit round 4 HIGH — tightened to exact equality (was a
      // loose `toBeCloseTo(_, 0)` that would not have caught the real
      // bug this guards against): `deliveredKgHa` must be computed from
      // each line's own real PUBLISHED `rateKgHa` (exactly what's
      // recomputed above), never the waterfall's raw unrounded internal
      // rate — a boundary NAP compliance result must be judged against
      // the same real number a farmer can actually verify.
      expect(plan.deliveredKgHa.n).toBe(expectedN);
      expect(plan.deliveredKgHa.p).toBe(expectedP);
      expect(plan.deliveredKgHa.k).toBe(expectedK);
    });

    it("compliance is evaluated against the real total applied, never the crop's gross agronomic requirement alone — and physical slurry never enters it as neat slurry (Campaign B)", () => {
      const slurryField: Field = { ...grazingField, id: "field-with-slurry", fertility: { ...grazingField.fertility, pIndex: tracked(2, "verified", "Lab") } };
      const groups: LivestockGroup[] = [{ id: "g1", farmId: "farm-test", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") }];
      const withoutSlurry = calculateNutrientPlan({ field: slurryField, farmGrasslandAreaHa: 27, livestockGroups: groups, slurryAllocation: undefined });
      const withSlurry = calculateNutrientPlan({
        field: slurryField,
        farmGrasslandAreaHa: 27,
        livestockGroups: groups,
        slurryAllocation: { fieldId: slurryField.id, housingId: "h1", priority: "high", volumeM3: 20 * slurryField.areaHa, score: 90 },
      });
      expect(withoutSlurry.requirement.value.n).toBe(withSlurry.requirement.value.n);
      if (withoutSlurry.napCompliance.status !== "OK") throw new Error("expected OK compliance without slurry");
      expect(withoutSlurry.napCompliance.value.nRequiredKgHa).toBe(withoutSlurry.deliveredKgHa.n);
      // The organic share is unknown (no neat-slurry evidence), so the
      // total — and the verdict — is blocked rather than understated.
      expect(withSlurry.napCompliance.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    });
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F1; Codex audit round 3 HIGH) — moved out of `PurchasedFertiliserCard.tsx`
  // into this pure domain module; AGENTS.md/DOMAIN_CONTRACTS.md forbid
  // any agronomic calculation, however small, inside a React component.
  describe("reconcileDeliveredSupply (Codex audit round 3 HIGH)", () => {
    it("reports an exact-match nutrient as immaterial — real but not worth separate disclosure", () => {
      const lines = reconcileDeliveredSupply({ n: 100, p: 20, k: 0 }, { n: 100, p: 20, k: 0 });
      expect(lines).toEqual([
        { nutrient: "n", deliveredKgHa: 100, needKgHa: 100, varianceKgHa: 0, material: false },
        { nutrient: "p", deliveredKgHa: 20, needKgHa: 20, varianceKgHa: 0, material: false },
        { nutrient: "k", deliveredKgHa: 0, needKgHa: 0, varianceKgHa: 0, material: false },
      ]);
    });

    it("flags a real excess above the materiality threshold, with the real variance and direction", () => {
      const lines = reconcileDeliveredSupply({ n: 100, p: 20, k: 0 }, { n: 100, p: 20, k: 8 });
      const kLine = lines.find((l) => l.nutrient === "k")!;
      expect(kLine.varianceKgHa).toBe(8);
      expect(kLine.material).toBe(true);
      expect(kLine.direction).toBe("excess");
    });

    it("flags a real shortfall below the materiality threshold, with the real variance and direction", () => {
      const lines = reconcileDeliveredSupply({ n: 100, p: 20, k: 0 }, { n: 90, p: 20, k: 0 });
      const nLine = lines.find((l) => l.nutrient === "n")!;
      expect(nLine.varianceKgHa).toBe(-10);
      expect(nLine.material).toBe(true);
      expect(nLine.direction).toBe("shortfall");
    });

    it("never flags a real but immaterial sub-threshold variance as excess/shortfall — still discloses the real variance value, just not a direction claim", () => {
      const lines = reconcileDeliveredSupply({ n: 100, p: 20, k: 0 }, { n: 100.3, p: 20, k: 0 });
      const nLine = lines.find((l) => l.nutrient === "n")!;
      expect(nLine.varianceKgHa).toBeCloseTo(0.3, 5);
      expect(nLine.material).toBe(false);
      expect(nLine.direction).toBeUndefined();
    });

    it("treats exactly the materiality threshold itself as material", () => {
      const lines = reconcileDeliveredSupply({ n: 100, p: 20, k: 0 }, { n: 100.5, p: 20, k: 0 });
      expect(lines.find((l) => l.nutrient === "n")!.material).toBe(true);
    });
  });

  it("a silage field intended for sale WITH confirmed written evidence, on a low-stocking holding, uses the real cut-only ceiling", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: {
        cutNumber: 1,
        expectedYieldTDMha: 5,
        wasGrazedPreviousYear: false,
        intendedUse: "sale",
        saleEvidence: { hasWrittenEvidence: true },
      },
    });
    expect(plan.napCompliance.status).toBe("OK");
    if (plan.napCompliance.status !== "OK") throw new Error("expected OK");
    expect(plan.napCompliance.value.legislation).toContain("Tables 16 & 17");
    expect(plan.napCompliance.value.saleEvidenceConfirmed).toBe(true);
  });

  it("V3 FIX (audit conflict #5, GFT103): a silage field intended for sale WITHOUT confirmed written evidence falls back to the ordinary ceiling", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false, intendedUse: "sale" },
    });
    expect(plan.napCompliance.status).toBe("OK");
    if (plan.napCompliance.status !== "OK") throw new Error("expected OK");
    expect(plan.napCompliance.value.legislation).toContain("Tables 13 & 15a");
    expect(plan.napCompliance.value.saleEvidenceRequired).toBe(true);
    expect(plan.napCompliance.value.saleEvidenceConfirmed).toBe(false);
  });

  it("a grazing field's napCompliance is compliance_value, using the real statutory GSR (suckler_cow resolves directly, no age/sex needed)", () => {
    const grazingField: Field = { ...field, plannedUse: tracked("grazing", "farmer_adjusted", "Keith"), fertility: { ...field.fertility, pIndex: tracked(3, "verified", "Lab") } };
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(20, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const plan = calculateNutrientPlan({
      field: grazingField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
      slurryAllocation: undefined,
    });

    expect(plan.napCompliance.status).toBe("OK");
    if (plan.napCompliance.status !== "OK") throw new Error("expected OK");
    const compliance = plan.napCompliance.value;
    const statutoryGsrOutcome = calculateStatutoryGrasslandStockingRateKgHa(groups, 27);
    expect(statutoryGsrOutcome.status).toBe("OK");
    if (statutoryGsrOutcome.status !== "OK") throw new Error("expected OK");

    expect(compliance.landUse).toBe("grazing");
    expect(compliance.regulatory).toBe("compliance_value");
    // orgNStockingRateKgHa is now the REAL statutory GSR (20 x 65 kgN /
    // 27ha), not the Green Book agronomic curve — a deliberately
    // different figure now that the two ledgers are properly separated.
    expect(compliance.orgNStockingRateKgHa).toBeCloseTo(statutoryGsrOutcome.value.gsrKgNHa, 5);
    expect(compliance.orgNStockingRateKgHa).toBeCloseTo((20 * 65) / 27, 5);
    expect(compliance.nCeilingKgHa).toBe(napMaxAvailableNGrazingKgHa(statutoryGsrOutcome.value.gsrKgNHa));
    // This farm's stocking rate is low, so the resulting N requirement
    // (still computed from the agronomic Green Book curve — grossN/
    // nRequiredKgHa is a SEPARATE figure from the statutory ceiling
    // input) sits comfortably under even the lowest ceiling band — a
    // genuinely compliant real-world case, not a guaranteed-true
    // assertion for every stocking rate.
    expect(compliance.nWithinCeiling).toBe(true);
  });

  it("V3 FIX (audit conflict #1): napCompliance is BLOCKED_INSUFFICIENT_EVIDENCE when the real statutory GSR cannot be resolved (e.g. a weanling group with no avgAgeMonths) — this app's real mock-farm.ts herd today", () => {
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "weanling", label: "Weanlings", count: tracked(18, "verified", "Keith"), system: "housed", value: tracked(0, "estimated", "x") },
    ];
    // Codex audit CRITICAL (round 26): this shared `field` fixture is
    // planned as a silage cut with no `silage` object ever supplied
    // here — round 26's own new silage-evidence gate would otherwise
    // block on that (a real, independent reason) before this test ever
    // reaches the GSR-resolution scenario it exists to exercise. Uses a
    // grazing field instead, isolating the one real condition this test
    // is actually about.
    const grazingField: Field = { ...field, plannedUse: tracked("grazing", "farmer_adjusted", "Keith") };
    const plan = calculateNutrientPlan({
      field: grazingField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
      slurryAllocation: undefined,
    });
    expect(plan.napCompliance.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (plan.napCompliance.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(plan.napCompliance.reasonCode).toBe("MISSING_LIVESTOCK_CATEGORISATION_FOR_GSR");
    }
    // The agronomic ledger (fertiliser recommendation/cost) is NOT
    // blocked by the compliance ledger being undeterminable — the two
    // ledgers never gate each other (spec Section A2).
    expect(plan.purchasedProducts.length).toBeGreaterThanOrEqual(0);
    expect(plan.estimatedFieldCostEur).toBeGreaterThanOrEqual(0);
  });

  // V3 closure pass, Priority 4 — COMMONAGE_FERTILISER_GATE wired live.
  it("AF003: a commonage field's purchased-product blend is genuinely suppressed, not merely reported", () => {
    const commonageField: Field = { ...field, id: "field-commonage", commonageStatus: tracked("commonage", "farmer_adjusted", "Keith") };
    const plan = calculateNutrientPlan({
      field: commonageField,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.commonageFertiliserGate.status).toBe("LEGAL_PROHIBITION");
    expect(plan.purchasedProducts).toEqual([]);
    expect(plan.estimatedFieldCostEur).toBe(0);
  });

  it("a non-commonage field with commonageStatus explicitly captured reports NOT_APPLICABLE and is never suppressed", () => {
    const notCommonageField: Field = { ...field, id: "field-not-commonage", commonageStatus: tracked("not_commonage", "farmer_adjusted", "Keith") };
    const plan = calculateNutrientPlan({
      field: notCommonageField,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.commonageFertiliserGate.status).toBe("NOT_APPLICABLE");
    expect(plan.purchasedProducts.length).toBeGreaterThan(0);
  });

  it("a field with no commonageStatus captured fails closed to BLOCKED_INSUFFICIENT_EVIDENCE but does NOT suppress the recommendation (inert today, real once captured)", () => {
    const plan = calculateNutrientPlan({
      field, // no commonageStatus set — this app's real mock-farm.ts fields today
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.commonageFertiliserGate.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(plan.purchasedProducts.length).toBeGreaterThan(0);
  });

  // Every real product's formulation metadata is now genuinely checked
  // (FERTILISER_PRODUCT_ADMISSIBILITY, audit conflict #7) — not merely
  // assumed. All three static catalogue products are admissible, so this
  // asserts the check runs and the result carries real formulation
  // provenance, not that it changes the blend.
  it("purchased products carry real, checked formulation provenance (FERTILISER_PRODUCT_ADMISSIBILITY)", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: { fieldId: field.id, housingId: "h1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 },
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
    });
    expect(plan.purchasedProducts.length).toBeGreaterThan(0);
    for (const product of plan.purchasedProducts) {
      expect(product.formulation).toBeDefined();
      expect(product.formulation?.value.inhibitorStatus).not.toBe("unknown");
    }
  });

  // V3 closure pass, Priority 4 — LESS_METHOD_GATE wired live from
  // SlurryAllocation.applicationMethod (already-captured data, no new
  // UI needed).
  it("AF004: LESS_METHOD_GATE is NOT_APPLICABLE for a field with no slurry allocation", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.lessMethodCompliance.status).toBe("NOT_APPLICABLE");
  });

  it("AF004: a slurry allocation with no captured applicationMethod fails closed to BLOCKED_INSUFFICIENT_EVIDENCE", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: { fieldId: field.id, housingId: "h1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 },
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.lessMethodCompliance.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (plan.lessMethodCompliance.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(plan.lessMethodCompliance.reasonCode).toBe("UNKNOWN_SLURRY_METHOD");
    }
  });

  it("AF004: LESS applied on a >=100 kg N/ha GSR field is COMPLIANT", () => {
    // 45 suckler cows x 65 kgN/head (Table 7) / 27ha = ~108.3 kg N/ha, above
    // the LESS_GSR_100 trigger.
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(45, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
      slurryAllocation: {
        fieldId: field.id,
        housingId: "h1",
        priority: "high",
        volumeM3: 33 * field.areaHa,
        score: 90,
        applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"),
      },
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.lessMethodCompliance.status).toBe("OK");
    if (plan.lessMethodCompliance.status === "OK") {
      expect(plan.lessMethodCompliance.value.result).toBe("COMPLIANT");
    }
  });

  it("AF004: splashplate on a field with no triggered LESS requirement (empty herd, no pig/arable trigger) is NOT_APPLICABLE, not a false prohibition", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: {
        fieldId: field.id,
        housingId: "h1",
        priority: "high",
        volumeM3: 33 * field.areaHa,
        score: 90,
        applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith"),
      },
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.lessMethodCompliance.status).toBe("NOT_APPLICABLE");
  });

  // V3 closure pass, Priority 4 — local water-buffer override layer
  // (AF010) wired live from field.waterBufferContext.
  it("AF010: no waterBufferContext ever captured fails closed to BLOCKED_INSUFFICIENT_EVIDENCE", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.localBufferOverrideStatus.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("AF010: localOverrideStatus 'unknown' maps to the top-level UNKNOWN status (QUALIFIED_NOT_DEFINITIVE), not a hard block", () => {
    const fieldWithUnknownOverride: Field = {
      ...field,
      id: "field-buffer-unknown",
      waterBufferContext: tracked({ nearestFeature: "stream", distanceM: 12, localOverrideStatus: "unknown" }, "farmer_adjusted", "Keith"),
    };
    const plan = calculateNutrientPlan({
      field: fieldWithUnknownOverride,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.localBufferOverrideStatus.status).toBe("UNKNOWN");
  });

  it("AF010: localOverrideStatus 'verified_none' resolves OK — the national baseline applies", () => {
    const fieldWithVerifiedNone: Field = {
      ...field,
      id: "field-buffer-verified-none",
      waterBufferContext: tracked({ nearestFeature: "stream", distanceM: 12, localOverrideStatus: "verified_none" }, "farmer_adjusted", "Keith"),
    };
    const plan = calculateNutrientPlan({
      field: fieldWithVerifiedNone,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.localBufferOverrideStatus.status).toBe("OK");
    if (plan.localBufferOverrideStatus.status === "OK") {
      expect(plan.localBufferOverrideStatus.value).toBe("NATIONAL_BASELINE_APPLIES");
    }
  });

  it("AF010: localOverrideStatus 'authoritative_rule' fails closed — the override distance itself is never captured in this data model", () => {
    const fieldWithAuthoritativeRule: Field = {
      ...field,
      id: "field-buffer-authoritative",
      waterBufferContext: tracked({ nearestFeature: "stream", distanceM: 12, localOverrideStatus: "authoritative_rule" }, "farmer_adjusted", "Keith"),
    };
    const plan = calculateNutrientPlan({
      field: fieldWithAuthoritativeRule,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.localBufferOverrideStatus.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  // V3 closure pass, Priority 11 — national water-buffer distance gate
  // (AF010, other half) wired live from field.waterBufferContext.featureType.
  // `checkNationalBufferDistance`'s own NOT_APPLICABLE-equivalent path
  // (no material at all) is already covered directly in
  // buffer-gate.test.ts; the tests below exercise the live wiring itself.
  it("AF010 (national half): fails closed to BLOCKED_INSUFFICIENT_EVIDENCE when a material is applied but featureType/distance were never captured", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: { fieldId: field.id, housingId: "h1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 },
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.nationalBufferDistanceStatus.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("AF010 (national half): a real featureType + distance meeting the statutory minimum resolves OK", () => {
    const fieldWithBuffer: Field = {
      ...field,
      id: "field-national-buffer-ok",
      waterBufferContext: tracked(
        { nearestFeature: "stream", distanceM: 10, localOverrideStatus: "verified_none", featureType: "surface_water" },
        "farmer_adjusted",
        "Keith",
      ),
    };
    const plan = calculateNutrientPlan({
      field: fieldWithBuffer,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: { fieldId: fieldWithBuffer.id, housingId: "h1", priority: "high", volumeM3: 33 * fieldWithBuffer.areaHa, score: 90 },
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    // Organic surface-water baseline is 5m; 10m clears it.
    expect(plan.nationalBufferDistanceStatus.status).toBe("OK");
  });

  it("AF010 (national half): a distance below the statutory minimum is a real LEGAL_PROHIBITION", () => {
    const fieldTooClose: Field = {
      ...field,
      id: "field-national-buffer-too-close",
      waterBufferContext: tracked(
        { nearestFeature: "stream", distanceM: 2, localOverrideStatus: "verified_none", featureType: "surface_water" },
        "farmer_adjusted",
        "Keith",
      ),
    };
    const plan = calculateNutrientPlan({
      field: fieldTooClose,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: { fieldId: fieldTooClose.id, housingId: "h1", priority: "high", volumeM3: 33 * fieldTooClose.areaHa, score: 90 },
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.nationalBufferDistanceStatus.status).toBe("LEGAL_PROHIBITION");
  });

  // V3 closure pass (second pass, buffer suppression) — the independent
  // verification found `nationalBufferDistanceStatus`/`localBufferOverrideStatus`
  // were computed and returned on `NutrientPlan` but never actually
  // consulted anywhere, so a real `LEGAL_PROHIBITION` (a field too close
  // to surface water for chemical fertiliser) changed nothing about the
  // recommendation a farmer would see or buy — the exact same "computed
  // but discarded" gap AF003/commonage had before Priority 4 wired it.
  it("a chemical-fertiliser national-buffer LEGAL_PROHIBITION genuinely suppresses the purchased-product blend, not merely reports it", () => {
    // No slurry offset at all -> remainingN/P/K > 0 -> allocatePurchasedProducts
    // proposes a real chemical blend -> bufferMaterial resolves to
    // "chemical_fertiliser", exercising the suppression path this test targets.
    const fieldTooClose: Field = {
      ...field,
      id: "field-national-buffer-suppresses-chemical",
      waterBufferContext: tracked(
        { nearestFeature: "stream", distanceM: 1, localOverrideStatus: "verified_none", featureType: "surface_water" },
        "farmer_adjusted",
        "Keith",
      ),
    };
    const plan = calculateNutrientPlan({
      field: fieldTooClose,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.nationalBufferDistanceStatus.status).toBe("LEGAL_PROHIBITION");
    expect(plan.purchasedProducts).toEqual([]);
    expect(plan.estimatedFieldCostEur).toBe(0);
  });

  it("a chemical-fertiliser local-buffer-override LEGAL_PROHIBITION also suppresses the purchased-product blend", () => {
    const fieldLocalOverride: Field = {
      ...field,
      id: "field-local-buffer-suppresses-chemical",
      waterBufferContext: tracked(
        {
          nearestFeature: "private well",
          distanceM: 30,
          localOverrideStatus: "authoritative_rule" as const,
          localOverrideDistanceM: 50,
          featureType: "surface_water" as const,
        },
        "farmer_adjusted",
        "Keith",
      ),
    };
    const plan = calculateNutrientPlan({
      field: fieldLocalOverride,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    // 30m clears the national 3m chemical baseline but not this field's
    // local-authority override of 50m — the local override result is what
    // must drive suppression here, not the (passing) national check alone.
    expect(plan.localBufferOverrideStatus.status).toBe("LEGAL_PROHIBITION");
    expect(plan.purchasedProducts).toEqual([]);
    expect(plan.estimatedFieldCostEur).toBe(0);
  });

  it("an organic-material buffer check is detected independently of the chemical-fertiliser ledger it never touches", () => {
    // `bufferMaterial` only ever resolves to "organic_fertiliser_or_soiled_water"
    // when there is no chemical shortfall left to purchase (this function's
    // own priority: any remaining chemical need always takes the chemical
    // material context) — so this case structurally never has a chemical
    // blend to suppress. The real assertion is ledger separation: the
    // buffer gate still fires and is still reported, it just has nothing
    // in the (already-empty) chemical ledger to act on.
    const fieldOrganicOnly: Field = {
      ...field,
      id: "field-organic-buffer-detected-not-suppressing-empty-ledger",
      waterBufferContext: tracked(
        { nearestFeature: "stream", distanceM: 2, localOverrideStatus: "verified_none", featureType: "surface_water" },
        "farmer_adjusted",
        "Keith",
      ),
    };
    const plan = calculateNutrientPlan({
      field: fieldOrganicOnly,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: { fieldId: fieldOrganicOnly.id, housingId: "h1", priority: "high", volumeM3: 33 * fieldOrganicOnly.areaHa, score: 90 },
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.nationalBufferDistanceStatus.status).toBe("LEGAL_PROHIBITION");
    expect(plan.purchasedProducts.length).toBe(0);
    expect(plan.estimatedFieldCostEur).toBe(0);
  });

  // V3 closure pass, Priority 5 — SOIL_TEST_VALIDITY surfaced (real,
  // computed, not yet enforcing suppression — see nutrients.ts's own
  // comment at the computation site).
  it("SOIL_TEST_VALIDITY is NOT_APPLICABLE when no verified lab test exists (this app's real field fixture)", () => {
    const plan = calculateNutrientPlan({
      field, // fertility has no verifiedTest
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    expect(plan.soilTestAgeValidity.status).toBe("NOT_APPLICABLE");
  });

  it("SOIL_TEST_VALIDITY resolves VALID for a real lab test under 4 years old as of the given asOfDate", () => {
    const fieldWithRecentTest: Field = {
      ...field,
      id: "field-recent-test",
      fertility: {
        ...field.fertility,
        verifiedTest: { sampleDate: "2024-01-01", laboratory: "Test Lab", sampleRef: "R1", p: 8, k: 120, pH: 6.3 },
      },
    };
    const plan = calculateNutrientPlan({
      field: fieldWithRecentTest,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
      asOfDate: "2026-01-01",
    });
    expect(plan.soilTestAgeValidity.status).toBe("OK");
    if (plan.soilTestAgeValidity.status === "OK") expect(plan.soilTestAgeValidity.value).toBe("VALID");
  });

  it("SOIL_TEST_VALIDITY resolves DISREGARD for a real lab test 4+ years old at a non-Index-4 P Index", () => {
    const fieldWithOldTest: Field = {
      ...field,
      id: "field-old-test",
      fertility: {
        ...field.fertility,
        pIndex: tracked(3, "verified", "Soil test lab"),
        verifiedTest: { sampleDate: "2020-01-01", laboratory: "Test Lab", sampleRef: "R2", p: 6, k: 100, pH: 6.1 },
      },
    };
    const plan = calculateNutrientPlan({
      field: fieldWithOldTest,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
      asOfDate: "2026-06-01",
    });
    expect(plan.soilTestAgeValidity.status).toBe("OK");
    if (plan.soilTestAgeValidity.status === "OK") expect(plan.soilTestAgeValidity.value).toBe("DISREGARD");
  });

  it("SOIL_TEST_VALIDITY resolves INDEX4_PERSISTED for a 4+ year old test at P Index 4, not DISREGARD", () => {
    const fieldWithOldIndex4Test: Field = {
      ...field,
      id: "field-old-index4-test",
      fertility: {
        ...field.fertility,
        pIndex: tracked(4, "verified", "Soil test lab"),
        verifiedTest: { sampleDate: "2020-01-01", laboratory: "Test Lab", sampleRef: "R3", p: 12, k: 150, pH: 6.4 },
      },
    };
    const plan = calculateNutrientPlan({
      field: fieldWithOldIndex4Test,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
      asOfDate: "2026-06-01",
    });
    expect(plan.soilTestAgeValidity.status).toBe("OK");
    if (plan.soilTestAgeValidity.status === "OK") expect(plan.soilTestAgeValidity.value).toBe("INDEX4_PERSISTED");
  });

  // V3 closure pass (second pass) — the independent verification found
  // soilTestAgeValidity was computed and returned on NutrientPlan but
  // never actually consulted by checkNapCompliance: a legally DISREGARDED
  // soil test still backed a "compliance_value" statutory P ceiling
  // exactly as if it were current lab evidence. These tests prove the
  // downgrade is real, not merely a status surfaced alongside an
  // unaffected number.
  it("a DISREGARDED soil test downgrades the P ceiling from a confirmed statutory value to planning advice, with a farmer-facing reason", () => {
    const fieldWithOldTest: Field = {
      ...field,
      id: "field-old-test-downgrades-nap",
      fertility: {
        ...field.fertility,
        pIndex: tracked(3, "verified", "Soil test lab"),
        verifiedTest: { sampleDate: "2020-01-01", laboratory: "Test Lab", sampleRef: "R2", p: 6, k: 100, pH: 6.1 },
      },
    };
    const plan = calculateNutrientPlan({
      field: fieldWithOldTest,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
      asOfDate: "2026-06-01",
    });
    expect(plan.soilTestAgeValidity.status).toBe("OK");
    if (plan.soilTestAgeValidity.status === "OK") expect(plan.soilTestAgeValidity.value).toBe("DISREGARD");
    expect(plan.napCompliance.status).toBe("OK");
    if (plan.napCompliance.status === "OK") {
      expect(plan.napCompliance.value.regulatory).toBe("planning_advice");
      expect(plan.napCompliance.value.soilTestDisregardedReason).toBeDefined();
      expect(plan.napCompliance.value.soilTestDisregardedReason).toMatch(/disregarded/i);
      // The number itself is still computed and shown, not blocked — only
      // its regulatory confidence is downgraded (spec's own
      // planning_advice / compliance_value distinction), matching how
      // sale-evidence and high-rate-eligibility gaps are surfaced.
      expect(plan.napCompliance.value.pCeilingKgHa).toBeGreaterThan(0);
    }
  });

  it("a VALID (non-disregarded) soil test does NOT downgrade the P ceiling's regulatory status", () => {
    const fieldWithRecentTest: Field = {
      ...field,
      id: "field-recent-test-no-downgrade",
      fertility: {
        ...field.fertility,
        pIndex: tracked(3, "verified", "Soil test lab"),
        verifiedTest: { sampleDate: "2024-01-01", laboratory: "Test Lab", sampleRef: "R1", p: 8, k: 120, pH: 6.3 },
      },
    };
    const plan = calculateNutrientPlan({
      field: fieldWithRecentTest,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
      asOfDate: "2026-01-01",
    });
    expect(plan.soilTestAgeValidity.status).toBe("OK");
    if (plan.soilTestAgeValidity.status === "OK") expect(plan.soilTestAgeValidity.value).toBe("VALID");
    expect(plan.napCompliance.status).toBe("OK");
    if (plan.napCompliance.status === "OK") {
      expect(plan.napCompliance.value.regulatory).toBe("compliance_value");
      expect(plan.napCompliance.value.soilTestDisregardedReason).toBeUndefined();
    }
  });

  describe("Campaign B stabilisation 2 — blocked soil-test validity never yields a compliance value", () => {
    const planFor = (sampleDate: string) =>
      calculateNutrientPlan({
        field: {
          ...field,
          id: "field-soil-validity",
          plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
          fertility: {
            ...field.fertility,
            pIndex: tracked(2, "verified", "Soil test lab"),
            verifiedTest: { sampleDate, laboratory: "Test Lab", sampleRef: "RV", p: 5, k: 110, pH: 6.2 },
          },
        },
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: undefined,
        asOfDate: "2026-06-01",
      });

    it("A: verified lab P + missing sample date + UNKNOWN_BLOCK does not produce compliance_value", () => {
      const plan = planFor("");
      expect(plan.soilTestAgeValidity).toEqual({
        status: "BLOCKED_INSUFFICIENT_EVIDENCE",
        reasonCode: "UNKNOWN_BLOCK",
        missingInputs: ["soil test sample/report date"],
      });
      expect(plan.napCompliance.status).toBe("OK");
      if (plan.napCompliance.status === "OK") {
        expect(plan.napCompliance.value.regulatory).toBe("planning_advice");
        expect(plan.napCompliance.value.soilTestValidityUnresolvedReason).toMatch(/no usable sample date/);
        // Blocked is neither reinterpreted as disregarded nor as non-lab.
        expect(plan.napCompliance.value.soilTestDisregardedReason).toBeUndefined();
        expect(plan.napCompliance.value.pIndexNotLaboratoryReason).toBeUndefined();
      }
    });

    it("B: the laboratory result is preserved", () => {
      const plan = planFor("");
      expect(plan.soilIndexProvenance?.p.basis).toBe("laboratory");
      expect(plan.soilIndexProvenance?.p.laboratory).toMatchObject({ value: 2, status: "verified", source: "Soil test lab" });
    });

    it("C: the agronomic/planning value remains available and matches a validly-dated plan", () => {
      const undated = planFor("");
      const dated = planFor("2025-01-01");
      expect(undated.fertilityEvidence.status).toBe("OK");
      expect(undated.requirement.value).toEqual(dated.requirement.value);
      expect(undated.napCompliance.status).toBe("OK");
      expect(dated.napCompliance.status).toBe("OK");
      if (undated.napCompliance.status === "OK" && dated.napCompliance.status === "OK") {
        expect(undated.napCompliance.value.pCeilingKgHa).toBeGreaterThan(0);
        expect(undated.napCompliance.value.pCeilingKgHa).toBe(dated.napCompliance.value.pCeilingKgHa);
      }
    });

    it("D: a genuinely VALID qualifying lab result still produces compliance_value", () => {
      const plan = planFor("2025-01-01");
      expect(plan.soilTestAgeValidity).toEqual({ status: "OK", value: "VALID", evidenceState: "MEASURED" });
      expect(plan.napCompliance.status).toBe("OK");
      if (plan.napCompliance.status === "OK") {
        expect(plan.napCompliance.value.regulatory).toBe("compliance_value");
        expect(plan.napCompliance.value.soilTestValidityUnresolvedReason).toBeUndefined();
      }
    });

    it("E: DISREGARD behaviour is unchanged", () => {
      const plan = planFor("2020-01-01");
      expect(plan.soilTestAgeValidity).toEqual({ status: "OK", value: "DISREGARD", evidenceState: "MEASURED" });
      expect(plan.napCompliance.status).toBe("OK");
      if (plan.napCompliance.status === "OK") {
        expect(plan.napCompliance.value.regulatory).toBe("planning_advice");
        expect(plan.napCompliance.value.soilTestDisregardedReason).toMatch(/disregarded/i);
        expect(plan.napCompliance.value.soilTestValidityUnresolvedReason).toBeUndefined();
      }
    });
  });

  it("INDEX4_PERSISTED (a real statutory exception, not a stale reading) does NOT downgrade the P ceiling either", () => {
    const fieldWithOldIndex4Test: Field = {
      ...field,
      id: "field-old-index4-no-downgrade",
      fertility: {
        ...field.fertility,
        pIndex: tracked(4, "verified", "Soil test lab"),
        verifiedTest: { sampleDate: "2020-01-01", laboratory: "Test Lab", sampleRef: "R3", p: 12, k: 150, pH: 6.4 },
      },
    };
    const plan = calculateNutrientPlan({
      field: fieldWithOldIndex4Test,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: undefined,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
      asOfDate: "2026-06-01",
    });
    expect(plan.soilTestAgeValidity.status).toBe("OK");
    if (plan.soilTestAgeValidity.status === "OK") expect(plan.soilTestAgeValidity.value).toBe("INDEX4_PERSISTED");
    expect(plan.napCompliance.status).toBe("OK");
    if (plan.napCompliance.status === "OK") {
      expect(plan.napCompliance.value.regulatory).toBe("compliance_value");
      expect(plan.napCompliance.value.soilTestDisregardedReason).toBeUndefined();
    }
  });

  // Golden-test reconciliation (GF20 system integration). This app has no
  // memoisation/cache layer between a field's soil P Index or a field's
  // slurry allocation and `calculateNutrientPlan` — every screen calls it
  // fresh from current store state on every render (src/app/nutrients/page.tsx).
  // These tests prove that structural property directly against the real
  // orchestration function, not by inspecting the store/React layer.
  it("GFT173: a real soil P correction recomputes the P ceiling, agronomic requirement, purchased blend and cost together — not independently stale", () => {
    const fieldOldP: Field = { ...field, id: "field-gft173", fertility: { ...field.fertility, pIndex: tracked(1, "verified", "Soil test lab") } };
    const fieldNewP: Field = { ...field, id: "field-gft173", fertility: { ...field.fertility, pIndex: tracked(3, "verified", "Soil test lab") } };
    const before = calculateNutrientPlan({ field: fieldOldP, farmGrasslandAreaHa: 27, livestockGroups: [], slurryAllocation: undefined, silage: { cutNumber: 1, expectedYieldTDMha: 5 } });
    const after = calculateNutrientPlan({ field: fieldNewP, farmGrasslandAreaHa: 27, livestockGroups: [], slurryAllocation: undefined, silage: { cutNumber: 1, expectedYieldTDMha: 5 } });
    // P_index: the input itself differs (sanity check on the test setup).
    expect(fieldOldP.fertility.pIndex?.value).not.toBe(fieldNewP.fertility.pIndex?.value);
    // nutrient_plan (agronomic P requirement) recomputed.
    expect(before.requirement.value.p).not.toBe(after.requirement.value.p);
    // fertiliser_purchase (purchased P product allocation) recomputed.
    const beforePCost = before.purchasedProducts.reduce((sum, p) => sum + p.costEur, 0);
    const afterPCost = after.purchasedProducts.reduce((sum, p) => sum + p.costEur, 0);
    expect(beforePCost).not.toBe(afterPCost);
    // finance (estimated field cost) recomputed.
    expect(before.estimatedFieldCostEur).not.toBe(after.estimatedFieldCostEur);
  });

  it("GFT175: a real change to a field's slurry K credit recomputes the chemical K top-up (bought K), not a stale figure", () => {
    const fieldK: Field = { ...field, id: "field-gft175" };
    const lowKSlurry = { fieldId: fieldK.id, housingId: "h1", priority: "high" as const, volumeM3: 10 * fieldK.areaHa, score: 90 };
    const highKSlurry = { fieldId: fieldK.id, housingId: "h1", priority: "high" as const, volumeM3: 40 * fieldK.areaHa, score: 90 };
    const before = calculateNutrientPlan({ field: fieldK, farmGrasslandAreaHa: 27, livestockGroups: [], slurryAllocation: lowKSlurry, silage: { cutNumber: 1, expectedYieldTDMha: 5 } });
    const after = calculateNutrientPlan({ field: fieldK, farmGrasslandAreaHa: 27, livestockGroups: [], slurryAllocation: highKSlurry, silage: { cutNumber: 1, expectedYieldTDMha: 5 } });
    expect(before.organicApplication.offsetK).not.toBe(after.organicApplication.offsetK);
    const beforeKCost = before.purchasedProducts.reduce((sum, p) => sum + p.costEur, 0);
    const afterKCost = after.purchasedProducts.reduce((sum, p) => sum + p.costEur, 0);
    // More real slurry K credit -> less (or equal, if already at zero) chemical top-up needed.
    expect(afterKCost).toBeLessThanOrEqual(beforeKCost);
    expect(before.estimatedFieldCostEur).not.toBe(after.estimatedFieldCostEur);
  });

  // Fertiliser Vertical V1, Checkpoint 3 — `netRequirement` (additive,
  // 2026-09-13): the campaign's own "(5) Net nutrient requirement" as a
  // first-class, separately inspectable value, distinct from
  // `requirement` (gross agronomic) and `organicApplication` (the
  // organic credit).
  describe("netRequirement (Fertiliser Vertical V1, Checkpoint 3)", () => {
    // Codex audit HIGH (round 1): this test originally asserted EXACT
    // equality with `requirement.value - organicApplication.offset*` —
    // both already rounded to the nearest whole kg/ha for display. That
    // is not what `netRequirement` actually computes (nor should it):
    // rounding each side before subtracting can disagree with rounding
    // the true, unrounded remaining amount whenever the fractional
    // remainders don't cancel (10.5 gross / 10.4 offset: real remaining
    // 0.1 rounds to 0, but round(10.5) - round(10.4) = 1) — exactly the
    // bug the fix corrected (`netRequirement` now rounds the same
    // unrounded `remainingN/P/K` fed to `allocatePurchasedProducts`, not
    // a second subtraction of two already-rounded numbers). The two can
    // therefore differ by at most 1 kg/ha at a rounding boundary — this
    // test asserts that real, bounded relationship instead of a false
    // exact one.
    it("is within 1 kg/ha of requirement minus the organic offset — the two roundings can disagree by at most a rounding boundary, never more", () => {
      const fieldWithSlurry: Field = { ...field, id: "field-net-req" };
      const slurry = { fieldId: fieldWithSlurry.id, housingId: "h1", priority: "high" as const, volumeM3: 20 * fieldWithSlurry.areaHa, score: 90 };
      const plan = calculateNutrientPlan({ field: fieldWithSlurry, farmGrasslandAreaHa: 27, livestockGroups: [], slurryAllocation: slurry, silage: { cutNumber: 1, expectedYieldTDMha: 5 } });

      expect(Math.abs(plan.netRequirement.value.n - Math.max(0, plan.requirement.value.n - plan.organicApplication.offsetN))).toBeLessThanOrEqual(1);
      expect(Math.abs(plan.netRequirement.value.p - Math.max(0, plan.requirement.value.p - plan.organicApplication.offsetP))).toBeLessThanOrEqual(1);
      expect(Math.abs(plan.netRequirement.value.k - Math.max(0, plan.requirement.value.k - plan.organicApplication.offsetK))).toBeLessThanOrEqual(1);
    });

    it("with no organic application at all, equals the gross requirement exactly", () => {
      const plan = calculateNutrientPlan({ field, farmGrasslandAreaHa: 27, livestockGroups: [], slurryAllocation: undefined, silage: { cutNumber: 1, expectedYieldTDMha: 5 } });
      expect(plan.organicApplication.offsetN).toBe(0);
      expect(plan.netRequirement.value).toEqual(plan.requirement.value);
    });

    it("never goes negative — floors at 0 even if a large organic credit exceeds the gross requirement", () => {
      const fieldHeavySlurry: Field = { ...field, id: "field-net-req-heavy" };
      const heavySlurry = { fieldId: fieldHeavySlurry.id, housingId: "h1", priority: "high" as const, volumeM3: 60 * fieldHeavySlurry.areaHa, score: 90 };
      const plan = calculateNutrientPlan({ field: fieldHeavySlurry, farmGrasslandAreaHa: 27, livestockGroups: [], slurryAllocation: heavySlurry, silage: { cutNumber: 1, expectedYieldTDMha: 5 } });
      expect(plan.netRequirement.value.k).toBeGreaterThanOrEqual(0);
      expect(plan.netRequirement.value.p).toBeGreaterThanOrEqual(0);
      expect(plan.netRequirement.value.n).toBeGreaterThanOrEqual(0);
    });

    it("is zeroed and marked unavailable, matching requirement's own fail-closed status, when fertility evidence is missing", () => {
      const fieldNoFertility: Field = { ...field, id: "field-no-fert", fertility: {} };
      const plan = calculateNutrientPlan({ field: fieldNoFertility, farmGrasslandAreaHa: 27, livestockGroups: [], slurryAllocation: undefined, silage: { cutNumber: 1, expectedYieldTDMha: 5 } });
      expect(plan.requirement.status).toBe("unavailable");
      expect(plan.netRequirement.status).toBe("unavailable");
      expect(plan.netRequirement.value).toEqual({ n: 0, p: 0, k: 0 });
    });
  });

  // Codex audit CRITICAL (round 26): a field's own recorded `plannedUse`
  // (a silage cut) was never checked against whether a real `silage`
  // input was actually supplied — this app has no real, persisted
  // `SilagePlan` source, so every real caller either omits `silage` or
  // passes `silagePlans: []`, meaning a real silage field silently ran
  // the grazing branch and got a full, actionable grazing-basis
  // recommendation instead of failing closed.
  describe("silage-evidence gate (Codex audit CRITICAL, round 26)", () => {
    it("fails closed — never a fabricated grazing recommendation — for a field planned as a silage cut with no real silage plan supplied", () => {
      const plan = calculateNutrientPlan({
        field, // plannedUse: "silage_1st_cut", no `silage` input
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: undefined,
      });
      expect(plan.requirement.status).toBe("unavailable");
      expect(plan.requirement.value).toEqual({ n: 0, p: 0, k: 0 });
      expect(plan.purchasedProducts).toEqual([]);
      expect(plan.estimatedFieldCostEur).toBe(0);
      expect(plan.napCompliance.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      if (plan.napCompliance.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
        expect(plan.napCompliance.reasonCode).toBe("MISSING_SILAGE_PLAN_DATA");
      }
    });

    it("computes the real silage plan normally once a matching real `silage` input is supplied — the gate is additive, not a regression", () => {
      const plan = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: undefined,
        silage: { cutNumber: 1, expectedYieldTDMha: 5 },
      });
      expect(plan.requirement.status).toBe("estimated");
      expect(plan.purchasedProducts.length).toBeGreaterThan(0);
    });

    it("never applies the silage gate to a genuinely grazing field, even with no `silage` input", () => {
      const grazingField: Field = { ...field, plannedUse: tracked("grazing", "farmer_adjusted", "Keith") };
      const plan = calculateNutrientPlan({
        field: grazingField,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: undefined,
      });
      expect(plan.requirement.status).toBe("estimated");
    });

    it("never applies the silage gate to a tillage field, even though it also has no `silage` input", () => {
      const tillageField: Field = { ...field, plannedUse: tracked("tillage", "farmer_adjusted", "Keith") };
      const plan = calculateNutrientPlan({
        field: tillageField,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: undefined,
      });
      // Tillage is gated by every real caller before calculateNutrientPlan
      // is ever invoked (this app has no tillage N/P/K table at all) —
      // this engine itself has no tillage-specific branch, so calling it
      // directly for a tillage field still runs the grazing formula here;
      // this test only proves the NEW silage gate doesn't misfire for it.
      expect(plan.napCompliance.status === "BLOCKED_INSUFFICIENT_EVIDENCE" ? plan.napCompliance.reasonCode : undefined).not.toBe(
        "MISSING_SILAGE_PLAN_DATA",
      );
    });

    it("still reports the fertility-evidence block reason when both fertility and silage evidence are missing", () => {
      const noFertilityField: Field = { ...field, fertility: {} };
      const plan = calculateNutrientPlan({
        field: noFertilityField,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: undefined,
      });
      expect(plan.napCompliance.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      if (plan.napCompliance.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
        expect(plan.napCompliance.reasonCode).toBe("MISSING_SOIL_FERTILITY_INDEX");
      }
    });

    it("organicApplication's offset figures are unaffected by the silage gate — slurryAvailableKgHa is not land-use dependent", () => {
      const withSilageEvidence = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: { fieldId: field.id, housingId: "h1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 },
        silage: { cutNumber: 1, expectedYieldTDMha: 5 },
      });
      const withoutSilageEvidence = calculateNutrientPlan({
        field,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: { fieldId: field.id, housingId: "h1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 },
      });
      expect(withoutSilageEvidence.organicApplication.offsetN).toBe(withSilageEvidence.organicApplication.offsetN);
      expect(withoutSilageEvidence.organicApplication.offsetP).toBe(withSilageEvidence.organicApplication.offsetP);
      expect(withoutSilageEvidence.organicApplication.offsetK).toBe(withSilageEvidence.organicApplication.offsetK);
    });
  });

  // Codex audit CRITICAL (round 28): `types.ts`'s own `Field.plannedUse`
  // doc comment already required "must treat an absent plannedUse as
  // unresolved, not grazing" for a legal/compliance calculation like
  // NAP's own grazing-vs-cut-only classification — a real, brand-new
  // field (mapped but not yet classified on Field Detail,
  // `FieldDrawer.tsx`'s own "not set" state) reaching this vertical's
  // real orchestration layer (`buildAllRealPrompts` has no plannedUse
  // filter) got a confidently-classified `compliance_value` NAP ceiling
  // assuming grazing, never disclosed as an assumption.
  describe("unresolved plannedUse downgrades NAP compliance to planning advice (Codex audit CRITICAL, round 28)", () => {
    it("downgrades regulatory to planning_advice and carries a real reason when plannedUse has never been recorded", () => {
      const unresolvedField: Field = { ...field, plannedUse: undefined };
      const plan = calculateNutrientPlan({
        field: unresolvedField,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: undefined,
      });
      expect(plan.napCompliance.status).toBe("OK");
      if (plan.napCompliance.status === "OK") {
        expect(plan.napCompliance.value.regulatory).toBe("planning_advice");
        expect(plan.napCompliance.value.landUse).toBe("grazing");
        expect(plan.napCompliance.value.plannedUseUnresolvedReason).toMatch(/hasn.t been recorded yet/i);
      }
    });

    it("never downgrades when plannedUse is explicitly recorded as grazing — a real, confirmed land use", () => {
      const grazingField: Field = { ...field, plannedUse: tracked("grazing", "farmer_adjusted", "Keith"), fertility: { ...field.fertility, pIndex: tracked(3, "verified", "Lab") } };
      const plan = calculateNutrientPlan({
        field: grazingField,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: undefined,
      });
      expect(plan.napCompliance.status).toBe("OK");
      if (plan.napCompliance.status === "OK") {
        expect(plan.napCompliance.value.regulatory).toBe("compliance_value");
        expect(plan.napCompliance.value.plannedUseUnresolvedReason).toBeUndefined();
      }
    });

    it("never downgrades when a real silage input is supplied, even with no plannedUse recorded — the silage evidence itself confirms the land use", () => {
      const unresolvedField: Field = { ...field, plannedUse: undefined, fertility: { ...field.fertility, pIndex: tracked(3, "verified", "Lab") } };
      const plan = calculateNutrientPlan({
        field: unresolvedField,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: undefined,
        silage: { cutNumber: 1, expectedYieldTDMha: 5 },
      });
      expect(plan.napCompliance.status).toBe("OK");
      if (plan.napCompliance.status === "OK") {
        expect(plan.napCompliance.value.regulatory).toBe("compliance_value");
        expect(plan.napCompliance.value.plannedUseUnresolvedReason).toBeUndefined();
      }
    });

    it("the agronomic N/P/K requirement itself is deliberately unaffected — the two ledgers are never gated against each other", () => {
      const unresolvedField: Field = { ...field, plannedUse: undefined };
      const withUnresolved = calculateNutrientPlan({
        field: unresolvedField,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: undefined,
      });
      const grazingField: Field = { ...field, plannedUse: tracked("grazing", "farmer_adjusted", "Keith") };
      const withGrazing = calculateNutrientPlan({
        field: grazingField,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: undefined,
      });
      expect(withUnresolved.requirement.value).toEqual(withGrazing.requirement.value);
      expect(withUnresolved.requirement.status).toBe(withGrazing.requirement.status);
    });

    it("both real reasons can apply at once — a disregarded soil test AND an unresolved plannedUse", () => {
      const unresolvedOldTestField: Field = {
        ...field,
        plannedUse: undefined,
        fertility: { ...field.fertility, verifiedTest: { sampleDate: "2020-01-01", laboratory: "Test Lab", sampleRef: "R1", p: 6, k: 100, pH: 6.1 } },
      };
      const plan = calculateNutrientPlan({
        field: unresolvedOldTestField,
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: undefined,
        asOfDate: "2026-08-01",
      });
      expect(plan.napCompliance.status).toBe("OK");
      if (plan.napCompliance.status === "OK") {
        expect(plan.napCompliance.value.regulatory).toBe("planning_advice");
        expect(plan.napCompliance.value.soilTestDisregardedReason).toBeDefined();
        expect(plan.napCompliance.value.plannedUseUnresolvedReason).toBeDefined();
      }
    });
  });
});

// Codex audit HIGH (round 31): the real schema (`unique (field_id,
// housing_id)`) permits more than one real slurry allocation per field,
// one per housing source — every real call site used a bare `.find()`,
// silently discarding a real second allocation and non-deterministically
// depending on database row order.
describe("resolveFieldSlurryAllocation", () => {
  function allocation(overrides: Partial<SlurryAllocation> = {}): SlurryAllocation {
    return { fieldId: "field-1", housingId: "h1", priority: "high", volumeM3: 100, score: 90, ...overrides };
  }

  it("returns undefined when the field has no real allocation", () => {
    expect(resolveFieldSlurryAllocation([allocation({ fieldId: "field-2" })], "field-1")).toBeUndefined();
  });

  it("returns the single real allocation unchanged when there is only one — fully backward compatible", () => {
    const a = allocation();
    expect(resolveFieldSlurryAllocation([a], "field-1")).toBe(a);
  });

  it("sums the real volume of two real allocations from different housing sources for the same field", () => {
    const a = allocation({ housingId: "h1", volumeM3: 100 });
    const b = allocation({ housingId: "h2", volumeM3: 60 });
    const result = resolveFieldSlurryAllocation([a, b], "field-1");
    expect(result?.volumeM3).toBe(160);
  });

  it("excludes a genuinely not_suitable allocation from the sum, but still counts a real applicable one", () => {
    const notSuitable = allocation({ housingId: "h1", priority: "not_suitable", volumeM3: 200 });
    const applicable = allocation({ housingId: "h2", priority: "high", volumeM3: 60 });
    const result = resolveFieldSlurryAllocation([notSuitable, applicable], "field-1");
    expect(result?.volumeM3).toBe(60);
  });

  it("returns undefined when every real allocation for the field is not_suitable", () => {
    const a = allocation({ housingId: "h1", priority: "not_suitable" });
    const b = allocation({ housingId: "h2", priority: "not_suitable" });
    expect(resolveFieldSlurryAllocation([a, b], "field-1")).toBeUndefined();
  });

  it("carries the shared applicationMethod through when every contributing allocation agrees", () => {
    const a = allocation({ housingId: "h1", applicationMethod: tracked("LESS", "verified", "Farmer") });
    const b = allocation({ housingId: "h2", applicationMethod: tracked("LESS", "verified", "Farmer") });
    const result = resolveFieldSlurryAllocation([a, b], "field-1");
    expect(result?.applicationMethod?.value).toBe("LESS");
  });

  it("fails closed to no applicationMethod when contributing allocations genuinely disagree — never guesses which one governs", () => {
    const a = allocation({ housingId: "h1", applicationMethod: tracked("LESS", "verified", "Farmer") });
    const b = allocation({ housingId: "h2", applicationMethod: tracked("splashplate", "verified", "Farmer") });
    const result = resolveFieldSlurryAllocation([a, b], "field-1");
    expect(result?.applicationMethod).toBeUndefined();
    // Codex audit HIGH (round 32): this IS a genuine conflict (two real,
    // different captured methods) — must be flagged as such, not
    // reported the same as "never captured".
    expect(result?.applicationMethodConflict).toBe(true);
  });

  it("fails closed to no applicationMethod when any contributing allocation's method was never captured", () => {
    const a = allocation({ housingId: "h1", applicationMethod: tracked("LESS", "verified", "Farmer") });
    const b = allocation({ housingId: "h2", applicationMethod: undefined });
    const result = resolveFieldSlurryAllocation([a, b], "field-1");
    expect(result?.applicationMethod).toBeUndefined();
    // Codex audit HIGH (round 32): only one real method was ever
    // captured here (the other allocation simply never recorded one) —
    // this is NOT a genuine conflict, just incomplete capture.
    expect(result?.applicationMethodConflict).toBe(false);
  });

  it("takes 'high' priority when any real contributing allocation is high, even if another is only medium", () => {
    const a = allocation({ housingId: "h1", priority: "medium" });
    const b = allocation({ housingId: "h2", priority: "high" });
    const result = resolveFieldSlurryAllocation([a, b], "field-1");
    expect(result?.priority).toBe("high");
  });

  it("the combined allocation feeds calculateNutrientPlan correctly — the real offset reflects the full summed volume, not just one allocation's", () => {
    const field: Field = {
      id: "field-1",
      farmId: "farm-test",
      name: "Test Field",
      areaHa: 10,
      centroid: [0, 0],
      plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
      fertility: { pIndex: tracked(3, "farmer_adjusted", "Keith"), kIndex: tracked(3, "farmer_adjusted", "Keith") },
      history: [],
    };
    const single = allocation({ housingId: "h1", volumeM3: 100 });
    const split: SlurryAllocation[] = [allocation({ housingId: "h1", volumeM3: 60 }), allocation({ housingId: "h2", volumeM3: 40 })];

    const planWithSingle = calculateNutrientPlan({ field, farmGrasslandAreaHa: 27, livestockGroups: [], slurryAllocation: single });
    const resolvedSplit = resolveFieldSlurryAllocation(split, "field-1");
    const planWithSplit = calculateNutrientPlan({ field, farmGrasslandAreaHa: 27, livestockGroups: [], slurryAllocation: resolvedSplit });

    // Same real total volume (100 m³), split across two real housing
    // sources instead of one — the organic offset must be identical.
    expect(planWithSplit.organicApplication.offsetN).toBe(planWithSingle.organicApplication.offsetN);
    expect(planWithSplit.organicApplication.totalM3).toBe(planWithSingle.organicApplication.totalM3);
  });
});

describe("knownFertiliserProductComposition", () => {
  it("returns the real, verified composition for each of the three catalogue products", () => {
    expect(knownFertiliserProductComposition("0-7-30")).toEqual({ name: "0-7-30", nPct: 0, pPct: 0.07, kPct: 0.3 });
    expect(knownFertiliserProductComposition("18-6-12")).toEqual({ name: "18-6-12", nPct: 0.18, pPct: 0.06, kPct: 0.12 });
    expect(knownFertiliserProductComposition("Protected Urea")).toEqual({ name: "Protected Urea", nPct: 0.46, pPct: 0, kPct: 0 });
  });

  it("fails closed (undefined) for any product not in the real, verified catalogue", () => {
    expect(knownFertiliserProductComposition("CAN 27%")).toBeUndefined();
    expect(knownFertiliserProductComposition("protected urea")).toBeUndefined(); // case-sensitive — never a fuzzy match
    expect(knownFertiliserProductComposition("")).toBeUndefined();
  });
});

// Campaign C verified-rules checkpoint (2026-09-29) — implementation status of
// the REPOSITORY_VERIFIED Teagasc rules within the existing engine. No
// production output changes (the engine has since moved to
// nutrient_engine_v1.4.0 for per-nutrient P/K Increments 2 and 3 only).
describe("Campaign C verified rules within the existing engine", () => {
  it("P/K first-cut yield scaling is ALREADY_IMPLEMENTED and matches the stored Teagasc rows (Index 3, 5 and 6 t DM/ha)", () => {
    // `CLM-TGC-YIELD-SCALE` Table 1: 5 t -> P 20 / K 125; 6 t -> P 24 / K 150.
    expect(pMaintenanceSilageKgHa(1, 3, 5)).toBe(20);
    expect(pMaintenanceSilageKgHa(1, 3, 6)).toBe(24);
    expect(pMaintenanceSilageKgHa(1, 3, 4)).toBe(16);
    expect(kSilageKgHa(1, 3, 5)).toBe(125);
    expect(kSilageKgHa(1, 3, 6)).toBe(150);
    expect(kSilageKgHa(1, 3, 4)).toBe(100);
  });

  it("N yield scaling is IMPLEMENTATION_DEFERRED_SUPPORTED_RANGE_UNCLEAR: the first-cut N rate does not vary with yield", () => {
    // The source's 5 t row (N 125) matches the existing rate; its 6 t row
    // (N 150) is not implemented until a supported yield range is stored.
    expect(nSilageKgHa(1, false)).toBe(125);
    expect(nSilageKgHa(1, true)).toBe(100);
  });

  it("no rate selector exists in the engine (AI_PROVISIONAL_RATE_SELECTOR_V1 is not implemented)", async () => {
    const engine = await import("./nutrients");
    expect(Object.keys(engine).filter((k) => /rate.?selector|selectSlurryRate/i.test(k))).toEqual([]);
    expect(NUTRIENT_ENGINE_VERSION).toBe("nutrient_engine_v1.4.0");
  });
});

// Campaign C per-nutrient P/K, Increment 1 (CP1 Target A,
// docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md §4 row 1) —
// `fertilityEvidenceByNutrient` is additive: every pre-existing field is
// identical to the pre-change engine. `nutrients.fertility-evidence-baseline.json`
// holds a SHA-256 of each case's plan (minus the new field), generated from
// the engine at b4d3c29 with the same matrix and a fixed `asOfDate`.
describe("fertilityEvidenceByNutrient (per-nutrient P/K Increment 1)", () => {
  const field: Field = {
    id: "field-pk1",
    farmId: "farm-pk1",
    name: "PK1 Field",
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
    fertility: {},
    history: [],
  };
  const baseAllocation: SlurryAllocation = { fieldId: field.id, housingId: "housing-1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 };
  const methods: [string, SlurryAllocation][] = [
    ["splashplate", { ...baseAllocation, applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") }],
    ["spring LESS", { ...baseAllocation, applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"), applicationDate: tracked("2027-03-15", "farmer_adjusted", "Keith") }],
    ["summer LESS", { ...baseAllocation, applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"), applicationDate: tracked("2026-06-10", "farmer_adjusted", "Keith") }],
    ["assumed default", baseAllocation],
  ];
  const statuses = ["verified", "farmer_adjusted", "estimated"] as const;
  const indices = [1, 2, 3, 4] as const;
  const presences = ["both", "P only", "K only", "neither"] as const;
  const fertilityFor = (presence: (typeof presences)[number], index: 1 | 2 | 3 | 4, status: (typeof statuses)[number]): Field["fertility"] => {
    const value = tracked(index, status, "Lab");
    if (presence === "both") return { pIndex: value, kIndex: value };
    if (presence === "P only") return { pIndex: value };
    if (presence === "K only") return { kIndex: value };
    return {};
  };
  const planFor = (allocation: SlurryAllocation, fertility: Field["fertility"]) =>
    calculateNutrientPlan({
      field: { ...field, fertility },
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: allocation,
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      asOfDate: "2026-10-02",
    });
  // Increment 2 extends the comparison: it also excludes
  // `organicApplication.availableNutrientByNutrient`, and normalises only
  // `calculationVersion` values from v1.3.0 back to v1.2.0 (the baseline's
  // engine). Increment 3 also excludes `requirementByNutrient` /
  // `netRequirementByNutrient` and maps v1.4.0 back to v1.2.0 instead.
  // CC-B6 also excludes `organicApplication.availableNutrientBasis` (no
  // version change). Fertiliser Vertical Increment 1 also excludes the
  // additive canonical `fieldRequirement` (no version change), and
  // Increment 2b the additive `fieldRemainingRequirement` (no version
  // change). Nothing else is normalised.
  const digestWithoutNewField = (plan: NutrientPlan) => {
    const existing: Partial<NutrientPlan> = { ...plan };
    delete existing.fertilityEvidenceByNutrient;
    delete existing.fieldRequirement;
    delete existing.fieldRemainingRequirement;
    delete existing.requirementByNutrient;
    delete existing.netRequirementByNutrient;
    const organicApplication: Partial<NutrientPlan["organicApplication"]> = { ...plan.organicApplication };
    delete organicApplication.availableNutrientByNutrient;
    delete organicApplication.availableNutrientBasis;
    existing.organicApplication = organicApplication as NutrientPlan["organicApplication"];
    const json = JSON.stringify(existing, (key, value) =>
      key === "calculationVersion" && value === "nutrient_engine_v1.4.0" ? "nutrient_engine_v1.2.0" : value,
    );
    return createHash("sha256").update(json).digest("hex");
  };
  const baseline = fertilityEvidenceBaseline as Record<string, string>;

  for (const [methodName, allocation] of methods) {
    for (const presence of presences) {
      for (const index of indices) {
        for (const status of statuses) {
          const key = `${methodName} | ${presence} | Index ${index} | ${status}`;
          it(key, () => {
            const plan = planFor(allocation, fertilityFor(presence, index, status));
            const { p, k } = plan.fertilityEvidenceByNutrient;
            const expectedState = status === "verified" ? "MEASURED" : "IRISH_DEFAULT";
            for (const [arm, present, input] of [
              [p, presence === "both" || presence === "P only", "fertility.pIndex"],
              [k, presence === "both" || presence === "K only", "fertility.kIndex"],
            ] as const) {
              if (present) {
                expect(arm).toEqual({ status: "OK", value: { index }, evidenceState: expectedState });
              } else {
                expect(arm).toEqual({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: [input] });
              }
            }
            // The paired outcome is the conjunction of the arms.
            if (presence === "both") {
              expect(plan.fertilityEvidence).toEqual({ status: "OK", value: { pIndex: index, kIndex: index }, evidenceState: expectedState });
            } else {
              expect(plan.fertilityEvidence).toEqual({
                status: "BLOCKED_INSUFFICIENT_EVIDENCE",
                reasonCode: "MISSING_SOIL_FERTILITY_INDEX",
                missingInputs: [...(p.status === "OK" ? [] : ["fertility.pIndex"]), ...(k.status === "OK" ? [] : ["fertility.kIndex"])],
              });
            }
            // Every pre-existing field (including the retained-N offsetN
            // for missing-index cases) equals the pre-change engine.
            expect(baseline[key]).toBeDefined();
            expect(digestWithoutNewField(plan)).toBe(baseline[key]);
            expect(plan.calculationVersion).toBe("nutrient_engine_v1.4.0");
          });
        }
      }
    }
  }

  it("covers every baseline case exactly once", () => {
    expect(Object.keys(baseline)).toHaveLength(methods.length * presences.length * indices.length * statuses.length);
  });

  it("status precedence is per arm: a verified index is MEASURED even when the other is farmer_adjusted or estimated", () => {
    for (const other of ["farmer_adjusted", "estimated"] as const) {
      const pVerified = planFor(baseAllocation, { pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(3, other, "Keith") });
      expect(pVerified.fertilityEvidenceByNutrient.p).toEqual({ status: "OK", value: { index: 2 }, evidenceState: "MEASURED" });
      expect(pVerified.fertilityEvidenceByNutrient.k).toEqual({ status: "OK", value: { index: 3 }, evidenceState: "IRISH_DEFAULT" });
      expect(pVerified.fertilityEvidence).toEqual({ status: "OK", value: { pIndex: 2, kIndex: 3 }, evidenceState: "IRISH_DEFAULT" });

      const kVerified = planFor(baseAllocation, { pIndex: tracked(2, other, "Keith"), kIndex: tracked(3, "verified", "Lab") });
      expect(kVerified.fertilityEvidenceByNutrient.p).toEqual({ status: "OK", value: { index: 2 }, evidenceState: "IRISH_DEFAULT" });
      expect(kVerified.fertilityEvidenceByNutrient.k).toEqual({ status: "OK", value: { index: 3 }, evidenceState: "MEASURED" });
      expect(kVerified.fertilityEvidence).toEqual({ status: "OK", value: { pIndex: 2, kIndex: 3 }, evidenceState: "IRISH_DEFAULT" });

      // A known arm keeps its own state when the other index is missing.
      const pOnly = planFor(baseAllocation, { pIndex: tracked(4, other, "Keith") });
      expect(pOnly.fertilityEvidenceByNutrient.p).toEqual({ status: "OK", value: { index: 4 }, evidenceState: "IRISH_DEFAULT" });
    }
    const bothVerified = planFor(baseAllocation, { pIndex: tracked(1, "verified", "Lab"), kIndex: tracked(4, "verified", "Lab") });
    expect(bothVerified.fertilityEvidence).toEqual({ status: "OK", value: { pIndex: 1, kIndex: 4 }, evidenceState: "MEASURED" });
  });
});

// Campaign C per-nutrient P/K, Increment 2 (CP4 only after the F001
// descope, docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md §4
// row 2) — the per-nutrient slurry credit, from the same table selection
// as the paired assessment. The internal Index-1 placeholder stays (CC-B5,
// CP3 blocked); no arm reads it. The baseline matrix above proves every
// pre-existing output is unchanged.
describe("availableNutrientByNutrient (per-nutrient P/K Increment 2)", () => {
  type Idx = 1 | 2 | 3 | 4;
  const field: Field = {
    id: "field-pk2",
    farmId: "farm-pk2",
    name: "PK2 Field",
    areaHa: 6.8,
    centroid: [0, 0],
    plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Keith"),
    fertility: {},
    history: [],
  };
  const baseAllocation: SlurryAllocation = { fieldId: field.id, housingId: "housing-1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 };
  const rate = baseAllocation.volumeM3 / field.areaHa;
  const composition = (dmPct: number, status: SlurryComposition["status"]): SlurryComposition => ({
    id: `comp-pk2-${dmPct}`,
    farmId: field.farmId,
    housingId: "housing-1",
    slurryType: "cattle_slurry",
    status,
    dmPct,
    sampleDate: "2026-06-10",
    source: "Southern Agri Labs report",
    recordedAt: "2026-06-12T09:00:00.000Z",
  });
  const methods: [string, Partial<SlurryAllocation>][] = [
    ["splashplate", { applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") }],
    ["LESS", { applicationMethod: tracked("LESS", "farmer_adjusted", "Keith") }],
    ["incorporate_24h", { applicationMethod: tracked("incorporate_24h", "farmer_adjusted", "Keith") }],
    ["no method (assumed)", {}],
  ];
  const timings: [string, string | undefined][] = [
    ["no date", undefined],
    ["spring", "2027-03-15"],
    ["summer", "2026-06-10"],
    ["late summer", "2026-09-10"],
  ];
  const dms: [string, SlurryComposition | undefined][] = [
    ["national average DM", undefined],
    ["verified 6% DM", composition(6, "verified")],
    ["farmer 8% DM", composition(8, "farmer_adjusted")],
  ];
  const indices = [1, 2, 3, 4] as const;
  const fertilities: { p?: Idx; k?: Idx }[] = [
    {},
    ...indices.map((p) => ({ p })),
    ...indices.map((k) => ({ k })),
    ...indices.flatMap((p) => indices.map((k) => ({ p, k }))),
  ];
  const fertilityOf = (f: { p?: Idx; k?: Idx }): Field["fertility"] => ({
    ...(f.p !== undefined ? { pIndex: tracked(f.p, "verified", "Lab") } : {}),
    ...(f.k !== undefined ? { kIndex: tracked(f.k, "verified", "Lab") } : {}),
  });
  const allocationFor = (method: Partial<SlurryAllocation>, date: string | undefined): SlurryAllocation => ({
    ...baseAllocation,
    ...method,
    ...(date !== undefined ? { applicationDate: tracked(date, "farmer_adjusted", "Keith") } : {}),
  });
  const planFor = (
    allocation: NonNullable<Parameters<typeof calculateNutrientPlan>[0]["slurryAllocation"]>,
    slurryComposition: SlurryComposition | undefined,
    f: { p?: Idx; k?: Idx },
    extra: Partial<Field> = {},
  ) =>
    calculateNutrientPlan({
      field: { ...field, ...extra, fertility: fertilityOf(f) },
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: allocation,
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      slurryComposition,
      asOfDate: "2026-10-02",
    });
  // The fully indexed paired resolver (signature unchanged) is the reference.
  const reference = (allocation: SlurryAllocation, slurryComposition: SlurryComposition | undefined, pIndex: Idx, kIndex: Idx) =>
    resolveAvailableSlurryNutrients({
      allocation,
      applicationRateM3ha: rate,
      dmPct: slurryComposition?.dmPct ?? NATIONAL_AVG_SLURRY_DM_PCT,
      dmPctStatus: slurryComposition?.status ?? "estimated",
      pIndex,
      kIndex,
    });

  // CC-B6: the paired assessment's basis fields — everything but the
  // index-dependent figures.
  const basisFields = (value: Extract<ReturnType<typeof reference>, { status: "OK" }>["value"]) => {
    const fields: Partial<typeof value> = { ...value };
    delete fields.n;
    delete fields.p;
    delete fields.k;
    delete fields.unit;
    delete fields.soilIndexAdjustmentApplied;
    return fields;
  };

  for (const [methodName, method] of methods) {
    for (const [timingName, date] of timings) {
      for (const [dmName, slurryComposition] of dms) {
        it(`${methodName} | ${timingName} | ${dmName}: each arm follows its own index; table-level blocks block every arm`, () => {
          const allocation = allocationFor(method, date);
          const table = reference(allocation, slurryComposition, 3, 3);
          for (const f of fertilities) {
            const plan = planFor(allocation, slurryComposition, f);
            const arms = plan.organicApplication.availableNutrientByNutrient;
            const paired = plan.organicApplication.availableNutrientAssessment;

            const basis = plan.organicApplication.availableNutrientBasis;
            if (table.status !== "OK") {
              // Table-level block: every arm is the paired outcome itself.
              expect(arms).toEqual({ n: table, p: table, k: table });
              // CC-B6: the basis carries the same table-level block.
              expect(basis).toEqual(table);
              expect(paired).toEqual(table);
              expect(plan.organicApplication.offsetN).toBe(0);
              continue;
            }

            expect(arms.n).toEqual({ status: "OK", value: { kgHa: table.value.n }, evidenceState: table.evidenceState });
            // CC-B6: the basis is OK independent of the indices and equals
            // the fully indexed reference's basis fields.
            expect(basis).toEqual({ status: "OK", value: basisFields(table.value), evidenceState: table.evidenceState });
            if (slurryComposition === undefined) expect(table.evidenceState).not.toBe("MEASURED");

            if (f.p !== undefined) {
              // Own index only: the reference's P with any K Index.
              for (const otherK of indices) {
                const r = reference(allocation, slurryComposition, f.p, otherK);
                if (r.status !== "OK") throw new Error("reference should be OK");
                expect(arms.p).toEqual({ status: "OK", value: { kgHa: r.value.p, soilIndexAdjustmentApplied: f.p <= 2 }, evidenceState: table.evidenceState });
              }
            } else {
              expect(arms.p).toEqual({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: ["fertility.pIndex"] });
            }
            if (f.k !== undefined) {
              for (const otherP of indices) {
                const r = reference(allocation, slurryComposition, otherP, f.k);
                if (r.status !== "OK") throw new Error("reference should be OK");
                expect(arms.k).toEqual({ status: "OK", value: { kgHa: r.value.k, soilIndexAdjustmentApplied: f.k <= 2 }, evidenceState: table.evidenceState });
              }
            } else {
              expect(arms.k).toEqual({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: ["fertility.kIndex"] });
            }

            if (f.p !== undefined && f.k !== undefined) {
              // Fully indexed: the arms equal the paired assessment.
              if (paired.status !== "OK" || arms.n.status !== "OK" || arms.p.status !== "OK" || arms.k.status !== "OK") throw new Error("expected OK");
              expect(arms.n.value.kgHa).toBe(paired.value.n);
              expect(arms.p.value.kgHa).toBe(paired.value.p);
              expect(arms.k.value.kgHa).toBe(paired.value.k);
              expect({ p: arms.p.value.soilIndexAdjustmentApplied, k: arms.k.value.soilIndexAdjustmentApplied }).toEqual(paired.value.soilIndexAdjustmentApplied);
              expect(paired.evidenceState).toBe(arms.n.evidenceState);
              if (basis.status !== "OK") throw new Error("expected OK");
              expect(basis.value).toEqual(basisFields(paired.value));
              expect(basis.evidenceState).toBe(paired.evidenceState);
            } else {
              // CC-B2 / CC-B4A: the paired assessment stays blocked; the
              // retained N equals the N arm; P/K offsets stay 0.
              expect(paired).toEqual({
                status: "BLOCKED_INSUFFICIENT_EVIDENCE",
                reasonCode: "MISSING_SOIL_FERTILITY_INDEX",
                missingInputs: [...(f.p === undefined ? ["fertility.pIndex"] : []), ...(f.k === undefined ? ["fertility.kIndex"] : [])],
              });
              expect(plan.organicApplication.offsetN).toBe(Math.round(table.value.n));
              expect(plan.organicApplication.offsetP).toBe(0);
              expect(plan.organicApplication.offsetK).toBe(0);
            }
          }
        });
      }
    }
  }

  it("spring LESS at a verified 6% DM: a known P or K arm carries its own Index 1/2 factor alone (CC-B2 figures)", () => {
    const allocation = allocationFor(methods[1][1], "2027-03-15");
    // 33 m3/ha at 6% DM: n=33, p=0.5*33=16.5 (x0.5 at P Index 1/2), k=3.5*33=115.5 (x0.9 at K Index 1/2).
    const pOnly = planFor(allocation, composition(6, "verified"), { p: 2 }).organicApplication.availableNutrientByNutrient;
    expect(pOnly.n).toEqual({ status: "OK", value: { kgHa: 33 }, evidenceState: "MEASURED" });
    expect(pOnly.p).toEqual({ status: "OK", value: { kgHa: 8.25, soilIndexAdjustmentApplied: true }, evidenceState: "MEASURED" });
    expect(pOnly.k.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    const kOnly = planFor(allocation, composition(6, "verified"), { k: 1 }).organicApplication.availableNutrientByNutrient;
    expect(kOnly.p.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(kOnly.k.status === "OK" && kOnly.k.value.kgHa).toBeCloseTo(103.95, 10);
    const kHigh = planFor(allocation, composition(6, "verified"), { k: 3 }).organicApplication.availableNutrientByNutrient;
    expect(kHigh.k).toEqual({ status: "OK", value: { kgHa: 115.5, soilIndexAdjustmentApplied: false }, evidenceState: "MEASURED" });
  });

  it("an unresolved slurry composition blocks every arm, and the retained N is 0", () => {
    const plan = calculateNutrientPlan({
      field: { ...field, fertility: fertilityOf({ p: 2 }) },
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: allocationFor(methods[1][1], "2027-03-15"),
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      slurryCompositionUnresolved: { housingIds: ["housing-1", "housing-2"], compositionRecordIds: ["c1", "c2"] },
      asOfDate: "2026-10-02",
    });
    const assessment = plan.organicApplication.availableNutrientAssessment;
    expect(assessment.status === "BLOCKED_INSUFFICIENT_EVIDENCE" && assessment.reasonCode).toBe("SLURRY_COMPOSITION_SOURCES_UNRESOLVED");
    expect(plan.organicApplication.availableNutrientByNutrient).toEqual({ n: assessment, p: assessment, k: assessment });
    expect(plan.organicApplication.availableNutrientBasis).toEqual(assessment);
    expect(plan.organicApplication.offsetN).toBe(0);
  });

  it("conflicting captured methods block every arm as AMBIGUOUS", () => {
    const plan = planFor({ ...baseAllocation, applicationMethodConflict: true }, undefined, { p: 3 });
    const assessment = plan.organicApplication.availableNutrientAssessment;
    expect(assessment.status).toBe("AMBIGUOUS");
    expect(plan.organicApplication.availableNutrientByNutrient).toEqual({ n: assessment, p: assessment, k: assessment });
    expect(plan.organicApplication.availableNutrientBasis).toEqual(assessment);
  });

  it("no slurry planned: every arm is NOT_APPLICABLE, like the paired assessment", () => {
    const plan = planFor({ ...baseAllocation, priority: "not_suitable" }, undefined, { k: 2 });
    const assessment = plan.organicApplication.availableNutrientAssessment;
    expect(assessment.status).toBe("NOT_APPLICABLE");
    expect(plan.organicApplication.availableNutrientByNutrient).toEqual({ n: assessment, p: assessment, k: assessment });
    expect(plan.organicApplication.availableNutrientBasis).toEqual(assessment);
  });

  it("no placeholder-derived figure reaches a gated output or an unknown arm when an index is missing", () => {
    for (const f of [{ k: 4 as Idx }, { p: 4 as Idx }, {}]) {
      const plan = planFor(allocationFor(methods[0][1], "2027-03-15"), undefined, f);
      expect(plan.requirement.status).toBe("unavailable");
      expect({ p: plan.requirement.value.p, k: plan.requirement.value.k }).toEqual({ p: 0, k: 0 });
      expect(plan.netRequirement).toMatchObject({ status: "unavailable", value: { n: 0, p: 0, k: 0 } });
      expect(plan.purchasedProducts).toEqual([]);
      expect(plan.deliveredKgHa).toEqual({ n: 0, p: 0, k: 0 });
      expect(plan.estimatedFieldCostEur).toBe(0);
      expect(plan.napCompliance).toEqual({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: ["fertility.pIndex", "fertility.kIndex"] });
      expect(plan.statutoryManureValue).toEqual({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: ["fertility.pIndex"] });
      const { p, k } = plan.organicApplication.availableNutrientByNutrient;
      if (f.p === undefined) expect(p).not.toHaveProperty("value");
      if (f.k === undefined) expect(k).not.toHaveProperty("value");
    }
  });

  it("the buffer check for an unknown P or K requirement equals the Index-1 stand-in (CC-B5)", () => {
    // Surface water at 4 m: chemical fertiliser (3 m) is met; organic (5 m) is not.
    const waterBufferContext = tracked({ featureType: "surface_water" as const, distanceM: 4, localOverrideStatus: "verified_none" as const }, "farmer_adjusted", "Keith");
    const allocation = allocationFor(methods[0][1], "2027-03-15");
    for (const [missing, standIn] of [
      [{ p: 3 as Idx }, { p: 3 as Idx, k: 1 as Idx }],
      [{ k: 3 as Idx }, { p: 1 as Idx, k: 3 as Idx }],
      [{}, { p: 1 as Idx, k: 1 as Idx }],
    ] as const) {
      const plan = planFor(allocation, undefined, missing, { waterBufferContext });
      expect(plan.nationalBufferDistanceStatus).toEqual({ status: "OK", value: "BOUNDARY_MET_SUBJECT_TO_OTHER_RULES", evidenceState: "DERIVED" });
      expect(plan.nationalBufferDistanceStatus).toEqual(planFor(allocation, undefined, standIn, { waterBufferContext }).nationalBufferDistanceStatus);
    }
  });

  // Increment 2 descope (F001 / CC-B5): the national buffer material is
  // still chosen by the Index-1 placeholder blend when P or K is missing,
  // exactly as at bfdad74 — no statutory output changes.
  // The blend is sized from the Index-1 stand-in with no slurry P/K credit
  // (the paired assessment is blocked). Audited case: the Index-1 K blend
  // is empty, so the organic 5 m buffer applies (LEGAL_PROHIBITION at 4 m,
  // the bfdad74 result the F001 audit recorded). Mirror: the Index-1 P
  // blend (P build-up) is not empty, so the chemical 3 m buffer applies
  // (OK at 4 m, as at bfdad74).
  for (const [label, f, expectedBuffer] of [
    [
      "K missing, P Index 4 (audited F001 case)",
      { p: 4 as Idx },
      {
        status: "LEGAL_PROHIBITION",
        reasonCode: "NATIONAL_BUFFER_DISTANCE_NOT_MET",
        consequence: "Proposed application at 4m to surface_water is below the statutory 5m buffer for organic_fertiliser_or_soiled_water.",
      },
    ],
    ["P missing, K Index 4 (mirror)", { k: 4 as Idx }, { status: "OK", value: "BOUNDARY_MET_SUBJECT_TO_OTHER_RULES", evidenceState: "DERIVED" }],
  ] as const) {
    it(`CC-B5 buffer regression — ${label}: second cut, yield 0, 100 m3/ha spring LESS at 6% DM, water 4 m keeps the bfdad74 result`, () => {
      const waterBufferContext = tracked({ featureType: "surface_water" as const, distanceM: 4, localOverrideStatus: "verified_none" as const }, "farmer_adjusted", "Keith");
      const allocation = { ...allocationFor(methods[1][1], "2027-03-15"), volumeM3: 100 * field.areaHa };
      const plan = calculateNutrientPlan({
        field: { ...field, waterBufferContext, fertility: fertilityOf(f) },
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: allocation,
        silage: { cutNumber: 2, expectedYieldTDMha: 0, wasGrazedPreviousYear: false },
        slurryComposition: composition(6, "verified"),
        asOfDate: "2026-10-02",
      });
      expect(plan.nationalBufferDistanceStatus).toEqual(expectedBuffer);
      expect(plan.purchasedProducts).toEqual([]);
      expect(plan.organicApplication.availableNutrientAssessment.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      // CC-B6: the credit's basis stays visible for the mixed field.
      expect(plan.organicApplication.availableNutrientBasis).toMatchObject({
        status: "OK",
        value: { applicationMethod: "LESS", ruleId: "SPRING_LESS_SLURRY_TABLE", timingCategory: "SPRING", timingAssumed: false, applicationDate: "2027-03-15" },
      });
      // The unknown arm still carries no number.
      const arms = plan.organicApplication.availableNutrientByNutrient;
      expect(f.p === undefined ? arms.p : arms.k).toEqual({
        status: "BLOCKED_INSUFFICIENT_EVIDENCE",
        reasonCode: "MISSING_SOIL_FERTILITY_INDEX",
        missingInputs: [f.p === undefined ? "fertility.pIndex" : "fertility.kIndex"],
      });
    });
  }
});

// Campaign C per-nutrient P/K, Increment 3 (CP2 Target A,
// docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md §4 row 3) —
// per-nutrient gross and net requirement. Released beside the retained
// internal Index-1 placeholder (product owner, 2026-10-02; CP3 blocked on
// CC-B5) on condition that no arm carries a placeholder-derived number. The
// baseline matrix above proves every pre-existing output is unchanged.
describe("requirementByNutrient / netRequirementByNutrient (per-nutrient P/K Increment 3)", () => {
  type Idx = 1 | 2 | 3 | 4;
  type Fert = { p?: Idx; k?: Idx };
  const field: Field = {
    id: "field-pk3",
    farmId: "farm-pk3",
    name: "PK3 Field",
    areaHa: 6.8,
    centroid: [0, 0],
    plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Keith"),
    fertility: {},
    history: [],
  };
  const baseAllocation: SlurryAllocation = { fieldId: field.id, housingId: "housing-1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 };
  const verified6 = (): SlurryComposition => ({
    id: "comp-pk3-6",
    farmId: field.farmId,
    housingId: "housing-1",
    slurryType: "cattle_slurry",
    status: "verified",
    dmPct: 6,
    sampleDate: "2026-06-10",
    source: "Southern Agri Labs report",
    recordedAt: "2026-06-12T09:00:00.000Z",
  });
  const silage1 = { cutNumber: 1 as const, expectedYieldTDMha: 5, wasGrazedPreviousYear: false };
  type Scenario = {
    slurryAllocation?: NonNullable<Parameters<typeof calculateNutrientPlan>[0]["slurryAllocation"]>;
    slurryComposition?: SlurryComposition;
    slurryCompositionUnresolved?: { housingIds: string[]; compositionRecordIds: string[] };
    silage?: typeof silage1;
  };
  const withMethod = (method: SlurryAllocation["applicationMethod"], date?: string): SlurryAllocation => ({
    ...baseAllocation,
    ...(method !== undefined ? { applicationMethod: method } : {}),
    ...(date !== undefined ? { applicationDate: tracked(date, "farmer_adjusted", "Keith") } : {}),
  });
  const splash = tracked("splashplate" as const, "farmer_adjusted", "Keith");
  const less = tracked("LESS" as const, "farmer_adjusted", "Keith");
  const scenarios: [string, Scenario][] = [
    ["no slurry allocated", { silage: silage1 }],
    ["slurry not suitable (no slurry)", { slurryAllocation: { ...baseAllocation, priority: "not_suitable" }, silage: silage1 }],
    ["spring splashplate", { slurryAllocation: withMethod(splash, "2027-03-15"), silage: silage1 }],
    ["summer splashplate (blocked table)", { slurryAllocation: withMethod(splash, "2026-06-10"), silage: silage1 }],
    ["spring LESS at verified 6% DM", { slurryAllocation: withMethod(less, "2027-03-15"), slurryComposition: verified6(), silage: silage1 }],
    ["summer LESS", { slurryAllocation: withMethod(less, "2026-06-10"), silage: silage1 }],
    ["incorporate_24h (blocked table)", { slurryAllocation: withMethod(tracked("incorporate_24h" as const, "farmer_adjusted", "Keith")), silage: silage1 }],
    ["assumed method, no date", { slurryAllocation: baseAllocation, silage: silage1 }],
    ["conflicting methods (ambiguous)", { slurryAllocation: { ...baseAllocation, applicationMethodConflict: true }, silage: silage1 }],
    [
      "unresolved composition",
      {
        slurryAllocation: withMethod(less, "2027-03-15"),
        slurryCompositionUnresolved: { housingIds: ["housing-1", "housing-2"], compositionRecordIds: ["c1", "c2"] },
        silage: silage1,
      },
    ],
    ["missing silage evidence", { slurryAllocation: withMethod(less, "2027-03-15"), slurryComposition: verified6() }],
  ];
  const indices = [1, 2, 3, 4] as const;
  const otherValues: (Idx | undefined)[] = [undefined, 1, 2, 3, 4];
  const fertilityOf = (f: Fert): Field["fertility"] => ({
    ...(f.p !== undefined ? { pIndex: tracked(f.p, "verified", "Lab") } : {}),
    ...(f.k !== undefined ? { kIndex: tracked(f.k, "verified", "Lab") } : {}),
  });
  const fert = (nutrient: "p" | "k", index: Idx | undefined, otherIndex: Idx | undefined): Fert =>
    nutrient === "p" ? { p: index, k: otherIndex } : { p: otherIndex, k: index };
  const planFor = (s: Scenario, f: Fert, extra: Partial<Field> = {}) =>
    calculateNutrientPlan({
      field: { ...field, ...extra, fertility: fertilityOf(f) },
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      ...(s.slurryAllocation !== undefined ? { slurryAllocation: s.slurryAllocation } : {}),
      ...(s.silage !== undefined ? { silage: s.silage } : {}),
      ...(s.slurryComposition !== undefined ? { slurryComposition: s.slurryComposition } : {}),
      ...(s.slurryCompositionUnresolved !== undefined ? { slurryCompositionUnresolved: s.slurryCompositionUnresolved } : {}),
      asOfDate: "2026-10-02",
    });
  const missingIndex = (input: string) => ({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: [input] });
  const silageBlock = { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SILAGE_PLAN_DATA", missingInputs: ["plannedUse"] };

  for (const [name, scenario] of scenarios) {
    it(`${name}: each arm follows its own index only; unknown arms carry no number`, () => {
      const silageOk = scenario.silage !== undefined;
      for (const nutrient of ["p", "k"] as const) {
        const other = nutrient === "p" ? "k" : "p";
        const otherInput = other === "p" ? "fertility.pIndex" : "fertility.kIndex";
        const input = nutrient === "p" ? "fertility.pIndex" : "fertility.kIndex";
        for (const index of indices) {
          // Invariance: the known arm's gross and net are identical for every
          // presence/value of the other nutrient's index (no placeholder).
          const plans = otherValues.map((o) => planFor(scenario, fert(nutrient, index, o)));
          const [first] = plans;
          for (const plan of plans) {
            expect(plan.requirementByNutrient[nutrient]).toEqual(first.requirementByNutrient[nutrient]);
            expect(plan.netRequirementByNutrient[nutrient]).toEqual(first.netRequirementByNutrient[nutrient]);
            expect(plan.requirementByNutrient.n).toEqual(first.requirementByNutrient.n);
            expect(plan.netRequirementByNutrient.n).toEqual(first.netRequirementByNutrient.n);
          }
          const gross = first.requirementByNutrient[nutrient];
          const net = first.netRequirementByNutrient[nutrient];
          const credit = first.organicApplication.availableNutrientByNutrient[nutrient];
          if (!silageOk) {
            expect(gross).toEqual(silageBlock);
            expect(net).toEqual(silageBlock);
            expect(first.requirementByNutrient.n).toEqual(silageBlock);
          } else {
            const unrounded = nutrient === "p" ? pBuildUpKgHa(index) + pMaintenanceSilageKgHa(1, index, 5) : kSilageKgHa(1, index, 5);
            expect(gross).toEqual({ status: "OK", value: Math.round(unrounded), evidenceState: "IRISH_DEFAULT" });
            if (credit.status === "OK") {
              expect(net).toEqual({ status: "OK", value: Math.round(Math.max(0, unrounded - credit.value.kgHa)), evidenceState: "IRISH_DEFAULT" });
            } else if (credit.status === "NOT_APPLICABLE") {
              expect(net).toEqual({ status: "OK", value: Math.round(unrounded), evidenceState: "IRISH_DEFAULT" });
            } else {
              expect(net).toEqual(credit);
              expect(net).not.toHaveProperty("value");
            }
          }
          // Mixed: the unknown arm is blocked with no value. Fully indexed
          // (each value of the other index): the arms equal the paired outputs.
          plans.forEach((plan, i) => {
            const otherGross = plan.requirementByNutrient[other];
            const otherNet = plan.netRequirementByNutrient[other];
            if (otherValues[i] === undefined) {
              expect(otherGross).toEqual(missingIndex(otherInput));
              expect(otherGross).not.toHaveProperty("value");
              expect(otherNet).toEqual(otherGross);
              expect(plan.requirement.status).toBe("unavailable");
              expect(plan.netRequirement.status).toBe("unavailable");
              return;
            }
            for (const arm of ["n", "p", "k"] as const) {
              const g = plan.requirementByNutrient[arm];
              const nt = plan.netRequirementByNutrient[arm];
              if (plan.requirement.status === "estimated") {
                expect(g).toEqual({ status: "OK", value: plan.requirement.value[arm], evidenceState: "IRISH_DEFAULT" });
              } else {
                expect(g).toEqual(silageBlock);
              }
              if (nt.status === "OK") {
                expect(plan.netRequirement.status).toBe("estimated");
                expect(nt.value).toBe(plan.netRequirement.value[arm]);
              }
            }
          });
          // Neither index: both P/K arms blocked on their own input only.
          const neither = planFor(scenario, {});
          expect(neither.requirementByNutrient[nutrient]).toEqual(missingIndex(input));
          expect(neither.netRequirementByNutrient[nutrient]).toEqual(missingIndex(input));
        }
      }
      // N: kept unless the silage evidence is missing, with or without indices.
      for (const f of [{}, { p: 2 as Idx }, { k: 2 as Idx }, { p: 3 as Idx, k: 3 as Idx }]) {
        const plan = planFor(scenario, f);
        const n = plan.requirementByNutrient.n;
        if (!silageOk) {
          expect(n).toEqual(silageBlock);
          expect(plan.netRequirementByNutrient.n).toEqual(silageBlock);
          continue;
        }
        expect(n).toEqual({ status: "OK", value: plan.requirement.value.n, evidenceState: "IRISH_DEFAULT" });
        const credit = plan.organicApplication.availableNutrientByNutrient.n;
        const net = plan.netRequirementByNutrient.n;
        if (credit.status === "OK") {
          expect(net).toEqual({ status: "OK", value: Math.round(Math.max(0, nSilageKgHa(1, false) - credit.value.kgHa)), evidenceState: "IRISH_DEFAULT" });
        } else if (credit.status === "NOT_APPLICABLE") {
          expect(net).toEqual(n);
        } else {
          expect(net).toEqual(credit);
        }
      }
    });
  }

  it("mixed case with a positive credit: the known net arm is round(max(0, gross - credit)) and below the gross", () => {
    const scenario = scenarios[4][1]; // spring LESS, verified 6% DM, 33 m3/ha
    for (const [f, nutrient] of [
      [{ p: 1 as Idx }, "p"],
      [{ k: 3 as Idx }, "k"],
    ] as const) {
      const plan = planFor(scenario, f);
      const gross = plan.requirementByNutrient[nutrient];
      const credit = plan.organicApplication.availableNutrientByNutrient[nutrient];
      const net = plan.netRequirementByNutrient[nutrient];
      if (gross.status !== "OK" || credit.status !== "OK" || net.status !== "OK") throw new Error("expected OK arms");
      expect(credit.value.kgHa).toBeGreaterThan(0);
      expect(net.value).toBe(Math.round(Math.max(0, gross.value - credit.value.kgHa)));
      expect(net.value).toBeLessThan(gross.value);
      expect(net.evidenceState).toBe("IRISH_DEFAULT");
      // The legacy paired outputs stay unavailable / 0 in the mixed case.
      expect(plan.netRequirement).toMatchObject({ status: "unavailable", value: { n: 0, p: 0, k: 0 } });
      expect(plan.organicApplication.offsetP).toBe(0);
      expect(plan.organicApplication.offsetK).toBe(0);
    }
  });

  it("grazing fields: the known gross arm uses its own index only, and N is kept without either index", () => {
    const grazing = { plannedUse: tracked("grazing" as const, "farmer_adjusted", "Keith") };
    for (const nutrient of ["p", "k"] as const) {
      for (const index of indices) {
        const arms = otherValues.map((o) => planFor({}, fert(nutrient, index, o), grazing).requirementByNutrient[nutrient]);
        for (const arm of arms) expect(arm).toEqual(arms[0]);
        const full = planFor({}, fert(nutrient, index, 3), grazing);
        expect(arms[0]).toEqual({ status: "OK", value: full.requirement.value[nutrient], evidenceState: "IRISH_DEFAULT" });
      }
    }
    const none = planFor({}, {}, grazing);
    expect(none.requirementByNutrient.n).toEqual({ status: "OK", value: none.requirement.value.n, evidenceState: "IRISH_DEFAULT" });
    expect(none.requirementByNutrient.p).toEqual(missingIndex("fertility.pIndex"));
    expect(none.requirementByNutrient.k).toEqual(missingIndex("fertility.kIndex"));
  });

  it("CC-B5 buffer regression cases keep the bfdad74 result and the unknown arms carry no number", () => {
    const waterBufferContext = tracked({ featureType: "surface_water" as const, distanceM: 4, localOverrideStatus: "verified_none" as const }, "farmer_adjusted", "Keith");
    for (const [f, unknownArm, expectedStatus] of [
      [{ p: 4 as Idx }, "k", "LEGAL_PROHIBITION"],
      [{ k: 4 as Idx }, "p", "OK"],
    ] as const) {
      const plan = calculateNutrientPlan({
        field: { ...field, waterBufferContext, fertility: fertilityOf(f) },
        farmGrasslandAreaHa: 27,
        livestockGroups: [],
        slurryAllocation: { ...withMethod(less, "2027-03-15"), volumeM3: 100 * field.areaHa },
        silage: { cutNumber: 2, expectedYieldTDMha: 0, wasGrazedPreviousYear: false },
        slurryComposition: verified6(),
        asOfDate: "2026-10-02",
      });
      expect(plan.nationalBufferDistanceStatus.status).toBe(expectedStatus);
      expect(plan.requirementByNutrient[unknownArm]).not.toHaveProperty("value");
      expect(plan.netRequirementByNutrient[unknownArm]).not.toHaveProperty("value");
    }
  });
});

// Fertiliser Vertical Completion, Increment 1 — the canonical per-field
// requirement (`NutrientPlan.fieldRequirement`): independent N/P/K arms,
// UNKNOWN never 0, field totals from the unrounded kg/ha, equal to the
// existing published requirement for complete data, no Index-1 placeholder.
describe("fieldRequirement (Fertiliser Vertical Increment 1)", () => {
  const field: Field = {
    id: "field-fv1",
    farmId: "farm-fv1",
    name: "FV1 Field",
    areaHa: 6.8,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
    mappedSoil: { soilAssociation: "Fermoy", dominantSeries: "Brown Earth", texture: "Loam", drainage: "moderately_drained", coveragePct: 88, datasetVersion: "test", source: "test" },
    fertility: {},
    history: [],
  };
  const herd: LivestockGroup[] = [
    { id: "g1", farmId: "farm-fv1", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
  ];
  const INDICES = [1, 2, 3, 4] as const;
  type Idx = (typeof INDICES)[number] | undefined;
  const fertilityOf = (p: Idx, k: Idx): Field["fertility"] => ({
    ...(p !== undefined ? { pIndex: tracked(p, "verified", "Lab") } : {}),
    ...(k !== undefined ? { kIndex: tracked(k, "verified", "Lab") } : {}),
  });
  const bases = {
    grazing: (fertility: Field["fertility"]) =>
      calculateNutrientPlan({ field: { ...field, fertility }, farmGrasslandAreaHa: 27, livestockGroups: herd, asOfDate: "2026-10-02" }),
    silage: (fertility: Field["fertility"]) =>
      calculateNutrientPlan({
        field: { ...field, plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Keith"), fertility },
        farmGrasslandAreaHa: 27,
        livestockGroups: herd,
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
        asOfDate: "2026-10-02",
      }),
  };
  const STATES: Idx[] = [undefined, ...INDICES];

  for (const [basis, build] of Object.entries(bases)) {
    it(`${basis}: complete data equals the published requirement; totals are kg/ha × area, unrounded`, () => {
      for (const p of INDICES) {
        for (const k of INDICES) {
          const plan = build(fertilityOf(p, k));
          const fr = plan.fieldRequirement;
          expect(plan.requirement.status).toBe("estimated");
          expect(fr.areaHa).toBe(field.areaHa);
          expect(fr.engineVersion).toBe(plan.calculationVersion);
          expect(fr.cropContext.basis).toBe(basis);
          for (const nutrient of ["n", "p", "k"] as const) {
            const arm = fr[nutrient];
            expect(arm.status, `${basis} P${p} K${k} ${nutrient}`).toBe("KNOWN");
            if (arm.status !== "KNOWN") continue;
            expect(Math.round(arm.kgHa)).toBe(plan.requirement.value[nutrient]);
            expect(arm.totalKg).toMatchObject({ status: "OK", value: arm.kgHa * field.areaHa });
          }
          expect(fr.p.soilIndex).toEqual(plan.fertilityEvidenceByNutrient.p);
          expect(fr.k.soilIndex).toEqual(plan.fertilityEvidenceByNutrient.k);
        }
      }
    });

    it(`${basis}: P and K are independent; an unknown arm has no number and no total; no placeholder`, () => {
      for (const known of ["p", "k"] as const) {
        const other = known === "p" ? "k" : "p";
        for (const index of INDICES) {
          const arms = STATES.map((o) => build(known === "p" ? fertilityOf(index, o) : fertilityOf(o, index)).fieldRequirement[known]);
          // The known arm is identical whatever the other index is, missing or 1–4.
          for (const arm of arms) expect(arm).toEqual(arms[arms.length - 1]);
          const mixed = build(known === "p" ? fertilityOf(index, undefined) : fertilityOf(undefined, index)).fieldRequirement;
          expect(mixed[known].status).toBe("KNOWN");
          expect(mixed.n.status).toBe("KNOWN");
          expect(mixed[other]).toMatchObject({ status: "UNKNOWN", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: [`fertility.${other}Index`] });
          expect(mixed[other]).not.toHaveProperty("kgHa");
          expect(mixed[other]).not.toHaveProperty("totalKg");
        }
      }
      const neither = build({}).fieldRequirement;
      expect(neither.n.status).toBe("KNOWN");
      expect(neither.p.status).toBe("UNKNOWN");
      expect(neither.k.status).toBe("UNKNOWN");
    });
  }

  it("silage N records that yield scaling is not applied (supported range unverified)", () => {
    const fr = bases.silage(fertilityOf(2, 2)).fieldRequirement;
    expect(fr.n).toMatchObject({ status: "KNOWN", limitations: expect.arrayContaining(["N_YIELD_SCALING_NOT_APPLIED"]) });
    expect(fr.cropContext.silage).toEqual({ cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false });
  });

  it("tillage is NOT_APPLICABLE; the paired requirement keeps its legacy behaviour", () => {
    const plan = calculateNutrientPlan({
      field: { ...field, plannedUse: tracked("tillage", "farmer_adjusted", "Keith"), fertility: fertilityOf(2, 2) },
      farmGrasslandAreaHa: 27,
      livestockGroups: herd,
      asOfDate: "2026-10-02",
    });
    for (const nutrient of ["n", "p", "k"] as const) {
      expect(plan.fieldRequirement[nutrient]).toMatchObject({ status: "NOT_APPLICABLE", reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED" });
    }
    expect(plan.requirement.status).toBe("estimated"); // LEGACY_COMPATIBILITY_PATH
  });

  it("grazing with no recorded livestock is UNKNOWN (MISSING_LIVESTOCK_DATA), never the clamped 35 kg N row", () => {
    const fr = calculateNutrientPlan({ field: { ...field, fertility: fertilityOf(2, 2) }, farmGrasslandAreaHa: 27, livestockGroups: [], asOfDate: "2026-10-02" }).fieldRequirement;
    for (const nutrient of ["n", "p", "k"] as const) {
      expect(fr[nutrient]).toMatchObject({ status: "UNKNOWN", reasonCode: "MISSING_LIVESTOCK_DATA" });
      expect(fr[nutrient]).not.toHaveProperty("kgHa");
    }
  });

  it("a silage-cut field with no silage plan has unknown N, not 0", () => {
    const fr = calculateNutrientPlan({
      field: { ...field, plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Keith"), fertility: fertilityOf(2, 2) },
      farmGrasslandAreaHa: 27,
      livestockGroups: herd,
      asOfDate: "2026-10-02",
    }).fieldRequirement;
    expect(fr.n).toMatchObject({ status: "UNKNOWN" });
    expect(fr.n).not.toHaveProperty("kgHa");
  });

  it("grazing with no usable farm grassland area is UNKNOWN (MISSING_GRASSLAND_AREA), never a known 0; legacy paired output unchanged", () => {
    // (A NaN area already throws inside the statutory P lookup before this builder runs — pre-existing, out of scope.)
    for (const area of [0, -1]) {
      const plan = calculateNutrientPlan({ field: { ...field, fertility: fertilityOf(2, 2) }, farmGrasslandAreaHa: area, livestockGroups: herd, asOfDate: "2026-10-02" });
      for (const nutrient of ["n", "p", "k"] as const) {
        expect(plan.fieldRequirement[nutrient], `${area} ${nutrient}`).toMatchObject({ status: "UNKNOWN", reasonCode: "MISSING_GRASSLAND_AREA", missingInputs: ["farmGrasslandAreaHa"] });
        expect(plan.fieldRequirement[nutrient]).not.toHaveProperty("kgHa");
        expect(plan.fieldRequirement[nutrient]).not.toHaveProperty("totalKg");
      }
      expect(plan.requirement.status).toBe("estimated"); // LEGACY_COMPATIBILITY_PATH
    }
    // Silage does not read the stocking rate, so it is unaffected.
    const silage = calculateNutrientPlan({
      field: { ...field, plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Keith"), fertility: fertilityOf(2, 2) },
      farmGrasslandAreaHa: 0,
      livestockGroups: herd,
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
      asOfDate: "2026-10-02",
    }).fieldRequirement;
    expect(silage.n.status).toBe("KNOWN");
  });

  it("a field with no usable area keeps its kg/ha but has an unknown total", () => {
    const fr = calculateNutrientPlan({ field: { ...field, areaHa: 0, fertility: fertilityOf(2, 2) }, farmGrasslandAreaHa: 27, livestockGroups: herd, asOfDate: "2026-10-02" }).fieldRequirement;
    expect(fr.p.status).toBe("KNOWN");
    if (fr.p.status === "KNOWN") expect(fr.p.totalKg).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_FIELD_AREA" });
  });
});

// Fertiliser Vertical Completion, Increment 2b — the canonical remaining
// chemical requirement (`NutrientPlan.fieldRemainingRequirement`):
// `fieldRequirement` less the per-nutrient slurry credit, unrounded; equal to
// `netRequirementByNutrient` after rounding; UNKNOWN never 0.
describe("fieldRemainingRequirement (Fertiliser Vertical Increment 2b)", () => {
  const field: Field = {
    id: "field-fv2b",
    farmId: "farm-fv2b",
    name: "FV2b Field",
    areaHa: 6.8,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
    mappedSoil: { soilAssociation: "Fermoy", dominantSeries: "Brown Earth", texture: "Loam", drainage: "moderately_drained", coveragePct: 88, datasetVersion: "test", source: "test" },
    fertility: {},
    history: [],
  };
  const herd: LivestockGroup[] = [
    { id: "g1", farmId: "farm-fv2b", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
  ];
  const INDICES = [1, 2, 3, 4] as const;
  const NUTRIENTS = ["n", "p", "k"] as const;
  type Idx = (typeof INDICES)[number] | undefined;
  const fertilityOf = (p: Idx, k: Idx): Field["fertility"] => ({
    ...(p !== undefined ? { pIndex: tracked(p, "verified", "Lab") } : {}),
    ...(k !== undefined ? { kIndex: tracked(k, "verified", "Lab") } : {}),
  });
  const baseAllocation: SlurryAllocation = { fieldId: field.id, housingId: "housing-1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 };
  const splashplate: SlurryAllocation = { ...baseAllocation, applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") };
  // The LESS tables need a recorded DM% on a published row (6%).
  const composition: SlurryComposition = {
    id: "comp-fv2b",
    farmId: field.farmId,
    housingId: "housing-1",
    slurryType: "cattle_slurry",
    status: "verified",
    dmPct: 6,
    sampleDate: "2026-06-10",
    source: "Lab report",
    recordedAt: "2026-06-12T09:00:00.000Z",
  };
  const springLess: SlurryAllocation = { ...baseAllocation, applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"), applicationDate: tracked("2027-03-15", "farmer_adjusted", "Keith") };
  const summerLess: SlurryAllocation = { ...baseAllocation, applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"), applicationDate: tracked("2026-06-10", "farmer_adjusted", "Keith") };
  const slurryCases: [string, Extra][] = [
    ["no slurry", {}],
    ["splashplate", { slurryAllocation: splashplate }],
    ["splashplate 6% DM", { slurryAllocation: splashplate, slurryComposition: composition }],
    ["spring LESS 6% DM", { slurryAllocation: springLess, slurryComposition: composition }],
    ["summer LESS 6% DM", { slurryAllocation: summerLess, slurryComposition: composition }],
    ["assumed default", { slurryAllocation: baseAllocation }],
  ];
  type Extra = Partial<Pick<Parameters<typeof calculateNutrientPlan>[0], "slurryAllocation" | "slurryComposition" | "slurryCompositionUnresolved" | "livestockGroups" | "farmGrasslandAreaHa">>;
  const bases = {
    grazing: (fertility: Field["fertility"], extra: Extra = {}) =>
      calculateNutrientPlan({ field: { ...field, fertility }, farmGrasslandAreaHa: 27, livestockGroups: herd, asOfDate: "2026-10-02", ...extra }),
    silage: (fertility: Field["fertility"], extra: Extra = {}) =>
      calculateNutrientPlan({
        field: { ...field, plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Keith"), fertility },
        farmGrasslandAreaHa: 27,
        livestockGroups: herd,
        silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
        asOfDate: "2026-10-02",
        ...extra,
      }),
  };
  const withSlurry = (allocation: SlurryAllocation | undefined): Extra => (allocation !== undefined ? { slurryAllocation: allocation } : {});

  for (const [basis, build] of Object.entries(bases)) {
    it(`${basis}: a known arm equals netRequirementByNutrient after rounding, for every Index 1–4 and slurry method; totals unrounded`, () => {
      for (const [label, extra] of slurryCases) {
        for (const p of INDICES) {
          for (const k of INDICES) {
            const plan = build(fertilityOf(p, k), extra);
            const fr = plan.fieldRemainingRequirement;
            expect(fr.contractVersion).toBe("field_nutrient_remaining_v1");
            expect(fr.requirementContractVersion).toBe(plan.fieldRequirement.contractVersion);
            expect(fr.engineVersion).toBe(plan.calculationVersion);
            expect(fr.fieldId).toBe(field.id);
            expect(fr.areaHa).toBe(field.areaHa);
            for (const nutrient of NUTRIENTS) {
              const where = `${basis} ${label} P${p} K${k} ${nutrient}`;
              const requirement = plan.fieldRequirement[nutrient];
              const credit = plan.organicApplication.availableNutrientByNutrient[nutrient];
              const net = plan.netRequirementByNutrient[nutrient];
              const arm = fr[nutrient];
              expect(requirement.status, where).toBe("KNOWN");
              expect(net.status, where).toBe("OK");
              expect(arm.status, where).toBe("KNOWN");
              if (arm.status !== "KNOWN" || requirement.status !== "KNOWN" || net.status !== "OK") continue;
              expect(Math.round(arm.kgHa), where).toBe(net.value);
              expect(arm.requirementKgHa).toBe(requirement.kgHa);
              if (extra.slurryAllocation === undefined) {
                expect(credit.status).toBe("NOT_APPLICABLE");
                expect(arm).toMatchObject({ creditBasis: "NO_SLURRY_PLANNED", creditKgHa: 0, kgHa: requirement.kgHa, evidenceState: requirement.evidenceState });
              } else {
                expect(credit.status, where).toBe("OK");
                if (credit.status !== "OK") continue;
                expect(arm.creditBasis).toBe("SLURRY_CREDIT");
                expect(arm.creditKgHa).toBe(credit.value.kgHa);
                expect(arm.kgHa).toBe(Math.max(0, requirement.kgHa - credit.value.kgHa));
                expect(arm.evidenceState).toBe(net.evidenceState);
              }
              expect(arm.totalKg).toMatchObject({ status: "OK", value: arm.kgHa * field.areaHa, evidenceState: arm.evidenceState });
            }
          }
        }
      }
    });

    it(`${basis}: P and K are independent; a missing own index is UNKNOWN with no number`, () => {
      for (const [, extra] of slurryCases) {
        for (const known of ["p", "k"] as const) {
          const other = known === "p" ? "k" : "p";
          for (const index of INDICES) {
            const complete = build(fertilityOf(index, index), extra).fieldRemainingRequirement;
            const mixed = build(known === "p" ? fertilityOf(index, undefined) : fertilityOf(undefined, index), extra).fieldRemainingRequirement;
            expect(mixed[known]).toEqual(complete[known]);
            expect(mixed.n).toEqual(complete.n);
            expect(mixed[other]).toMatchObject({ status: "UNKNOWN", cause: "REQUIREMENT_UNKNOWN", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: [`fertility.${other}Index`] });
            expect(mixed[other]).not.toHaveProperty("kgHa");
            expect(mixed[other]).not.toHaveProperty("totalKg");
          }
        }
      }
    });
  }

  it("an unknown slurry credit is UNKNOWN (SLURRY_CREDIT_UNKNOWN), never 0", () => {
    const unknownCredit: [string, Extra][] = [
      ["LATE_SUMMER splashplate", { slurryAllocation: { ...splashplate, applicationDate: tracked("2026-08-15", "farmer_adjusted", "Keith") } }],
      ["LATE_SUMMER LESS", { slurryAllocation: { ...baseAllocation, applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"), applicationDate: tracked("2026-09-10", "farmer_adjusted", "Keith") } }],
      ["unsupported method", { slurryAllocation: { ...baseAllocation, applicationMethod: tracked("other", "farmer_adjusted", "Keith") } }],
      ["unresolved composition", { slurryAllocation: baseAllocation, slurryCompositionUnresolved: { housingIds: ["housing-1", "housing-2"], compositionRecordIds: ["c1", "c2"] } }],
      ["method conflict", { slurryAllocation: { ...baseAllocation, applicationMethodConflict: true } }],
    ];
    for (const [label, extra] of unknownCredit) {
      for (const build of Object.values(bases)) {
        const plan = build(fertilityOf(2, 3), extra);
        for (const nutrient of NUTRIENTS) {
          const where = `${label} ${nutrient}`;
          const credit = plan.organicApplication.availableNutrientByNutrient[nutrient];
          const arm = plan.fieldRemainingRequirement[nutrient];
          expect(plan.fieldRequirement[nutrient].status, where).toBe("KNOWN");
          expect(credit.status, where).not.toBe("OK");
          expect(credit.status, where).not.toBe("NOT_APPLICABLE");
          expect(plan.netRequirementByNutrient[nutrient].status, where).not.toBe("OK");
          if (credit.status === "OK") continue;
          expect(arm, where).toMatchObject({ status: "UNKNOWN", cause: "SLURRY_CREDIT_UNKNOWN", reasonCode: credit.reasonCode });
          if (credit.status === "BLOCKED_INSUFFICIENT_EVIDENCE" && arm.status === "UNKNOWN") expect(arm.missingInputs).toEqual(credit.missingInputs);
          expect(arm).not.toHaveProperty("kgHa");
          expect(arm).not.toHaveProperty("totalKg");
        }
      }
    }
  });

  it("a missing own index with slurry planned is UNKNOWN, never a 0 credit or 0 remaining", () => {
    const plan = bases.grazing(fertilityOf(2, undefined), { slurryAllocation: splashplate });
    expect(plan.organicApplication.availableNutrientByNutrient.k.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(plan.fieldRemainingRequirement.k).toMatchObject({ status: "UNKNOWN", reasonCode: "MISSING_SOIL_FERTILITY_INDEX" });
    expect(plan.fieldRemainingRequirement.k).not.toHaveProperty("kgHa");
    expect(plan.fieldRemainingRequirement.p).toMatchObject({ status: "KNOWN", creditBasis: "SLURRY_CREDIT" });
  });

  it("tillage is NOT_APPLICABLE", () => {
    const plan = calculateNutrientPlan({
      field: { ...field, plannedUse: tracked("tillage", "farmer_adjusted", "Keith"), fertility: fertilityOf(2, 2) },
      farmGrasslandAreaHa: 27,
      livestockGroups: herd,
      slurryAllocation: splashplate,
      asOfDate: "2026-10-02",
    });
    for (const nutrient of NUTRIENTS) {
      expect(plan.fieldRemainingRequirement[nutrient]).toEqual({ status: "NOT_APPLICABLE", reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED" });
    }
  });

  it("grazing with no livestock or no usable grassland area is UNKNOWN (REQUIREMENT_UNKNOWN), never 0", () => {
    const cases: [Extra, string, string][] = [
      [{ livestockGroups: [] }, "MISSING_LIVESTOCK_DATA", "livestockGroups"],
      [{ farmGrasslandAreaHa: 0 }, "MISSING_GRASSLAND_AREA", "farmGrasslandAreaHa"],
      [{ farmGrasslandAreaHa: -1 }, "MISSING_GRASSLAND_AREA", "farmGrasslandAreaHa"],
    ];
    for (const [extra, reasonCode, input] of cases) {
      for (const allocation of [undefined, splashplate]) {
        const plan = bases.grazing(fertilityOf(2, 2), { ...extra, ...withSlurry(allocation) });
        for (const nutrient of NUTRIENTS) {
          const arm = plan.fieldRemainingRequirement[nutrient];
          expect(arm, `${reasonCode} ${nutrient}`).toMatchObject({ status: "UNKNOWN", cause: "REQUIREMENT_UNKNOWN", reasonCode, missingInputs: [input] });
          expect(arm).not.toHaveProperty("kgHa");
        }
      }
    }
  });

  it("a field with no usable area keeps its kg/ha but has an unknown total (MISSING_FIELD_AREA)", () => {
    const fr = calculateNutrientPlan({ field: { ...field, areaHa: 0, fertility: fertilityOf(2, 2) }, farmGrasslandAreaHa: 27, livestockGroups: herd, asOfDate: "2026-10-02" }).fieldRemainingRequirement;
    for (const nutrient of NUTRIENTS) {
      const arm = fr[nutrient];
      expect(arm.status).toBe("KNOWN");
      if (arm.status === "KNOWN") expect(arm.totalKg).toEqual({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_FIELD_AREA", missingInputs: ["field.areaHa"] });
    }
  });

  it("a credit larger than the requirement floors to a known 0; the excess is not encoded here", () => {
    const plan = bases.grazing(fertilityOf(4, 4), { slurryAllocation: splashplate });
    const k = plan.fieldRemainingRequirement.k;
    const credit = plan.organicApplication.availableNutrientByNutrient.k;
    expect(k.status).toBe("KNOWN");
    expect(credit.status).toBe("OK");
    if (k.status !== "KNOWN" || credit.status !== "OK") return;
    expect(credit.value.kgHa).toBeGreaterThan(k.requirementKgHa);
    expect(k.kgHa).toBe(0);
    expect(Object.keys(k).sort()).toEqual(["creditBasis", "creditKgHa", "evidenceState", "kgHa", "requirementKgHa", "status", "totalKg"]);
  });
});
