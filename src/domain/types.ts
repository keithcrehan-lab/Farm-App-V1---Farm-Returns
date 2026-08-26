/**
 * Core domain types for the Farm Return connected farm model.
 *
 * Source of truth: docs/data-model.md. Keep the two in sync — this file is
 * the TypeScript expression of that document's entity definitions.
 *
 * These types are shared by mock data (Phase 1) and, later, by the real
 * domain engines (Phase 3+) and persistence layer (Phase 2) — the shapes
 * should not need to change when mock values are replaced with computed
 * ones, only the `status`/`source` metadata on each TrackedValue.
 */

import type { EngineOutcome } from "./evidence";
import type { StatutoryManureNutrientValue } from "./statutory-manure-value";
import type { LessMethodGateOk } from "./less-method-gate";

// ---------------------------------------------------------------------------
// Provenance — every enterable/derivable value is wrapped in this.
// ---------------------------------------------------------------------------

export type DataStatus = "verified" | "farmer_adjusted" | "estimated" | "mapped";

export interface Provenance {
  /** e.g. "Soil test", "Teagasc rule", "Irish Soil Information System",
   *  "Met Éireann", "CSO", "Supplier quote", "Farm Return assumption" */
  source: string;
  /** Dataset/rule publication or retrieval date (ISO date). */
  sourceDate?: string;
  /** When Farm Return fetched/derived this value (ISO datetime). */
  retrievedAt?: string;
}

export interface Versioned {
  /** e.g. "nutrient_engine_v1.2.0" — only set on derived/calculated values. */
  calculationVersion?: string;
}

export interface Confidence {
  level?: "high" | "medium" | "low";
}

export interface RegulatoryStatus {
  regulatory?: "planning_advice" | "compliance_value";
}

export interface TrackedValue<T> extends Provenance, Versioned, Confidence, RegulatoryStatus {
  value: T;
  status: DataStatus;
  /** Never overwritten — history chain. See docs/data-model.md "never overwrite provenance". */
  previous?: TrackedValue<T>;
}

export function tracked<T>(
  value: T,
  status: DataStatus,
  source: string,
  extra: Partial<Omit<TrackedValue<T>, "value" | "status" | "source">> = {},
): TrackedValue<T> {
  return { value, status, source, ...extra };
}

// ---------------------------------------------------------------------------
// Farm & fields
// ---------------------------------------------------------------------------

export type EnterpriseType =
  | "suckler_beef"
  | "dairy_beef"
  | "dairy"
  | "sheep"
  | "tillage"
  | "mixed";

export interface Farm {
  id: string;
  name: string;
  location: { county: string; centroid: [number, number] };
  primaryEnterprises: EnterpriseType[];
  units: "metric";
  ownerName: string;
  /** V3 closure pass, Priority 3/5 —
   * `rules_statutory/p_build_up_eligibility_2026.csv`'s occupier-level
   * Article 17(6) conditions (`PBUILD_B_ADVISER`/`PBUILD_C_NMP`/
   * `PBUILD_D_TRAINING`) — none of which any other Farm Return data can
   * derive, so this is a genuinely new, additive, farmer-entered fact,
   * not something already captured elsewhere. Absent means "not proven"
   * and fails closed to the standard P route (never inferred true) — see
   * `src/domain/p-build-up-eligibility.ts`. */
  pBuildUpCompliance?: TrackedValue<{
    adviserEngaged: boolean;
    nmpSubmitted: boolean;
    trainingCompleted: boolean;
  }>;
}

export type FieldUse =
  | "grazing"
  | "silage_1st_cut"
  | "silage_2nd_cut"
  | "silage_3rd_cut"
  | "mixed"
  | "tillage"
  | "other";

export type Drainage = "well_drained" | "moderately_drained" | "poorly_drained";

export interface MappedSoil {
  soilAssociation: string;
  dominantSeries: string;
  texture: string;
  drainage: Drainage;
  depth?: string;
  organicCarbonStatus?: "mineral" | "peat" | "high_organic";
  coveragePct: number;
  datasetVersion: string;
  /** Display-friendly provider attribution, e.g. "Teagasc + Sentinel". */
  source: string;
}

export interface SoilTest {
  sampleDate: string;
  laboratory: string;
  sampleRef: string;
  p: number;
  k: number;
  pH: number;
  limeRequirement?: number;
  mg?: number;
  organicMatterPct?: number;
  reportFileUrl?: string;
}

