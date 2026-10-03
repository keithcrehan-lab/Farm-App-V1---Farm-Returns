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

import type { EngineOutcome, EvidenceState } from "./evidence";
import type { StatutoryManureNutrientValue } from "./statutory-manure-value";
import type { LessMethodGateOk } from "./less-method-gate";
import type { SoilTestAgeStatus } from "./soil-test-validity";
import type { SoilIndexProvenance } from "./soil-index-provenance";

// ---------------------------------------------------------------------------
// Provenance — every enterable/derivable value is wrapped in this.
// ---------------------------------------------------------------------------

/**
 * Codex remediation Priority 1/2 — `"unavailable"` added. Represents a
 * value that is genuinely absent, not merely low-confidence: no farmer
 * entry, no automatic mapping, no lab test. Every other status carries a
 * real (if uncertain) figure; `"unavailable"` carries none, and callers
 * must never read `.value` off a TrackedValue in this state as if it were
 * real (see `src/domain/nutrients.ts`'s `fertilityEvidence` gate). The
 * value is not fabricated even when the field is technically required at
 * the type level.
 */
export type DataStatus = "verified" | "farmer_adjusted" | "estimated" | "mapped" | "unavailable";

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
  /** Codex remediation Priority 8 — when the spatial resolver produced this
   * result (ISO datetime), distinct from `datasetVersion` (the dataset's
   * own publication version). Absent for pre-remediation records only. */
  resolvedAt?: string;
  /** Codex remediation Priority 8 — set when a farmer has overridden the
   * spatially-resolved soil with their own knowledge (e.g. a local
   * association name the polygon-intersection got wrong). Distinct from
   * `source` (which stays the original dataset attribution) so provenance
   * of the override itself is never lost. */
  farmerOverride?: { by: string; at: string; reason?: string };
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
  /** Fertiliser Vertical V1, Checkpoint 2 — additive, non-breaking
   * provenance link when this `SoilTest` was applied from the new
   * guided-sampling evidence chain (`lab_results`/`soil_interpretations`
   * tables) rather than typed in directly on the legacy Soil screen.
   * Absent for every pre-existing/legacy soil test — never backfilled. */
  compositeSampleId?: string;
  labResultId?: string;
  /** Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
   * F4) — the field's own previously-active `SoilTest`, chained here the
   * same way `TrackedValue.previous` already chains every other
   * provenance history in this app ("never overwritten — history
   * chain", this file's own `TrackedValue` doc comment) — never
   * overwritten, never truncated by a new test replacing it.
   * `SoilFertility.verifiedTest` itself is not a `TrackedValue<SoilTest>`
   * (a raw lab record, not a single derived value with a status), so
   * this is the same chaining concept expressed directly on the type it
   * actually chains. Absent for a field's first-ever real test. */
  previous?: SoilTest;
}

/**
 * Codex remediation Priority 2 — `pIndex`/`kIndex` are now genuinely
 * optional. A newly-created field has neither: no fabricated "Index 2"
 * default is ever written. `src/domain/nutrients.ts`'s `calculateNutrientPlan`
 * fails closed (`NutrientPlan.fertilityEvidence`) whenever either is
 * missing — never silently substitutes a value.
 */
export interface SoilFertility {
  pIndex?: TrackedValue<1 | 2 | 3 | 4>;
  kIndex?: TrackedValue<1 | 2 | 3 | 4>;
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
  /** Codex remediation Priority 6 — field creation is boundary-first now:
   * `areaHa` is always derived from `polygon` (`field-boundary.ts`'s
   * `computeBoundaryGeometry`) at the moment the field is created, never
   * typed by the farmer or left as a guess. `docs/data-model.md`'s own
   * comment ("derived from polygon, not entered") is now true from
   * creation onward, not just after a later edit. */
  areaHa: number;
  /** Derived from `polygon`, same as `areaHa` — see its comment above. */
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
  /** Codex remediation Priority 6 — absent until the farmer sets it in
   * Field Detail, entered after the field is created (boundary-first
   * workflow — see `fields/page.tsx`'s Add Field flow), never assumed at
   * creation. Every consumer that needs a land use for a legal/compliance
   * calculation (e.g. NAP grazing-vs-cut-only, non-grass % — `nutrients.ts`)
   * must treat an absent `plannedUse` as unresolved, not "grazing". */
  plannedUse?: TrackedValue<FieldUse>;
  /** Codex remediation Priority 2/8 — absent until a real spatial soil
   * lookup (or a farmer override) resolves it. Never seeded with a
   * "Pending mapping" placeholder that looks like real data — see
   * `src/domain/soil-resolution.ts` and CLAUDE.md's "provenance is
   * permanent" rule. */
  mappedSoil?: MappedSoil;
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
    /** V3 closure pass, Priority 11 (AF010, national buffer half) —
     * `buffer-gate.ts`'s own `BufferFeature` categories
     * (`rules_statutory/buffer_distances_2026.csv`). Distinct from
     * `nearestFeature` above (a free-text label never auto-categorised
     * into this typed union — see `checkNationalBufferDistance`'s own
     * doc comment for why). Absent means "not categorised yet", which
     * fails closed exactly like the rest of this object. */
    featureType?: "surface_water" | "major_drinking_water_abstraction" | "drinking_water_abstraction" | "other_drinking_well_spring_borehole" | "lake_or_turlough_likely_to_flood" | "exposed_cavernous_or_karst_limestone_feature";
    /** V3 closure pass (second pass) — the local authority's own override
     * distance, only meaningful when `localOverrideStatus ===
     * "authoritative_rule"`. Was documented in `checkLocalBufferOverride`'s
     * own doc comment as "never captured in this data model", making its
     * `authoritative_rule` branch permanently unreachable — closes that
     * gap so a real local-authority figure can actually be recorded. */
    localOverrideDistanceM?: number;
  }>;
  history: FieldSeasonRecord[];
  /** Thumbnail asset for field cards — Phase 1 uses static crops, not live tiles. */
  thumbnail?: string;
  /** Real Farm V1 Phase 7 — soft delete ("Provenance is permanent": a
   * field's soil tests/slurry allocations/history must survive, so this
   * is a timestamp, not a hard DELETE). Absent/undefined means active.
   * `useFields()` (farm-store.tsx) filters archived fields out by
   * default everywhere else in the app reads from it. */
  archivedAt?: string;
}

