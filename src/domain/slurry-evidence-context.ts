/**
 * Campaign A (slurry recommendation evidence foundation) — the one
 * canonical way to inspect the evidence Farm Return already holds for
 * current slurry planning (A3). Pure: it reads what the data layer already
 * returns and never persists, derives new science or makes a regulatory
 * decision.
 *
 * Every fact is an `EvidenceFact`: `known` (value + the source's own
 * status/source/recorded date), `missing` (with a reason — never `0`,
 * `false` or a default), or `conflicting` (every candidate kept, none
 * chosen, because no audited rule exists to choose). Freshness is reported
 * as `NO_FRESHNESS_POLICY` wherever no approved validity rule exists
 * rather than inventing one; soil P/K keeps the existing 4-year soil-test
 * rule (`soilTestAgeValidityForFertility`).
 *
 * Scope boundaries (see docs/farm-return-next/SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md,
 * "Campaign A completion"):
 * - Only active fields are current planning candidates; archived fields
 *   are listed by id only and their history is untouched.
 * - Recorded slurry DM% is passed through raw. No DM → N/P/K conversion,
 *   interpolation or table choice happens here (Campaign C).
 * - Physical store volume is never converted into regulatory neat slurry
 *   (Campaign B). Store nutrient content stays unknown until a real engine
 *   exists — the Housing `slurryEstimate` placeholder is never read as 0.
 * - Planned applications stay planned, completed actuals stay actual, and
 *   a past application's method is never offered as a future method.
 * - Commonage and water-buffer answers are surfaced as recorded; no legal
 *   conclusion is drawn from them here (Campaign B).
 */

import type { DataStatus, Field, Housing, SlurryAllocation, SlurryEstimate, TrackedValue } from "./types";
import { activeFields } from "./types";
import type { SlurryComposition } from "./slurry-composition";
import { currentSlurryCompositionByHousing } from "./slurry-composition";
import { isActiveReservation, storeReconciledVolumeM3, type SlurryAllocationRecord } from "./slurry-allocation-lifecycle";
import { farmGrasslandAggregates, soilTestAgeValidityForFertility } from "./nutrients";
import { resolveSoilIndexProvenance, type SoilIndexProvenance } from "./soil-index-provenance";
import type { EngineOutcome } from "./evidence";
import type { SoilTestAgeStatus } from "./soil-test-validity";

export const SLURRY_EVIDENCE_CONTEXT_VERSION = "slurry_evidence_context_v1.0.0";

/** No approved validity/expiry rule exists for this fact in the repo. */
export type EvidenceFreshness = "NO_FRESHNESS_POLICY";

export interface EvidenceSourceRef {
  status: DataStatus;
  source: string;
  /** When the fact was true/recorded as the source states it (sample
   * date, declaration date, spread date). Absent when never recorded. */
  recordedAt?: string;
  /** The persisted record this came from, when it has its own id. */
  recordId?: string;
}

export type EvidenceFact<T> =
  | ({ state: "known"; value: T; freshness: EvidenceFreshness } & EvidenceSourceRef)
  | { state: "missing"; reasonCode: string }
  | { state: "conflicting"; reasonCode: string; candidates: ({ value: T } & EvidenceSourceRef)[] };

export type SlurryApplicationMethodValue = NonNullable<SlurryAllocation["applicationMethod"]>["value"];
export type WaterBufferContextValue = NonNullable<Field["waterBufferContext"]>["value"];

function missing<T>(reasonCode: string): EvidenceFact<T> {
  return { state: "missing", reasonCode };
}

function knownFromTracked<T>(tv: TrackedValue<unknown>, value: T): EvidenceFact<T> {
  return {
    state: "known",
    value,
    status: tv.status,
    source: tv.source,
    ...(tv.sourceDate !== undefined ? { recordedAt: tv.sourceDate } : {}),
    freshness: "NO_FRESHNESS_POLICY",
  };
}

// ---------------------------------------------------------------------------
// Farmer answers already held on the field (A2.1)
// ---------------------------------------------------------------------------

