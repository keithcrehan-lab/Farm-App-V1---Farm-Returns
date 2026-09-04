/**
 * Farm Return Next — Supports Intelligence, versioned Scheme Registry.
 *
 * `docs/product/farm-return-next-v1.1/SUPPORTS_STRATEGY_CONTRACT.md` §3:
 * "Rules come from SchemeVersion" — no magic percentage/threshold/ceiling
 * may be typed directly into a UI component or the eligibility engine.
 * Every number here carries a `SchemeSource` citation and a
 * `verificationStatus`. `CLAUDE.md`'s "never fabricate a production
 * scientific, regulatory or financial number" rule applied to Irish farm
 * schemes specifically: a rate/threshold this file cannot cite to a real,
 * checked source is not written down as a number — the field is left
 * absent and `verificationStatus` is `"RULES_UNVERIFIED"` instead
 * (`scheme-eligibility.ts` refuses to return `ELIGIBLE`/`NOT_ELIGIBLE` for
 * any `SchemeVersion` at that status — see that module's own doc comment).
 *
 * Sourcing note for this first seed set (2026-09-04): `gov.ie` itself
 * returned HTTP 403 to this session's own fetch tool for every DAFM
 * scheme page tried (`WebFetch` — confirmed for ANC, YFCIS, National
 * Reserve, BISS entitlements) — a real, disclosed tooling limitation, not
 * a claim those pages don't exist or say something different. Every
 * number below is instead sourced to a page this session *could* fetch
 * and read verbatim (Teagasc's own co-managing-body pages, which
 * republish DAFM's own scheme terms; IFAC, an authoritative farm
 * advisory secondary source) or an official DAFM/gov.ie citation returned
 * intact inside a `WebSearch` result summary (Basic Payment/BISS,
 * National Reserve) — see each `SchemeSource.retrievedVia` for exactly
 * which. `docs/evidence-register.md`'s own source-hierarchy discipline
 * ("1. Irish Statute Book/EU legislation, 2. DAFM official material, 3.
 * Teagasc/other Irish authoritative technical source, 4. approved
 * authoritative secondary material only where necessary") is followed
 * per-fact, not per-scheme: within one `SchemeVersion`, some facts are
 * DAFM-official-tier and others are Teagasc-tier, each cited
 * individually rather than the whole record inheriting one blended tier.
 */

export type SchemeCategory =
  | "direct_basic_support"
  | "environmental_support"
  | "young_new_farmer_support"
  | "capital_investment_support"
  | "livestock_support";

export type SchemeAuthority = "DAFM" | "EU_CAP";

/** Section-source hierarchy per `docs/evidence-register.md`'s own
 * governance rules, reused verbatim rather than inventing a second tier
 * vocabulary for schemes specifically. */
export type SchemeSourceTier =
  | "statute"
  | "dafm_official"
  | "teagasc_technical"
  | "authoritative_secondary";

export interface SchemeSource {
  tier: SchemeSourceTier;
  publisher: string;
  title: string;
  url: string;
  /** How this session actually obtained the content — honesty about a
   * real, disclosed tooling gap (`gov.ie` blocking this session's own
   * fetch tool), not asserted as a live verified connection the way
   * `docs/evidence-register.md`'s Met Éireann/CDSE rows can claim. */
  retrievedVia: "direct_fetch" | "search_result_summary";
  retrievedAt: string; // ISO date
}

export type SchemeVerificationStatus = "CONFIRMED" | "RULES_UNVERIFIED";

/**
 * One versioned, sourced eligibility or payment rule. `scheme-eligibility.ts`
 * reads these — it never hardcodes a threshold inline. `value` is
 * deliberately untyped (`unknown`) here — each scheme's own eligibility
 * function (`scheme-eligibility.ts`) narrows it to the shape that
 * specific rule needs, the same "producer-specific generic shape"
 * pattern `Prompt.basis` already uses (`src/orchestration/prompt/index.ts`).
 */
