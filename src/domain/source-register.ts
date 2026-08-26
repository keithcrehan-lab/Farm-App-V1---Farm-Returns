/**
 * Scientific engine V3 foundation — source IDs and ruleset versions.
 * Phase 1 (see `src/domain/evidence.ts`'s header for the phase note).
 *
 * `SOURCE_REGISTER` is a typed copy of
 * `docs/scientific-engine/v3/sources/source_register.csv`'s bibliographic
 * metadata (authority, title, publication/checked date, URL, precedence,
 * effective status) — deliberately NO numeric agronomic/regulatory value
 * lives here. Those stay in each domain module (`nutrients.ts`,
 * `livestock.ts`, ...) until their own phase replaces/extends them; this
 * file only lets a future `CalculationStep`/`SourceCitation` cite a
 * `SourceId` and have it resolve to a real, dated, sourced reference.
 *
 * Three additional source IDs (`ENGINE_AUDIT_RULE`, `ENGINE_UNIT_RULE`,
 * `ENGINE_FAIL_CLOSED`) are not Irish external sources — they are cited by
 * `validation/golden_farm_tests.csv` itself for engine-internal rules (a
 * report-completeness check, a unit-basis gate, an unsupported-scenario
 * block) that have no external authority to cite, and are registered here
 * with `sourceType: "ENGINE_INTERNAL"` rather than left as an unregistered
 * string a future citation could invent ad hoc.
 */

export type SourceId =
  | "LAW_IE_SI_588_2025"
  | "LAW_IE_SI_119_2026"
  | "GOV_IE_SIXTH_NAP"
  | "TEAGASC_SOIL_SAMPLING"
  | "TEAGASC_GREENBOOK_2020"
  | "TEAGASC_PH_LIME"
  | "TEAGASC_ORGANIC_MANURES"
  | "TEAGASC_FODDER_2026_08_26"
  | "TEAGASC_BEEF_SILAGE_2026_07"
  | "TEAGASC_BEEF_2026_FORAGE"
  | "TEAGASC_BEEF_2026_FINISHING"
  | "TEAGASC_DAIRYBEEF_DMD"
  | "TEAGASC_SHEEP_2026"
  | "TEAGASC_CLOVER_BEEF_2026"
  | "TEAGASC_CLOVER_DAIRY_2026"
  | "TEAGASC_SOIL_INDEX"
  | "MET_SMD"
  | "MET_WARNINGS_JSON"
  | "CSO_AG_PRICES"
  | "TEAGASC_CLOVER_DAIRY_TODAYS_FARM_2026"
  | "ENGINE_AUDIT_RULE"
  | "ENGINE_UNIT_RULE"
  | "ENGINE_FAIL_CLOSED";

export interface SourceReference {
  sourceId: SourceId;
  authority: string;
  title: string;
  sourceType: string;
  /** Left `undefined`, never guessed, where `source_register.csv`'s own
   * `publication_date` cell is blank (several Teagasc advisory pages carry
   * no single publication date). */
  publicationDate?: string;
  checkedDate: string;
  url?: string;
  precedence: string;
  effectiveStatus: "CURRENT" | "SUPERSEDED" | "HISTORICAL";
  /** `source_register.csv`'s own `notes` column, verbatim — the caveat a
   * calculation trace citing this source must not silently drop (e.g.
   * "Never copy a base provision without resolving S.I. 119/2026 amendment
   * precedence."). */
  notes?: string;
}

