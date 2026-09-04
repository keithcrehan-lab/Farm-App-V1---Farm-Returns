import { describe, expect, it } from "vitest";
import { assessSchemeEligibility } from "./scheme-eligibility";
import { getSchemeVersion, type SchemeVersion } from "./scheme-registry";
import type { SupportProfile, SupportProfileFact } from "./support-profile";

const ASSESSED_AT = "2026-09-04T00:00:00.000Z";

function profile(overrides: Partial<SupportProfile> = {}, facts: SupportProfileFact[] = []): SupportProfile {
  const farmerFacts: SupportProfile["farmerFacts"] = {};
  for (const fact of facts) farmerFacts[fact.key] = fact;
  return {
    farmId: "farm-1",
    version: "support-profile-v1",
    derived: {
      countyLocation: "Cork",
      primaryEnterprises: ["suckler_beef"],
      totalDeclaredAreaHa: 0,
      forageAreaHa: null,
      fieldsWithUnresolvedUse: 0,
      totalLivestockUnits: 0,
    },
    knownFacts: [],
    farmerFacts,
    gaps: [],
    ...overrides,
  };
}

function fact(key: SupportProfileFact["key"], value: unknown): SupportProfileFact {
  return { key, value, status: "farmer_confirmed", source: "farmer_entered", updatedAt: ASSESSED_AT };
}

const TAMS3_GENERAL = getSchemeVersion("tams3-general") as SchemeVersion;
const TAMS3_YFCIS = getSchemeVersion("tams3-yfcis") as SchemeVersion;
const NATIONAL_RESERVE = getSchemeVersion("national-reserve-young-farmer") as SchemeVersion;
const ANC = getSchemeVersion("anc") as SchemeVersion;
const BISS = getSchemeVersion("biss") as SchemeVersion;

describe("assessSchemeEligibility", () => {
  it("returns ELIGIBLE for TAMS 3 general using only real farm evidence, never LIKELY_ELIGIBLE", () => {
    const result = assessSchemeEligibility(TAMS3_GENERAL, profile({ derived: { ...profile().derived, totalDeclaredAreaHa: 12 } }), ASSESSED_AT);
    expect(result.state).toBe("ELIGIBLE");
    expect(result.failed).toHaveLength(0);
    expect(result.unknown).toHaveLength(0);
  });

  it("returns NOT_ELIGIBLE for TAMS 3 general when no land is declared", () => {
    const result = assessSchemeEligibility(TAMS3_GENERAL, profile(), ASSESSED_AT);
    expect(result.state).toBe("NOT_ELIGIBLE");
    expect(result.failed).toHaveLength(1);
  });

  it("returns MORE_INFORMATION_REQUIRED for YFCIS when genuine gaps are unanswered — never fabricates NOT_ELIGIBLE", () => {
    const result = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalDeclaredAreaHa: 20 } }), ASSESSED_AT);
    expect(result.state).toBe("MORE_INFORMATION_REQUIRED");
    expect(result.unknown.length).toBeGreaterThan(0);
    expect(result.whatIsMissing.length).toBeGreaterThan(0);
  });

  it("returns LIKELY_ELIGIBLE (never bare ELIGIBLE) for YFCIS once every self-declared fact passes", () => {
    const facts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6)];
    const result = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalDeclaredAreaHa: 20 } }, facts), ASSESSED_AT);
    expect(result.state).toBe("LIKELY_ELIGIBLE");
    expect(result.failed).toHaveLength(0);
    expect(result.unknown).toHaveLength(0);
  });

  it("returns NOT_ELIGIBLE for YFCIS when the declared age is out of range", () => {
    const facts = [fact("date_of_birth", "1970-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6)];
    const result = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalDeclaredAreaHa: 20 } }, facts), ASSESSED_AT);
    expect(result.state).toBe("NOT_ELIGIBLE");
  });

  it("returns NOT_ELIGIBLE for National Reserve Young Farmer when BISS participation is explicitly false", () => {
    const facts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6), fact("biss_participant_2026", false)];
    const result = assessSchemeEligibility(NATIONAL_RESERVE, profile({}, facts), ASSESSED_AT);
    expect(result.state).toBe("NOT_ELIGIBLE");
  });

  it("never returns ELIGIBLE or NOT_ELIGIBLE for an unverified scheme (ANC), regardless of how the one confirmed criterion resolves", () => {
    const passingDensity = assessSchemeEligibility(ANC, profile({ derived: { ...profile().derived, forageAreaHa: 10, totalLivestockUnits: 5 } }), ASSESSED_AT);
    expect(passingDensity.state).toBe("RULES_UNVERIFIED");

    const failingDensity = assessSchemeEligibility(ANC, profile({ derived: { ...profile().derived, forageAreaHa: 100, totalLivestockUnits: 0.5 } }), ASSESSED_AT);
    expect(failingDensity.state).toBe("RULES_UNVERIFIED");
  });

  it("never returns ELIGIBLE or NOT_ELIGIBLE for BISS (unverified)", () => {
    const result = assessSchemeEligibility(BISS, profile(), ASSESSED_AT);
    expect(result.state).toBe("RULES_UNVERIFIED");
  });

  it("fails closed to SCHEME_UNAVAILABLE for a scheme with no matching checker", () => {
    const unknownScheme: SchemeVersion = { ...TAMS3_GENERAL, schemeId: "not-a-real-scheme", verificationStatus: "CONFIRMED" };
    const result = assessSchemeEligibility(unknownScheme, profile(), ASSESSED_AT);
    expect(result.state).toBe("SCHEME_UNAVAILABLE");
  });
});
