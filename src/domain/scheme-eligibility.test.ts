import { describe, expect, it } from "vitest";
import { assessSchemeEligibility } from "./scheme-eligibility";
import { getSchemeVersion, type SchemeVersion } from "./scheme-registry";
import type { SupportProfile, SupportProfileFact } from "./support-profile";

/** Within every seeded scheme's own application window (all five open no
 * later than 2026-01-01; only National Reserve closes, on 2026-05-15). */
const ASSESSED_AT = "2026-03-04T00:00:00.000Z";
/** After National Reserve's own 2026-05-15 close date but still within
 * every other seeded scheme's own window — used only by the
 * scheme-window tests below. */
const AFTER_NATIONAL_RESERVE_CLOSES = "2026-09-04T00:00:00.000Z";

function profile(overrides: Partial<SupportProfile> = {}, facts: SupportProfileFact[] = []): SupportProfile {
  const farmerFacts: SupportProfile["farmerFacts"] = {};
  for (const fact of facts) farmerFacts[fact.key] = fact;
  return {
    farmId: "farm-1",
    version: "support-profile-v1",
    derived: {
      countyLocation: "Cork",
      primaryEnterprises: ["suckler_beef"],
      totalMappedAreaHa: 0,
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
  it("returns MORE_INFORMATION_REQUIRED for TAMS 3 general when declared area hasn't been entered — never inferred from mapped area alone", () => {
    const result = assessSchemeEligibility(TAMS3_GENERAL, profile({ derived: { ...profile().derived, totalMappedAreaHa: 12 } }), ASSESSED_AT);
    expect(result.state).toBe("MORE_INFORMATION_REQUIRED");
  });

  it("returns LIKELY_ELIGIBLE for TAMS 3 general once a real declared area is confirmed", () => {
    const result = assessSchemeEligibility(TAMS3_GENERAL, profile({ derived: { ...profile().derived, totalMappedAreaHa: 12 } }, [fact("declared_area_ha", 12)]), ASSESSED_AT);
    expect(result.state).toBe("LIKELY_ELIGIBLE");
  });

  it("returns NOT_ELIGIBLE for TAMS 3 general when the farmer confirms zero declared area — a real self-declared negative", () => {
    const result = assessSchemeEligibility(TAMS3_GENERAL, profile({}, [fact("declared_area_ha", 0)]), ASSESSED_AT);
    expect(result.state).toBe("NOT_ELIGIBLE");
    expect(result.failed).toHaveLength(1);
  });

  it("returns MORE_INFORMATION_REQUIRED for TAMS 3 general when no land is mapped at all — an incomplete map is not proof of no real land", () => {
    const result = assessSchemeEligibility(TAMS3_GENERAL, profile(), ASSESSED_AT);
    expect(result.state).toBe("MORE_INFORMATION_REQUIRED");
    expect(result.failed).toHaveLength(0);
  });

  it("returns MORE_INFORMATION_REQUIRED for YFCIS when genuine gaps are unanswered — never fabricates NOT_ELIGIBLE", () => {
    const result = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalMappedAreaHa: 20 } }), ASSESSED_AT);
    expect(result.state).toBe("MORE_INFORMATION_REQUIRED");
    expect(result.unknown.length).toBeGreaterThan(0);
    expect(result.whatIsMissing.length).toBeGreaterThan(0);
  });

  it("returns LIKELY_ELIGIBLE (never bare ELIGIBLE) for YFCIS once every self-declared fact passes", () => {
    const facts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6), fact("declared_area_ha", 20)];
    const result = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalMappedAreaHa: 20 } }, facts), ASSESSED_AT);
    expect(result.state).toBe("LIKELY_ELIGIBLE");
    expect(result.failed).toHaveLength(0);
    expect(result.unknown).toHaveLength(0);
  });

  it("returns NOT_ELIGIBLE for YFCIS when the declared age is out of range", () => {
    const facts = [fact("date_of_birth", "1970-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6), fact("declared_area_ha", 20)];
    const result = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalMappedAreaHa: 20 } }, facts), ASSESSED_AT);
    expect(result.state).toBe("NOT_ELIGIBLE");
  });

  it("treats a malformed date of birth as unknown, never as a confident NOT_ELIGIBLE from NaN arithmetic", () => {
    const facts = [fact("date_of_birth", "not-a-real-date"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6)];
    const result = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalMappedAreaHa: 20 } }, facts), ASSESSED_AT);
    expect(result.state).toBe("MORE_INFORMATION_REQUIRED");
    expect(result.failed).toHaveLength(0);
  });

  it("treats a below-minimum qualification level as unknown (grace period), never as a disqualifying NOT_ELIGIBLE", () => {
    const facts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 3), fact("declared_area_ha", 20)];
    const result = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalMappedAreaHa: 20 } }, facts), ASSESSED_AT);
    expect(result.state).toBe("MORE_INFORMATION_REQUIRED");
    expect(result.failed).toHaveLength(0);
  });

  it("returns NOT_ELIGIBLE for National Reserve Young Farmer when BISS participation is explicitly false, within its own open window", () => {
    const facts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6), fact("biss_participant_2026", false)];
    const result = assessSchemeEligibility(NATIONAL_RESERVE, profile({}, facts), ASSESSED_AT);
    expect(result.state).toBe("NOT_ELIGIBLE");
  });

  it("fails closed to SCHEME_CLOSED (not NOT_ELIGIBLE) once National Reserve's own application window has closed, regardless of how the facts would otherwise resolve", () => {
    const facts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6), fact("biss_participant_2026", true)];
    const result = assessSchemeEligibility(NATIONAL_RESERVE, profile({}, facts), AFTER_NATIONAL_RESERVE_CLOSES);
    expect(result.state).toBe("SCHEME_CLOSED");
    expect(result.whyThisState).toMatch(/closed/i);
  });

  it("computes National Reserve's age gate against the whole calendar year, not just the assessment date — fails a farmer who turns 41 later in the same year", () => {
    // Assessed 2026-03-04; born 1986-08-15 -> turns 40 in August 2026,
    // still within the year, so max-during-year age is 40 (eligible).
    const okFacts = [fact("date_of_birth", "1986-08-15"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6), fact("biss_participant_2026", true)];
    const ok = assessSchemeEligibility(NATIONAL_RESERVE, profile({}, okFacts), ASSESSED_AT);
    expect(ok.state).toBe("LIKELY_ELIGIBLE");

    // Born 1985-08-15 -> turns 41 in August 2026 (still within the
    // assessed year) -> must fail, even though today's real age is 40.
    const failFacts = [fact("date_of_birth", "1985-08-15"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6), fact("biss_participant_2026", true)];
    const fails = assessSchemeEligibility(NATIONAL_RESERVE, profile({}, failFacts), ASSESSED_AT);
    expect(fails.state).toBe("NOT_ELIGIBLE");
  });

  it("uses the exact elapsed time for the 5-year head-of-holding window, not a floored approximation that would grant up to a year of extra slack", () => {
    // Assessed 2026-03-04; became head of holding 2020-04-01 -> just
    // under 6 real years ago. floor(~5.92) would wrongly read as 5
    // ("within 5 years"); the exact comparison correctly fails it.
    const facts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2020-04-01"), fact("agricultural_qualification_level", 6), fact("declared_area_ha", 20)];
    const result = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalMappedAreaHa: 20 } }, facts), ASSESSED_AT);
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
    const unknownScheme: SchemeVersion = { ...TAMS3_GENERAL, schemeId: "not-a-real-scheme", verificationStatus: "CONFIRMED", applicationCloses: undefined };
    const result = assessSchemeEligibility(unknownScheme, profile(), ASSESSED_AT);
    expect(result.state).toBe("SCHEME_UNAVAILABLE");
  });
});
