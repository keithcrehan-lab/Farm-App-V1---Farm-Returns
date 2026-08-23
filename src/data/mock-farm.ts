/**
 * Mock dataset for Phase 1 (UI-first, no persistence yet).
 *
 * One internally-consistent demo farm — "Ballybeg Farm" — so every screen
 * tells the same story: a field's soil status matches its nutrient plan
 * matches its spreading score matches its silage plan, etc. Built from the
 * approved reference screens (design/reference/), reconciled where the
 * reference pack itself is inconsistent (it is explicitly illustrative —
 * see spec §00: "Sample names and numerical values are illustrative").
 * Notable reconciliations are called out inline as comments.
 *
 * Per docs/data-model.md and CLAUDE.md's visual-QA rule: every value here
 * is a real TrackedValue with a plausible source, so components render
 * their actual provenance badge from day one — mock data is never
 * styled differently to how real "estimated" data will look.
 */

import type {
  Farm,
  Field,
  LivestockGroup,
  Housing,
  SlurryAllocation,
  SilagePlan,
  ForageInventory,
  FinanceLine,
  CashflowPoint,
  OpportunityLine,
  SpreadingFieldScore,
  SpreadingDayForecast,
  InputRequirement,
  BuyingOpportunity,
  MarketPrice,
  FarmAlert,
  TimelineEvent,
} from "@/domain/types";
import { tracked } from "@/domain/types";

const FARM_ID = "farm-ballybeg";
const SOURCE_ASSUMPTION = "Farm Return assumption";
const SOURCE_ISIS = "Irish Soil Information System v2025";
const NUTRIENT_ENGINE_VERSION = "nutrient_engine_v1.2.0 (mock)";
const SLURRY_ENGINE_VERSION = "slurry_engine_v1.0.0 (mock)";

