/**
 * Farm Return Next — Supports Intelligence, deterministic Eligibility
 * Engine. `SUPPORTS_STRATEGY_CONTRACT.md` §5: "AI IS NOT THE ELIGIBILITY
 * ENGINE." Every result here is a plain, reproducible function of
 * `SchemeVersion` (`scheme-registry.ts`) and `SupportProfile`
 * (`support-profile.ts`) — no model call, no invented number.
 *
 * Farmer-facing states: `ELIGIBLE`, `LIKELY_ELIGIBLE`,
 * `MORE_INFORMATION_REQUIRED`, `NOT_ELIGIBLE`. Two additional internal
 * fail-closed states: `RULES_UNVERIFIED` (the scheme's own rules aren't
 * confirmed enough to judge anyone against — see `scheme-registry.ts`'s
 * `SchemeVerificationStatus`) and `SCHEME_UNAVAILABLE` (a scheme exists in
 * the registry with no matching checker below — a defensive fail-closed
 * default for a future registry entry added before its own eligibility
 * logic ships, never silently treated as eligible).
 *
 * `ELIGIBLE` vs `LIKELY_ELIGIBLE` — a real, disclosed distinction, not
 * cosmetic: `ELIGIBLE` is reserved for an assessment whose every
 * satisfied requirement rests on evidence Farm Return already holds and
 * trusts (a real mapped field's own polygon-derived area, a real
 * livestock count) — nothing here has been independently verified by
 * DAFM. Every one of this registry's young-farmer criteria depends on at
 * least one fact only the farmer can supply (date of birth, qualification,
 * when they became head of holding) — Farm Return has no way to confirm
 * any of those against a real DAFM record, so an assessment that relies
 * on one can only ever reach `LIKELY_ELIGIBLE`, never `ELIGIBLE`, however
 * confident the arithmetic is once the farmer has answered. `Unknown`
 * requirements always yield `MORE_INFORMATION_REQUIRED`, never silently
 * become `false` or fall through to `NOT_ELIGIBLE` (`CLAUDE.md`).
 */
import { yearsBetweenIsoDates } from "./nutrients";
import type { SchemeRule, SchemeSource, SchemeVersion } from "./scheme-registry";
import type { SupportProfile } from "./support-profile";

export const SCHEME_ELIGIBILITY_ENGINE_VERSION = "scheme-eligibility-v1";

export type EligibilityState = "ELIGIBLE" | "LIKELY_ELIGIBLE" | "MORE_INFORMATION_REQUIRED" | "NOT_ELIGIBLE" | "RULES_UNVERIFIED" | "SCHEME_UNAVAILABLE";

export interface RequirementResult {
  ruleId: string;
  description: string;
  satisfied: "yes" | "no" | "unknown";
  detail: string;
}

export interface EligibilityAssessment {
  farmId: string;
  schemeId: string;
  /** `SchemeVersion.version` at the moment of assessment — preserved even
   * if the registry's own record for this scheme is later replaced by a
   * newer version, per `SUPPORTS_STRATEGY_CONTRACT.md` §3's "historical
   * eligibility assessments must retain the scheme version used." This
   * assessment type is not yet persisted (see that contract's own
   * "not yet built" section) — the field exists now so a future
   * persistence layer doesn't need a shape change to add it. */
  schemeVersionAssessed: string;
  assessedAt: string;
  state: EligibilityState;
  satisfied: RequirementResult[];
  failed: RequirementResult[];
  unknown: RequirementResult[];
  /** Rules the scheme carries that this engine doesn't use to gate
   * eligibility (payment rate/ceiling/minimum-investment terms) — shown
   * for context, never folded into `satisfied`/`failed`/`unknown`. */
  informational: SchemeRule[];
  /** "Why does Farm Return think this?" */
  whyThisState: string;
  /** "What does Farm Return still need?" — empty when nothing is missing. */
  whatIsMissing: string[];
  sources: SchemeSource[];
}

function findRule(schemeVersion: SchemeVersion, id: string): SchemeRule {
  const rule = schemeVersion.rules.find((r) => r.id === id);
  if (!rule) throw new Error(`scheme-eligibility.ts: scheme ${schemeVersion.schemeId} is missing its own registered rule "${id}"`);
  return rule;
}

