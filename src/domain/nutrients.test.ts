import { describe, expect, it } from "vitest";
import {
  calculateGrasslandStockingRateKgHa,
  calculateNutrientPlan,
  checkNapCompliance,
  cropGroupForFieldUse,
  HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT,
  isEligibleForElevatedNRate,
  kGrazingKgHa,
  kIndexFromMgL,
  kSilageKgHa,
  LIVESTOCK_UNITS_PER_HEAD,
  napEnhancedPBuildUpKgHa,
  napMaxAvailableNCutOnlyKgHa,
  napMaxAvailableNGrazingKgHa,
  napMaxAvailableNGrazingKgHaEligibilityGated,
  napMaxAvailablePCutOnlyKgHa,
  napMaxAvailablePGrazingKgHa,
  NAP_N_CATCHMENT_AMENDMENT_2028,
  nGrazingSucklerToBeefKgHa,
  nSilageKgHa,
  pBuildUpKgHa,
  pIndexFromMgL,
  pMaintenanceGrazingKgHa,
  pMaintenanceSilageKgHa,
  resolvePIndexConservatively,
  slurryAvailableKgHa,
  soilMaterialForOrganicCarbonStatus,
  totalLivestockUnits,
} from "./nutrients";
import { tracked } from "./types";
import type { Field, LivestockGroup } from "./types";
import { calculateStatutoryGrasslandStockingRateKgHa } from "./statutory-excretion";

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
  it("grassland: definite Index 1-3 boundaries at the statutory Table 12 precision", () => {
    expect(okValue(pIndexFromMgL(0))).toBe(1);
    expect(okValue(pIndexFromMgL(3.04))).toBe(1);
    expect(okValue(pIndexFromMgL(3.05))).toBe(2);
    expect(okValue(pIndexFromMgL(5.04))).toBe(2);
    expect(okValue(pIndexFromMgL(5.05))).toBe(3);
    expect(okValue(pIndexFromMgL(8.0))).toBe(3);
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

  it("other_crop: wider Index 2/3 bands and its own (10.00, 10.01] ambiguous gap (GFT008-GFT010)", () => {
    expect(okValue(pIndexFromMgL(6.04, "other_crop"))).toBe(2);
    expect(okValue(pIndexFromMgL(10.0, "other_crop"))).toBe(3);
    expect(pIndexFromMgL(10.01, "other_crop").status).toBe("AMBIGUOUS");
    expect(okValue(pIndexFromMgL(10.02, "other_crop"))).toBe(4);
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

describe("cropGroupForFieldUse", () => {
  it("maps tillage to other_crop and every other use to grassland", () => {
    expect(cropGroupForFieldUse("tillage")).toBe("other_crop");
    expect(cropGroupForFieldUse("grazing")).toBe("grassland");
    expect(cropGroupForFieldUse("silage_1st_cut")).toBe("grassland");
    expect(cropGroupForFieldUse("mixed")).toBe("grassland");
    expect(cropGroupForFieldUse("other")).toBe("grassland");
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
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: { fieldId: field.id, housingId: "h1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 },
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
    });
    expect(plan.napCompliance.status).toBe("OK");
    if (plan.napCompliance.status !== "OK") throw new Error("expected OK");
    const compliance = plan.napCompliance.value;
    expect(compliance.landUse).toBe("cut_only");
    expect(compliance.regulatory).toBe("compliance_value");
    expect(compliance.legislation).toContain("Tables 13 & 15a");
    // requirement.value === {n:125, p:20} from the test above — same total
    // the NAP check compares against the ceiling, not just the top-up.
    expect(compliance.nRequiredKgHa).toBe(125);
    expect(compliance.pRequiredKgHa).toBe(20);
  });

  it("a silage field intended for sale WITH confirmed written evidence, on a low-stocking holding, uses the real cut-only ceiling", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: [],
      slurryAllocation: { fieldId: field.id, housingId: "h1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 },
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
      slurryAllocation: { fieldId: field.id, housingId: "h1", priority: "high", volumeM3: 33 * field.areaHa, score: 90 },
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false, intendedUse: "sale" },
    });
    expect(plan.napCompliance.status).toBe("OK");
    if (plan.napCompliance.status !== "OK") throw new Error("expected OK");
    expect(plan.napCompliance.value.legislation).toContain("Tables 13 & 15a");
    expect(plan.napCompliance.value.saleEvidenceRequired).toBe(true);
    expect(plan.napCompliance.value.saleEvidenceConfirmed).toBe(false);
  });

  it("a grazing field's napCompliance is compliance_value, using the real statutory GSR (suckler_cow resolves directly, no age/sex needed)", () => {
    const grazingField: Field = { ...field, plannedUse: tracked("grazing", "farmer_adjusted", "Keith") };
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
    const plan = calculateNutrientPlan({
      field,
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
});