export interface SchemeRule {
  id: string;
  description: string;
  value: unknown;
  source: SchemeSource;
}

export interface SchemeVersion {
  schemeId: string;
  version: string;
  name: string;
  category: SchemeCategory;
  authority: SchemeAuthority;
  /** ISO date. Codex audit CRITICAL (round 9, 2026-09-04) made this
   * optional: it was originally required, which forced every seeded
   * record (including one whose real source names no window date at
   * all) to carry *some* value here — for a `CONFIRMED` scheme this
   * feeds `assessSchemeEligibility`'s own farmer-facing `SCHEME_CLOSED`
   * determination directly (`RULES_UNVERIFIED` schemes never reach that
   * check), so an unsourced placeholder date reached a real decision.
   * Omit entirely, exactly like the three siblings below already could,
   * when no source actually states a window date — `undefined` here
   * means "no known window constraint", never "open forever" asserted
   * as a fact. */
  effectiveFrom?: string;
  effectiveTo?: string;
  applicationOpen?: string;
  applicationCloses?: string;
  verificationStatus: SchemeVerificationStatus;
  /** Plain-English summary of what this scheme is, farmer-facing safe —
   * never a number that isn't also in `rules` with its own source. */
  summary: string;
  rules: SchemeRule[];
  /** Known limitations of this record — read aloud in the eligibility
   * detail screen so a farmer never mistakes "the parts we could verify"
   * for "the whole scheme". Required, never empty — every scheme has at
   * least one real limitation at this seed stage. */
  knownLimitations: string[];
  sources: SchemeSource[];
}

const RETRIEVED_2026_09_04 = "2026-09-04";

const TEAGASC_YFCIS_SOURCE: SchemeSource = {
  tier: "teagasc_technical",
  publisher: "Teagasc",
  title: "Young Farmer Capital Investment Scheme (YFCIS) (TAMS 3)",
  url: "https://teagasc.ie/rural-economy/rural-development/equine/grants-and-schemes/young-farmer-capital-investment-scheme/",
  retrievedVia: "direct_fetch",
  retrievedAt: RETRIEVED_2026_09_04,
};

const IFAC_TAMS_SOURCE: SchemeSource = {
  tier: "authoritative_secondary",
  publisher: "IFAC (farm accountancy/advisory)",
  title: "TAMS III deadlines are approaching: should you apply?",
  url: "https://www.ifac.ie/news-insights/news/tams-iii-deadlines-are-approaching-should-you-apply-",
  retrievedVia: "search_result_summary",
  retrievedAt: RETRIEVED_2026_09_04,
};

const TEAGASC_ANC_SOURCE: SchemeSource = {
  tier: "teagasc_technical",
  publisher: "Teagasc",
  title: "Areas of Natural Constraint (ANC)",
  url: "https://teagasc.ie/rural-economy/rural-development/equine/grants-and-schemes/areas-of-natural-constraint/",
  retrievedVia: "direct_fetch",
  retrievedAt: RETRIEVED_2026_09_04,
};

const GOVIE_NATIONAL_RESERVE_SOURCE: SchemeSource = {
  tier: "dafm_official",
  publisher: "Department of Agriculture, Food and the Marine (gov.ie)",
  title: "National Reserve (Young Farmer Category)",
  url: "https://www.gov.ie/en/department-of-agriculture-food-and-the-marine/services/national-reserve-young-farmer-category/",
  // This session's own WebFetch tool received HTTP 403 from gov.ie for
  // this exact page — the eligibility text quoted in `rules` below was
  // returned verbatim inside a WebSearch result summary that cites this
  // URL as its origin, not read by this session directly from the page.
  retrievedVia: "search_result_summary",
  retrievedAt: RETRIEVED_2026_09_04,
};

const CITIZENS_INFO_BISS_SOURCE: SchemeSource = {
  tier: "authoritative_secondary",
  publisher: "Citizens Information",
  title: "Basic Income Support for Sustainability Scheme for farmers",
  url: "https://www.citizensinformation.ie/en/environment/land/basic-income-support-for-sustainability-scheme-for-farmers/",
  retrievedVia: "search_result_summary",
  retrievedAt: RETRIEVED_2026_09_04,
};