export interface SoilFertility {
  pIndex: TrackedValue<1 | 2 | 3 | 4>;
  kIndex: TrackedValue<1 | 2 | 3 | 4>;
  pH?: TrackedValue<number>;
  verifiedTest?: SoilTest;
}

export interface FieldSeasonRecord {
  season: string;
  yieldTDMha?: number;
  fieldCost?: number;
}

export interface Field {
  id: string;
  farmId: string;
  name: string;
  /** Derived from `polygon` once one exists (docs/data-model.md's own
   * comment: "derived from polygon, not entered") — see
   * `src/domain/field-boundary.ts`. Until a polygon is drawn, this is
   * whatever the farmer typed when adding the field (Phase 1 fallback). */
  areaHa: number;
  /** Derived from `polygon` once one exists, same as `areaHa`. Before a
   * polygon is drawn, this is a placeholder (the farm's own centroid —
   * see `addField` in farm-store.tsx), not a real field-specific location. */
  centroid: [number, number];
  /** Real farmer-drawn field boundary (`docs/data-model.md`'s `Field.polygon`)
   * — closes the "Mapping provider account" open question in
   * docs/product-requirements.md. Single exterior ring only, no holes (see
   * field-boundary.ts). Absent until the farmer maps this field for real. */
  polygon?: GeoJSON.Polygon;
  /** When/how `polygon` was captured — always "farmer_drawn" today (no
   * other source exists yet, e.g. an LPIS import); kept as a distinct
   * literal from `DataStatus` because "drawn on real imagery" is a
   * stronger provenance claim than "farmer adjusted an estimate". Set
   * together with `polygon`, never independently. */
  polygonSource?: "farmer_drawn";
  polygonCapturedAt?: string;
  lpisRef?: string;
  plannedUse: TrackedValue<FieldUse>;
  mappedSoil: MappedSoil;
  fertility: SoilFertility;
  /** V3 `required_input_fields.csv` "FIELD_COMMONAGE_STATUS" — commonage
   * land has a separate 50 kg organic-N/ha stocking allowance and a
   * chemical-fertiliser prohibition
   * (`rules_statutory/commonage_rules_2026.csv`). Absent or `"unknown"`
   * must fail closed for any compliance output that depends on it — see
   * `src/domain/input-gates.ts`'s `requireCommonageStatus`. */
  commonageStatus?: TrackedValue<"commonage" | "not_commonage" | "unknown">;
  /** V3 `required_input_fields.csv` "LOCAL_WATER_BUFFER_OVERRIDE" — a
   * local authority can set a greater/alternative buffer than the
   * national baseline for a qualifying water feature
   * (`rules_statutory/local_buffer_override_rules_2026.csv`). Absent means
   * "never assessed" (fails closed); `localOverrideStatus: "unknown"`
   * means "assessed, but the override status itself is unresolved" (a
   * distinct, non-blocking `QUALIFIED_NOT_DEFINITIVE` state per AF010) —
   * see `src/domain/input-gates.ts`'s `resolveLocalWaterBufferOverrideStatus`. */
  waterBufferContext?: TrackedValue<{
    nearestFeature?: string;
    distanceM?: number;
    localOverrideStatus: "authoritative_rule" | "verified_none" | "unknown";
  }>;
  history: FieldSeasonRecord[];
  /** Thumbnail asset for field cards — Phase 1 uses static crops, not live tiles. */
  thumbnail?: string;
}

// ---------------------------------------------------------------------------
// Livestock & housing
// ---------------------------------------------------------------------------

export type LivestockCategory =
  | "suckler_cow"
  | "dairy_cow"
  | "bull"
  | "calf"
  | "weanling"
  | "store"
  | "steer"
  | "heifer";

export type LivestockGoal = "maintain" | "grow" | "breed" | "sell_store" | "finish_slaughter";

export interface LivestockGroup {
  id: string;
  farmId: string;
  category: LivestockCategory;
  label: string;
  count: TrackedValue<number>;
  avgWeightKg?: TrackedValue<number>;
  avgAgeMonths?: number;
  breed?: string;
  sex?: "male" | "female" | "mixed";
  system: "grazing" | "housed";
  housingId?: string;
  goal?: LivestockGoal;
  value: TrackedValue<number>;
  statusLabel?: string; // e.g. "On Track" — UI convenience, not a domain rule yet
}

export interface TankDetail {
  dimensions?: { lengthM: number; widthM: number; depthM: number };
  observedFillPct?: number;
  dilutionWaterFactor?: number;
  analysis?: { n: number; p: number; k: number; sampleDate: string };
}

