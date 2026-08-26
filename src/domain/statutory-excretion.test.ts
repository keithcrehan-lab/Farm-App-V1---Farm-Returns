import { describe, expect, it } from "vitest";
import {
  TABLE_7_LIVESTOCK_EXCRETION,
  calculateStatutoryGrasslandStockingRateKgHa,
  resolveStatutoryExcretionCategory,
  statutoryAnnualExcretionKgPerHead,
} from "./statutory-excretion";
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

describe("resolveStatutoryExcretionCategory", () => {
  it("resolves suckler_cow directly — no age/sex needed", () => {
    const outcome = resolveStatutoryExcretionCategory(group({ category: "suckler_cow" }));
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("suckler_cow");
  });

  it("blocks dairy_cow when avgMilkYieldKgPerYear is absent — this app's real groups today have none", () => {
    const outcome = resolveStatutoryExcretionCategory(group({ category: "dairy_cow" }));
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("MISSING_DAIRY_MILK_YIELD_BAND");
    }
  });

  // V3 closure pass, Priority 5 (AF012) — real Table 7a milk-yield banding.
  it("resolves dairy_cow_band_1 for <4500 kg milk yield", () => {
    const outcome = resolveStatutoryExcretionCategory(
      group({ category: "dairy_cow", avgMilkYieldKgPerYear: tracked(4200, "farmer_adjusted", "Keith") }),
    );
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("dairy_cow_band_1");
  });

  it("GFT019: band 2 ordinary dairy excretion (no CP election) — 92 kgN/cow, 120 cows -> 11,040 kg total", () => {
    const groups: LivestockGroup[] = [
      group({ id: "g1", category: "dairy_cow", count: tracked(120, "verified", "Keith"), avgMilkYieldKgPerYear: tracked(5000, "farmer_adjusted", "Keith") }),
    ];
    const outcome = calculateStatutoryGrasslandStockingRateKgHa(groups, 100);
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.totalStatutoryNKg).toBe(11040);
  });

  // GFT020/GFT021 (Table 7a CP-election N reduction — 15% CP-as-fed with
  // records lowers N/cow to 90; without records it's denied, falling back
  // to 92) are NOT built: no rules_statutory CSV publishes a general
  // CP%-to-N-rate table, only these two golden tests' own two data
  // points (CP 15/14 -> N 90/92) — insufficient evidence to safely
  // reconstruct a general rule (unlike GFT023/GFT024's single non-grass-
  // area threshold + documented fallback). Real, open, EVIDENCE_BLOCKED
  // gap — `resolveStatutoryExcretionCategory` correctly resolves the
  // ordinary band only, with no CP-election path at all.

  it("resolves dairy_cow_band_2 for the inclusive 4500-6500 kg range, at both boundaries", () => {
    const lower = resolveStatutoryExcretionCategory(
      group({ category: "dairy_cow", avgMilkYieldKgPerYear: tracked(4500, "farmer_adjusted", "Keith") }),
    );
    const upper = resolveStatutoryExcretionCategory(
      group({ category: "dairy_cow", avgMilkYieldKgPerYear: tracked(6500, "farmer_adjusted", "Keith") }),
    );
    if (lower.status === "OK") expect(lower.value).toBe("dairy_cow_band_2");
    else throw new Error("expected OK");
    if (upper.status === "OK") expect(upper.value).toBe("dairy_cow_band_2");
    else throw new Error("expected OK");
  });

  it("resolves dairy_cow_band_3 for >6500 kg milk yield", () => {
    const outcome = resolveStatutoryExcretionCategory(
      group({ category: "dairy_cow", avgMilkYieldKgPerYear: tracked(7200, "farmer_adjusted", "Keith") }),
    );
    if (outcome.status === "OK") expect(outcome.value).toBe("dairy_cow_band_3");
    else throw new Error("expected OK");
  });

  it("blocks any age-dependent category when avgAgeMonths is absent (GFT-style: real mock-farm.ts groups have none)", () => {
    for (const category of ["calf", "weanling", "store", "steer", "heifer", "bull"] as const) {
      const outcome = resolveStatutoryExcretionCategory(group({ category }));
      expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
        expect(outcome.reasonCode).toBe("MISSING_LIVESTOCK_AGE");
      }
    }
  });

  it("resolves calf_0_90_days for an animal under 3 months", () => {
    const outcome = resolveStatutoryExcretionCategory(group({ category: "calf", avgAgeMonths: 2 }));
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("calf_0_90_days");
  });

  it("resolves cattle_91_days_to_end_year1 for an animal aged 3-11 months, sex-independent", () => {
    const outcome = resolveStatutoryExcretionCategory(group({ category: "weanling", avgAgeMonths: 8 }));
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("cattle_91_days_to_end_year1");
  });

  it("blocks the 1-2 year band when sex is missing", () => {
    const outcome = resolveStatutoryExcretionCategory(group({ category: "store", avgAgeMonths: 18 }));
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("MISSING_LIVESTOCK_SEX_FOR_1_2Y_BAND");
    }
  });

  it("blocks the 1-2 year band when sex is 'mixed' (Table 7 has no mixed row)", () => {
    const outcome = resolveStatutoryExcretionCategory(group({ category: "store", avgAgeMonths: 18, sex: "mixed" }));
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("resolves cattle_female_1_2_years / cattle_male_1_2_years when sex is known", () => {
    const female = resolveStatutoryExcretionCategory(group({ category: "heifer", avgAgeMonths: 18, sex: "female" }));
    const male = resolveStatutoryExcretionCategory(group({ category: "steer", avgAgeMonths: 18, sex: "male" }));
    expect(female.status === "OK" && female.value).toBe("cattle_female_1_2_years");
    expect(male.status === "OK" && male.value).toBe("cattle_male_1_2_years");
  });

  it("resolves cattle_over_2_years for a 24+ month animal, sex-independent", () => {
    const outcome = resolveStatutoryExcretionCategory(group({ category: "bull", avgAgeMonths: 36 }));
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("cattle_over_2_years");
  });
});