/**
 * 1 — direct/basic agricultural support. Structural eligibility (one
 * entitlement per eligible hectare, convergence, the €700/ha payment
 * cap) is confirmed; the actual euro value of one entitlement is NOT
 * confirmed this session (search results disagreed with themselves — one
 * figure looked like a stale planning-stage estimate, not a checked 2026
 * live number) — `verificationStatus: "RULES_UNVERIFIED"` for that
 * reason alone, deliberately not for the structural facts, which are
 * kept and cited so a later pass with real per-hectare figures doesn't
 * have to re-derive the scheme's own shape.
 */
const BISS_2026: SchemeVersion = {
  schemeId: "biss",
  version: "2026",
  name: "Basic Income Support for Sustainability (BISS)",
  category: "direct_basic_support",
  authority: "DAFM",
  effectiveFrom: "2026-01-01",
  verificationStatus: "RULES_UNVERIFIED",
  summary:
    "The main annual direct payment for actively farmed land in Ireland — one payment entitlement per eligible hectare declared, its value moving each year toward a national average ('convergence'), capped per hectare.",
  rules: [
    {
      id: "biss-entitlement-per-eligible-ha",
      description: "One payment entitlement is allocated per eligible hectare of land declared.",
      value: { structure: "one_entitlement_per_eligible_hectare" },
      source: CITIZENS_INFO_BISS_SOURCE,
    },
    {
      id: "biss-convergence-floor-2026",
      description: "By 2026, every entitlement's value converges to at least 85% of the national average entitlement value.",
      value: { convergenceFloorPctOfNationalAverage: 85 },
      source: CITIZENS_INFO_BISS_SOURCE,
    },
    {
      id: "biss-payment-cap-per-ha",
      description: "Ireland applies a maximum BISS payment amount of €700 per hectare.",
      value: { maxPaymentPerHaEur: 700 },
      source: CITIZENS_INFO_BISS_SOURCE,
    },
  ],
  knownLimitations: [
    "The actual euro value of one 2026 BISS entitlement (the 'national average value' every convergence/top-up calculation depends on) is not confirmed by this record — this session's own tools could not reach a live DAFM figure for it. Any BISS or National-Reserve-top-up euro estimate this app might otherwise show is deliberately withheld, not guessed, until that figure is confirmed.",
    "Per-farm entitlement history (how many entitlements this farm holds today, and their current individual value) is not modelled anywhere in Farm Return yet — BISS eligibility here can only describe the scheme's shape, not this specific farm's real entitlement position.",
  ],
  sources: [CITIZENS_INFO_BISS_SOURCE],
};

/**
 * 2 — capital investment support, general/standard rate.
 *
 * `verificationStatus: "RULES_UNVERIFIED"` — Codex audit HIGH (round 6,
 * 2026-09-04), correcting this record's own earlier (round 0) mistaken
 * `"CONFIRMED"`: no rule below was actually established by a source that
 * covers *this specific scheme*. `IFAC_TAMS_SOURCE`
 * (`retrievedVia: "search_result_summary"`, never directly fetched) is
 * an advisory summary about TAMS III generally, not a direct statement
 * of a land-holding gate; the minimum-investment rule's own citation
 * (`TEAGASC_YFCIS_SOURCE`) is literally the *Young Farmer* scheme's own
 * page, not this general scheme's — a genuine cross-scheme sourcing
 * error, not a defensible shared fact. Per this file's own header rule
 * ("never fabricate... a number the source hierarchy can't support"),
 * this whole record stays unverified until a directly-fetched, scheme-
 * specific source exists — the 40%/€90,000 figures may well be correct
 * (they match public reporting), but "well corroborated by secondary
 * commentary" is not the same evidentiary bar this app holds a
 * production regulatory eligibility determination to.
 */