export interface SlurryEstimate {
  volumeM3: TrackedValue<number>;
  availableN: TrackedValue<number>;
  availableP: TrackedValue<number>;
  availableK: TrackedValue<number>;
  ruleSetVersion: string;
}

export interface Housing {
  id: string;
  farmId: string;
  shedName: string;
  shedType: "slatted" | "straw_bedded" | "other";
  linkedGroupIds: string[];
  housingPeriod: { start: string; end: string };
  tankRefinement?: TankDetail;
  slurryEstimate: SlurryEstimate;
  storageCapacityM3: number;
  storageFillPct: number;
}

export interface SlurryAllocation {
  fieldId: string;
  housingId: string;
  priority: "high" | "medium" | "not_suitable";
  volumeM3: number;
  score: number;
  /** V3 `required_input_fields.csv` "SLURRY_APPLICATION_METHOD" — LESS
   * (Low Emission Slurry Spreading) is legally required in defined
   * GSR/pig-slurry/arable scenarios
   * (`rules_statutory/less_requirements_2026.csv`). Absent means the
   * method has not been captured; a nutrient/spreading plan cannot
   * certify method compliance without it — see
   * `src/domain/input-gates.ts`'s `requireSlurryApplicationMethod`. */
  applicationMethod?: TrackedValue<"LESS" | "splashplate" | "incorporate_24h" | "other">;
}

export interface FertiliserProduct {
  name: string;
  npkAnalysis: string; // e.g. "18-6-12"
  rateKgHa: number;
  totalKg: number;
  costEur: number;
  /** V3 `required_input_fields.csv` "FERTILISER_UREA_INHIBITOR_STATUS" —
   * current tables exclude specified uninhibited solid urea with ureic N
   * >=1% (`rules_statutory/fertiliser_product_restrictions_2026.csv`).
   * Never infer this from the product name (e.g. "Protected Urea") — see
   * `src/domain/input-gates.ts`'s `requireFertiliserFormulation`. */
  formulation?: TrackedValue<{
    physicalForm: "solid" | "liquid" | "unknown";
    ureicNPercent?: number;
    inhibitorStatus: "inhibited" | "uninhibited" | "unknown";
  }>;
}

/**
 * Per-field nutrient plan output — spec §5 "Calculation outputs". Phase 1
 * mock stand-in for the real nutrient engine (docs/agronomy-engine.md,
 * Phase 3): gross requirement, the organic (slurry) offset for *this*
 * planned application, and the resulting purchased top-up.
 */
/**
 * A field's planned total N/P application checked against the statutory
 * NAP ceiling for its land use — see `checkNapCompliance` in
 * src/domain/nutrients.ts. `regulatory` follows the same
 * planning_advice/compliance_value distinction as `RegulatoryStatus`:
 * grazing land's ceilings are confirmed against a real S.I. 588/2025
 * extract (`"compliance_value"`); cut-only grassland's aren't yet
 * (`"planning_advice"`) — see nutrients.ts's NAP section header.
 */
export interface NapComplianceCheck {
  landUse: "grazing" | "cut_only";
  orgNStockingRateKgHa: number;
  nRequiredKgHa: number;
  nCeilingKgHa: number;
  nWithinCeiling: boolean;
  pRequiredKgHa: number;
  pCeilingKgHa: number;
  pWithinCeiling: boolean;
  regulatory: "planning_advice" | "compliance_value";
  legislation: string;
  /** V3 fix (`SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md` conflict #5,
   * `GFT102`/`GFT103`) — whether the cut-only sale-route ceiling
   * (Tables 16/17) was even a candidate for this field (`cut_only` land
   * use with `intendedUse: "sale"`/`"both"`), and whether written
   * evidence of sale was actually confirmed. `saleEvidenceRequired: true`
   * with `saleEvidenceConfirmed: false` means the field fell back to the
   * ordinary Table 13/15a ceiling specifically for lack of evidence, not
   * because the destination was own-feed — a materially different reason
   * a farmer/reviewer needs to see, not just the resulting ceiling
   * number. */
  saleEvidenceRequired: boolean;
  saleEvidenceConfirmed: boolean;
  /** V3 closure-pass fix (AF011 — "GSR>170 alone does not entitle
   * holding to higher N/P rates"). `highRateEligibilityApplicable: true`
   * means this field's statutory GSR is above 170 kg N/ha, so the
   * elevated 241/214 kg N/ha rate is even a candidate; whether it was
   * actually granted depends on `highRateEligibilityConfirmed` (real,
   * evidenced ≥5% non-grass eligible area — `GFT023`/`GFT024`). A field
   * with `highRateEligibilityApplicable: true` and
   * `highRateEligibilityConfirmed: false` fell back to the 131-170
   * band's own 185 kg N/ha rate, not the raw table's higher figure — a
   * materially different reason a farmer/reviewer needs to see. */
  highRateEligibilityApplicable: boolean;
  highRateEligibilityConfirmed: boolean;
  /** V3 closure pass, Priority 3 (`P_BUILD_UP_ELIGIBILITY`).
   * `pBuildUpEligibilityApplicable: true` means Table 15b's enhanced
   * build-up figure is even published for this field's stocking-rate
   * band (grazing land only, >130 kg N/ha organic-N stocking rate);
   * whether the higher ceiling was actually granted depends on
   * `pBuildUpEligibilityConfirmed` (real, evidenced Article 17(6)
   * conditions — `p-build-up-eligibility.ts`). Never inferred from the P
   * Index alone. */
  pBuildUpEligibilityApplicable: boolean;
  pBuildUpEligibilityConfirmed: boolean;
}

