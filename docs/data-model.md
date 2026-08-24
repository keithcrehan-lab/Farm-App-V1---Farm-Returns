# Farm Return — data model & mock dataset proposal

Domain entities for the connected farm model (spec §2) plus the mock-data
shape for Phase 1 (UI-first, no real persistence yet — Phase 2 adds
Supabase/Postgres persistence behind the same shapes).

## Provenance — the pattern every calculated/enterable value follows

Per spec §2 "Data precedence" and §15 "Every material recommendation
carries metadata", no plain number is stored on its own. Every value that
can be estimated, farmer-adjusted or verified is wrapped:

```ts
type DataStatus = "verified" | "farmer_adjusted" | "estimated" | "mapped";

interface Provenance {
  source: string;          // e.g. "Soil test", "Teagasc rule", "Irish Soil Information System",
                            // "Met Éireann", "CSO", "Supplier quote", "Farm Return assumption"
  sourceDate?: string;      // ISO date — dataset/rule publication or retrieval date
  retrievedAt?: string;     // ISO datetime — when Farm Return fetched/derived it
}

interface Versioned {
  calculationVersion?: string; // e.g. "nutrient_engine_v1.2.0" — only on derived values
}

interface Confidence {
  level?: "high" | "medium" | "low"; // only where estimate uncertainty is meaningful
}

interface RegulatoryStatus {
  regulatory?: "planning_advice" | "compliance_value";
}

/** The generic wrapper. Replace T with the value's real type. */
interface TrackedValue<T> extends Provenance, Versioned, Confidence, RegulatoryStatus {
  value: T;
  status: DataStatus;
  previous?: TrackedValue<T>; // never overwritten — history chain, per "never overwrite provenance"
}
```

`TrackedValue<T>.previous` is how "retain the original value, source,
timestamp and rule/model version" (spec §2) is modeled: replacing an
estimate with a verified value creates a new `TrackedValue` whose
`previous` points at the one it replaced, rather than mutating it in
place.

Every domain engine module returns `TrackedValue<...>` for its outputs, not
raw numbers — see `docs/agronomy-engine.md`, `docs/feed-engine.md`,
`docs/finance-engine.md` for the calculation pipelines that produce them.

## Core entities