describe("statutoryAnnualExcretionKgPerHead", () => {
  it("matches Table 7's suckler_cow row exactly: 65 kgN, 10 kgP", () => {
    expect(statutoryAnnualExcretionKgPerHead("suckler_cow")).toEqual({ n: 65, p: 10 });
  });

  it("combines calf_0_90_days + cattle_91_days_to_end_year1 into one first-year annual total: 21 kgN, 2.9 kgP", () => {
    expect(statutoryAnnualExcretionKgPerHead("calf_0_90_days")).toEqual({ n: 21, p: 2.9 });
    expect(statutoryAnnualExcretionKgPerHead("cattle_91_days_to_end_year1")).toEqual({ n: 21, p: 2.9 });
  });

  it("matches Table 7's 1-2 year and 2+ year rows exactly", () => {
    expect(statutoryAnnualExcretionKgPerHead("cattle_female_1_2_years")).toEqual({ n: 55, p: 8 });
    expect(statutoryAnnualExcretionKgPerHead("cattle_male_1_2_years")).toEqual({ n: 61, p: 9 });
    expect(statutoryAnnualExcretionKgPerHead("cattle_over_2_years")).toEqual({ n: 65, p: 10 });
  });

  it("TABLE_7_LIVESTOCK_EXCRETION has all 31 named categories with the CSV's exact values", () => {
    expect(Object.keys(TABLE_7_LIVESTOCK_EXCRETION)).toHaveLength(31);
    expect(TABLE_7_LIVESTOCK_EXCRETION.dairy_cow_band_2).toEqual({
      category: "dairy_cow_band_2",
      basis: "animal_year",
      totalNKg: 92,
      totalPKg: 13.6,
      notes: "4500-6500 kg milk yield; banding footnotes apply",
    });
    expect(TABLE_7_LIVESTOCK_EXCRETION.laying_hen.totalNKg).toBe(0.56);
    expect(TABLE_7_LIVESTOCK_EXCRETION.integrated_pig_unit.totalPKg).toBe(17);
  });
});

describe("calculateStatutoryGrasslandStockingRateKgHa", () => {
  it("computes the real statutory GSR for a fully-categorised herd (no exports subtracted)", () => {
    const groups: LivestockGroup[] = [
      group({ id: "g1", category: "suckler_cow", count: tracked(20, "verified", "Keith") }),
      group({ id: "g2", category: "steer", avgAgeMonths: 30, count: tracked(10, "verified", "Keith") }),
    ];
    // 20 x 65 (suckler_cow) + 10 x 65 (cattle_over_2_years, 30mo) = 1300 + 650 = 1950 kgN
    const outcome = calculateStatutoryGrasslandStockingRateKgHa(groups, 60);
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value.totalStatutoryNKg).toBe(1950);
      expect(outcome.value.gsrKgNHa).toBeCloseTo(1950 / 60, 6);
    }
  });

  it("blocks the WHOLE calculation if even one group can't be categorised (GFT022-style correctness, not a partial undercount)", () => {
    const groups: LivestockGroup[] = [
      group({ id: "g1", category: "suckler_cow", count: tracked(20, "verified", "Keith") }),
      group({ id: "g2", category: "weanling", count: tracked(18, "verified", "Keith") }), // no avgAgeMonths
    ];
    const outcome = calculateStatutoryGrasslandStockingRateKgHa(groups, 60);
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("MISSING_LIVESTOCK_CATEGORISATION_FOR_GSR");
      expect(outcome.missingInputs[0]).toContain("g2");
    }
  });

  it("reflects this app's real mock-farm.ts herd today: blocked, since no group has avgAgeMonths/sex set", () => {
    // Mirrors src/data/mock-farm.ts's mockLivestockGroups exactly (category/count only).
    const groups: LivestockGroup[] = [
      group({ id: "lg-suckler-cows", category: "suckler_cow", count: tracked(32, "verified", "Keith") }),
      group({ id: "lg-weanlings", category: "weanling", count: tracked(18, "verified", "Keith") }),
      group({ id: "lg-heifers", category: "heifer", count: tracked(12, "verified", "Keith") }),
      group({ id: "lg-bull", category: "bull", count: tracked(1, "verified", "Keith") }),
      group({ id: "lg-continental-steers", category: "steer", count: tracked(18, "verified", "Keith") }),
    ];
    const outcome = calculateStatutoryGrasslandStockingRateKgHa(groups, 60);
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("blocks when eligible grassland area is zero or negative", () => {
    const outcome = calculateStatutoryGrasslandStockingRateKgHa([group({ category: "suckler_cow" })], 0);
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("MISSING_ELIGIBLE_GRASSLAND_AREA");
    }
  });

  it("does NOT subtract manure exports from the numerator (GFT022 — this function has no exports parameter at all)", () => {
    const groups: LivestockGroup[] = [group({ category: "suckler_cow", count: tracked(20, "verified", "Keith") })];
    const outcome = calculateStatutoryGrasslandStockingRateKgHa(groups, 60);
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value.totalStatutoryNKg).toBe(20 * 65);
  });
});