export interface NutrientPlan {
  fieldId: string;
  requirement: TrackedValue<{ n: number; p: number; k: number }>; // kg/ha
  organicApplication: {
    rateM3ha: number;
    totalM3: number;
    offsetN: number;
    offsetP: number;
    offsetK: number; // kg/ha
  };
  purchasedProducts: FertiliserProduct[];
  /** V3 fix (`SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md` conflict #1) —
   * the compliance ceiling can only be determined once the real statutory
   * Grassland Stocking Rate resolves for every group in the herd
   * (`calculateStatutoryGrasslandStockingRateKgHa`,
   * `src/domain/statutory-excretion.ts`); when it can't (this app's real
   * herd today has no captured age/sex data), this is the
   * `BLOCKED_INSUFFICIENT_EVIDENCE` outcome instead of a
   * `NapComplianceCheck` computed from the wrong figure. */
  napCompliance: EngineOutcome<NapComplianceCheck>;
  /** V3 closure pass, Priority 2 (`COMPLIANCE_MANURE_NP`,
   * `statutory-manure-value.ts`) — the real STATUTORY total N/P content ×
   * statutory availability factor for this field's slurry application,
   * kept strictly separate from `organicApplication` above (the Teagasc
   * Green Book Table 9-8 AGRONOMIC "typical available N/P/K" figure).
   * `BLOCKED_INSUFFICIENT_EVIDENCE` for fields with no field area
   * evidence; `NOT_APPLICABLE` for fields with no slurry allocation. */
  statutoryManureValue: EngineOutcome<StatutoryManureNutrientValue & { availableNKgHa: number; availablePKgHa: number }>;
  /** V3 closure pass, Priority 4 (`COMMONAGE_FERTILISER_GATE`, AF003
   * CRITICAL) — real, wired from `field.commonageStatus`. `LEGAL_PROHIBITION`
   * means `purchasedProducts`/`estimatedFieldCostEur` above were actually
   * suppressed (never a chemical-fertiliser recommendation on commonage
   * land), not merely reported alongside one. */
  commonageFertiliserGate: EngineOutcome<"PROHIBITED" | "NOT_APPLICABLE">;
  /** V3 closure pass, Priority 4 (`LESS_METHOD_GATE`, AF004 HIGH) — real,
   * wired from `SlurryAllocation.applicationMethod`. `NOT_APPLICABLE` for
   * fields with no slurry allocation; `BLOCKED_INSUFFICIENT_EVIDENCE` when
   * a slurry allocation exists but its application method was never
   * captured. */
  lessMethodCompliance: EngineOutcome<LessMethodGateOk>;
  /** V3 closure pass, Priority 4 (local water-buffer override layer,
   * AF010) — real, wired from `field.waterBufferContext`. `UNKNOWN` means
   * the override status was assessed but is genuinely unresolved
   * (`QUALIFIED_NOT_DEFINITIVE`, not a hard block, per AF010's own
   * resolution); `BLOCKED_INSUFFICIENT_EVIDENCE` means either no
   * assessment was ever captured, or a local override rule applies but
   * this data model has no field for the override distance itself. The
   * NATIONAL buffer distance check (`checkNationalBufferDistance`) is a
   * separate, still-unwired gate — it needs a categorised water-feature
   * type this data model doesn't capture yet (see the comment at this
   * field's computation site in `nutrients.ts`). */
  localBufferOverrideStatus: EngineOutcome<"NATIONAL_BASELINE_APPLIES">;
  estimatedFieldCostEur: number;
  calculationVersion: string;
}