/** Whole-years elapsed, floored — reuses `nutrients.ts`'s existing
 * date-difference primitive (`DOMAIN_CONTRACTS.md`: never duplicate a
 * calculation) rather than a second hand-written implementation. */
function wholeYearsSince(fromIso: string, asOfIso: string): number {
  return Math.floor(yearsBetweenIsoDates(fromIso, asOfIso));
}

function requirement(rule: SchemeRule, satisfied: "yes" | "no" | "unknown", detail: string): RequirementResult {
  return { ruleId: rule.id, description: rule.description, satisfied, detail };
}

interface Gated {
  results: RequirementResult[];
  /** True when at least one satisfied/failed requirement's evidence is a
   * farmer-declared `SupportProfileFact` rather than existing, already-
   * trusted farm evidence — caps the reachable state at `LIKELY_ELIGIBLE`. */
  reliesOnSelfDeclaration: boolean;
}

function aggregate(gated: Gated, informational: SchemeRule[]): Pick<EligibilityAssessment, "satisfied" | "failed" | "unknown" | "informational" | "state" | "whyThisState" | "whatIsMissing"> {
  const satisfied = gated.results.filter((r) => r.satisfied === "yes");
  const failed = gated.results.filter((r) => r.satisfied === "no");
  const unknown = gated.results.filter((r) => r.satisfied === "unknown");

  if (failed.length > 0) {
    return {
      satisfied,
      failed,
      unknown,
      informational,
      state: "NOT_ELIGIBLE",
      whyThisState: `At least one requirement is not met: ${failed.map((f) => f.detail).join(" ")}`,
      whatIsMissing: [],
    };
  }
  if (unknown.length > 0) {
    return {
      satisfied,
      failed,
      unknown,
      informational,
      state: "MORE_INFORMATION_REQUIRED",
      whyThisState: "Every requirement checked so far is met, but at least one requirement can't be assessed yet.",
      whatIsMissing: unknown.map((u) => u.detail),
    };
  }
  return {
    satisfied,
    failed,
    unknown,
    informational,
    state: gated.reliesOnSelfDeclaration ? "LIKELY_ELIGIBLE" : "ELIGIBLE",
    whyThisState: gated.reliesOnSelfDeclaration
      ? "Every checked requirement is met, using facts you've entered yourself — DAFM would still need to verify these before final approval."
      : "Every checked requirement is met, using Farm Return's own real farm evidence.",
    whatIsMissing: [],
  };
}

function assessTams3General(profile: SupportProfile, schemeVersion: SchemeVersion): Gated {
  const rule = findRule(schemeVersion, "tams3-general-must-hold-agricultural-land");
  const hasLand = profile.derived.totalDeclaredAreaHa > 0;
  return {
    results: [requirement(rule, hasLand ? "yes" : "no", hasLand ? `${profile.derived.totalDeclaredAreaHa.toFixed(2)}ha of agricultural land is declared.` : "No agricultural land is declared/mapped for this farm yet.")],
    reliesOnSelfDeclaration: false,
  };
}