/**
 * Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
 * F2) — `listFieldsForFarm` (`src/lib/farm-data/fields.ts`) itself
 * returns every field for a farm regardless of `archivedAt`, by design
 * (the one legitimate caller needing the full set,
 * `(app)/layout.tsx`, seeds the client store for
 * `useAllFieldsIncludingArchived()`'s own "Archived fields" section).
 * Every farm-wide aggregation — stocking rate, grassland area,
 * fertiliser demand/requirement totals, reports, purchase quantities —
 * must exclude an archived field from its own calculation the same way
 * `useFields()` (farm-store.tsx) already does for the client store.
 * Shared here so that rule is applied once, consistently, at each real
 * server-side aggregation call site, rather than trusted to be
 * remembered independently at every one of them (the actual root cause
 * of F2 — the client already filtered correctly, the server never did).
 * `support-profile.ts` inlined this identical filter before this helper
 * existed (Codex audit HIGH, round 4, 2026-09-04) — now reuses it too.
 */
export function activeFields<T extends Pick<Field, "archivedAt">>(fields: readonly T[]): T[] {
  return fields.filter((f) => !f.archivedAt);
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
  /** V3 closure pass, Priority 5 — S.I. 119/2026 Table 7's dairy-cow
   * milk-yield banding (`rules_statutory/livestock_excretion_rates_2026.csv`
   * rows `dairy_cow_band_1/2/3`), average kg milk/cow/year. Only
   * meaningful for `category: "dairy_cow"` groups; absent means the band
   * cannot be resolved and `resolveStatutoryExcretionCategory`
   * (`statutory-excretion.ts`) correctly fails closed — this app models
   * no real dairy enterprise today, so the field exists for correctness
   * and any future dairy farm, not because a live group needs it now. */
  avgMilkYieldKgPerYear?: TrackedValue<number>;
}

// ---------------------------------------------------------------------------
// Individual animal detail (Real Mode Completion Phase 12) — an optional
// layer under a LivestockGroup; a farmer who only wants group management
// never has to touch this. `currentWeightKg` is derived (the latest
// `WeightObservation` by date), never stored redundantly on the animal
// itself — "prefer a structure that can support historical weight
// observations rather than assuming an animal only ever has one weight."
// ---------------------------------------------------------------------------

export interface IndividualAnimal {
  id: string;
  farmId: string;
  groupId?: string;
  tagNumber?: string;
  category: LivestockCategory;
  sex?: "male" | "female";
  breed?: string;
  dateOfBirth?: string;
  goalStatus?: string;
  notes?: string;
}

export type AnimalLifecycleStatus = "active" | "sold" | "deceased" | "culled" | "transferred";

/**
 * Farm Return Next Checkpoint 1.5 (Intelligence & Extensibility
 * Architecture) — a documented *future* shape for `IndividualAnimal`
 * parentage/lifecycle tracking, kept deliberately separate from
 * `IndividualAnimal` itself.
 *
 * Codex audit MEDIUM (round 1, 2026-09-08): an earlier version of this
 * checkpoint merged these two fields directly into `IndividualAnimal` —
 * the real, persisted, round-tripped entity `rowToIndividualAnimal`
 * (`src/lib/farm-data/mappers.ts`) actually returns. Since
 * `livestock_individuals` (`supabase/migrations/
 * 20260828040000_individual_animals.sql`) has no `sire_id`/`dam_id`/
 * `lifecycle_status` columns, and no mapper/input type populates them,
 * every real `IndividualAnimal` a caller ever sees would have had these
 * fields permanently `undefined` — indistinguishable from "this animal
 * genuinely has no parents", a materially misleading claim for a live
 * entity to make, not the honest "not yet a stored entity" disclosure
 * this same file's own `ConcentrateFeedSpec` can honestly make (that
 * type is *only* ever used as a real function parameter, never returned
 * from a real record's own mapper). Kept here instead, entirely
 * disconnected from `IndividualAnimal` — a future breeding/movement
 * feature that actually implements this extends `IndividualAnimal`'s
 * real schema/mapper/input types *together, in the same commit*, never
 * adding a type-level field ahead of that. Parent ids would be
 * `IndividualAnimal.id` references, needing the same same-farm
 * enforcement `livestock_individuals_check_same_farm` (`supabase/
 * migrations/20260828070000_cross_farm_integrity.sql`) already gives
 * every other field on that table.
 */