const TAMS3_GENERAL_2026: SchemeVersion = {
  schemeId: "tams3-general",
  version: "2026-tranche",
  name: "TAMS 3 — standard rate (On-Farm Capital Investment Scheme)",
  category: "capital_investment_support",
  authority: "DAFM",
  effectiveFrom: "2026-01-01",
  applicationCloses: "2026-12-04",
  verificationStatus: "RULES_UNVERIFIED",
  summary:
    "Co-funded grant aid toward eligible farm capital investments (nutrient storage, animal welfare/housing, dairy equipment, tillage equipment and more) at DAFM's own published standard rate, open to any eligible DAFM-registered farmer regardless of age.",
  rules: [
    {
      id: "tams3-general-must-hold-agricultural-land",
      description: "Open to a farmer who holds/declares eligible agricultural land — a working definitional gate, not a numeric threshold.",
      value: { requiresDeclaredAgriculturalLand: true },
      source: IFAC_TAMS_SOURCE,
    },
    {
      id: "tams3-general-grant-rate-pct",
      description: "Standard TAMS 3 grant rate for a farmer not qualifying for the Young Farmer/Women in Agriculture top-up rate.",
      value: { grantRatePct: 40 },
      source: IFAC_TAMS_SOURCE,
    },
    {
      id: "tams3-investment-ceiling-eur",
      description: "Maximum eligible investment ceiling per holding across the standard TAMS 3 measures.",
      value: { ceilingEur: 90000 },
      source: IFAC_TAMS_SOURCE,
    },
    {
      id: "tams3-minimum-eligible-investment-eur",
      description: "Minimum eligible investment per TAMS 3 application.",
      value: { minimumEur: 2000 },
      source: TEAGASC_YFCIS_SOURCE,
    },
  ],
  knownLimitations: [
    "None of this scheme's own rules (land-holding gate, 40% rate, €90,000 ceiling) are sourced from a page that specifically and directly covers the general/standard TAMS 3 rate — the cited sources are a general advisory summary and, for one rule, the Young Farmer scheme's own separate page. The figures may well be correct (they match public reporting) but do not meet this app's own bar for a confirmed regulatory determination — Farm Return will not tell you ELIGIBLE or NOT_ELIGIBLE for this scheme until a directly-fetched, scheme-specific source exists.",
    "The 40% rate and €90,000 ceiling, if confirmed, would still not encode each measure's own separate eligible-item reference-cost list, which is where a real per-item grant amount would ultimately be calculated from.",
    "Solar PV specifically is reported elsewhere as also sitting at this same 60/90,000 structure for young farmers — not independently re-verified for this record; treat solar as a candidate investment under this scheme's general numbers only, not as its own separately confirmed sub-scheme.",
    "Tranche ranking/selection criteria (DAFM has publicly stated some tranches apply ranking & selection, not simple first-come approval) are not modelled — this record cannot say whether a specific application would be selected within a tranche's own budget, only whether the farm meets the scheme's stated eligibility terms.",
  ],
  sources: [TEAGASC_YFCIS_SOURCE, IFAC_TAMS_SOURCE],
};

/**
 * 3 — young/new farmer + capital investment. The most fully corroborated
 * record in this seed set for its own eligibility rules: every rule
 * below is stated directly, in quoted form, on Teagasc's own
 * co-managing-body page. Deliberately carries no `effectiveFrom`/
 * `applicationCloses` — Codex audit CRITICAL (round 9, 2026-09-04): an
 * earlier version guessed `2026-01-01`/`2026-12-04` for both, neither
 * cited to any `SchemeRule`/`SchemeSource`. Re-checked directly
 * (`WebFetch`, 2026-09-04): Teagasc's own page states no window date at
 * all. IFAC's separate TAMS III article does name three real 2026
 * tranche deadlines (5 June, 4 September, 4 December — the December one
 * coincidentally matches the guessed date) but never mentions YFCIS
 * specifically or says which tranche(s) it applies to — using it here
 * would repeat the exact cross-scheme sourcing error round 6 already
 * fixed for `TAMS3_GENERAL_2026`. Farm Return has no evidenced window
 * for this scheme, so it states none, rather than guessing one that
 * could wrongly tell a farmer this scheme is currently closed.
 */