function assessYoungFarmerAgeAndSetup(profile: SupportProfile, ageRule: SchemeRule, setupRule: SchemeRule, qualificationRule: SchemeRule, assessedAt: string, minAgeInclusive: number, maxAgeInclusive: number): { results: RequirementResult[]; reliesOnSelfDeclaration: boolean } {
  const results: RequirementResult[] = [];
  let reliesOnSelfDeclaration = false;

  const dob = profile.farmerFacts.date_of_birth;
  if (dob === undefined) {
    results.push(requirement(ageRule, "unknown", "Date of birth has not been entered."));
  } else {
    reliesOnSelfDeclaration = true;
    const age = wholeYearsSince(String(dob.value), assessedAt);
    const ok = age >= minAgeInclusive && age <= maxAgeInclusive;
    results.push(requirement(ageRule, ok ? "yes" : "no", `Age computed as ${age} from the entered date of birth (allowed range ${minAgeInclusive}-${maxAgeInclusive}).`));
  }

  const headSince = profile.farmerFacts.head_of_holding_since;
  if (headSince === undefined) {
    results.push(requirement(setupRule, "unknown", "Date became head of holding has not been entered."));
  } else {
    reliesOnSelfDeclaration = true;
    const years = wholeYearsSince(String(headSince.value), assessedAt);
    const ok = years >= 0 && years <= 5;
    results.push(requirement(setupRule, ok ? "yes" : "no", `${years} year(s) since becoming head of holding (must be within 5).`));
  }

  const qualification = profile.farmerFacts.agricultural_qualification_level;
  if (qualification === undefined) {
    results.push(requirement(qualificationRule, "unknown", "Agricultural qualification level has not been entered."));
  } else {
    reliesOnSelfDeclaration = true;
    const level = Number(qualification.value);
    const ok = Number.isFinite(level) && level >= 6;
    results.push(
      requirement(
        qualificationRule,
        ok ? "yes" : "no",
        `Entered qualification is NFQ Level ${qualification.value}. Farm Return checks this against a minimum of Level 6 as a proxy for the scheme's own Annex J/qualification list — it cannot check the exact course itself.`,
      ),
    );
  }

  return { results, reliesOnSelfDeclaration };
}

function assessTams3Yfcis(profile: SupportProfile, schemeVersion: SchemeVersion, assessedAt: string): Gated {
  const ageRule = findRule(schemeVersion, "yfcis-age-window");
  const setupRule = findRule(schemeVersion, "yfcis-set-up-within-years");
  const qualificationRule = findRule(schemeVersion, "yfcis-qualification-requirement");
  const areaRule = findRule(schemeVersion, "yfcis-minimum-declared-area-ha");

  const { results, reliesOnSelfDeclaration } = assessYoungFarmerAgeAndSetup(profile, ageRule, setupRule, qualificationRule, assessedAt, 18, 40);

  const minHa = (areaRule.value as { minimumDeclaredHa: number }).minimumDeclaredHa;
  const areaOk = profile.derived.totalDeclaredAreaHa >= minHa;
  results.push(requirement(areaRule, areaOk ? "yes" : "no", `${profile.derived.totalDeclaredAreaHa.toFixed(2)}ha declared (minimum ${minHa}ha).`));

  return { results, reliesOnSelfDeclaration };
}

function assessNationalReserveYoungFarmer(profile: SupportProfile, schemeVersion: SchemeVersion, assessedAt: string): Gated {
  const bissRule = findRule(schemeVersion, "nr-yf-biss-participation-required");
  const ageRule = findRule(schemeVersion, "nr-yf-age-limit");
  const setupRule = findRule(schemeVersion, "nr-yf-set-up-window");
  const qualificationRule = findRule(schemeVersion, "nr-yf-qualification-deadline");

  const { results, reliesOnSelfDeclaration: reliesFromAgeSetup } = assessYoungFarmerAgeAndSetup(profile, ageRule, setupRule, qualificationRule, assessedAt, 0, 40);
  let reliesOnSelfDeclaration = reliesFromAgeSetup;

  const biss = profile.farmerFacts.biss_participant_2026;
  if (biss === undefined) {
    results.push(requirement(bissRule, "unknown", "2026 BISS participation has not been confirmed."));
  } else {
    reliesOnSelfDeclaration = true;
    const participating = biss.value === true;
    results.push(requirement(bissRule, participating ? "yes" : "no", participating ? "Confirmed as a 2026 BISS participant." : "Not confirmed as a 2026 BISS participant."));
  }

  return { results, reliesOnSelfDeclaration };
}

/** The one CONFIRMED rule on an otherwise `RULES_UNVERIFIED` scheme
 * (ANC) — computed and shown for context even though it can never move
 * the scheme's own overall state off `RULES_UNVERIFIED` (see
 * `assessSchemeEligibility`'s own short-circuit for that verification
 * status). Reuses `support-profile.ts`'s already-derived forage area and
 * `nutrients.ts`'s `totalLivestockUnits` — never recomputed here. */
