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
import { isPlausibleIsoDate, type SupportProfile } from "./support-profile";

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

/**
 * Real, physical mapped area alone can prove a definitive **"no"** (zero
 * mapped land really is zero land held) but can never alone prove a
 * definitive **"yes"** — Codex audit HIGH (round 1, 2026-09-04):
 * `totalMappedAreaHa` reflects real drawn field boundaries, not
 * confirmation the same land is actually declared under BISS/CAP with
 * DAFM, which is what every scheme in this registry actually requires.
 * A positive result additionally needs the farmer's own
 * `land_declared_for_schemes` confirmation — real, but self-declared and
 * DAFM-unverified, so it also sets `reliesOnSelfDeclaration`.
 */
/**
 * `minimumHa: null` — Codex audit CRITICAL (round 2, 2026-09-04): an
 * earlier version invented a `0.01ha` numeric threshold for
 * `tams3-general`'s own gate, whose registered rule
 * (`tams3-general-must-hold-agricultural-land`, `scheme-registry.ts`)
 * explicitly documents itself as "a working definitional gate, not a
 * numeric threshold" — no source cites any specific minimum hectare
 * figure for this scheme's own land-holding requirement, so none is
 * invented or displayed as if it were sourced. `null` means "any real
 * mapped land at all, no specific figure asserted"; a real number
 * (YFCIS's own sourced 5ha) is used, and named in the copy, only where
 * `scheme-registry.ts` actually cites one.
 */
function assessLandDeclaredGate(profile: SupportProfile, rule: SchemeRule, minimumHa: number | null): { result: RequirementResult; reliesOnSelfDeclaration: boolean } {
  const mappedHa = profile.derived.totalMappedAreaHa;
  const meetsMinimum = minimumHa === null ? mappedHa > 0 : mappedHa >= minimumHa;
  const minimumClause = minimumHa === null ? "" : ` (minimum ${minimumHa}ha)`;
  if (!meetsMinimum) {
    return {
      result: requirement(
        rule,
        "no",
        minimumHa === null
          ? "No agricultural land is mapped for this farm yet, regardless of declaration status."
          : `Only ${mappedHa.toFixed(2)}ha is mapped for this farm — below the ${minimumHa}ha minimum, regardless of declaration status.`,
      ),
      reliesOnSelfDeclaration: false,
    };
  }
  const declared = profile.farmerFacts.land_declared_for_schemes;
  if (declared === undefined) {
    return {
      result: requirement(rule, "unknown", `${mappedHa.toFixed(2)}ha is mapped${minimumClause}, but Farm Return can't yet confirm this land is actually declared under BISS/CAP with DAFM.`),
      reliesOnSelfDeclaration: false,
    };
  }
  const isDeclared = declared.value === true;
  return {
    result: requirement(
      rule,
      isDeclared ? "yes" : "no",
      isDeclared
        ? `${mappedHa.toFixed(2)}ha is mapped and confirmed as declared under BISS/CAP with DAFM.`
        : `${mappedHa.toFixed(2)}ha is mapped, but you've confirmed it is not currently declared under BISS/CAP with DAFM.`,
    ),
    reliesOnSelfDeclaration: true,
  };
}

function assessTams3General(profile: SupportProfile, schemeVersion: SchemeVersion): Gated {
  const rule = findRule(schemeVersion, "tams3-general-must-hold-agricultural-land");
  const { result, reliesOnSelfDeclaration } = assessLandDeclaredGate(profile, rule, null);
  return { results: [result], reliesOnSelfDeclaration };
}

