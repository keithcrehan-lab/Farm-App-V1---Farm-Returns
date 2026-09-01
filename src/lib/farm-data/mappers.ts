/**
 * Real Farm V1 Phase 3 — pure row <-> domain mappers.
 *
 * No Supabase import here on purpose: these functions take/return plain
 * data, so they're testable without a browser or a live database (Phase 22
 * requirement) exactly like the domain engines in `src/domain/`. The
 * server-only query/mutation functions that actually call Supabase
 * (`src/lib/farm-data/*.ts`, Phase 3 continuation / Phase 6) call these to
 * convert between a DB row and the `Field`/`Farm`/etc. types the existing
 * domain engines and UI already consume — "adapters, not new engines".
 */
import type {
  Farm,
  Field,
  FinancialAssumption,
  FinancialAssumptionKey,
  Housing,
  IndividualAnimal,
  LivestockGroup,
  SlurryAllocation,
  WeightObservation,
} from "@/domain/types";
import { computeBoundaryGeometry } from "@/domain/field-boundary";
import { resolveSoilForFieldPolygon } from "@/domain/soil-resolution";
import type { EngineOutcome } from "@/domain/evidence";
import type {
  DecisionRow,
  FarmRow,
  FieldRow,
  FinancialAssumptionRow,
  HousingRow,
  JobRow,
  LivestockGroupRow,
  LivestockIndividualRow,
  NotificationRow,
  SlurryAllocationRow,
  TelemetryEventRow,
  WeightObservationRow,
} from "./row-types";

// ---------------------------------------------------------------------------
// Farm
// ---------------------------------------------------------------------------

export function rowToFarm(row: FarmRow): Farm {
  return {
    id: row.id,
    name: row.name,
    location: { county: row.county, centroid: [row.centroid_lng, row.centroid_lat] },
    primaryEnterprises: row.primary_enterprises as Farm["primaryEnterprises"],
    units: row.units,
    ownerName: row.owner_name,
    ...(row.p_build_up_compliance ? { pBuildUpCompliance: row.p_build_up_compliance } : {}),
  };
}

export type NewFarmInput = Pick<Farm, "name" | "ownerName"> & {
  county: string;
  centroid: [number, number];
  primaryEnterprises: Farm["primaryEnterprises"];
};

export function farmToInsertRow(userId: string, input: NewFarmInput): Omit<FarmRow, "id" | "created_at" | "updated_at"> {
  return {
    user_id: userId,
    name: input.name,
    county: input.county,
    centroid_lng: input.centroid[0],
    centroid_lat: input.centroid[1],
    primary_enterprises: input.primaryEnterprises,
    units: "metric",
    owner_name: input.ownerName,
    p_build_up_compliance: null,
    onboarding_completed_at: null,
  };
}

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

export function rowToField(row: FieldRow): Field {
  return {
    id: row.id,
    farmId: row.farm_id,
    name: row.name,
    areaHa: row.area_ha,
    centroid: [row.centroid_lng, row.centroid_lat],
    ...(row.polygon ? { polygon: row.polygon } : {}),
    ...(row.polygon_source ? { polygonSource: row.polygon_source } : {}),
    ...(row.polygon_captured_at ? { polygonCapturedAt: row.polygon_captured_at } : {}),
    ...(row.lpis_ref ? { lpisRef: row.lpis_ref } : {}),
    ...(row.planned_use ? { plannedUse: row.planned_use } : {}),
    ...(row.mapped_soil ? { mappedSoil: row.mapped_soil } : {}),
    fertility: row.fertility,
    ...(row.commonage_status ? { commonageStatus: row.commonage_status } : {}),
    // `featureType` is a fixed literal union in the domain type
    // (`buffer-gate.ts`'s `BufferFeature`) but stored as `string` in the
    // row shape (see row-types.ts) — trusted the same way every other
    // jsonb-typed row field here is: written only by this app's own
    // adapters, never runtime-validated on read, matching mock-farm.ts's
    // existing precedent of untyped-at-the-boundary domain data.
    ...(row.water_buffer_context
      ? { waterBufferContext: row.water_buffer_context as unknown as NonNullable<Field["waterBufferContext"]> }
      : {}),
    history: row.history,
    ...(row.thumbnail ? { thumbnail: row.thumbnail } : {}),
    ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
  };
}