export interface FutureIndividualAnimalLifecycleFields {
  parentIds?: { damId?: string; sireId?: string };
  /** Free-standing from `IndividualAnimal.goalStatus` (a farmer-facing
   * management label, e.g. "On track to finish") — this would be a
   * closed, structural lifecycle state a future inventory/profitability
   * calculation could safely switch over exhaustively. Absent would mean
   * "not tracked yet", never assumed to be `"active"`. */
  lifecycleStatus?: AnimalLifecycleStatus;
}

export interface WeightObservation {
  id: string;
  animalId: string;
  weightKg: number;
  observedDate: string;
  /** e.g. "Farmer entered", "Weighbridge" — never fabricated. */
  source: string;
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
  /**
   * Fertiliser Overview and Stock Visuals campaign — `storageFillPct`
   * itself carried no provenance at all before this campaign: no way to
   * tell a real farmer-typed fill level from a placeholder/never-touched
   * one, and no "when was this last true" timestamp. Smallest reliable
   * addition (not a full `TrackedValue<number>` — that would ripple
   * through every existing `storageFillPct` read site, e.g. `ShedCard.tsx`,
   * `farm-stats.ts` — see `docs/farm-return-next/DOMAIN_CONTRACTS.md`'s
   * "Fertiliser Overview and Stock Visuals" entry for the full account).
   * `"farmer_recorded"` whenever a farmer has ever explicitly submitted
   * the Housing form's own "Current fill (%)" field (`createHousing`/
   * `updateHousing`, `src/lib/farm-data/housing.ts`, always stamp this
   * together with `storageFillRecordedAt` — never set independently);
   * `"estimated"` for every pre-existing row this campaign's own
   * migration backfilled (honestly: this app cannot tell, after the
   * fact, whether an old value was ever farmer-confirmed, so it is never
   * upgraded to `"farmer_recorded"` retroactively). Always present —
   * the migration's own `not null default 'estimated'` guarantees it.
   */
  storageFillStatus: "estimated" | "farmer_recorded";
  /** ISO datetime `storageFillPct` was last explicitly set by a farmer —
   * `undefined` for a pre-migration row this campaign's own backfill
   * could not honestly date (see `storageFillStatus`'s own doc comment). */
  storageFillRecordedAt?: string;
  /** Phase 1A store reconciliation (`20260926000000_slurry_allocation_lifecycle.sql`,
   * `slurry-allocation-lifecycle.ts`) — the database-owned identity of the
   * current fill observation. Absent in mock mode. */
  storeObservationSeq?: number;
  /** When the current observation was recorded; absent for a pre-lifecycle
   * observation whose instant is unknown. */
  storeObservedAt?: string;
  /** Physical m³ of completed allocations withdrawn from this store since
   * its current observation. Absent (none recorded) in mock mode. */
  storeWithdrawnSinceObservationM3?: number;
}