export function commonageStatusEvidence(field: Pick<Field, "commonageStatus">): EvidenceFact<"commonage" | "not_commonage"> {
  const tv = field.commonageStatus;
  if (tv === undefined) return missing("COMMONAGE_STATUS_NOT_RECORDED");
  // A farmer choosing "unknown" is an answer of "I don't know" — still no
  // fact about the land, never read as "not commonage".
  if (tv.value === "unknown") return missing("COMMONAGE_STATUS_DECLARED_UNKNOWN");
  return knownFromTracked(tv, tv.value);
}

/** The recorded water-buffer context exactly as captured — an unset
 * distance or feature type stays `undefined`, never `0`. */
export function waterBufferContextEvidence(field: Pick<Field, "waterBufferContext">): EvidenceFact<WaterBufferContextValue> {
  const tv = field.waterBufferContext;
  if (tv === undefined) return missing("WATER_BUFFER_CONTEXT_NOT_RECORDED");
  return knownFromTracked(tv, { ...tv.value });
}

// ---------------------------------------------------------------------------
// Slurry dry matter (A2.2)
// ---------------------------------------------------------------------------

function applicableAllocationsForField<T extends SlurryAllocation>(allocations: readonly T[], fieldId: string): T[] {
  // Same applicability rule as `resolveFieldSlurryAllocation`.
  return allocations.filter((a) => a.fieldId === fieldId && a.priority !== "not_suitable");
}

/**
 * What `calculateNutrientPlan` may be given for a field's slurry
 * composition. `composition` only when exactly one store contributes and
 * it has a recorded result; `unresolved` when several stores contribute
 * and any of them has a recorded result — no approved rule combines
 * per-store DM%, so the engine must not silently use the national
 * average in place of recorded evidence.
 */
export interface FieldSlurryCompositionInput {
  composition?: SlurryComposition;
  unresolved?: { housingIds: string[]; compositionRecordIds: string[] };
}

export function resolveFieldSlurryCompositionInput(
  allocations: readonly SlurryAllocation[],
  fieldId: string,
  compositionByHousing: ReadonlyMap<string, SlurryComposition>,
): FieldSlurryCompositionInput {
  const housingIds = [...new Set(applicableAllocationsForField(allocations, fieldId).map((a) => a.housingId))].sort();
  if (housingIds.length === 0) return {};
  if (housingIds.length === 1) {
    const composition = compositionByHousing.get(housingIds[0]);
    return composition ? { composition } : {};
  }
  const recorded = housingIds.map((id) => compositionByHousing.get(id)).filter((c): c is SlurryComposition => c !== undefined);
  if (recorded.length === 0) return {};
  return { unresolved: { housingIds, compositionRecordIds: recorded.map((c) => c.id) } };
}

export interface RecordedSlurryDryMatter {
  dmPct: number;
  housingId: string;
}

function compositionSourceRef(c: SlurryComposition): EvidenceSourceRef {
  return { status: c.status, source: c.laboratory ? `${c.source} (${c.laboratory})` : c.source, recordedAt: c.sampleDate, recordId: c.id };
}

/** The raw recorded DM% for the store(s) supplying this field's planned
 * slurry. Missing when nothing is recorded — the national-average DM% the
 * nutrient engine falls back to is a standard assumption, not recorded
 * evidence, and is never reported here as if it were. */
export function fieldSlurryDryMatterEvidence(
  allocations: readonly SlurryAllocation[],
  fieldId: string,
  compositionByHousing: ReadonlyMap<string, SlurryComposition>,
): EvidenceFact<RecordedSlurryDryMatter> {
  const housingIds = [...new Set(applicableAllocationsForField(allocations, fieldId).map((a) => a.housingId))].sort();
  if (housingIds.length === 0) return missing("NO_PLANNED_SLURRY_SOURCE");
  const recorded = housingIds.map((id) => compositionByHousing.get(id)).filter((c): c is SlurryComposition => c !== undefined);
  if (recorded.length === 0) return missing("NO_RECORDED_SLURRY_COMPOSITION");
  if (housingIds.length === 1) {
    const c = recorded[0];
    return { state: "known", value: { dmPct: c.dmPct, housingId: c.housingId }, ...compositionSourceRef(c), freshness: "NO_FRESHNESS_POLICY" };
  }
  return {
    state: "conflicting",
    reasonCode: "SLURRY_COMPOSITION_SOURCES_UNRESOLVED",
    candidates: recorded.map((c) => ({ value: { dmPct: c.dmPct, housingId: c.housingId }, ...compositionSourceRef(c) })),
  };
}

