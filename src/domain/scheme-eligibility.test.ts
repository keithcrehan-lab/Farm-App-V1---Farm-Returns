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

const TAMS3_GENERAL_REAL = getSchemeVersion("tams3-general") as SchemeVersion;
const NATIONAL_RESERVE_REAL = getSchemeVersion("national-reserve-young-farmer") as SchemeVersion;
// Codex audit HIGH (round 6, 2026-09-04) correctly moved both real
// registry records above to `RULES_UNVERIFIED` — their sources never
// specifically confirmed this scheme's own rules (see
// `scheme-registry.ts`'s own doc comments). The requirement-checking
// logic these two schemes exercise below (land-declaration inference,
// the whole-calendar-year age gate, the SCHEME_CLOSED override) is real
// domain logic this suite still needs to cover, so — matching this same
// file's own established `unknownScheme` pattern further down — these
// two local fixtures force `verificationStatus: "CONFIRMED"` to reach
// that logic; they are never used to claim the real registry entries
// are confirmed (see the dedicated RULES_UNVERIFIED tests below, which
// use `TAMS3_GENERAL_REAL`/`NATIONAL_RESERVE_REAL` unmodified).
const TAMS3_GENERAL: SchemeVersion = { ...TAMS3_GENERAL_REAL, verificationStatus: "CONFIRMED" };
const NATIONAL_RESERVE: SchemeVersion = { ...NATIONAL_RESERVE_REAL, verificationStatus: "CONFIRMED" };
const TAMS3_YFCIS = getSchemeVersion("tams3-yfcis") as SchemeVersion;
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

  it("YFCIS's qualification requirement never resolves to yes from an NFQ level alone — real, honest, permanent MORE_INFORMATION_REQUIRED, since a level number can't establish Annex J compliance", () => {
    // Every other requirement genuinely passes; only the Annex J
    // qualification gate is unresolved, however high the entered level.
    const facts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 10), fact("declared_area_ha", 20)];
    const result = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalMappedAreaHa: 20 } }, facts), ASSESSED_AT);
    expect(result.state).toBe("MORE_INFORMATION_REQUIRED");
    expect(result.failed).toHaveLength(0);
    expect(result.unknown).toHaveLength(1);
  });

  it("Codex audit round 12: a real holds_annex_j_qualification answer actually resolves YFCIS's qualification gate — the sole CONFIRMED scheme is no longer permanently stuck at MORE_INFORMATION_REQUIRED", () => {
    const okFacts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("holds_annex_j_qualification", true), fact("declared_area_ha", 20)];
    const ok = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalMappedAreaHa: 20 } }, okFacts), ASSESSED_AT);
    expect(ok.state).toBe("LIKELY_ELIGIBLE");

    const failFacts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("holds_annex_j_qualification", false), fact("declared_area_ha", 20)];
    const fails = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalMappedAreaHa: 20 } }, failFacts), ASSESSED_AT);
    expect(fails.state).toBe("NOT_ELIGIBLE");
  });

  it("returns LIKELY_ELIGIBLE for National Reserve once every fact passes, including a real NFQ Level 6 qualification (its own sourced criterion, unlike YFCIS's Annex J list)", () => {
    const facts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6), fact("biss_participant_2026", true)];
    const result = assessSchemeEligibility(NATIONAL_RESERVE, profile({}, facts), ASSESSED_AT);
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

  it("Codex audit round 13: a future date of birth (only reachable via a direct write bypassing the real validator) is treated as unknown, never used for a confident age calculation", () => {
    // `fact()` sets a raw value directly, exactly simulating a write that
    // bypassed `upsertSupportProfileFactAction`'s own
    // `validateSupportProfileFactValue` call — `isPlausibleIsoDate` alone
    // would accept this as a real calendar date.
    const facts = [fact("date_of_birth", "2099-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6), fact("declared_area_ha", 20)];
    const result = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalMappedAreaHa: 20 } }, facts), ASSESSED_AT);
    expect(result.state).toBe("MORE_INFORMATION_REQUIRED");
    expect(result.failed).toHaveLength(0);
  });

  it("Codex audit round 13: a fractional NFQ level (only reachable via a direct write) never satisfies National Reserve's real qualification gate", () => {
    const facts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6.5), fact("biss_participant_2026", true)];
    const result = assessSchemeEligibility(NATIONAL_RESERVE, profile({}, facts), ASSESSED_AT);
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

  it("Codex audit round 7: the 5-year head-of-holding boundary is exact across leap years, not a 365.25-day approximation that can misfire on the exact anniversary", () => {
    // 2020-01-01 to 2025-01-01 is exactly 5 calendar years, but the
    // interval crosses two leap years (2020, 2024 — 1827 real elapsed
    // days). A 365.25-day-per-year approximation reads that as ~5.002
    // years, just over the limit, wrongly rejecting a farmer who is
    // exactly on the 5-year boundary. The exact calendar comparison
    // correctly passes it. (A widened window on this local fixture only
    // — the real seeded scheme's own 2026 window would otherwise reject
    // a 2025 assessment date on timing alone, unrelated to what this
    // test checks.)
    const widenedWindowScheme: SchemeVersion = { ...TAMS3_YFCIS, effectiveFrom: "2020-01-01", applicationCloses: "2030-01-01" };
    const facts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2020-01-01"), fact("agricultural_qualification_level", 6), fact("declared_area_ha", 20)];
    const result = assessSchemeEligibility(widenedWindowScheme, profile({ derived: { ...profile().derived, totalMappedAreaHa: 20 } }, facts), "2025-01-01T00:00:00.000Z");
    // Overall state stays MORE_INFORMATION_REQUIRED (YFCIS's own Annex J
    // qualification gate never resolves to "yes" from an NFQ level alone
    // — round 5's own, separate fix) — the boundary fix this test checks
    // is the individual set-up-within-years requirement itself.
    expect(result.state).toBe("MORE_INFORMATION_REQUIRED");
    const setup = [...result.satisfied, ...result.failed, ...result.unknown].find((r) => r.ruleId === "yfcis-set-up-within-years");
    expect(setup?.satisfied).toBe("yes");
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

  it("Codex audit round 6: the real TAMS 3 general registry record is RULES_UNVERIFIED, even with a real confirmed declared area", () => {
    const result = assessSchemeEligibility(TAMS3_GENERAL_REAL, profile({ derived: { ...profile().derived, totalMappedAreaHa: 12 } }, [fact("declared_area_ha", 12)]), ASSESSED_AT);
    expect(result.state).toBe("RULES_UNVERIFIED");
  });

  it("Codex audit round 6: the real National Reserve registry record is RULES_UNVERIFIED, even when every fact would otherwise pass", () => {
    const facts = [fact("date_of_birth", "2000-01-01"), fact("head_of_holding_since", "2024-01-01"), fact("agricultural_qualification_level", 6), fact("biss_participant_2026", true)];
    const result = assessSchemeEligibility(NATIONAL_RESERVE_REAL, profile({}, facts), ASSESSED_AT);
    expect(result.state).toBe("RULES_UNVERIFIED");
  });

  it("surfaces a CONFIRMED scheme's own real known limitations on every assessment, not just an unverified scheme's", () => {
    const result = assessSchemeEligibility(TAMS3_YFCIS, profile({ derived: { ...profile().derived, totalMappedAreaHa: 20 } }), ASSESSED_AT);
    expect(result.knownLimitations.length).toBeGreaterThan(0);
    expect(result.knownLimitations.some((l) => l.includes("Annex J"))).toBe(true);
  });

  it("fails closed to SCHEME_UNAVAILABLE for a scheme with no matching checker", () => {
    const unknownScheme: SchemeVersion = { ...TAMS3_GENERAL, schemeId: "not-a-real-scheme", verificationStatus: "CONFIRMED", applicationCloses: undefined };
    const result = assessSchemeEligibility(unknownScheme, profile(), ASSESSED_AT);
    expect(result.state).toBe("SCHEME_UNAVAILABLE");
  });
});