// ---------------------------------------------------------------------------
// Silage & forage
// ---------------------------------------------------------------------------

export interface SilagePlan {
  id: string;
  fieldId: string;
  cutNumber: 1 | 2 | 3;
  harvestSystem: "pit" | "bale";
  targetCutWindow: TrackedValue<{ start: string; end: string }>;
  expectedYieldTDMha: TrackedValue<number>;
  expectedBales?: number;
  expectedQuality?: TrackedValue<{ dmd?: number }>;
  intendedUse: "own_livestock" | "sale" | "both";
  /** V3 `required_input_fields.csv` "SILAGE_SALE_EVIDENCE" — the current
   * statutory sale-route N/P ceiling (Tables 16/17) requires written
   * evidence of sale, not just `intendedUse: "sale"`
   * (`rules_statutory/silage_for_sale_n_limits_2026.csv`/
   * `..._p_limits_2026.csv`). Absent means unproven — see
   * `src/domain/input-gates.ts`'s `requireSilageSaleEvidence`. Note:
   * `intendedUse`'s own enum (`own_livestock`/`sale`/`both`) still differs
   * from V3's `own_feed`/`sale`/`mixed`/`unknown` — that rename and the
   * eligibility-logic fix are `SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md`
   * conflict #5, addressed in the phase that rewires `checkNapCompliance`,
   * not here. */
  saleEvidence?: TrackedValue<{ hasWrittenEvidence: boolean; documentReference?: string }>;
  actualOutput?: { tonnesOrBales: number; moisturePct?: number };
  productionCost: { fertiliserSlurry: number; contractor: number; wrapBales: number; other: number };
  chemicalFertiliserKgNpk: number;
  estimatedFieldCost: number;
  /** Which livestock group this cut is earmarked for, and for how long —
   * a Phase 1 mock stand-in for the real feed-days allocation the feed
   * engine will compute (docs/feed-engine.md, Phase 4). */
  feedSupport?: { groupId: string; days: number };
}

/**
 * V3 `required_input_fields.csv` "CONCENTRATE_CP_PERCENT"/
 * "CONCENTRATE_P_CONTENT" — not yet a stored farm entity (this data model
 * has no concentrate-purchase/feed-plan entity), so this is a parameter
 * shape for the `FEED_CP_LEGAL_GATE`/`CONCENTRATE_P_COMPLIANCE`
 * calculations (`src/domain/input-gates.ts`) to accept, not a
 * `Field`/`LivestockGroup` addition.
 */
export interface ConcentrateFeedSpec {
  cpPercent?: TrackedValue<number>;
  pContentKgPer100kg?: TrackedValue<number>;
}

export interface ForageInventory {
  farmId: string;
  totalDmTonnes: TrackedValue<number>;
  requiredWinterForageDmTonnes: TrackedValue<number>;
  surplusDeficitDmTonnes: number;
}

/**
 * Per-group economics — spec §9 "Livestock economics" / "Feed optimiser".
 * Phase 1 mock stand-in for the real feed-cost + optimiser engines
 * (docs/feed-engine.md, Phase 4/7): current diet cost, a performance
 * forecast if the current plan continues, the cost-to-finish breakdown,
 * and the sell-now-vs-finish comparison.
 */
export interface CostBreakdownItem {
  label: string;
  costPerHeadEur: number;
  totalGroupEur: number;
}

export interface LivestockEconomics {
  groupId: string;
  targetWeightKg: number;
  targetDate: string;
  currentValueEur: TrackedValue<number>;
  currentFeedCost: { perHeadPerDayEur: number; totalGroupPerDayEur: number; changeVsLastWeekEur: number };
  performanceForecast: { avgDailyGainKg: number; daysToFinish: number; forecastSaleValueEur: number };
  costBreakdown: CostBreakdownItem[];
  marginOutlook: { sellNowEur: number; finishEur: number };
  recommendation: { title: string; description: string };
}

/**
 * One feeding-strategy option in the advanced optimiser comparison — spec
 * §9 "optimise profit, not just price per tonne": every strategy carries
 * both feed cost AND performance so the farmer can see the margin
 * trade-off, not just the cheapest ration.
 */