function assessYoungFarmerAgeAndSetup(profile: SupportProfile, ageRule: SchemeRule, setupRule: SchemeRule, qualificationRule: SchemeRule, assessedAt: string, minAgeInclusive: number, maxAgeInclusive: number): { results: RequirementResult[]; reliesOnSelfDeclaration: boolean } {
  const results: RequirementResult[] = [];
  let reliesOnSelfDeclaration = false;

  const dob = profile.farmerFacts.date_of_birth;
  if (dob === undefined) {
    results.push(requirement(ageRule, "unknown", "Date of birth has not been entered."));
  } else if (!isPlausibleIsoDate(dob.value)) {
    results.push(requirement(ageRule, "unknown", "The entered date of birth isn't a real calendar date — please re-enter it."));
  } else {
    reliesOnSelfDeclaration = true;
    const age = wholeYearsSince(dob.value, assessedAt);
    const ok = age >= minAgeInclusive && age <= maxAgeInclusive;
    results.push(requirement(ageRule, ok ? "yes" : "no", `Age computed as ${age} from the entered date of birth (allowed range ${minAgeInclusive}-${maxAgeInclusive}).`));
  }

  const headSince = profile.farmerFacts.head_of_holding_since;
  if (headSince === undefined) {
    results.push(requirement(setupRule, "unknown", "Date became head of holding has not been entered."));
  } else if (!isPlausibleIsoDate(headSince.value)) {
    results.push(requirement(setupRule, "unknown", "The entered head-of-holding date isn't a real calendar date — please re-enter it."));
  } else {
    reliesOnSelfDeclaration = true;
    const years = wholeYearsSince(headSince.value, assessedAt);
    const ok = years >= 0 && years <= 5;
    results.push(requirement(setupRule, ok ? "yes" : "no", `${years} year(s) since becoming head of holding (must be within 5).`));
  }

  // Codex audit HIGH (round 1, 2026-09-04): a level below 6 (or a
  // malformed/unparseable value) must never become a confident "no" —
  // both YFCIS's own registered rule (a recognised qualification may be
  // completed within a 36-month grace period *after* Department
  // approval, not necessarily held already) and National Reserve's own
  // deadline (15 May 2026 — separately enforced by this module's own
  // scheme-window check, not here) mean "not yet at Level 6" is never
  // proof the farmer never will be. Only a real, plausible Level >= 6
  // entry can satisfy this requirement; every other case — missing,
  // malformed, or genuinely below 6 — is "unknown", not "no".
  const qualification = profile.farmerFacts.agricultural_qualification_level;
  const qualificationLevel = qualification === undefined ? undefined : Number(qualification.value);
  if (qualification === undefined) {
    results.push(requirement(qualificationRule, "unknown", "Agricultural qualification level has not been entered."));
  } else if (qualificationLevel === undefined || !Number.isFinite(qualificationLevel) || qualificationLevel < 0 || qualificationLevel > 10) {
    results.push(requirement(qualificationRule, "unknown", "The entered qualification level isn't a valid NFQ level (0-10) — please re-enter it."));
  } else if (qualificationLevel >= 6) {
    reliesOnSelfDeclaration = true;
    results.push(
      requirement(
        qualificationRule,
        "yes",
        `Entered qualification is NFQ Level ${qualificationLevel}, which meets the scheme's own minimum — checked as a proxy for its specific Annex J/qualification list, which Farm Return cannot verify the exact course against.`,
      ),
    );
  } else {
    results.push(
      requirement(
        qualificationRule,
        "unknown",
        `Entered qualification is NFQ Level ${qualificationLevel}, below the scheme's usual Level 6 minimum — not treated as disqualifying, since a recognised qualification can sometimes still be completed within an approval grace period or before a scheme's own deadline.`,
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
  const area = assessLandDeclaredGate(profile, areaRule, minHa);
  results.push(area.result);

  return { results, reliesOnSelfDeclaration: reliesOnSelfDeclaration || area.reliesOnSelfDeclaration };
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
 * Compares `assessedAt` (a full ISO datetime) against a scheme's own
 * `effectiveFrom`/`effectiveTo`/`applicationOpen`/`applicationCloses`
 * (each a plain `YYYY-MM-DD` per `scheme-registry.ts`) — Codex audit
 * HIGH (round 1, 2026-09-04): the seeded National Reserve scheme closed
 * 2026-05-15, but the engine never checked any date field at all, so an
 * assessment run well after closing could still report
 * `LIKELY_ELIGIBLE`, a real, concrete overstatement. String comparison
 * is deliberately sufficient here — both sides are already
 * zero-padded ISO calendar dates (`assessedAt`'s own `YYYY-MM-DD`
 * prefix), which sort lexicographically identically to chronological
 * order.
 */
function schemeWindowClosedReason(schemeVersion: SchemeVersion, assessedAt: string): string | undefined {
  const today = assessedAt.slice(0, 10);
  if (schemeVersion.effectiveFrom && today < schemeVersion.effectiveFrom) {
    return `This scheme isn't in effect yet (effective from ${schemeVersion.effectiveFrom}).`;
  }
  if (schemeVersion.effectiveTo && today > schemeVersion.effectiveTo) {
    return `This scheme's effective period has ended (${schemeVersion.effectiveTo}).`;
  }
  if (schemeVersion.applicationOpen && today < schemeVersion.applicationOpen) {
    return `Applications haven't opened yet (opens ${schemeVersion.applicationOpen}).`;
  }
  if (schemeVersion.applicationCloses && today > schemeVersion.applicationCloses) {
    return `The application window for this scheme closed on ${schemeVersion.applicationCloses}.`;
  }
  return undefined;
}

/**
 * The single entry point — dispatches by `schemeVersion.schemeId` to the
 * matching real checker above. Never returns `ELIGIBLE`/`NOT_ELIGIBLE`
 * for a `RULES_UNVERIFIED` scheme (`SUPPORTS_STRATEGY_CONTRACT.md` §4/§5),
 * fails closed to `SCHEME_UNAVAILABLE` for any registry entry this file
 * doesn't yet implement a checker for, and fails closed to `NOT_ELIGIBLE`
 * (with a real, dated explanation) whenever the scheme's own effective/
 * application window doesn't cover `assessedAt` — a future scheme added
 * to `scheme-registry.ts` without matching logic here is never silently
 * treated as eligible, and an expired/not-yet-open scheme is never
 * reported as currently eligible either.
 */
export function assessSchemeEligibility(schemeVersion: SchemeVersion, profile: SupportProfile, assessedAt: string): EligibilityAssessment {
  const base = {
    farmId: profile.farmId,
    schemeId: schemeVersion.schemeId,
    schemeVersionAssessed: schemeVersion.version,
    assessedAt,
    sources: schemeVersion.sources,
  };

  const windowClosedReason = schemeWindowClosedReason(schemeVersion, assessedAt);
  if (windowClosedReason && schemeVersion.verificationStatus === "CONFIRMED") {
    return {
      ...base,
      state: "NOT_ELIGIBLE",
      satisfied: [],
      failed: [],
      unknown: [],
      informational: schemeVersion.rules,
      whyThisState: windowClosedReason,
      whatIsMissing: [],
    };
  }

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
