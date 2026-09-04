import { describe, expect, it } from "vitest";
import { buildSupportOpportunity, estimateGrantSupportEur } from "./support-opportunity";
import { getSchemeVersion, type SchemeVersion } from "./scheme-registry";
import { compareStrategyToBaseline } from "./farm-strategy";
import type { EligibilityAssessment } from "./scheme-eligibility";

const TAMS3_GENERAL = getSchemeVersion("tams3-general") as SchemeVersion;
const TAMS3_YFCIS = getSchemeVersion("tams3-yfcis") as SchemeVersion;
const ANC = getSchemeVersion("anc") as SchemeVersion;

function assessment(overrides: Partial<EligibilityAssessment> = {}): EligibilityAssessment {
  return {
    farmId: "farm-1",
    schemeId: "tams3-general",
    schemeVersionAssessed: "2026-tranche",
    assessedAt: "2026-09-04",
    state: "ELIGIBLE",
    satisfied: [],
    failed: [],
    unknown: [],
    informational: [],
    whyThisState: "",
    whatIsMissing: [],
    knownLimitations: [],
    sources: [],
    ...overrides,
  };
}

describe("estimateGrantSupportEur", () => {
  it("computes the confirmed rate against gross cost, capped at the confirmed ceiling", () => {
    const result = estimateGrantSupportEur(TAMS3_GENERAL, 20000);
    expect(result).toEqual({ amountEur: 8000, grantRatePct: 40, ceilingEur: 90000 });
  });

  it("applies the rate to the capped eligible investment, not to the uncapped cost, for a large investment", () => {
    // €90,000 is the maximum ELIGIBLE INVESTMENT the 60% rate applies to
    // (Teagasc's own YFCIS terms: "60% of €90,000 max"), not a cap on the
    // resulting payout — 60% of a €200,000 cost capped at €90,000 is
    // €54,000, not €90,000 (which would imply a 45% effective rate).
    const result = estimateGrantSupportEur(TAMS3_YFCIS, 200000);
    expect(result?.amountEur).toBe(54000);
  });

  it("returns undefined for a RULES_UNVERIFIED scheme rather than guessing a rate", () => {
    expect(estimateGrantSupportEur(ANC, 10000)).toBeUndefined();
  });

  it("returns undefined for a negative or non-finite gross cost rather than a nonsensical estimate", () => {
    expect(estimateGrantSupportEur(TAMS3_GENERAL, -1000)).toBeUndefined();
    expect(estimateGrantSupportEur(TAMS3_GENERAL, Number.NaN)).toBeUndefined();
    expect(estimateGrantSupportEur(TAMS3_GENERAL, Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe("buildSupportOpportunity", () => {
  it("is 'not_assessed' financially with no strategy comparison supplied — never inferred from eligibility alone", () => {
    const opp = buildSupportOpportunity(TAMS3_GENERAL, assessment());
    expect(opp.financiallySensible).toBe("not_assessed");
  });

  it("reflects a real strategy comparison's own verdict", () => {
    const comparison = compareStrategyToBaseline({ id: "s", label: "Investment", investments: [{ label: "Shed", grossCostEur: 10000, costStatus: "estimated" }], annualEffects: [{ label: "benefit", amountEurPerYear: 500, status: "estimated", source: "x" }] }, 10);
    const opp = buildSupportOpportunity(TAMS3_GENERAL, assessment(), comparison);
    expect(opp.financiallySensible).toBe("not_sensible_within_horizon");
  });
});