// ---------------------------------------------------------------------------
// Slurry stores: physical volume vs nutrient composition (A1.3)
// ---------------------------------------------------------------------------

/** A newly-created shed's `slurryEstimate` is a mock-tagged placeholder
 * (`src/lib/farm-data/housing.ts`) — no excretion-rate engine exists. */
export function isPlaceholderSlurryEstimate(estimate: Pick<SlurryEstimate, "volumeM3">): boolean {
  return estimate.volumeM3.source.includes("(mock)");
}

/** Per-nutrient view of a store's `slurryEstimate`: a placeholder or
 * `unavailable` figure is unknown, never a real 0 kg. A genuine
 * calculated zero stays representable as `known` with value 0. */
export function slurryEstimateNutrientEvidence(estimate: SlurryEstimate): { n: EvidenceFact<number>; p: EvidenceFact<number>; k: EvidenceFact<number> } {
  const placeholder = isPlaceholderSlurryEstimate(estimate);
  const fact = (tv: TrackedValue<number>): EvidenceFact<number> =>
    placeholder ? missing("SLURRY_NUTRIENT_CONTENT_NOT_CALCULATED") : tv.status === "unavailable" || !Number.isFinite(tv.value) ? missing("SLURRY_NUTRIENT_CONTENT_UNAVAILABLE") : knownFromTracked(tv, tv.value);
  return { n: fact(estimate.availableN), p: fact(estimate.availableP), k: fact(estimate.availableK) };
}

export interface RecordedCompositionTotals {
  nPerM3: EvidenceFact<number>;
  pPerM3: EvidenceFact<number>;
  kPerM3: EvidenceFact<number>;
}

function recordedTotal(c: SlurryComposition | undefined, key: "nPerM3" | "pPerM3" | "kPerM3"): EvidenceFact<number> {
  if (c === undefined) return missing("NO_RECORDED_SLURRY_COMPOSITION");
  const v = c[key];
  if (v === undefined) return missing("NUTRIENT_NOT_RECORDED_ON_COMPOSITION");
  return { state: "known", value: v, ...compositionSourceRef(c), freshness: "NO_FRESHNESS_POLICY" };
}

export interface SlurryStoreEvidence {
  housingId: string;
  shedName: string;
  /** Physical slurry in the store (capacity × fill, less spread since the
   * last reading) — known independently of what is in it. Never a
   * regulatory neat-slurry quantity. */
  physicalVolumeM3: EvidenceFact<number>;
  /** Raw recorded dry matter for this store, if any. */
  recordedDryMatterPct: EvidenceFact<number>;
  /** Raw recorded total N/P/K per m³ — recorded, not consumed by any
   * nutrient calculation (no approved conversion exists). */
  recordedTotals: RecordedCompositionTotals;
  /** The store's estimated available N/P/K — unknown until a real engine
   * calculates it. */
  estimatedAvailableNutrients: { n: EvidenceFact<number>; p: EvidenceFact<number>; k: EvidenceFact<number> };
}

