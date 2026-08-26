import { describe, expect, it } from "vitest";
import { evaluatePBuildUpEligibility, type PBuildUpEligibilityInput } from "./p-build-up-eligibility";

const fullyEligible: PBuildUpEligibilityInput = {
  hasCurrentVerifiedSoilPTest: true,
  organicMatterPct: 10,
  adviserEngaged: true,
  nmpSubmitted: true,
  trainingCompleted: true,
  orgNStockingRateKgHa: 100, // below the 130 kg/ha footnote threshold — PBUILD_HIGH_GSR not applicable
  nonGrassPct: 0,
};

describe("evaluatePBuildUpEligibility — rules_statutory/p_build_up_eligibility_2026.csv", () => {
  it("T024: all mandatory conditions true + applicable footnotes pass -> ELIGIBLE", () => {
    const outcome = evaluatePBuildUpEligibility(fullyEligible);
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.eligible).toBe(true);
    expect(outcome.value.failedConditions).toEqual([]);
  });

  it("T025: NMP missing -> NOT_ELIGIBLE; standard P route (never a blocked/insufficient-evidence outcome)", () => {
    const outcome = evaluatePBuildUpEligibility({ ...fullyEligible, nmpSubmitted: false });
    expect(outcome.status).toBe("OK");
    if (outcome.status !== "OK") return;
    expect(outcome.value.eligible).toBe(false);
    expect(outcome.value.failedConditions).toContain("PBUILD_C_NMP");
  });

  it("T026: training missing -> NOT_ELIGIBLE; standard P route", () => {
    const outcome = evaluatePBuildUpEligibility({ ...fullyEligible, trainingCompleted: false });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.eligible).toBe(false);
    expect(outcome.value.failedConditions).toContain("PBUILD_D_TRAINING");
  });

  // Negative test for EVERY one of the 6 conditions, per the closure
  // pass's explicit instruction: "Add negative tests for each missing
  // eligibility condition."

  it("PBUILD_A_SOIL_TESTS fails when no current verified soil P test exists", () => {
    const outcome = evaluatePBuildUpEligibility({ ...fullyEligible, hasCurrentVerifiedSoilPTest: false });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.eligible).toBe(false);
    expect(outcome.value.failedConditions).toContain("PBUILD_A_SOIL_TESTS");
  });

  it("PBUILD_A_SOIL_TESTS fails when organic-matter determination is missing, even with a verified P test", () => {
    const outcome = evaluatePBuildUpEligibility({ ...fullyEligible, organicMatterPct: undefined });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.failedConditions).toContain("PBUILD_A_SOIL_TESTS");
  });

  it("PBUILD_B_ADVISER fails when no DAFM-approved adviser is engaged", () => {
    const outcome = evaluatePBuildUpEligibility({ ...fullyEligible, adviserEngaged: false });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.eligible).toBe(false);
    expect(outcome.value.failedConditions).toContain("PBUILD_B_ADVISER");
  });

  it("PBUILD_B_ADVISER fails closed when undefined (never captured), not treated as true", () => {
    const outcome = evaluatePBuildUpEligibility({ ...fullyEligible, adviserEngaged: undefined });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.failedConditions).toContain("PBUILD_B_ADVISER");
  });

  it("PBUILD_C_NMP fails when undefined (never captured)", () => {
    const outcome = evaluatePBuildUpEligibility({ ...fullyEligible, nmpSubmitted: undefined });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.failedConditions).toContain("PBUILD_C_NMP");
  });

  it("PBUILD_D_TRAINING fails when undefined (never captured)", () => {
    const outcome = evaluatePBuildUpEligibility({ ...fullyEligible, trainingCompleted: undefined });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.failedConditions).toContain("PBUILD_D_TRAINING");
  });

  it("PBUILD_OM_LIMIT fails when organic matter exceeds 20% (peat/high-organic soil, not ordinary mineral-soil build-up)", () => {
    const outcome = evaluatePBuildUpEligibility({ ...fullyEligible, organicMatterPct: 25 });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.eligible).toBe(false);
    expect(outcome.value.failedConditions).toContain("PBUILD_OM_LIMIT");
  });

  it("PBUILD_OM_LIMIT passes at exactly 20% OM (mineral-soil boundary, matching Green Book's own <=20% definition)", () => {
    const outcome = evaluatePBuildUpEligibility({ ...fullyEligible, organicMatterPct: 20 });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.failedConditions).not.toContain("PBUILD_OM_LIMIT");
  });

  it("PBUILD_HIGH_GSR is not applicable at or below the 130 kg N/ha footnote threshold, regardless of non-grass area", () => {
    const outcome = evaluatePBuildUpEligibility({ ...fullyEligible, orgNStockingRateKgHa: 130, nonGrassPct: 0 });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.failedConditions).not.toContain("PBUILD_HIGH_GSR");
    expect(outcome.value.eligible).toBe(true);
  });

  it("PBUILD_HIGH_GSR fails above 130 kg N/ha without proven non-grass eligible area", () => {
    const outcome = evaluatePBuildUpEligibility({ ...fullyEligible, orgNStockingRateKgHa: 184, nonGrassPct: 0 });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.eligible).toBe(false);
    expect(outcome.value.failedConditions).toContain("PBUILD_HIGH_GSR");
  });

  it("PBUILD_HIGH_GSR passes above 130 kg N/ha with proven >=5% non-grass eligible area", () => {
    const outcome = evaluatePBuildUpEligibility({ ...fullyEligible, orgNStockingRateKgHa: 184, nonGrassPct: 5 });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.failedConditions).not.toContain("PBUILD_HIGH_GSR");
  });

  it("multiple simultaneous failures are all reported, not just the first", () => {
    const outcome = evaluatePBuildUpEligibility({
      hasCurrentVerifiedSoilPTest: false,
      organicMatterPct: undefined,
      adviserEngaged: false,
      nmpSubmitted: false,
      trainingCompleted: false,
      orgNStockingRateKgHa: 100,
      nonGrassPct: 0,
    });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.eligible).toBe(false);
    expect(outcome.value.failedConditions).toEqual(
      expect.arrayContaining(["PBUILD_A_SOIL_TESTS", "PBUILD_B_ADVISER", "PBUILD_C_NMP", "PBUILD_D_TRAINING"]),
    );
  });
});