export interface SlurryAllocation {
  fieldId: string;
  housingId: string;
  /** Ranking outputs of an allocation-scoring engine. Absent on a
   * farmer-planned allocation (`src/domain/slurry-allocation-plan.ts`) —
   * no audited engine has ranked it, so no rank is invented. */
  priority?: "high" | "medium" | "not_suitable";
  volumeM3: number;
  score?: number;
  /** V3 `required_input_fields.csv` "SLURRY_APPLICATION_METHOD" — LESS
   * (Low Emission Slurry Spreading) is legally required in defined
   * GSR/pig-slurry/arable scenarios
   * (`rules_statutory/less_requirements_2026.csv`). Absent means the
   * method has not been captured; a nutrient/spreading plan cannot
   * certify method compliance without it — see
   * `src/domain/input-gates.ts`'s `requireSlurryApplicationMethod`. */
  applicationMethod?: TrackedValue<"LESS" | "splashplate" | "incorporate_24h" | "other">;
  /** Slurry Application Context V1 — when this specific allocation's
   * slurry was (or is planned to be) actually spread, ISO date. Placed
   * here, not on `SlurryComposition` (composition describes what is in
   * the tank; this describes how/when THIS allocation's slurry is
   * applied — the same field/housing-scoped record `applicationMethod`
   * above already lives on) and not as a competing model alongside
   * `job-actual.ts`'s `SlurrySpreadingActual` (a separate, later-stage,
   * job-session-confirmed RETROSPECTIVE record, not consumed by
   * `calculateNutrientPlan`). No evidenced Teagasc spring/summer/autumn/
   * winter availability boundary exists in this repository, so this date
   * does not drive which nutrient-availability table applies — see
   * `resolveAvailableSlurryNutrients` (`src/domain/nutrients.ts`). It is
   * captured/surfaced for the farmer's own record and as the narrowest
   * correct home for any future evidenced timing rule. */
  applicationDate?: TrackedValue<string>;
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
  /** Campaign B regulatory interpretation — set only when the planned
   * slurry is evidenced as grazing livestock manure produced on this
   * holding. Under S.I. 588/2025 Art. 17(8) the maxima are in addition to
   * it, so its statutory available N/P (kg/ha) is NOT in `nRequiredKgHa`/
   * `pRequiredKgHa` above, which are then the chemical supply alone. It is
   * still limited elsewhere (livestock-manure N limit, Index 4 surplus
   * rule) — this is not a statement that it is unlimited. */
  homeProducedGrazingManureExcluded?: { nKgHa: number; pKgHa: number; legalBasis: string };
  /** V3 closure pass (second pass, `SOIL_TEST_VALIDITY` enforcement) —
   * set only when this field has a verified lab soil test AND
   * `checkSoilTestAgeValidity` resolved it to `"DISREGARD"` (4+ years
   * old, not P-Index 4). `regulatory` above is downgraded from
   * `"compliance_value"` to `"planning_advice"` in this case — a
   * disregarded lab result can no longer back a confirmed statutory P
   * ceiling; `soilTestDisregardedReason` carries a farmer-facing
   * explanation for why. Previously this status was computed
   * (`soilTestAgeValidity` below) and SURFACED but never actually
   * changed the compliance answer — this field closes that gap. */
  soilTestDisregardedReason?: string;
  /** Codex audit CRITICAL (round 28) — set when this field's own
   * `plannedUse` has genuinely never been recorded (not "grazing", not
   * any other real land use — see this file's own `plannedUse` doc
   * comment: "must treat an absent plannedUse as unresolved, not
   * grazing" for a legal/compliance calculation like this one).
   * `landUse` above still resolves to `"grazing"` (the same safe,
   * disclosed default the agronomic N/P/K requirement itself already
   * uses — the two ledgers are deliberately not reversed here), but
   * `regulatory` is downgraded to `"planning_advice"`, the identical
   * mechanism `soilTestDisregardedReason` already establishes, since a
   * genuinely unconfirmed land use cannot back a confirmed statutory
   * ceiling. */
  plannedUseUnresolvedReason?: string;
  /** Campaign B (B2.4) — set when the working P Index is not a
   * laboratory result (a farmer override or an unconfirmed estimate).
   * The override stays the agronomic value; `regulatory` is downgraded to
   * `"planning_advice"` by the same mechanism as the two reasons above. */
  pIndexNotLaboratoryReason?: string;
  /** Campaign B stabilisation 2 — set when this field has a verified lab
   * soil test whose regulatory age validity could not be resolved
   * (`soilTestAgeValidity` is `BLOCKED_INSUFFICIENT_EVIDENCE`, e.g.
   * `UNKNOWN_BLOCK` for an undated test). The lab result and the
   * agronomic value are kept, but `regulatory` is downgraded to
   * `"planning_advice"` — unresolved validity is never read as valid. */
  soilTestValidityUnresolvedReason?: string;
}

/** Fertiliser Vertical Completion, Increment 1 — one nutrient's canonical
 * per-field requirement (`NutrientPlan.fieldRequirement`). `KNOWN` carries
 * the unrounded kg/ha (round only for presentation) and its field total;
 * `UNKNOWN` carries no number, never 0; `NOT_APPLICABLE` means this
 * grassland engine has no requirement table for the field's use (tillage),
 * not a zero requirement. */
export type FieldNutrientRequirementArm =
  | {
      status: "KNOWN";
      kgHa: number;
      /** `kgHa` × field area, kg, unrounded. Blocked (`MISSING_FIELD_AREA`)
       * when the field area is not a positive number. */
      totalKg: EngineOutcome<number>;
      evidenceState: EvidenceState;
      source: string;
      /** The source tables the figure is read from. */
      ruleRefs: string[];
      /** Known limitation codes, e.g. `N_YIELD_SCALING_NOT_APPLIED`. */
      limitations: string[];
    }
  | { status: "UNKNOWN"; reasonCode: string; missingInputs: string[] }
  | { status: "NOT_APPLICABLE"; reasonCode: string };

/** Fertiliser Vertical Completion, Increment 1 — the canonical per-field
 * N, P and K requirement downstream slurry allocation, chemical
 * recommendation, aggregation and quoting consume. Each nutrient is
 * independent: P depends only on the P Index, K only on the K Index, and
 * neither reads the internal Index-1 placeholder (CC-B5). A known arm
 * equals `requirementByNutrient`'s arm after `Math.round`. */
export interface FieldNutrientRequirement {
  contractVersion: "field_nutrient_requirement_v1";
  engineVersion: string;
  fieldId: string;
  areaHa: number;
  cropContext: {
    basis: "grazing" | "silage" | "tillage";
    plannedUse?: FieldUse;
    /** `true` when no `plannedUse` is recorded and grazing was assumed. */
    plannedUseAssumed: boolean;
    /** Silage basis with a cut plan: the target yield context. */
    silage?: { cutNumber: 1 | 2 | 3; expectedYieldTDMha: number; wasGrazedPreviousYear: boolean };
    /** Grazing basis: the agronomic organic-N stocking rate (Table 12-3). */
    grazingStockingRateKgNHa?: number;
  };
  n: FieldNutrientRequirementArm;
  p: FieldNutrientRequirementArm & { soilIndex: EngineOutcome<{ index: 1 | 2 | 3 | 4 }> };
  k: FieldNutrientRequirementArm & { soilIndex: EngineOutcome<{ index: 1 | 2 | 3 | 4 }> };
}