export function slurryStoreEvidence(housing: Housing, currentComposition: SlurryComposition | undefined): SlurryStoreEvidence {
  const fillRecorded = housing.storageFillStatus === "farmer_recorded";
  // A blank fill field is persisted as `0`/`"estimated"` (Housing form) —
  // that is "never recorded", not a known empty store. An explicitly
  // farmer-recorded 0 stays a real, known zero.
  const fillUnrecordedPlaceholder = !fillRecorded && housing.storageFillPct === 0;
  const capacityKnown =
    Number.isFinite(housing.storageCapacityM3) && housing.storageCapacityM3 > 0 && Number.isFinite(housing.storageFillPct) && !fillUnrecordedPlaceholder;
  const physicalVolumeM3: EvidenceFact<number> = capacityKnown
    ? {
        state: "known",
        value: storeReconciledVolumeM3(housing),
        status: fillRecorded ? "farmer_adjusted" : "estimated",
        source: fillRecorded
          ? "Store capacity × recorded fill level, less slurry spread since that reading"
          : "Store capacity × estimated fill level (not farmer-recorded), less slurry spread since that reading",
        ...(housing.storageFillRecordedAt !== undefined ? { recordedAt: housing.storageFillRecordedAt } : {}),
        freshness: "NO_FRESHNESS_POLICY",
      }
    : missing("STORE_CAPACITY_OR_FILL_NOT_RECORDED");
  return {
    housingId: housing.id,
    shedName: housing.shedName,
    physicalVolumeM3,
    recordedDryMatterPct: currentComposition
      ? { state: "known", value: currentComposition.dmPct, ...compositionSourceRef(currentComposition), freshness: "NO_FRESHNESS_POLICY" }
      : missing("NO_RECORDED_SLURRY_COMPOSITION"),
    recordedTotals: {
      nPerM3: recordedTotal(currentComposition, "nPerM3"),
      pPerM3: recordedTotal(currentComposition, "pPerM3"),
      kPerM3: recordedTotal(currentComposition, "kPerM3"),
    },
    estimatedAvailableNutrients: slurryEstimateNutrientEvidence(housing.slurryEstimate),
  };
}

// ---------------------------------------------------------------------------
// Slurry application evidence (A2.3) — Phase 1A lifecycle is canonical
// ---------------------------------------------------------------------------

export interface PlannedSlurryApplicationEvidence {
  basis: "planned";
  allocationId: string;
  housingId: string;
  /** Planned physical volume from the store (not neat slurry). */
  plannedPhysicalVolumeM3: number;
  /** This planned allocation's own method — never inherited from a past
   * application on the same field. */
  plannedMethod: EvidenceFact<SlurryApplicationMethodValue>;
  plannedDate: EvidenceFact<string>;
}

export interface CompletedSlurryApplicationEvidence {
  basis: "completed_actual";
  allocationId: string;
  housingId: string;
  actualPhysicalVolumeM3: EvidenceFact<number>;
  actualSpreadDate: EvidenceFact<string>;
  /** The method the allocation was PLANNED with. Completion does not
   * confirm the method used, so this is never an observed actual method. */
  methodAsPlanned: EvidenceFact<SlurryApplicationMethodValue>;
  completedAt?: string;
}

function trackedOrMissing<T>(tv: TrackedValue<T> | undefined, reasonCode: string): EvidenceFact<T> {
  return tv === undefined ? missing(reasonCode) : knownFromTracked(tv, tv.value);
}

function plannedApplication(r: SlurryAllocationRecord): PlannedSlurryApplicationEvidence {
  return {
    basis: "planned",
    allocationId: r.id,
    housingId: r.housingId,
    plannedPhysicalVolumeM3: r.volumeM3,
    plannedMethod: trackedOrMissing(r.applicationMethod, "PLANNED_METHOD_NOT_RECORDED"),
    plannedDate: trackedOrMissing(r.applicationDate, "PLANNED_DATE_NOT_RECORDED"),
  };
}

function completedApplication(r: SlurryAllocationRecord): CompletedSlurryApplicationEvidence {
  const actualSource: EvidenceSourceRef = { status: "farmer_adjusted", source: r.completedBy ? `Confirmed spread by ${r.completedBy}` : "Confirmed spread", recordId: r.id };
  return {
    basis: "completed_actual",
    allocationId: r.id,
    housingId: r.housingId,
    actualPhysicalVolumeM3:
      r.actualVolumeM3 === undefined ? missing("ACTUAL_VOLUME_NOT_RECORDED") : { state: "known", value: r.actualVolumeM3, ...actualSource, ...(r.completedAt ? { recordedAt: r.completedAt } : {}), freshness: "NO_FRESHNESS_POLICY" },
    actualSpreadDate:
      r.actualSpreadDate === undefined ? missing("ACTUAL_SPREAD_DATE_NOT_RECORDED") : { state: "known", value: r.actualSpreadDate, ...actualSource, recordedAt: r.actualSpreadDate, freshness: "NO_FRESHNESS_POLICY" },
    methodAsPlanned: trackedOrMissing(r.applicationMethod, "PLANNED_METHOD_NOT_RECORDED"),
    ...(r.completedAt !== undefined ? { completedAt: r.completedAt } : {}),
  };
}