// V3 closure pass, Priority 9 — GF04's own exact golden-test scenarios
// (GFT029-GFT036), reconciled against this module now that it's real
// (built Priority 3). GFT029-034's "om"/"soil_test" are two separate
// booleans in the golden test's own setup; this module treats "a current
// verified soil P test AND its organic-matter determination" as one
// combined condition (`PBUILD_A_SOIL_TESTS`) — either one being false
// still correctly resolves `eligible: false`, matching every one of
// these scenarios' expected outcome.
describe("GF04 golden-test reconciliation (GFT029-GFT036)", () => {
  const allTrue: PBuildUpEligibilityInput = {
    hasCurrentVerifiedSoilPTest: true,
    organicMatterPct: 10,
    adviserEngaged: true,
    nmpSubmitted: true,
    trainingCompleted: true,
    orgNStockingRateKgHa: 100,
    nonGrassPct: 0,
  };

  it("GFT029: all conditions true -> eligible: true", () => {
    const outcome = evaluatePBuildUpEligibility(allTrue);
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.eligible).toBe(true);
  });

  it("GFT030: soil_test false -> eligible: false", () => {
    const outcome = evaluatePBuildUpEligibility({ ...allTrue, hasCurrentVerifiedSoilPTest: false });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.eligible).toBe(false);
  });

  it("GFT031: om false -> eligible: false", () => {
    const outcome = evaluatePBuildUpEligibility({ ...allTrue, organicMatterPct: undefined });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.eligible).toBe(false);
  });

  it("GFT032: approved_adviser false -> eligible: false", () => {
    const outcome = evaluatePBuildUpEligibility({ ...allTrue, adviserEngaged: false });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.eligible).toBe(false);
  });

  it("GFT033: NMP false -> eligible: false", () => {
    const outcome = evaluatePBuildUpEligibility({ ...allTrue, nmpSubmitted: false });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.eligible).toBe(false);
  });

  it("GFT034: training false -> eligible: false", () => {
    const outcome = evaluatePBuildUpEligibility({ ...allTrue, trainingCompleted: false });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.eligible).toBe(false);
  });
});

