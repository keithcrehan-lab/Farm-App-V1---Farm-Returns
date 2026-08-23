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
  areaHa: number;
  /** Simple centroid for the demo map; a real polygon is a Phase 2 concern. */
  centroid: [number, number];
  lpisRef?: string;
  plannedUse: TrackedValue<FieldUse>;
  mappedSoil: MappedSoil;
  fertility: SoilFertility;
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
  actualOutput?: { tonnesOrBales: number; moisturePct?: number };
  productionCost: { fertiliserSlurry: number; contractor: number; wrapBales: number; other: number };
  chemicalFertiliserKgNpk: number;
  estimatedFieldCost: number;
  /** Which livestock group this cut is earmarked for, and for how long —
   * a Phase 1 mock stand-in for the real feed-days allocation the feed
   * engine will compute (docs/feed-engine.md, Phase 4). */
  feedSupport?: { groupId: string; days: number };
}

export interface ForageInventory {
  farmId: string;
  totalDmTonnes: TrackedValue<number>;
  requiredWinterForageDmTonnes: TrackedValue<number>;
  surplusDeficitDmTonnes: number;
}

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
  label: string;
  price: number;
  unit: string;
  changePct: number;
  asOf: string;
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