```ts
interface Farm {
  id: string;
  name: string;
  location: { county: string; centroid: [number, number] };
  primaryEnterprises: EnterpriseType[]; // e.g. ["suckler_beef"], ["dairy"], ["tillage"]
  units: "metric"; // Ireland — metric only, kept explicit for future-proofing
  ownerName: string;
}

type EnterpriseType =
  | "suckler_beef" | "dairy_beef" | "dairy" | "sheep" | "tillage" | "mixed";

interface Field {
  id: string;
  farmId: string;
  name: string;
  polygon: GeoJSON.Polygon;
  areaHa: number;              // derived from polygon, not entered
  centroid: [number, number];
  lpisRef?: string;
  plannedUse: TrackedValue<FieldUse>;
  mappedSoil: MappedSoil;      // §5 "Mapped soil" layer — physical, not fertility
  fertility: SoilFertility;    // §5 "Planning fertility" + "Verified test" layers
  history: FieldSeasonRecord[]; // yield/harvest/field cost per season
}

type FieldUse = "grazing" | "silage_1st_cut" | "silage_2nd_cut" | "silage_3rd_cut"
  | "mixed" | "tillage" | "other";

interface MappedSoil {
  soilAssociation: string;
  dominantSeries: string;
  texture: string;
  drainage: "well_drained" | "moderately_drained" | "poorly_drained";
  depth?: string;
  organicCarbonStatus?: "mineral" | "peat" | "high_organic";
  coveragePct: number;         // % of field area the mapped unit covers
  datasetVersion: string;      // Irish Soil Information System version/date
}

interface SoilFertility {
  pIndex: TrackedValue<1 | 2 | 3 | 4>;
  kIndex: TrackedValue<1 | 2 | 3 | 4>;
  pH?: TrackedValue<number>;
  verifiedTest?: SoilTest;
}

interface SoilTest {
  sampleDate: string;
  laboratory: string;
  sampleRef: string;
  p: number; k: number; pH: number;
  limeRequirement?: number;
  mg?: number;
  organicMatterPct?: number;
  reportFileUrl?: string;
}

interface LivestockGroup {
  id: string;
  farmId: string;
  category: LivestockCategory;
  count: TrackedValue<number>;
  avgWeightKg?: TrackedValue<number>;
  avgAgeMonths?: number;
  breed?: string;
  sex?: "male" | "female" | "mixed";
  system: "grazing" | "housed";
  housingId?: string;          // link, not re-entry
  goal?: LivestockGoal;
  value: TrackedValue<number>; // € current/forecast value
}

type LivestockCategory =
  | "suckler_cow" | "dairy_cow" | "bull" | "calf" | "weanling"
  | "store" | "steer" | "heifer"; // sheep equivalents added later

type LivestockGoal = "maintain" | "grow" | "breed" | "sell_store" | "finish_slaughter";

interface Housing {
  id: string;
  farmId: string;
  shedName: string;
  shedType: "slatted" | "straw_bedded" | "other";
  linkedGroupIds: string[];    // link to existing LivestockGroup, never re-ask headcount
  housingPeriod: { start: string; end: string };
  tankRefinement?: TankDetail; // optional — only if farmer wants a refined estimate
  slurryEstimate: SlurryEstimate;
}

interface TankDetail {
  dimensions?: { lengthM: number; widthM: number; depthM: number };
  observedFillPct?: number;
  dilutionWaterFactor?: number;
  analysis?: { n: number; p: number; k: number; sampleDate: string };
}

interface SlurryEstimate {
  volumeM3: TrackedValue<number>;
  availableN: TrackedValue<number>;
  availableP: TrackedValue<number>;
  availableK: TrackedValue<number>;
  ruleSetVersion: string;      // versioned organic-manure rule set (§6)
}

interface SlurryAllocation {
  fieldId: string;
  housingId: string;
  priority: "high" | "medium" | "not_suitable";
  volumeM3: number;
  score: number; // 0-100, ties to the spreading engine's constraint set
}

interface SilagePlan {
  id: string;
  fieldId: string;
  cutNumber: 1 | 2 | 3;
  harvestSystem: "pit" | "bale";
  targetCutWindow: TrackedValue<{ start: string; end: string }>;
  expectedYieldTDMha: TrackedValue<number>;
  expectedQuality?: TrackedValue<{ dmd?: number }>;
  intendedUse: "own_livestock" | "sale" | "both";
  actualOutput?: { tonnesOrBales: number; moisturePct?: number };
  productionCost: { fertiliserSlurry: number; contractor: number; wrapBales: number; other: number };
}

interface ForageInventory {
  farmId: string;
  totalDmTonnes: TrackedValue<number>;
  requiredWinterForageDmTonnes: TrackedValue<number>;
  surplusDeficitDmTonnes: number; // derived: total - required
}

interface FinanceLine {
  category: "revenue" | "feed" | "fertiliser_lime" | "livestock" | "cashflow";
  label: string;
  amount: TrackedValue<number>;
  priceSource: PriceSource;
}

interface PriceSource {
  kind: "public_benchmark" | "farmer_price" | "invoice_contract" | "supplier_quote" | "bulk_buy_price";
  date: string;
}

interface SpreadingFieldScore {
  fieldId: string;
  date: string;
  slurryScore: TrackedValue<number> | HardStop;   // 0-100, or a hard stop
  fertiliserScore: TrackedValue<number> | HardStop;
  componentBreakdown: Record<string, number>;      // rainfall, moisture, soilTemp, demand, drainageRisk, wind
}

interface HardStop {
  hardStop: true;
  reason: string; // e.g. "Closed period", "Saturated ground", "Heavy rainfall forecast"
}

interface InputRequirement {
  id: string;
  category: "fertiliser" | "feed" | "lime" | "minerals" | "silage_inputs" | "contractor" | "other";
  label: string;
  requiredQty: TrackedValue<number>;
  stockOnHandQty: number;
  purchaseQty: number;          // derived: requiredQty - stockOnHandQty
  estCost: TrackedValue<number>;
  requiredByWindow: { start: string; end: string };
  confidencePct: number;
  demandState: "forecast" | "farmer_confirmed" | "committed" | "purchased";
}

interface BuyingOpportunity {
  id: string;
  inputRequirementCategory: InputRequirement["category"];
  userRequirementQty: number;
  regionalConfirmedQty: number;
  regionalCommittedQty: number;
  targetPrice: number;
  currentPrice: number;
  potentialSavingPerUnit: number;
}
```