export interface FeedStrategy {
  id: "lowest_cost" | "balanced" | "faster_finish";
  label: string;
  recommended: boolean;
  ingredientsKgDay: { label: string; kgDay: number }[];
  dailyGainKg: number;
  daysToFinish: number;
  feedCostPerHeadDayEur: number;
  totalCostPerHeadEur: number;
  note?: string;
}

// FeedOptimiserContext (cattlePriceLiveweightEurKg/marginUpliftEurHead) is
// gone — that was a Phase 1 mock wrapper around FeedStrategy[] with no real
// source; both livestock groups' strategy comparisons are computed for
// real now (src/domain/livestock.ts), and neither has a real liveweight-
// price/margin-uplift benchmark to replace it with yet, so the Feed
// Optimiser screen shows an evidence caveat in its place instead.

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

export type PriceSourceKind =
  | "public_benchmark"
  | "farmer_price"
  | "invoice_contract"
  | "supplier_quote"
  | "bulk_buy_price";

export interface PriceSource {
  kind: PriceSourceKind;
  date: string;
}

export interface FinanceLine {
  category: "revenue" | "feed" | "fertiliser_lime" | "livestock" | "cashflow";
  label: string;
  amount: TrackedValue<number>;
  priceSource: PriceSource;
}

export interface CashflowPoint {
  month: string;
  cumulativeMargin: number;
}

export interface OpportunityLine {
  id: string;
  kind: "savings" | "buying_group" | "risk";
  title: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Spreading
// ---------------------------------------------------------------------------

export interface HardStop {
  hardStop: true;
  reason: string;
}

export type SpreadingScoreValue = TrackedValue<number> | HardStop;

export function isHardStop(v: SpreadingScoreValue): v is HardStop {
  return (v as HardStop).hardStop === true;
}

export interface SpreadingFieldScore {
  fieldId: string;
  date: string;
  slurryScore: SpreadingScoreValue;
  fertiliserScore: SpreadingScoreValue;
  soilTempC?: number;
  rainfallForecastMm?: string;
  drainageLabel?: string;
}

export interface SpreadingDayForecast {
  date: string;
  dayLabel: string;
  score: number;
  weather: "sun" | "cloud" | "rain";
}

export interface PlannedApplication {
  id: string;
  kind: "slurry" | "fertiliser";
  label: string;
  fieldNames: string;
  when: { date: string; timeLabel: string };
  quantityLabel: string;
  status: "planned" | "complete";
}

// ---------------------------------------------------------------------------
// Input Planner
// ---------------------------------------------------------------------------

export type InputCategory =
  | "fertiliser"
  | "feed"
  | "lime"
  | "minerals"
  | "silage_inputs"
  | "contractor"
  | "other";

export type DemandState = "forecast" | "farmer_confirmed" | "committed" | "purchased";

export interface InputRequirement {
  id: string;
  category: InputCategory;
  label: string;
  requiredQty: TrackedValue<number>;
  unit: string;
  stockOnHandQty: number;
  purchaseQty: number;
  estCost: TrackedValue<number>;
  requiredByWindow: { start: string; end: string };
  confidencePct: number;
  demandState: DemandState;
}

export interface BuyingOpportunity {
  id: string;
  category: InputCategory;
  userRequirementQty: number;
  regionalConfirmedQty: number;
  regionalCommittedQty: number;
  targetPrice: number;
  currentPrice: number;
  potentialSavingPerUnit: number;
}

// ---------------------------------------------------------------------------
// Market prices & alerts (dashboard surfaces)
// ---------------------------------------------------------------------------

export interface MarketPrice {
  id: string;
  category: "Cattle" | "Feed" | "Fertiliser";
  label: string;
  price: number;
  unit: string;
  changePct: number;
  asOf: string;
  source: string;
  /** Set only where `price`/`changePct` come from a real CSO series
   * (src/domain/market.ts) rather than a static mock figure — "verified"
   * for a single official series, "estimated" where Farm Return combines
   * two (e.g. the sex-unrecorded weanling group's Bullocks+Heifers blend).
   */
  status?: "estimated" | "verified";
  /** Real trailing-12-month low/high range, where computed from a real
   * CSO series — the source workbook's own "low/base/high scenarios"
   * framing, never an invented forecast band. */
  range?: { low: number; high: number };
}

export type AlertSeverity = "risk" | "attention" | "info";

export interface FarmAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  subtitle: string;
  href?: string;
}

export interface TimelineEvent {
  category: string;
  label: string;
  monthStart: number; // 0=Jan
  monthEnd: number;
}