const TAMS3_YFCIS_2026: SchemeVersion = {
  schemeId: "tams3-yfcis",
  version: "2026-tranche",
  name: "TAMS 3 — Young Farmer Capital Investment Scheme (YFCIS)",
  category: "young_new_farmer_support",
  authority: "DAFM",
  verificationStatus: "CONFIRMED",
  summary:
    "The young-farmer top-up rate of TAMS 3 — the same eligible capital investments as the standard scheme, at a higher grant rate for a farmer who is under 41, holds (or will hold) the required agricultural qualification, and has set up as head of holding for the first time within the last five years.",
  rules: [
    {
      id: "yfcis-grant-rate-pct",
      description: "Young Farmer Capital Investment Scheme grant rate.",
      value: { grantRatePct: 60 },
      source: TEAGASC_YFCIS_SOURCE,
    },
    {
      id: "yfcis-investment-ceiling-eur",
      description: "Maximum eligible investment ceiling per holding (per partner for a qualifying partnership, up to a combined maximum).",
      value: { ceilingEur: 90000, partnershipCeilingEur: 160000 },
      source: TEAGASC_YFCIS_SOURCE,
    },
    {
      id: "yfcis-minimum-eligible-investment-eur",
      description: "Minimum eligible investment per application.",
      value: { minimumEur: 2000 },
      source: TEAGASC_YFCIS_SOURCE,
    },
    {
      id: "yfcis-age-window",
      description: "Applicant must be aged over 18 and under 41 at the date of submitting the application.",
      value: { minAgeYears: 18, maxAgeYearsExclusive: 41 },
      source: TEAGASC_YFCIS_SOURCE,
    },
    {
      id: "yfcis-set-up-within-years",
      description: "Applicant must have set up as head of holding for the first time within 5 years of the application.",
      value: { withinYears: 5 },
      source: TEAGASC_YFCIS_SOURCE,
    },
    {
      id: "yfcis-qualification-requirement",
      description: "Applicant must hold (or complete within 36 months of Department approval to commence works) a recognised agricultural qualification per DAFM's Annex J list.",
      value: { requiresAnnexJQualification: true, grantsGracePeriodMonths: 36 },
      source: TEAGASC_YFCIS_SOURCE,
    },
    {
      id: "yfcis-minimum-declared-area-ha",
      description: "Applicant must have declared at least 5 hectares under BISS (or its predecessor BPS) for the year of application or the preceding year.",
      value: { minimumDeclaredHa: 5 },
      source: TEAGASC_YFCIS_SOURCE,
    },
  ],
  knownLimitations: [
    "Farm Return does not yet capture Farm.headOfHoldingSince or Farm.agriculturalQualification anywhere in the existing farm model — both are genuine Support Profile gaps this scheme's own eligibility check must ask for, never inferred.",
    "The eligible-item reference-cost list itself (what specific investment items qualify, and at what maximum reference cost each) is not encoded here — this record can only assess the farmer-level/holding-level eligibility gate, not price a specific candidate investment against DAFM's own reference costs.",
    "The qualification requirement above cites DAFM's own specific Annex J course list, which Farm Return does not hold — a farmer-entered NFQ level alone can only ever leave this one requirement as 'more information needed', never confirm it, however high the level (Codex audit HIGH, round 5, 2026-09-04: an earlier version wrongly let a Level 6+ entry alone satisfy this). A separate, genuine self-declaration (do you hold or are you on track to complete a real Annex J-recognised qualification?) can resolve it directly (Codex audit HIGH, round 12, 2026-09-04: without this, YFCIS could never progress past 'more information required' even once every gap Farm Return asked for was answered).",
    "No application window (opening/closing date) is encoded for this scheme — TAMS III runs multiple tranches per year (three named in a real 2026 source: 5 June, 4 September, 4 December) but no source this session could reach states which tranche(s) YFCIS specifically follows, so no window date is shown rather than guessing one (Codex audit CRITICAL, round 9, 2026-09-04).",
  ],
  sources: [TEAGASC_YFCIS_SOURCE],
};