/** Fertiliser Vertical Completion, Increment 2b — one nutrient's canonical
 * remaining chemical requirement (`NutrientPlan.fieldRemainingRequirement`):
 * `fieldRequirement`'s arm less `organicApplication.availableNutrientByNutrient`'s
 * credit. `KNOWN` is unrounded `max(0, requirement − credit)`; no slurry
 * planned (credit `NOT_APPLICABLE`) is a known zero credit. `UNKNOWN`
 * carries no number, never 0. `NOT_APPLICABLE` follows the requirement arm
 * (tillage). The organic excess is not encoded here. */
export type FieldNutrientRemainingArm =
  | {
      status: "KNOWN";
      /** Unrounded `max(0, requirementKgHa − creditKgHa)`, kg/ha. */
      kgHa: number;
      /** `kgHa` × field area, kg, unrounded. Blocked (`MISSING_FIELD_AREA`)
       * when the field area is not a positive number. */
      totalKg: EngineOutcome<number>;
      requirementKgHa: number;
      creditKgHa: number;
      creditBasis: "NO_SLURRY_PLANNED" | "SLURRY_CREDIT";
      /** Weakest of the requirement's and the credit's evidence states. */
      evidenceState: EvidenceState;
    }
  | {
      status: "UNKNOWN";
      reasonCode: string;
      missingInputs: string[];
      cause: "REQUIREMENT_UNKNOWN" | "SLURRY_CREDIT_UNKNOWN";
    }
  | { status: "NOT_APPLICABLE"; reasonCode: string };

/** Fertiliser Vertical Completion, Increment 2b — the canonical per-field
 * remaining chemical N, P and K requirement, computed once in
 * `calculateNutrientPlan` from `fieldRequirement` and the per-nutrient
 * slurry credit. Each nutrient is independent. A known arm equals
 * `netRequirementByNutrient`'s OK arm after `Math.round`. */
export interface FieldNutrientRemainingRequirement {
  contractVersion: "field_nutrient_remaining_v1";
  requirementContractVersion: "field_nutrient_requirement_v1";
  engineVersion: string;
  fieldId: string;
  areaHa: number;
  n: FieldNutrientRemainingArm;
  p: FieldNutrientRemainingArm;
  k: FieldNutrientRemainingArm;
}

/** Fertiliser Vertical Completion, Session 2b — why this field's
 * `purchasedProducts` / `deliveredKgHa` / `estimatedFieldCostEur` hold what
 * they hold, so no consumer infers meaning from an empty product list.
 * Products exist only for `RECOMMENDED` and `RECOMMENDED_CREDIT_NOT_COUNTED`.
 * - `RECOMMENDED`: sized from `fieldRemainingRequirement`'s KNOWN arms.
 * - `RECOMMENDED_CREDIT_NOT_COUNTED`: slurry is planned but its credit cannot
 *   be assessed (timing, method, method conflict, …); sized on the full
 *   `fieldRequirement`, no credit counted — provisional, as
 *   `requirementProvisional`.
 * - `NONE_NEEDED`: the requirement is known and the blend holds no product
 *   (`REMAINING_ZERO`: every remaining arm is 0; `BELOW_PRODUCT_THRESHOLD`:
 *   every product rate falls below the catalogue's 0.5 kg/ha line).
 * - `PROHIBITED`: chemical fertiliser is legally prohibited on this field —
 *   commonage (whatever the requirement), or a water buffer that suppresses
 *   a sized blend.
 * - `WITHHELD_MIXED_EVIDENCE`: one soil index known, the other missing (D3
 *   option a); `fieldRemainingRequirement` still carries the known arm.
 * - `UNKNOWN`: the requirement or the slurry credit cannot be established.
 * - `NOT_APPLICABLE`: no requirement table applies (tillage). */
export type FieldPurchaseStatus =
  | { status: "RECOMMENDED" }
  | { status: "RECOMMENDED_CREDIT_NOT_COUNTED"; reasonCode: string; missingInputs: string[] }
  | { status: "NONE_NEEDED"; basis: "REMAINING_ZERO" | "BELOW_PRODUCT_THRESHOLD" }
  | { status: "PROHIBITED"; reasonCode: "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED" | "WATER_BUFFER_CHEMICAL_FERTILISER_PROHIBITED" }
  | { status: "WITHHELD_MIXED_EVIDENCE"; reasonCode: "MIXED_SOIL_INDEX_EVIDENCE"; missingInputs: string[] }
  | { status: "UNKNOWN"; reasonCode: string; missingInputs: string[] }
  | { status: "NOT_APPLICABLE"; reasonCode: string };