export const mockFarm: Farm = {
  id: FARM_ID,
  name: "Ballybeg Farm",
  location: { county: "Co. Cork", centroid: [-8.4863, 51.8985] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Keith",
};

/**
 * Total fields mapped across the farm (spec §5 "Soil coverage" stat).
 * Only a representative subset is modeled in full detail below — the ones
 * that appear in the approved reference screens — matching how a real farm
 * would have far more mapped parcels than any single screenshot needs to
 * show.
 */
export const mockFarmStats = {
  totalFieldsMapped: 42,
  totalVerifiedTests: 12,
  planningAccuracyPct: 68,
  planConfidencePct: 82,
  carbonGrade: "B+",
  carbonGradeLabel: "Good",
};

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export const mockFields: Field[] = [
  {
    id: "field-home",
    farmId: FARM_ID,
    name: "Home Field",
    areaHa: 8.6,
    centroid: [-8.489, 51.9],
    plannedUse: tracked("grazing", "estimated", SOURCE_ASSUMPTION),
    mappedSoil: {
      soilAssociation: "Fermoy",
      dominantSeries: "Brown Earth",
      texture: "Loam",
      drainage: "moderately_drained",
      coveragePct: 92,
      datasetVersion: SOURCE_ISIS,
    },
    fertility: {
      pIndex: tracked(2, "estimated", SOURCE_ASSUMPTION),
      kIndex: tracked(3, "estimated", SOURCE_ASSUMPTION),
    },
    history: [],
  },
  {
    id: "field-back",
    farmId: FARM_ID,
    name: "Back Field",
    areaHa: 6.8,
    centroid: [-8.483, 51.901],
    plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Keith"),
    mappedSoil: {
      soilAssociation: "Fermoy",
      dominantSeries: "Brown Earth",
      texture: "Loam",
      drainage: "moderately_drained",
      coveragePct: 88,
      datasetVersion: SOURCE_ISIS,
    },
    fertility: {
      pIndex: tracked(3, "farmer_adjusted", "Keith", { sourceDate: "2026-05-02" }),
      kIndex: tracked(2, "farmer_adjusted", "Keith", { sourceDate: "2026-05-02" }),
      pH: tracked(6.2, "farmer_adjusted", "Keith"),
    },
    history: [],
  },
  {
    id: "field-river",
    farmId: FARM_ID,
    name: "River Field",
    areaHa: 5.4,
    centroid: [-8.478, 51.897],
    plannedUse: tracked("grazing", "estimated", SOURCE_ASSUMPTION),
    mappedSoil: {
      soilAssociation: "Blackwater",
      dominantSeries: "Surface-water Gley",
      texture: "Clay loam",
      drainage: "poorly_drained",
      coveragePct: 95,
      datasetVersion: SOURCE_ISIS,
    },
    fertility: {
      pIndex: tracked(1, "verified", "Soil test", { sourceDate: "2025-05-12" }),
      kIndex: tracked(1, "verified", "Soil test", { sourceDate: "2025-05-12" }),
      verifiedTest: {
        sampleDate: "2025-05-12",
        laboratory: "Southern Agri Labs",
        sampleRef: "SAL-2025-0442",
        p: 4.1,
        k: 58,
        pH: 5.9,
        limeRequirement: 2.5,
      },
    },
    history: [],
  },
  {
    id: "field-road",
    farmId: FARM_ID,
    name: "Road Field",
    areaHa: 6.2,
    centroid: [-8.486, 51.895],
    plannedUse: tracked("grazing", "estimated", SOURCE_ASSUMPTION),
    mappedSoil: {
      soilAssociation: "Fermoy",
      dominantSeries: "Brown Earth",
      texture: "Loam",
      drainage: "well_drained",
      coveragePct: 90,
      datasetVersion: SOURCE_ISIS,
    },
    fertility: {
      pIndex: tracked(2, "estimated", SOURCE_ASSUMPTION),
      kIndex: tracked(3, "estimated", SOURCE_ASSUMPTION),
    },
    history: [],
  },
];

export const fieldById = (id: string): Field | undefined =>
  mockFields.find((f) => f.id === id);

// ---------------------------------------------------------------------------
// Livestock
// ---------------------------------------------------------------------------

export const mockLivestockGroups: LivestockGroup[] = [
  {
    id: "lg-suckler-cows",
    farmId: FARM_ID,
    category: "suckler_cow",
    label: "Suckler Cows",
    count: tracked(32, "verified", "Keith"),
    avgWeightKg: tracked(612, "estimated", SOURCE_ASSUMPTION),
    system: "grazing",
    housingId: "housing-shed-1",
    goal: "breed",
    value: tracked(41_600, "estimated", SOURCE_ASSUMPTION),
    statusLabel: "On Track",
  },
  {
    id: "lg-weanlings",
    farmId: FARM_ID,
    category: "weanling",
    label: "Weanlings",
    count: tracked(18, "verified", "Keith"),
    avgWeightKg: tracked(335, "estimated", SOURCE_ASSUMPTION),
    system: "housed",
    housingId: "housing-shed-1",
    goal: "grow",
    value: tracked(16_020, "estimated", SOURCE_ASSUMPTION),
    statusLabel: "On Track",
  },
  {
    id: "lg-heifers",
    farmId: FARM_ID,
    category: "heifer",
    label: "Heifers",
    count: tracked(12, "verified", "Keith"),
    avgWeightKg: tracked(412, "estimated", SOURCE_ASSUMPTION),
    system: "housed",
    housingId: "housing-shed-1",
    goal: "grow",
    value: tracked(14_400, "estimated", SOURCE_ASSUMPTION),
    statusLabel: "On Track",
  },
  {
    id: "lg-bull",
    farmId: FARM_ID,
    category: "bull",
    label: "Bull",
    count: tracked(1, "verified", "Keith"),
    avgWeightKg: tracked(920, "estimated", SOURCE_ASSUMPTION),
    system: "grazing",
    goal: "maintain",
    value: tracked(2_380, "estimated", SOURCE_ASSUMPTION),
    statusLabel: "On Track",
  },
  {
    id: "lg-continental-steers",
    farmId: FARM_ID,
    category: "steer",
    label: "Continental Steers",
    count: tracked(18, "verified", "Keith"),
    avgWeightKg: tracked(520, "estimated", SOURCE_ASSUMPTION),
    system: "housed",
    housingId: "housing-shed-1",
    goal: "finish_slaughter",
    value: tracked(7_380, "estimated", SOURCE_ASSUMPTION, { level: "medium" }),
    statusLabel: "On Track",
  },
];

export const totalLivestockCount = mockLivestockGroups.reduce(
  (sum, g) => sum + g.count.value,
  0,
);

export const totalLivestockValue = mockLivestockGroups.reduce(
  (sum, g) => sum + g.value.value,
  0,
);

export const totalLiveWeightKg = mockLivestockGroups.reduce(
  (sum, g) => sum + g.count.value * (g.avgWeightKg?.value ?? 0),
  0,
);

export const avgLiveWeightKg = Math.round(totalLiveWeightKg / totalLivestockCount);

// ---------------------------------------------------------------------------
// Housing & slurry
// ---------------------------------------------------------------------------

export const mockHousing: Housing[] = [
  {
    id: "housing-shed-1",
    farmId: FARM_ID,
    shedName: "Shed 1",
    shedType: "slatted",
    linkedGroupIds: ["lg-suckler-cows", "lg-heifers", "lg-weanlings"],
    housingPeriod: { start: "2026-11-01", end: "2027-03-15" },
    storageCapacityM3: 2850,
    storageFillPct: 60,
    slurryEstimate: {
      volumeM3: tracked(2850, "estimated", SOURCE_ASSUMPTION, {
        calculationVersion: SLURRY_ENGINE_VERSION,
      }),
      availableN: tracked(126, "estimated", SOURCE_ASSUMPTION, {
        calculationVersion: SLURRY_ENGINE_VERSION,
      }),
      availableP: tracked(56, "estimated", SOURCE_ASSUMPTION, {
        calculationVersion: SLURRY_ENGINE_VERSION,
      }),
      availableK: tracked(158, "estimated", SOURCE_ASSUMPTION, {
        calculationVersion: SLURRY_ENGINE_VERSION,
      }),
      ruleSetVersion: SLURRY_ENGINE_VERSION,
    },
  },
];

export const mockSlurryAllocations: SlurryAllocation[] = [
  { fieldId: "field-back", housingId: "housing-shed-1", priority: "high", volumeM3: 950, score: 91 },
  { fieldId: "field-home", housingId: "housing-shed-1", priority: "medium", volumeM3: 700, score: 86 },
  { fieldId: "field-river", housingId: "housing-shed-1", priority: "not_suitable", volumeM3: 0, score: 0 },
];

// ---------------------------------------------------------------------------
// Silage & forage
// ---------------------------------------------------------------------------

export const mockSilagePlans: SilagePlan[] = [
  {
    id: "silage-back-1",
    fieldId: "field-back",
    cutNumber: 1,
    harvestSystem: "bale",
    targetCutWindow: tracked(
      { start: "2026-05-15", end: "2026-05-25" },
      "estimated",
      SOURCE_ASSUMPTION,
    ),
    expectedYieldTDMha: tracked(10.4, "estimated", SOURCE_ASSUMPTION),
    expectedBales: 176,
    intendedUse: "own_livestock",
    productionCost: { fertiliserSlurry: 101, contractor: 620, wrapBales: 340, other: 40 },
    estimatedFieldCost: 101,
  },
];

export const mockForageInventory: ForageInventory = {
  farmId: FARM_ID,
  totalDmTonnes: tracked(310, "estimated", SOURCE_ASSUMPTION),
  requiredWinterForageDmTonnes: tracked(350, "estimated", SOURCE_ASSUMPTION),
  surplusDeficitDmTonnes: -40,
};

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------
// Headline margin/revenue/cost figures are shared verbatim by the Dashboard
// hero and the Finance page hero, per docs/finance-engine.md's "single
// source of truth" rollup principle — the reference pack shows two
// different revenue/cost splits with the same €47,820 margin; this mock
// keeps just one (the Dashboard's) so both screens stay reconcilable.

export const mockFinanceSummary = {
  forecastMarginEur: 47_820,
  marginChangePct: 12,
  totalRevenueEur: 121_400,
  revenueChangePct: 8,
  totalCostsEur: 73_580,
  costsChangePct: -3,
};

export const mockFinanceLines: FinanceLine[] = [
  {
    category: "feed",
    label: "Silage",
    amount: tracked(18_420, "estimated", SOURCE_ASSUMPTION),
    priceSource: { kind: "public_benchmark", date: "2026-08-01" },
  },
  {
    category: "feed",
    label: "Concentrates",
    amount: tracked(23_650, "farmer_adjusted", "Keith"),
    priceSource: { kind: "farmer_price", date: "2026-07-15" },
  },
  {
    category: "feed",
    label: "Grass",
    amount: tracked(8_960, "estimated", SOURCE_ASSUMPTION),
    priceSource: { kind: "public_benchmark", date: "2026-08-01" },
  },
  {
    category: "feed",
    label: "Minerals",
    amount: tracked(3_540, "estimated", SOURCE_ASSUMPTION),
    priceSource: { kind: "public_benchmark", date: "2026-08-01" },
  },
  {
    category: "fertiliser_lime",
    label: "Fertiliser spend",
    amount: tracked(14_250, "estimated", SOURCE_ASSUMPTION, {
      calculationVersion: NUTRIENT_ENGINE_VERSION,
    }),
    priceSource: { kind: "public_benchmark", date: "2026-08-01" },
  },
  {
    category: "fertiliser_lime",
    label: "Slurry nutrient value",
    amount: tracked(6_780, "estimated", SOURCE_ASSUMPTION, {
      calculationVersion: SLURRY_ENGINE_VERSION,
    }),
    priceSource: { kind: "public_benchmark", date: "2026-08-01" },
  },
  {
    category: "livestock",
    label: "Livestock value",
    amount: tracked(totalLivestockValue, "estimated", SOURCE_ASSUMPTION),
    priceSource: { kind: "public_benchmark", date: "2026-08-15" },
  },
];

export const mockCashflow: CashflowPoint[] = [
  { month: "Jan", cumulativeMargin: -18_000 },
  { month: "Feb", cumulativeMargin: -12_000 },
  { month: "Mar", cumulativeMargin: -4_000 },
  { month: "Apr", cumulativeMargin: 6_000 },
  { month: "May", cumulativeMargin: 16_000 },
  { month: "Jun", cumulativeMargin: 24_000 },
  { month: "Jul", cumulativeMargin: 30_000 },
  { month: "Aug", cumulativeMargin: 34_000 },
  { month: "Sep", cumulativeMargin: 38_000 },
  { month: "Oct", cumulativeMargin: 43_000 },
  { month: "Nov", cumulativeMargin: 47_820 },
];

export const mockOpportunities: OpportunityLine[] = [
  {
    id: "opp-feed-mix",
    kind: "savings",
    title: "Optimise feed mix",
    description: "Reduce concentrate use and save up to €1,120",
  },
  {
    id: "opp-fert-group",
    kind: "buying_group",
    title: "Join fertiliser buying group",
    description: "Save up to €740",
  },
  {
    id: "opp-silage-deficit",
    kind: "risk",
    title: "Silage deficit risk",
    description: "Increase silage by 8% to reduce risk",
  },
];

// ---------------------------------------------------------------------------
// Spreading
// ---------------------------------------------------------------------------

export const mockSpreadingScores: SpreadingFieldScore[] = [
  {
    fieldId: "field-back",
    date: "2026-05-21",
    slurryScore: tracked(91, "estimated", "Met Éireann", { calculationVersion: "spreading_engine_v1.0.0 (mock)" }),
    fertiliserScore: tracked(88, "estimated", "Met Éireann"),
    soilTempC: 10.6,
    rainfallForecastMm: "1–4 mm",
    drainageLabel: "Good drainage",
  },
  {
    fieldId: "field-home",
    date: "2026-05-21",
    slurryScore: tracked(86, "estimated", "Met Éireann", { calculationVersion: "spreading_engine_v1.0.0 (mock)" }),
    fertiliserScore: tracked(84, "estimated", "Met Éireann"),
    soilTempC: 11.2,
    rainfallForecastMm: "0–2 mm",
    drainageLabel: "Well drained",
  },
  {
    fieldId: "field-road",
    date: "2026-05-21",
    slurryScore: tracked(58, "estimated", "Met Éireann", { calculationVersion: "spreading_engine_v1.0.0 (mock)" }),
    fertiliserScore: tracked(60, "estimated", "Met Éireann"),
    soilTempC: 9.4,
    rainfallForecastMm: "5–8 mm",
    drainageLabel: "Moderate drainage",
  },
  {
    fieldId: "field-river",
    date: "2026-05-21",
    slurryScore: { hardStop: true, reason: "Saturated ground, heavy rainfall (>20 mm) forecast" },
    fertiliserScore: { hardStop: true, reason: "Saturated ground, heavy rainfall (>20 mm) forecast" },
  },
];

export const mockSpreadingForecast: SpreadingDayForecast[] = [
  { date: "2026-05-20", dayLabel: "Mon 20 May", score: 74, weather: "sun" },
  { date: "2026-05-21", dayLabel: "Tue 21 May", score: 86, weather: "cloud" },
  { date: "2026-05-22", dayLabel: "Wed 22 May", score: 81, weather: "cloud" },
  { date: "2026-05-23", dayLabel: "Thu 23 May", score: 62, weather: "rain" },
  { date: "2026-05-24", dayLabel: "Fri 24 May", score: 38, weather: "rain" },
];

// ---------------------------------------------------------------------------
// Input Planner
// ---------------------------------------------------------------------------

export const mockInputRequirements: InputRequirement[] = [
  {
    id: "input-fertiliser",
    category: "fertiliser",
    label: "Fertiliser",
    requiredQty: tracked(13.6, "estimated", SOURCE_ASSUMPTION, { calculationVersion: NUTRIENT_ENGINE_VERSION }),
    unit: "t",
    stockOnHandQty: 0,
    purchaseQty: 13.6,
    estCost: tracked(6_960, "estimated", SOURCE_ASSUMPTION),
    requiredByWindow: { start: "2027-02-01", end: "2027-04-30" },
    confidencePct: 91,
    demandState: "forecast",
  },
  {
    id: "input-feed",
    category: "feed",
    label: "Feed",
    requiredQty: tracked(24.8, "estimated", SOURCE_ASSUMPTION),
    unit: "t",
    stockOnHandQty: 3.2,
    purchaseQty: 21.6,
    estCost: tracked(8_420, "estimated", SOURCE_ASSUMPTION),
    requiredByWindow: { start: "2026-10-01", end: "2027-03-31" },
    confidencePct: 74,
    demandState: "forecast",
  },
  {
    id: "input-lime",
    category: "lime",
    label: "Lime",
    requiredQty: tracked(42.0, "estimated", SOURCE_ASSUMPTION, { calculationVersion: NUTRIENT_ENGINE_VERSION }),
    unit: "t",
    stockOnHandQty: 0,
    purchaseQty: 42.0,
    estCost: tracked(2_100, "estimated", SOURCE_ASSUMPTION),
    requiredByWindow: { start: "2027-01-01", end: "2027-03-31" },
    confidencePct: 52,
    demandState: "forecast",
  },
  {
    id: "input-bale-wrap",
    category: "silage_inputs",
    label: "Bale Wrap",
    requiredQty: tracked(185, "estimated", SOURCE_ASSUMPTION),
    unit: "rolls",
    stockOnHandQty: 20,
    purchaseQty: 165,
    estCost: tracked(1_850, "estimated", SOURCE_ASSUMPTION),
    requiredByWindow: { start: "2027-04-01", end: "2027-05-31" },
    confidencePct: 89,
    demandState: "farmer_confirmed",
  },
  {
    id: "input-other",
    category: "other",
    label: "Other",
    requiredQty: tracked(1, "estimated", SOURCE_ASSUMPTION),
    unit: "lot",
    stockOnHandQty: 0,
    purchaseQty: 1,
    estCost: tracked(3_150, "estimated", SOURCE_ASSUMPTION),
    requiredByWindow: { start: "2026-09-01", end: "2027-06-30" },
    confidencePct: 60,
    demandState: "forecast",
  },
];

export const mockInputPlannerSummary = {
  seasonLabel: "2027 Farm Requirements",
  forecastSpendEur: mockInputRequirements.reduce((sum, r) => sum + r.estCost.value, 0),
  potentialSavingEur: 2_240,
  planningConfidencePct: 82,
};

export const mockBuyingOpportunities: BuyingOpportunity[] = [
  {
    id: "buy-fertiliser",
    category: "fertiliser",
    userRequirementQty: 13.6,
    regionalConfirmedQty: 620,
    regionalCommittedQty: 410,
    targetPrice: 470,
    currentPrice: 512,
    potentialSavingPerUnit: 42,
  },
  {
    id: "buy-bale-wrap",
    category: "silage_inputs",
    userRequirementQty: 165,
    regionalConfirmedQty: 5400,
    regionalCommittedQty: 3900,
    targetPrice: 9.2,
    currentPrice: 10.0,
    potentialSavingPerUnit: 0.8,
  },
];

// ---------------------------------------------------------------------------
// Market prices, alerts & timeline (dashboard surfaces)
// ---------------------------------------------------------------------------

export const mockMarketPrices: MarketPrice[] = [
  { id: "mp-beef", label: "Beef (R3)", price: 5.42, unit: "/kg", changePct: 2.1, asOf: "2026-08-22" },
  { id: "mp-weanling", label: "Weanling (300kg)", price: 890, unit: "/hd", changePct: -1.3, asOf: "2026-08-22" },
  { id: "mp-barley", label: "Barley", price: 270, unit: "/t", changePct: 0.6, asOf: "2026-08-22" },
  { id: "mp-1861-12", label: "18-6-12", price: 620, unit: "/t", changePct: -0.3, asOf: "2026-08-22" },
];

export const mockAlerts: FarmAlert[] = [
  { id: "alert-soil-test", severity: "risk", title: "Soil test due", subtitle: "Home Field", href: "/soil" },
  { id: "alert-fert-window", severity: "attention", title: "Fertiliser window open", subtitle: "Back Field", href: "/nutrients" },
  { id: "alert-slurry", severity: "info", title: "Slurry spreading conditions", subtitle: "Good for next 3 days", href: "/spreading" },
  { id: "alert-feed-budget", severity: "attention", title: "Feed budget attention", subtitle: "Weanlings", href: "/feed-optimiser" },
];

export const mockTimeline: TimelineEvent[] = [
  { category: "Fertiliser", label: "1st application", monthStart: 1, monthEnd: 3 },
  { category: "Fertiliser", label: "2nd cut top-up", monthStart: 7, monthEnd: 7 },
  { category: "Silage", label: "1st cut", monthStart: 4, monthEnd: 4 },
  { category: "Silage", label: "2nd cut", monthStart: 7, monthEnd: 7 },
  { category: "Slurry", label: "Spring spreading", monthStart: 0, monthEnd: 1 },
  { category: "Slurry", label: "Autumn spreading", monthStart: 9, monthEnd: 10 },
  { category: "Sowing", label: "Reseeding", monthStart: 3, monthEnd: 3 },
  { category: "Housing", label: "Winter housing", monthStart: 10, monthEnd: 11 },
];