/**
 * 4 — environmental/land-constraint support. Genuinely partial: one real
 * eligibility criterion (minimum stocking density) is confirmed, but the
 * per-hectare payment rate and the designated-ANC-area boundary data
 * (which fields are actually 'in ANC') are not — `verificationStatus:
 * "RULES_UNVERIFIED"` for the whole record, per this file's own header
 * comment: an unverified scheme must never present a computed euro
 * value or a bare ELIGIBLE/NOT_ELIGIBLE.
 */
const ANC_2026: SchemeVersion = {
  schemeId: "anc",
  version: "2026",
  name: "Areas of Natural Constraints (ANC)",
  category: "environmental_support",
  authority: "DAFM",
  effectiveFrom: "2026-01-01",
  verificationStatus: "RULES_UNVERIFIED",
  summary:
    "Annual per-hectare payment for farming land in a DAFM-designated area facing natural handicaps (mountain/remoteness/poor soils/climate) — a stocking-density condition applies; the designated-area map and the actual per-hectare payment rates are not yet part of this record.",
  rules: [
    {
      id: "anc-minimum-stocking-density",
      description: "Applicant must maintain a minimum stocking density of 0.10 livestock units per forage hectare for 28 consecutive weeks (or 7 months) within the scheme year.",
      value: { minimumLuPerForageHa: 0.1, minimumConsecutiveWeeks: 28 },
      source: TEAGASC_ANC_SOURCE,
    },
  ],
  knownLimitations: [
    "This record does NOT include the ANC per-hectare payment rate for any land category, nor the payment area cap — every source this session could actually read either omitted the figures or (gov.ie's own designation/rate page) returned HTTP 403 to this session's own fetch tool. No rate is guessed.",
    "Whether any of this farm's own mapped fields sit inside a DAFM-designated ANC area is not modelled — Farm Return has no ANC designation boundary dataset loaded. `scheme-eligibility.ts` cannot resolve this criterion at all today; it always reports it as a genuine gap, never assumed either way.",
    "Because both the designation boundary and the payment rate are unresolved, this scheme's eligibility assessment can only ever reach MORE_INFORMATION_REQUIRED-equivalent internal states, never ELIGIBLE/NOT_ELIGIBLE, regardless of how the confirmed stocking-density criterion alone resolves.",
  ],
  sources: [TEAGASC_ANC_SOURCE],
};

/**
 * 5 — young/new farmer support, entitlement top-up (distinct mechanism
 * from TAMS 3's capital grant — this one raises the value of a young
 * farmer's own BISS entitlements rather than funding an investment).
 *
 * `verificationStatus: "RULES_UNVERIFIED"` — Codex audit HIGH (round 6,
 * 2026-09-04), correcting this record's own earlier (round 0) mistaken
 * `"CONFIRMED"`: every rule below traces to `GOVIE_NATIONAL_RESERVE_SOURCE`,
 * which is a real gov.ie page's own eligibility text — but only as
 * quoted inside a `WebSearch` result summary, never read directly by
 * this session (`retrievedVia: "search_result_summary"` — the same
 * direct `WebFetch` of this exact URL returned HTTP 403). A search
 * snippet, however precisely it quotes the source, is not the same
 * evidentiary weight as this app's own source-hierarchy discipline
 * requires for a production regulatory eligibility determination —
 * this record stays unverified until a directly-fetched copy of the
 * real gov.ie page exists.
 */