function assessAncStockingDensityInformational(profile: SupportProfile, schemeVersion: SchemeVersion): RequirementResult {
  const rule = findRule(schemeVersion, "anc-minimum-stocking-density");
  const { forageAreaHa, totalLivestockUnits: lu } = profile.derived;
  if (forageAreaHa === null) {
    return requirement(rule, "unknown", "Forage area can't be computed until every field's planned use is set.");
  }
  if (forageAreaHa === 0) {
    return requirement(rule, "unknown", "No forage area is recorded for this farm — stocking density can't be computed.");
  }
  const density = lu / forageAreaHa;
  const min = (rule.value as { minimumLuPerForageHa: number }).minimumLuPerForageHa;
  return requirement(rule, density >= min ? "yes" : "no", `Computed stocking density is ${density.toFixed(3)} LU/forage ha (minimum ${min}).`);
}

/**
 * The single entry point — dispatches by `schemeVersion.schemeId` to the
 * matching real checker above. Never returns `ELIGIBLE`/`NOT_ELIGIBLE`
 * for a `RULES_UNVERIFIED` scheme (`SUPPORTS_STRATEGY_CONTRACT.md` §4/§5),
 * and fails closed to `SCHEME_UNAVAILABLE` for any registry entry this
 * file doesn't yet implement a checker for — a future scheme added to
 * `scheme-registry.ts` without matching logic here is never silently
 * treated as eligible.
 */
export function assessSchemeEligibility(schemeVersion: SchemeVersion, profile: SupportProfile, assessedAt: string): EligibilityAssessment {
  const base = {
    farmId: profile.farmId,
    schemeId: schemeVersion.schemeId,
    schemeVersionAssessed: schemeVersion.version,
    assessedAt,
    sources: schemeVersion.sources,
  };

  if (schemeVersion.verificationStatus === "RULES_UNVERIFIED") {
    const informational = schemeVersion.schemeId === "anc" ? [assessAncStockingDensityInformational(profile, schemeVersion)] : [];
    return {
      ...base,
      state: "RULES_UNVERIFIED",
      satisfied: [],
      failed: [],
      unknown: informational.filter((r) => r.satisfied !== "yes"),
      informational: schemeVersion.rules,
      whyThisState: `This scheme's own rules aren't confirmed enough yet for Farm Return to judge eligibility: ${schemeVersion.knownLimitations[0]}`,
      whatIsMissing: schemeVersion.knownLimitations,
    };
  }

  let gated: Gated;
  let informational: SchemeRule[];
  switch (schemeVersion.schemeId) {
    case "tams3-general":
      gated = assessTams3General(profile, schemeVersion);
      informational = schemeVersion.rules.filter((r) => r.id !== "tams3-general-must-hold-agricultural-land");
      break;
    case "tams3-yfcis":
      gated = assessTams3Yfcis(profile, schemeVersion, assessedAt);
      informational = schemeVersion.rules.filter((r) => !["yfcis-age-window", "yfcis-set-up-within-years", "yfcis-qualification-requirement", "yfcis-minimum-declared-area-ha"].includes(r.id));
      break;
    case "national-reserve-young-farmer":
      gated = assessNationalReserveYoungFarmer(profile, schemeVersion, assessedAt);
      informational = schemeVersion.rules.filter((r) => !["nr-yf-biss-participation-required", "nr-yf-age-limit", "nr-yf-set-up-window", "nr-yf-qualification-deadline"].includes(r.id));
      break;
    default:
      return {
        ...base,
        state: "SCHEME_UNAVAILABLE",
        satisfied: [],
        failed: [],
        unknown: [],
        informational: schemeVersion.rules,
        whyThisState: `Farm Return's eligibility engine doesn't yet have logic for "${schemeVersion.name}".`,
        whatIsMissing: ["Eligibility logic for this scheme has not been built yet."],
      };
  }

  return { ...base, ...aggregate(gated, informational) };
}

export function assessAllSchemes(profile: SupportProfile, schemeVersions: SchemeVersion[], assessedAt: string): EligibilityAssessment[] {
  return schemeVersions.map((sv) => assessSchemeEligibility(sv, profile, assessedAt));
}