## Mock dataset proposal (Phase 1)

`src/data/mock-farm.ts` exports one internally-consistent demo farm so
every screen tells the same story (a field's soil status matches its
nutrient plan matches its spreading score matches its silage plan, etc.).
Reuse the reference screens' own field names/figures as the baseline
demo — they already form a coherent example:

- **Farm:** "Ballybeg Farm", Co. Cork, suckler beef, ~4 fields for the
  Phase 1 demo (Home Field 8.6 ha, Back Field 9.1 ha / 6.8 ha across
  screens — reconcile to one figure, e.g. 6.8 ha, when building the mock
  file, and note the discrepancy came from the reference pack using
  illustrative rounding — River Field 5.4 ha, Road Field 6.2 ha), 63 head
  of cattle across suckler cows/weanlings/heifers/bull.
- **Soil:** Home/Back/Road Fields = Brown Earth, estimated/farmer-adjusted
  P/K; River Field = Surface-water Gley, poor drainage, verified test.
- **Housing:** one slatted shed ("Shed 1"), all three cattle groups linked,
  60% storage fill, allocation ranks Back Field (high) > Home Field
  (medium) > River Field (not suitable — matches its poor drainage/hard
  stop in Spreading).
- **Spreading:** River Field = hard stop (saturated ground) consistent with
  its poor-drainage/verified-gley soil; Back Field highest score (91),
  matching housing's high-priority allocation.
- **Silage:** Back Field first-cut, 10.4 t DM/ha, feeds into a whole-farm
  −40 t DM winter deficit warning.
- **Finance/Feed/Livestock Economics:** the €47,820 forecast margin,
  18-head "Continental steers" feed-optimiser example, and cost tables
  from the reference screens carry through unchanged as the demo's
  headline numbers.

Export shape:

```ts
export const mockFarm: Farm = { /* … */ };
export const mockFields: Field[] = [ /* Home, Back, River, Road */ ];
export const mockLivestockGroups: LivestockGroup[] = [ /* suckler cows, weanlings, heifers, bull */ ];
export const mockHousing: Housing[] = [ /* Shed 1 */ ];
export const mockSlurryAllocations: SlurryAllocation[] = [ /* … */ ];
export const mockSilagePlans: SilagePlan[] = [ /* Back Field 1st cut */ ];
export const mockForageInventory: ForageInventory = { /* … */ };
export const mockFinanceLines: FinanceLine[] = [ /* … */ ];
export const mockSpreadingScores: SpreadingFieldScore[] = [ /* … */ ];
export const mockInputRequirements: InputRequirement[] = [ /* … */ ];
export const mockBuyingOpportunities: BuyingOpportunity[] = [ /* … */ ];
```

All mock values are `TrackedValue`s with plausible `source` strings (e.g.
`"Farm Return assumption"`, `"Teagasc rule (mock)"`) so components render
their real provenance badges from day one — Phase 1 screens must never
special-case "mock mode" styling separately from "estimated" styling; per
`CLAUDE.md`'s visual QA rule, mock data is kept *labelled and traceable*,
not visually distinct from how real estimated data will look.

## Open modeling questions for Phase 2

- Individual-animal tracking vs group-only (spec allows "individuals
  later" — Phase 1/2 stays group-only).
- Multi-season history storage shape for `FieldSeasonRecord` (deferred —
  not needed until Phase 2 persistence).
- How `BuyingOpportunity` regional aggregation is computed server-side
  (Phase 6 concern, needs its own design pass).