const NATIONAL_RESERVE_YOUNG_FARMER_2026: SchemeVersion = {
  schemeId: "national-reserve-young-farmer",
  version: "2026",
  name: "National Reserve — Young Farmer Category",
  category: "young_new_farmer_support",
  authority: "DAFM",
  effectiveFrom: "2026-01-01",
  applicationCloses: "2026-05-15",
  verificationStatus: "RULES_UNVERIFIED",
  summary:
    "Allocates BISS payment entitlements at (or tops up existing entitlements to) the national average value for a young farmer setting up for the first time — every eligibility fact below is quoted from a real DAFM page, but only via a search-result summary, not a direct fetch this session could verify itself (see this scheme's own known limitations); the euro value of the resulting top-up is separately unconfirmed too, since it depends on BISS_2026's own unconfirmed national-average entitlement figure.",
  rules: [
    {
      id: "nr-yf-biss-participation-required",
      description: "Applicant must be participating in the 2026 BISS scheme.",
      value: { requiresBissParticipation2026: true },
      source: GOVIE_NATIONAL_RESERVE_SOURCE,
    },
    {
      id: "nr-yf-age-limit",
      description: "Applicant must be no more than 40 years of age at any time during the calendar year of their first application.",
      value: { maxAgeYearsInclusive: 40 },
      source: GOVIE_NATIONAL_RESERVE_SOURCE,
    },
    {
      id: "nr-yf-set-up-window",
      description: "Applicant must be setting up as head of a farm holding for the first time, or have set one up during the five years preceding their first application.",
      value: { withinYears: 5 },
      source: GOVIE_NATIONAL_RESERVE_SOURCE,
    },
    {
      id: "nr-yf-qualification-deadline",
      description: "Applicant must have completed a recognised agricultural course at NFQ Level 6 (or equivalent) by 15 May 2026.",
      value: { minimumNfqLevel: 6, deadline: "2026-05-15" },
      source: GOVIE_NATIONAL_RESERVE_SOURCE,
    },
    {
      id: "nr-yf-application-deadline",
      description: "Application must be submitted on or before 15 May 2026.",
      value: { deadline: "2026-05-15" },
      source: GOVIE_NATIONAL_RESERVE_SOURCE,
    },
  ],
  knownLimitations: [
    "Every eligibility fact above is quoted from a real gov.ie page, but only via a WebSearch result summary — this session's own direct fetch of that exact page returned HTTP 403, so none of it has been independently read and verified by this session itself. Farm Return will not tell you ELIGIBLE or NOT_ELIGIBLE for this scheme until a directly-fetched copy of the real page exists.",
    "The payment mechanism (allocation of entitlements at national average value, or a top-up to it) depends entirely on the national average entitlement value BISS_2026 already discloses as unconfirmed — even once the eligibility gate itself is confirmed, no euro top-up figure would be shown until that value is confirmed too.",
    "Whether this farmer already holds BISS entitlements from a prior allocation (which would change whether National Reserve tops-up vs. allocates fresh) is not modelled in Farm Return's existing farm data.",
  ],
  sources: [GOVIE_NATIONAL_RESERVE_SOURCE],
};

/**
 * The registry itself — every `SchemeVersion` Farm Return currently
 * knows about, seeded 2026-09-04. `scheme-eligibility.ts` is the only
 * intended reader; a UI component reads a scheme's rules only through an
 * `EligibilityAssessment`, never by importing this array directly (same
 * "domain layer produces the number, presentation layer never
 * recomputes it" discipline as every other `src/domain/` module).
 */
export const SCHEME_REGISTRY: SchemeVersion[] = [
  BISS_2026,
  TAMS3_GENERAL_2026,
  TAMS3_YFCIS_2026,
  ANC_2026,
  NATIONAL_RESERVE_YOUNG_FARMER_2026,
];

export function getSchemeVersion(schemeId: string): SchemeVersion | undefined {
  return SCHEME_REGISTRY.find((s) => s.schemeId === schemeId);
}

export function listSchemeVersions(): SchemeVersion[] {
  return SCHEME_REGISTRY;
}