/**
 * Codex remediation Priority 6 — boundary-first field creation. A field no
 * longer takes a manually-typed `areaHa`/an upfront `plannedUse`/a
 * fabricated `mappedSoil`: it takes the real drawn `polygon`, and
 * `areaHa`/`centroid` are derived from it right here (same
 * `computeBoundaryGeometry` the later `setFieldBoundary` edit path uses),
 * never typed by hand. `plannedUse`/`mappedSoil` are genuinely absent until
 * set afterward in Field Detail / resolved by a real spatial lookup.
 */
export type NewFieldInput = Pick<Field, "name" | "fertility"> & { polygon: GeoJSON.Polygon };

export function fieldToInsertRow(farmId: string, input: NewFieldInput): Omit<FieldRow, "id" | "created_at" | "updated_at"> {
  const { centroid, areaHa } = computeBoundaryGeometry(input.polygon);
  // Codex remediation Priority 8 — real spatial soil resolution attempt at
  // creation time (`soil-resolution.ts`'s own header documents why this
  // always returns BLOCKED_INSUFFICIENT_EVIDENCE today; the call site is
  // real, not dead code, so a future real dataset/resolver activates with
  // no caller change). `fieldId` doesn't exist yet at insert time — the
  // resolver's real implementation would key its intersection lookup off
  // the polygon geometry, not the id, so a placeholder is safe here.
  const soilOutcome = resolveSoilForFieldPolygon({ fieldId: "pending", fieldPolygon: input.polygon, fieldAreaHa: areaHa });
  return {
    farm_id: farmId,
    name: input.name,
    area_ha: areaHa,
    centroid_lng: centroid[0],
    centroid_lat: centroid[1],
    polygon: input.polygon,
    polygon_source: "farmer_drawn",
    polygon_captured_at: new Date().toISOString(),
    lpis_ref: null,
    planned_use: null,
    mapped_soil: soilOutcome.status === "OK" ? soilOutcome.value.dominant : null,
    fertility: input.fertility,
    commonage_status: null,
    water_buffer_context: null,
    history: [],
    thumbnail: null,
    archived_at: null,
  };
}

// ---------------------------------------------------------------------------
// Housing — `linkedGroupIds` is not a column (see the migration's header
// comment on avoiding a circular FK); callers pass in the livestock group
// ids that reference this housing row, typically from a batched query.
// ---------------------------------------------------------------------------

export function rowToHousing(row: HousingRow, linkedGroupIds: string[]): Housing {
  return {
    id: row.id,
    farmId: row.farm_id,
    shedName: row.shed_name,
    shedType: row.shed_type,
    linkedGroupIds,
    housingPeriod: { start: row.housing_period_start, end: row.housing_period_end },
    ...(row.tank_refinement ? { tankRefinement: row.tank_refinement } : {}),
    slurryEstimate: row.slurry_estimate,
    storageCapacityM3: row.storage_capacity_m3,
    storageFillPct: row.storage_fill_pct,
  };
}