// ---------------------------------------------------------------------------
// The context
// ---------------------------------------------------------------------------

export interface FieldSlurryEvidence {
  fieldId: string;
  fieldName: string;
  commonageStatus: EvidenceFact<"commonage" | "not_commonage">;
  waterBufferContext: EvidenceFact<WaterBufferContextValue>;
  soilIndex: { p: SoilIndexProvenance; k: SoilIndexProvenance };
  /** The existing 4-year soil-test rule, judged on the laboratory index. */
  soilTestAgeValidity: EngineOutcome<SoilTestAgeStatus>;
  slurryDryMatter: EvidenceFact<RecordedSlurryDryMatter>;
  /** Exactly what `calculateNutrientPlan` should be given for composition. */
  nutrientPlanComposition: FieldSlurryCompositionInput;
  plannedApplications: PlannedSlurryApplicationEvidence[];
  completedApplications: CompletedSlurryApplicationEvidence[];
}

export interface SlurryEvidenceContext {
  version: typeof SLURRY_EVIDENCE_CONTEXT_VERSION;
  asOfDate: string;
  /** Current planning candidates only. */
  activeFields: Field[];
  /** Archived fields left out of current planning. Their records are not
   * touched and remain available to historical views. */
  archivedFieldIds: string[];
  /** Farm grassland aggregates over active fields only. */
  farmGrasslandAreaHa: number;
  nonGrassPct: number;
  fields: FieldSlurryEvidence[];
  stores: SlurryStoreEvidence[];
}

export interface BuildSlurryEvidenceContextInput {
  /** Every field, archived included (`listFieldsForFarm`). */
  fields: readonly Field[];
  housing: readonly Housing[];
  /** Every allocation with its lifecycle (`listSlurryAllocationRecordsForFarm`). */
  allocationRecords: readonly SlurryAllocationRecord[];
  compositionRecords: readonly SlurryComposition[];
  asOfDate: string;
}

export function buildSlurryEvidenceContext(input: BuildSlurryEvidenceContextInput): SlurryEvidenceContext {
  const current = activeFields(input.fields);
  const archivedFieldIds = input.fields.filter((f) => f.archivedAt).map((f) => f.id);
  const { farmGrasslandAreaHa, nonGrassPct } = farmGrasslandAggregates(current);
  const compositionByHousing = currentSlurryCompositionByHousing(input.compositionRecords);
  const planned = input.allocationRecords.filter(isActiveReservation);

  const fields: FieldSlurryEvidence[] = current.map((field) => ({
    fieldId: field.id,
    fieldName: field.name,
    commonageStatus: commonageStatusEvidence(field),
    waterBufferContext: waterBufferContextEvidence(field),
    soilIndex: { p: resolveSoilIndexProvenance(field.fertility.pIndex), k: resolveSoilIndexProvenance(field.fertility.kIndex) },
    soilTestAgeValidity: soilTestAgeValidityForFertility(field.fertility, input.asOfDate),
    slurryDryMatter: fieldSlurryDryMatterEvidence(planned, field.id, compositionByHousing),
    nutrientPlanComposition: resolveFieldSlurryCompositionInput(planned, field.id, compositionByHousing),
    plannedApplications: planned.filter((r) => r.fieldId === field.id).map(plannedApplication),
    completedApplications: input.allocationRecords.filter((r) => r.fieldId === field.id && r.status === "completed").map(completedApplication),
  }));

  return {
    version: SLURRY_EVIDENCE_CONTEXT_VERSION,
    asOfDate: input.asOfDate,
    activeFields: current,
    archivedFieldIds,
    farmGrasslandAreaHa,
    nonGrassPct,
    fields,
    stores: input.housing.map((h) => slurryStoreEvidence(h, compositionByHousing.get(h.id))),
  };
}