export interface NutrientPlan {
  fieldId: string;
  /** Codex remediation Priority 1 (fail-closed nutrients) — whether this
   * field's soil fertility (P Index + K Index) is real evidence, not a
   * fabricated default. `BLOCKED_INSUFFICIENT_EVIDENCE` means
   * `purchasedProducts`/`estimatedFieldCostEur` below are forced to
   * `[]`/`0` and `requirement.status` is `"unavailable"` — never a
   * confidently-computed plan derived from an assumed Index 2. See
   * `src/domain/nutrients.ts`'s `calculateNutrientPlan`. */
  fertilityEvidence: EngineOutcome<{ pIndex: 1 | 2 | 3 | 4; kIndex: 1 | 2 | 3 | 4 }>;
  /** Campaign C per-nutrient P/K, Increment 1 (CP1 Target A,
   * `docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md`) — the
   * same soil-fertility evidence reported for P and K independently. Each
   * arm is OK when its own index exists (`MEASURED` only if that index is
   * `verified`, otherwise `IRISH_DEFAULT`); otherwise
   * `BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX` naming
   * only its own input. Additive: the paired `fertilityEvidence` above is
   * unchanged and is the conjunction of these two arms (derived from them
   * in `calculateNutrientPlan`). No other output reads this field yet. */
  fertilityEvidenceByNutrient: {
    p: EngineOutcome<{ index: 1 | 2 | 3 | 4 }>;
    k: EngineOutcome<{ index: 1 | 2 | 3 | 4 }>;
  };
  /** Campaign A (A1.2) — which evidence the P/K Index above came from:
   * the laboratory result, a farmer override of it (the original
   * laboratory node kept alongside), a farmer value with no laboratory
   * result, or an unconfirmed estimate. Additive and read-only: the
   * calculation still consumes the effective value; this only makes an
   * override traceable as an override. Always set by
   * `calculateNutrientPlan`; optional only for hand-built fixtures. */
  soilIndexProvenance?: { p: SoilIndexProvenance; k: SoilIndexProvenance };
  requirement: TrackedValue<{ n: number; p: number; k: number }>; // kg/ha
  /** Campaign C per-nutrient P/K, Increment 3 (CP2 Target A) — the gross
   * requirement per nutrient, kg/ha. Each OK arm is `Math.round` of the same
   * figure `requirement` uses, released only from that nutrient's own index
   * (never the Index-1 placeholder). An unknown P or K arm is
   * `BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX` naming
   * only its own input and carries no number; missing silage evidence
   * blocks every arm (`MISSING_SILAGE_PLAN_DATA`). N follows `requirement`'s
   * rule. With both indices each arm equals `requirement.value`. Additive:
   * no other output reads this field yet. */
  requirementByNutrient: {
    n: EngineOutcome<number>;
    p: EngineOutcome<number>;
    k: EngineOutcome<number>;
  };
  organicApplication: {
    rateM3ha: number;
    totalM3: number;
    offsetN: number;
    offsetP: number;
    offsetK: number; // kg/ha
    /** Slurry Evidence & Composition V1 — the dry-matter % actually used
     * for this calculation's Table 9-8 lookup (`slurryAvailableKgHa`),
     * and its provenance: a real measured/farmer-provided composition
     * record for the contributing shed/tank when one exists and is
     * current, or the unchanged Teagasc Table 9-1 national-average
     * fallback otherwise. See `resolveEffectiveSlurryComposition`
     * (`src/domain/nutrients.ts`) — the one place this selection is
     * made, never a UI component. */
    dmPct: number;
    dmPctEvidence: {
      status: DataStatus;
      source: string;
      sourceDate?: string;
      /** The `SlurryComposition.id` this figure came from — absent when
       * `status === "estimated"` (no real record exists for this shed/
       * tank). */
      compositionRecordId?: string;
    };
    /** Slurry Application Context V1 — the canonical
     * `resolveAvailableSlurryNutrients` resolver's own full outcome
     * (`src/domain/nutrients.ts`); `offsetN/P/K` above are derived from
     * its `.value.n/p/k` once `status === "OK"`. Lets a caller/UI
     * distinguish a real, evidenced SUPPORTED result — which Teagasc
     * table, which captured application method, whether it's an ASSUMED
     * spring/splashplate default (no method captured yet) — from an
     * honest NOT_ASSESSED/UNSUPPORTED one (no slurry applied, an
     * unsupported captured method, a spring/LESS DM% with no exact
     * published match, or genuinely conflicting captured methods across
     * this field's contributing allocations). This shape structurally
     * mirrors `AvailableSlurryNutrientResult`
     * (`src/domain/nutrients.ts`) rather than importing it, matching
     * `dmPctEvidence` above's own established precedent (types.ts stays
     * free of a dependency on the engine file that computes its values). */
    availableNutrientAssessment: EngineOutcome<{
      n: number;
      p: number;
      k: number;
      unit: "kg/ha";
      applicationMethod?: "LESS" | "splashplate" | "incorporate_24h" | "other";
      assumedDefault: boolean;
      applicationRateM3ha: number;
      dmPct: number;
      applicationDate?: string;
      /** Slurry Timing Evidence Patch V1 — the Teagasc Farm Carbon
       * Navigator period (`classifySlurryTiming`, `src/domain/
       * slurry-timing.ts`) this result was resolved against. Always
       * `"SPRING"` or `"SUMMER"` on an `"OK"` result — `"LATE_SUMMER"`/
       * `"UNSUPPORTED"` never reach an `"OK"` outcome (see
       * `resolveAvailableSlurryNutrients`, `src/domain/nutrients.ts`). */
      timingCategory: "SPRING" | "SUMMER" | "LATE_SUMMER" | "UNSUPPORTED";
      /** `true` only when no real `applicationDate` was captured and
       * SPRING was assumed (Farm Return's pre-existing conservative
       * default) — independent of `assumedDefault` above (that one is
       * about the method, this one is about the timing). */
      timingAssumed: boolean;
      ruleId: "SLURRY_TABLE_9_8" | "SPRING_LESS_SLURRY_TABLE" | "SUMMER_LESS_SLURRY_TABLE";
      source: string;
      soilIndexAdjustmentApplied: { p: boolean; k: boolean };
      scientificBasisNote: string;
    }>;
    /** Campaign C per-nutrient P/K, Increment 2 (CP4 Target A,
     * `docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md`) — the
     * same slurry credit per nutrient, derived from the same table
     * selection as `availableNutrientAssessment`. N needs no soil index.
     * A known P or K arm applies only its own index's Index 1/2 factor
     * (`soilIndexAdjustmentApplied`); an unknown arm is
     * `BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX`
     * naming only its own input. A table-level block (method, timing, DM%,
     * unresolved composition, conflicting methods) or `NOT_APPLICABLE` (no
     * slurry) is every arm's outcome. With both indices each arm equals the
     * paired assessment's `n`/`p`/`k`. Additive: the paired assessment and
     * `offsetP`/`offsetK` above are unchanged; no other output reads this
     * field yet. */
    availableNutrientByNutrient: {
      n: EngineOutcome<{ kgHa: number; soilIndexAdjustmentApplied?: boolean }>;
      p: EngineOutcome<{ kgHa: number; soilIndexAdjustmentApplied?: boolean }>;
      k: EngineOutcome<{ kgHa: number; soilIndexAdjustmentApplied?: boolean }>;
    };
    /** Per-nutrient P/K Increment 5b completion (CC-B6) — the basis of
     * `availableNutrientByNutrient`: the one table selection's method,
     * rate, DM%, date, timing and rule, with the same field meanings as the
     * paired assessment's value. Needs neither soil index, so it stays OK
     * for a mixed field whose paired assessment is
     * `MISSING_SOIL_FERTILITY_INDEX`; a table-level block or
     * `NOT_APPLICABLE` is its outcome otherwise. With both indices it equals
     * the corresponding fields of `availableNutrientAssessment.value`.
     * Additive, metadata only. */
    availableNutrientBasis: EngineOutcome<{
      applicationMethod?: "LESS" | "splashplate" | "incorporate_24h" | "other";
      assumedDefault: boolean;
      applicationRateM3ha: number;
      dmPct: number;
      applicationDate?: string;
      timingCategory: "SPRING" | "SUMMER" | "LATE_SUMMER" | "UNSUPPORTED";
      timingAssumed: boolean;
      ruleId: "SLURRY_TABLE_9_8" | "SPRING_LESS_SLURRY_TABLE" | "SUMMER_LESS_SLURRY_TABLE";
      source: string;
      scientificBasisNote: string;
    }>;
  };
  /** Slurry Timing Evidence Patch V1, brief §6 ("Unsupported credit
   * policy") — computed once in `calculateNutrientPlan`
   * (`src/domain/nutrients.ts`), never in a UI component. `true` only
   * when real slurry is allocated to this field (`organicApplication.rateM3ha
   * > 0`) AND `organicApplication.availableNutrientAssessment.status !==
   * "OK"` — i.e. Farm Return could not resolve an evidenced available-
   * nutrient figure for the real captured method/timing/DM% combination,
   * so the organic offset was floored to 0 for calculation safety without
   * that being a genuine, evidenced zero. `requirement`/`netRequirement`/
   * `purchasedProducts` are NOT suppressed when this is `true` — the rest
   * of the fertiliser plan stays actionable (brief §6); a caller must
   * surface `headline`/`detail` alongside those figures so a farmer can
   * tell a resolved scientific answer apart from a provisional one. */
  requirementProvisional: {
    isProvisional: boolean;
    /** Canonical short qualification, e.g. "Slurry nutrient credit not
     * included" — only present when `isProvisional` is `true`. */
    headline?: string;
    /** Canonical longer explanation, e.g. "Fertiliser requirement is
     * provisional until the slurry nutrient contribution can be
     * assessed." — only present when `isProvisional` is `true`. */
    detail?: string;
  };
  /** Fertiliser Vertical V1, Checkpoint 3 — `requirement` less
   * `organicApplication`'s own offset, floored at 0 kg/ha. The campaign's
   * own "(5) Net nutrient requirement" as a first-class, separately
   * inspectable concern — computed from (never a second, independent
   * derivation of) the two fields above, so it is provably consistent
   * with them by construction. Feeds `purchasedProducts`' own allocation
   * exactly as it always did (previously only as an unnamed internal
   * local); this field only makes that same real number inspectable by
   * a caller for the first time. */
  netRequirement: TrackedValue<{ n: number; p: number; k: number }>; // kg/ha
  /** Campaign C per-nutrient P/K, Increment 3 (CP2 Target A) — the net
   * requirement per nutrient, kg/ha: `Math.round(max(0, gross − credit))`,
   * where the credit is `organicApplication.availableNutrientByNutrient`'s
   * arm (`NOT_APPLICABLE`, no slurry allocated, is a known zero credit).
   * Blocked when its gross arm is blocked or its credit arm is
   * blocked/unknown/unsupported (including an unresolved composition).
   * Never derived from the paired offset. With both indices, an OK arm
   * equals `netRequirement.value`. Additive: no other output reads it yet. */
  netRequirementByNutrient: {
    n: EngineOutcome<number>;
    p: EngineOutcome<number>;
    k: EngineOutcome<number>;
  };
  /** Fertiliser Vertical Completion, Increment 1 — the canonical per-field
   * requirement (see `FieldNutrientRequirement`). Additive: the paired
   * `requirement` and every other output are unchanged; no consumer reads
   * it yet. */
  fieldRequirement: FieldNutrientRequirement;
  /** Fertiliser Vertical Completion, Increment 2b — the canonical per-field
   * remaining chemical requirement (see `FieldNutrientRemainingRequirement`).
   * Additive: every other output is unchanged; no consumer reads it yet. */
  fieldRemainingRequirement: FieldNutrientRemainingRequirement;
  /** Fertiliser Vertical Completion, Session 2b — the status of the
   * purchase outputs below (see `FieldPurchaseStatus`). Every consumer of
   * `purchasedProducts` / `deliveredKgHa` / `estimatedFieldCostEur` reads
   * it; an empty list alone never means "nothing needed". */
  purchaseStatus: FieldPurchaseStatus;
  /** Sized from `fieldRemainingRequirement` (or the full `fieldRequirement`
   * when the slurry credit cannot be assessed) — see `purchaseStatus`.
   * Empty unless `purchaseStatus` is `RECOMMENDED` or
   * `RECOMMENDED_CREDIT_NOT_COUNTED`. */
  purchasedProducts: FertiliserProduct[];
  /**
   * Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
   * F1) — the real total N/P/K `purchasedProducts` above actually
   * delivers, kg/ha. Every product in this app's real catalogue is a
   * multi-nutrient blend (0-7-30 always brings P with its K; 18-6-12
   * always brings K with its P) — this is the real, fully-reconciled
   * total across every nutrient of every chosen product, not just
   * whichever single nutrient each product happened to be sized
   * against. Compare against `netRequirement` above to see the real
   * shortfall/excess this exact blend produces (`allocatePurchasedProducts`'s
   * own doc comment has the full account of why a byproduct like this
   * exists and was previously untracked). Zeroed together with
   * `purchasedProducts` whenever chemical fertiliser is suppressed
   * (commonage/buffer prohibition, or missing evidence). */
  deliveredKgHa: { n: number; p: number; k: number };
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
   * this data model has no field for the override distance itself. */
  localBufferOverrideStatus: EngineOutcome<"NATIONAL_BASELINE_APPLIES">;
  /** V3 closure pass, Priority 11 (national water-buffer distance,
   * AF010 other half) — real, wired from
   * `field.waterBufferContext.featureType` (an additive field this pass
   * introduced) whenever a material is actually being applied to this
   * field. `NOT_APPLICABLE` when nothing is applied at all;
   * `BLOCKED_INSUFFICIENT_EVIDENCE` when the feature type/distance
   * haven't been captured — never guessed from `nearestFeature`'s
   * free-text label. */
  nationalBufferDistanceStatus: EngineOutcome<"BOUNDARY_MET_SUBJECT_TO_OTHER_RULES">;
  /** V3 closure pass, Priority 5 (`SOIL_TEST_VALIDITY`) — real, computed
   * from `field.fertility.verifiedTest`, SURFACED but not yet enforced
   * (the P/K figures above are not suppressed on `"DISREGARD"` — see the
   * computation site in `nutrients.ts` for why). `NOT_APPLICABLE` when no
   * lab test exists at all (an estimated/farmer-adjusted P-Index was
   * never a "soil test"). */
  soilTestAgeValidity: EngineOutcome<SoilTestAgeStatus>;
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
  /** Real Mode Completion Phase 7 — required, not optional: an alert with
   * no real destination is exactly the "looks clickable, does nothing"
   * false affordance the brief targets. Every alert generator
   * (`real-alerts.ts`) already sets a real one; this is enforced at the
   * type level so a future alert type can't silently omit it. */
  href: string;
}

export interface TimelineEvent {
  category: string;
  label: string;
  monthStart: number; // 0=Jan
  monthEnd: number;
}

// ---------------------------------------------------------------------------
// Financial assumptions (Real Farm V1 Phase 3/14) — farmer-editable prices/
// costs, kept distinct from `src/domain/market.ts`'s externally-sourced CSO
// reference series (those stay versioned code constants, never farm-scoped
// rows — a reference price must not be silently edited into looking like a
// farmer's own price). `value.status` follows the same DataStatus states as
// everything else: "estimated" until a farmer overrides it with their own
// real quote (`"farmer_adjusted"`).
// ---------------------------------------------------------------------------

export type FinancialAssumptionKey =
  | "fertiliser_price_eur_per_t"
  | "concentrate_feed_price_eur_per_t"
  | "contractor_silage_cost_eur_per_ha"
  | "cattle_sale_price_eur_per_kg_carcass"
  | "fuel_price_eur_per_l";

export interface FinancialAssumption {
  id: string;
  farmId: string;
  key: FinancialAssumptionKey;
  value: TrackedValue<number>;
  unit: string;
}