/** Groups a flat `livestock_groups` row set by `housing_id` for `rowToHousing` batch use. */
export function groupLivestockIdsByHousing(rows: Pick<LivestockGroupRow, "id" | "housing_id">[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.housing_id) continue;
    const existing = map.get(row.housing_id) ?? [];
    existing.push(row.id);
    map.set(row.housing_id, existing);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Livestock group
// ---------------------------------------------------------------------------

export function rowToLivestockGroup(row: LivestockGroupRow): LivestockGroup {
  return {
    id: row.id,
    farmId: row.farm_id,
    category: row.category as LivestockGroup["category"],
    label: row.label,
    count: row.count,
    ...(row.avg_weight_kg ? { avgWeightKg: row.avg_weight_kg } : {}),
    ...(row.avg_age_months != null ? { avgAgeMonths: row.avg_age_months } : {}),
    ...(row.breed ? { breed: row.breed } : {}),
    ...(row.sex ? { sex: row.sex } : {}),
    system: row.system,
    ...(row.housing_id ? { housingId: row.housing_id } : {}),
    ...(row.goal ? { goal: row.goal } : {}),
    value: row.value,
    ...(row.status_label ? { statusLabel: row.status_label } : {}),
    ...(row.avg_milk_yield_kg_per_year ? { avgMilkYieldKgPerYear: row.avg_milk_yield_kg_per_year } : {}),
  };
}

// ---------------------------------------------------------------------------
// Slurry allocation
// ---------------------------------------------------------------------------

export function rowToSlurryAllocation(row: SlurryAllocationRow): SlurryAllocation {
  return {
    fieldId: row.field_id,
    housingId: row.housing_id,
    priority: row.priority,
    volumeM3: row.volume_m3,
    score: row.score,
    ...(row.application_method ? { applicationMethod: row.application_method } : {}),
  };
}

// ---------------------------------------------------------------------------
// Financial assumption
// ---------------------------------------------------------------------------

export function rowToFinancialAssumption(row: FinancialAssumptionRow): FinancialAssumption {
  return {
    id: row.id,
    farmId: row.farm_id,
    key: row.key as FinancialAssumptionKey,
    value: row.value,
    unit: row.unit ?? "",
  };
}

// ---------------------------------------------------------------------------
// Individual animal (Real Mode Completion Phase 12)
// ---------------------------------------------------------------------------

export function rowToIndividualAnimal(row: LivestockIndividualRow): IndividualAnimal {
  return {
    id: row.id,
    farmId: row.farm_id,
    ...(row.group_id ? { groupId: row.group_id } : {}),
    ...(row.tag_number ? { tagNumber: row.tag_number } : {}),
    category: row.category as IndividualAnimal["category"],
    ...(row.sex ? { sex: row.sex } : {}),
    ...(row.breed ? { breed: row.breed } : {}),
    ...(row.date_of_birth ? { dateOfBirth: row.date_of_birth } : {}),
    ...(row.goal_status ? { goalStatus: row.goal_status } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
  };
}

export function rowToWeightObservation(row: WeightObservationRow): WeightObservation {
  return {
    id: row.id,
    animalId: row.animal_id,
    weightKg: row.weight_kg,
    observedDate: row.observed_date,
    source: row.source,
  };
}

/** The most recent observation by date — "current weight" is always
 * derived, never a second stored fact that could drift from the history
 * (this file's own header note on `WeightObservation`). */
export function latestWeightObservation(observations: WeightObservation[]): WeightObservation | undefined {
  return [...observations].sort((a, b) => b.observedDate.localeCompare(a.observedDate))[0];
}

// ---------------------------------------------------------------------------
// Decision / Job (Farm Return Next Checkpoint 2, Vertical D)
//
// `DecisionRecord`/`JobRecord` (the mapped output shapes below) are defined
// in this file rather than imported from `@/orchestration/decide`/
// `@/orchestration/act`, unlike every other `rowToX` in this file, which
// maps into a pre-existing type from `@/domain/types`. That's deliberate,
// not an oversight: `ARCHITECTURE.md`'s layering has the persistence layer
// (`src/lib/farm-data/`) *below* the orchestration layer — orchestration
// calls farm-data, never the reverse — so this file must not import
// `Decision`/`Job` from `src/orchestration/*`, which would invert that
// dependency. `DecisionRecord` is structurally compatible with
// orchestration's real `Decision` type for every field this table actually
// has a column for (see `DecisionRow`'s own doc comment on the three
// fields it deliberately omits); `decisions.ts`/`jobs.ts` (this
// directory's real Supabase-calling functions, following
// `individual-animals.ts`'s exact pattern) import these mapped types from
// here, and `src/orchestration/act/index.ts` imports them from
// `decisions.ts`/`jobs.ts` in turn — the same "orchestration depends on
// farm-data" direction every existing call (e.g. `addWeightObservation`)
// already uses.
// ---------------------------------------------------------------------------

export type DecisionOutcome = "accepted" | "edited" | "dismissed";

export interface DecisionRecord {
  id: string;
  farmId: string;
  promptId: string;
  calculationKind: string;
  estimateSnapshot: EngineOutcome<unknown>;
  outcome: DecisionOutcome;
  edits?: Record<string, unknown>;
  decidedBy: "farmer";
  decidedAt: string;
  fieldId?: string;
  calculationVersion?: string;
  inputsSnapshot?: Record<string, unknown>;
  createdAt: string;
}

export function rowToDecision(row: DecisionRow): DecisionRecord {
  return {
    id: row.id,
    farmId: row.farm_id,
    promptId: row.prompt_id,
    calculationKind: row.calculation_kind,
    estimateSnapshot: row.estimate_snapshot,
    outcome: row.outcome,
    ...(row.edits ? { edits: row.edits } : {}),
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    ...(row.field_id ? { fieldId: row.field_id } : {}),
    ...(row.calculation_version ? { calculationVersion: row.calculation_version } : {}),
    ...(row.inputs_snapshot ? { inputsSnapshot: row.inputs_snapshot } : {}),
    createdAt: row.created_at,
  };
}

export type JobStatus = "proposed" | "scheduled" | "in_progress" | "confirmed" | "dismissed";

export interface JobRecord {
  id: string;
  farmId: string;
  decisionId: string;
  jobType: string;
  status: JobStatus;
  /** The specific `WeightObservation` (or other future job-type-specific
   * Actual) row that justified this job — present only for job types that
   * populate it (`record_weight_observation`, currently the only one).
   * See `JobRow.weight_observation_id`'s own doc comment for why this is
   * job-type-specific, not a general target reference. */
  weightObservationId?: string;
  createdAt: string;
  updatedAt: string;
}

export function rowToJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    farmId: row.farm_id,
    decisionId: row.decision_id,
    jobType: row.job_type,
    status: row.status,
    ...(row.weight_observation_id ? { weightObservationId: row.weight_observation_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// TelemetryEvent (Vertical A — Observe/telemetry,
// 20260901000000_telemetry_events.sql). Same "defined here, not imported
// from src/orchestration/observe" reasoning as DecisionRecord/JobRecord
// above — src/lib/farm-data/ stays below the orchestration layer.
// ---------------------------------------------------------------------------

export interface PhoneGpsPayload {
  lat: number;
  lng: number;
  accuracyM?: number;
  altitudeM?: number;
  headingDeg?: number;
  speedMps?: number;
}

export interface TelemetryEventRecord {
  id: string;
  farmId: string;
  source: "phone_gps";
  recordedAt: string;
  payload: PhoneGpsPayload;
  createdAt: string;
}

export function rowToTelemetryEvent(row: TelemetryEventRow): TelemetryEventRecord {
  return {
    id: row.id,
    farmId: row.farm_id,
    source: row.source,
    recordedAt: row.recorded_at,
    // The database CHECK (telemetry_events_phone_gps_payload_shape)
    // already guarantees lat/lng are present, numeric and in-range for
    // every row with source = 'phone_gps' — the only source this table
    // accepts today — so this cast is backed by a real, enforced
    // database constraint, not an unchecked assumption.
    payload: row.payload as unknown as PhoneGpsPayload,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Notification (Vertical G — in-app notifications,
// 20260901020000_notifications.sql). Same "defined here, not imported
// from src/orchestration/notify" reasoning as DecisionRecord/JobRecord/
// TelemetryEventRecord above.
// ---------------------------------------------------------------------------

export type NotificationState = "unread" | "viewed" | "acted_on" | "dismissed" | "expired";

export interface NotificationRecord {
  id: string;
  farmId: string;
  kind: string;
  dedupeKey: string;
  title: string;
  body: string;
  fieldId?: string;
  state: NotificationState;
  createdAt: string;
  stateChangedAt: string;
}

export function rowToNotification(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    farmId: row.farm_id,
    kind: row.kind,
    dedupeKey: row.dedupe_key,
    title: row.title,
    body: row.body,
    ...(row.field_id ? { fieldId: row.field_id } : {}),
    state: row.state,
    createdAt: row.created_at,
    stateChangedAt: row.state_changed_at,
  };
}