export const SOURCE_REGISTER: Record<SourceId, SourceReference> = {
  LAW_IE_SI_588_2025: {
    sourceId: "LAW_IE_SI_588_2025",
    authority: "Irish Statute Book",
    title:
      "S.I. No. 588/2025 — European Union (Good Agricultural Practice for Protection of Waters) Regulations 2025",
    sourceType: "STATUTORY",
    publicationDate: "2025-12-12",
    checkedDate: "2026-08-26",
    url: "https://www.irishstatutebook.ie/eli/2025/si/588/made/en/print",
    precedence: "Highest legal authority, except where expressly amended by later law.",
    effectiveStatus: "CURRENT",
    notes: "Never copy a base provision without resolving S.I. 119/2026 amendment precedence.",
  },
  LAW_IE_SI_119_2026: {
    sourceId: "LAW_IE_SI_119_2026",
    authority: "Irish Statute Book",
    title:
      "S.I. No. 119/2026 — European Union (Good Agricultural Practice for Protection of Waters) (Amendment) Regulations 2026",
    sourceType: "STATUTORY_AMENDMENT",
    publicationDate: "2026-04-03",
    checkedDate: "2026-08-26",
    url: "https://www.irishstatutebook.ie/eli/2026/si/119/made/en/print",
    precedence: "Overrides S.I. 588/2025 wherever it amends it.",
    effectiveStatus: "CURRENT",
    notes: "Ruleset resolver must combine base + amendment; never maintain competing hard-coded copies.",
  },
  GOV_IE_SIXTH_NAP: {
    sourceId: "GOV_IE_SIXTH_NAP",
    authority: "Government of Ireland",
    title: "Sixth Nitrates Action Programme",
    sourceType: "OFFICIAL_POLICY_FRAMEWORK",
    publicationDate: "2025-12-05",
    checkedDate: "2026-08-26",
    url: "https://www.gov.ie/en/department-of-housing-local-government-and-heritage/publications/sixth-nitrates-action-programme/",
    precedence: "Context only; statute controls compliance calculations.",
    effectiveStatus: "CURRENT",
    notes: "Sixth NAP effective from 1 January 2026.",
  },
  TEAGASC_SOIL_SAMPLING: {
    sourceId: "TEAGASC_SOIL_SAMPLING",
    authority: "Teagasc",
    title: "Soil Sampling",
    sourceType: "ADVISORY/COMPLIANCE_GUIDANCE",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/environment/soil/soil-fertility/soil-analysis/soil-sampling/",
    precedence: "Use statute for legal determination; Teagasc for implementation/advisory explanation.",
    effectiveStatus: "CURRENT",
    notes: "Four-year nutrient use must honour the statutory Index-4 persistence exception.",
  },
  TEAGASC_GREENBOOK_2020: {
    sourceId: "TEAGASC_GREENBOOK_2020",
    authority: "Teagasc",
    title: "Major & Micro Nutrient Advice for Productive Agricultural Crops, 5th Edition",
    sourceType: "SCIENTIFIC_ADVISORY_BASELINE",
    publicationDate: "2020",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/environment/soil/soil-fertility/fertiliser-advice/",
    precedence: "Agronomic baseline only; never overrides current statute.",
    effectiveStatus: "CURRENT",
    notes: "Raw extraction in this pack is reference-only until source-page headers/units/footnotes are checked.",
  },
  TEAGASC_PH_LIME: {
    sourceId: "TEAGASC_PH_LIME",
    authority: "Teagasc",
    title: "Soil pH / Liming",
    sourceType: "SCIENTIFIC_ADVISORY",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/environment/soil/soil-fertility/crop-nutrition/soil-ph-liming/",
    precedence: "Agronomic advisory.",
    effectiveStatus: "CURRENT",
    notes: "Exact lime t/ha must come from a laboratory lime requirement/buffer test, not pH alone.",
  },
  TEAGASC_ORGANIC_MANURES: {
    sourceId: "TEAGASC_ORGANIC_MANURES",
    authority: "Teagasc",
    title: "Organic Manures",
    sourceType: "SCIENTIFIC_ADVISORY",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/environment/soil/soil-fertility/fertiliser-advice/organic-manures/",
    precedence: "Agronomic ledger only; legal ledger uses statutory values.",
    effectiveStatus: "CURRENT",
    notes: "Measured composition outranks a default for agronomic planning when scientifically appropriate.",
  },
  TEAGASC_FODDER_2026_08_26: {
    sourceId: "TEAGASC_FODDER_2026_08_26",
    authority: "Teagasc",
    title: "Assessing Winter Feed Stocks",
    sourceType: "CURRENT_IRISH_ADVISORY",
    publicationDate: "2026-08-26",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/news--events/daily/assessing-winter-feed-stocks/",
    precedence: "Preferred current basic fodder-planning table.",
    effectiveStatus: "CURRENT",
    notes:
      "Planning coefficients, not individual-animal nutritional equations. Actual winter months, liveweight, forage quality, wastage and meal alter demand.",
  },
  TEAGASC_BEEF_SILAGE_2026_07: {
    sourceId: "TEAGASC_BEEF_SILAGE_2026_07",
    authority: "Teagasc",
    title: "Making quality silage on beef farms",
    sourceType: "CURRENT_IRISH_RESEARCH/ADVISORY",
    publicationDate: "2026-07-01",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/insights/making-quality-silage-on-beef-farms/",
    precedence: "Preferred current beef silage-planning source.",
    effectiveStatus: "CURRENT",
    notes: "DM losses can be 15–30% of crop DM; avoid double-counting losses once stored feed is measured.",
  },
  TEAGASC_BEEF_2026_FORAGE: {
    sourceId: "TEAGASC_BEEF_2026_FORAGE",
    authority: "Teagasc",
    title: "Producing beef from grass-forage-based systems",
    sourceType: "CURRENT_IRISH_RESEARCH",
    publicationDate: "2026-07-01",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/insights/producing-beef-from-grass-forage-based-systems/",
    precedence: "Exact scenario reference only.",
    effectiveStatus: "CURRENT",
    notes: "Do not generalise 650 kg cow / 350 kg weanling examples into a universal intake equation.",
  },
  TEAGASC_BEEF_2026_FINISHING: {
    sourceId: "TEAGASC_BEEF_2026_FINISHING",
    authority: "Teagasc",
    title: "Nutritional management of finishing beef cattle",
    sourceType: "CURRENT_IRISH_RESEARCH",
    publicationDate: "2026-07-01",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/insights/nutritional-management-of-finishing-beef-cattle/",
    precedence: "Use only within stated finishing-cattle scope.",
    effectiveStatus: "CURRENT",
    notes: "A 2% liveweight DMI example is not a universal Farm Return feed model.",
  },
  TEAGASC_DAIRYBEEF_DMD: {
    sourceId: "TEAGASC_DAIRYBEEF_DMD",
    authority: "Teagasc",
    title: "Silage Quality and Concentrate Supplementation — DairyBeef 500",
    sourceType: "SCIENTIFIC_ADVISORY",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/animals/beef/dairy-calf-to-beef/dairybeef-500/dairybeef-500-factsheets/silage-quality-and-concentrate-supplementation/",
    precedence: "Validated lookup for exact matching scenarios.",
    effectiveStatus: "CURRENT",
    notes: "No interpolation/extrapolation unless a separately validated model is activated.",
  },
  TEAGASC_SHEEP_2026: {
    sourceId: "TEAGASC_SHEEP_2026",
    authority: "Teagasc",
    title: "Why high quality silage is better for ewes. And you",
    sourceType: "CURRENT_IRISH_ADVISORY/RESEARCH_SUMMARY",
    publicationDate: "2026-04-26",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/news--events/daily/why-high-quality-silage-is-better-for-ewes-and-you/",
    precedence: "Use only for matching ewe scenario.",
    effectiveStatus: "CURRENT",
    notes: "Litter size, stage, body condition and forage management remain required context.",
  },
  TEAGASC_CLOVER_BEEF_2026: {
    sourceId: "TEAGASC_CLOVER_BEEF_2026",
    authority: "Teagasc",
    title: "Management of red and white clover in Irish beef grass-based systems",
    sourceType: "CURRENT_IRISH_RESEARCH/ADVISORY",
    publicationDate: "2026-07-01",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/insights/management-of-red-and-white-clover-in-irish-beef-grass-based-systems/",
    precedence: "Supported scenario only; legal N cap still applies.",
    effectiveStatus: "CURRENT",
    notes: "Do not turn clover presence into a fixed N credit.",
  },
  TEAGASC_CLOVER_DAIRY_2026: {
    sourceId: "TEAGASC_CLOVER_DAIRY_2026",
    authority: "Teagasc",
    title: "Today's Farm April–June 2026 — clover fertiliser-N strategy",
    sourceType: "CURRENT_IRISH_ADVISORY",
    publicationDate: "2026-04",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/wp-content/uploads/uploads/media/website/publications/2026/Todays-Farm-Web-Access-Edition-Apr-Jun-2026.pdf",
    precedence: "Supported dairy grazing scenario only; legal cap overrides.",
    effectiveStatus: "SUPERSEDED",
    notes:
      "No interpolation between clover classes unless separately approved. V3 uses TEAGASC_CLOVER_DAIRY_TODAYS_FARM_2026 for the current 2026 table.",
  },
  TEAGASC_SOIL_INDEX: {
    sourceId: "TEAGASC_SOIL_INDEX",
    authority: "Teagasc",
    title: "Soil Index System",
    sourceType: "SCIENTIFIC_ADVISORY",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/environment/soil/soil-fertility/soil-analysis/soil-index-system/",
    precedence: "Agronomic classification; legal P classification uses statute.",
    effectiveStatus: "CURRENT",
    notes: "The same printed 8.01/10.01 P boundary anomaly appears in current materials; v2 contains a guarded ambiguity rule.",
  },
  MET_SMD: {
    sourceId: "MET_SMD",
    authority: "Met Éireann",
    title: "Agri-Meteorological Data — Soil Moisture Deficit Model",
    sourceType: "OFFICIAL_MODEL",
    checkedDate: "2026-08-26",
    url: "https://www.met.ie/climate/services/agri-meteorological-data",
    precedence: "Official model output.",
    effectiveStatus: "CURRENT",
    notes: "SMD is not converted into an invented legal threshold.",
  },
  MET_WARNINGS_JSON: {
    sourceId: "MET_WARNINGS_JSON",
    authority: "Met Éireann",
    title: "Weather warnings/open data",
    sourceType: "OFFICIAL_LIVE",
    checkedDate: "2026-08-26",
    url: "https://www.met.ie/about-us/specialised-services/widgets",
    precedence: "Official live data.",
    effectiveStatus: "CURRENT",
    notes: "Cache expiry/currentness must be enforced; warning data cannot be treated as static.",
  },
  CSO_AG_PRICES: {
    sourceId: "CSO_AG_PRICES",
    authority: "Central Statistics Office",
    title: "Agricultural Price Indices / PxStat agricultural datasets",
    sourceType: "OFFICIAL_MARKET_DATA",
    publicationDate: "2026-08-14",
    checkedDate: "2026-08-26",
    url: "https://www.cso.ie/en/releasesandpublications/ep/p-api/agriculturalpriceindicesjune2026/data/",
    precedence: "Official market data; farm-specific sale facts remain user data.",
    effectiveStatus: "CURRENT",
    notes: "Never infer farmer sale intention, grade, weight or route from market prices.",
  },
  TEAGASC_CLOVER_DAIRY_TODAYS_FARM_2026: {
    sourceId: "TEAGASC_CLOVER_DAIRY_TODAYS_FARM_2026",
    authority: "Teagasc",
    title: "Today's Farm April–June 2026 — Dairy spring-summer management tips",
    sourceType: "CURRENT_IRISH_ADVISORY",
    publicationDate: "2026-04",
    checkedDate: "2026-08-26",
    url: "https://teagasc.ie/wp-content/uploads/uploads/media/website/publications/2026/Todays-Farm-Web-Access-Edition-Apr-Jun-2026.pdf",
    precedence: "Advisory strategy only; current legal N limits override.",
    effectiveStatus: "CURRENT",
    notes: "Use exact source classes only; no interpolation. Report the exact row used.",
  },
  ENGINE_AUDIT_RULE: {
    sourceId: "ENGINE_AUDIT_RULE",
    authority: "Farm Return",
    title: "Engine-internal report/audit-completeness rule",
    sourceType: "ENGINE_INTERNAL",
    checkedDate: "2026-08-26",
    precedence: "Cited by golden tests for report-structure/system-integration checks with no external authority.",
    effectiveStatus: "CURRENT",
    notes: "Not an Irish scientific/statutory source — an internal engine-architecture rule (see RECOMMENDATION_AUDIT_REPORT_SPEC.md).",
  },
  ENGINE_UNIT_RULE: {
    sourceId: "ENGINE_UNIT_RULE",
    authority: "Farm Return",
    title: "Engine-internal fresh-weight/dry-matter unit-basis gate",
    sourceType: "ENGINE_INTERNAL",
    checkedDate: "2026-08-26",
    precedence: "Cited by golden tests for mixed-basis rejection (e.g. GFT107).",
    effectiveStatus: "CURRENT",
    notes: "Not an Irish scientific/statutory source — an internal unit-safety rule (see src/domain/units.ts).",
  },
  ENGINE_FAIL_CLOSED: {
    sourceId: "ENGINE_FAIL_CLOSED",
    authority: "Farm Return",
    title: "Engine-internal fail-closed/unsupported-scenario rule",
    sourceType: "ENGINE_INTERNAL",
    checkedDate: "2026-08-26",
    precedence: "Cited by golden tests where no validated Irish coefficient exists for the requested scenario (e.g. GFT098).",
    effectiveStatus: "CURRENT",
    notes: "Not an Irish scientific/statutory source — the engine's own 'do not invent a coefficient' rule (see src/domain/evidence.ts).",
  },
};

// ---------------------------------------------------------------------------
// Ruleset versions
// ---------------------------------------------------------------------------

export interface RulesetVersion {
  rulesetId: string;
  sourceCheckedAt: string;
  sourceIds: SourceId[];
}

/**
 * The statutory ruleset a `CalculationRun` stamps itself with today. Not
 * yet consumed by any calculation (Phase 1 is inert) — this is the seed
 * value a future `startCalculationRun` call will pass, kept here so it has
 * exactly one definition rather than being re-typed at each call site.
 */
export const CURRENT_RULESET: RulesetVersion = {
  rulesetId: "IE_NAP_2026_CURRENT",
  sourceCheckedAt: "2026-08-26",
  sourceIds: ["LAW_IE_SI_588_2025", "LAW_IE_SI_119_2026"],
};
