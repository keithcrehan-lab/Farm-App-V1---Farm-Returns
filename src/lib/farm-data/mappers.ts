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
import type {
  FarmRow,
  FieldRow,
  FinancialAssumptionRow,
  HousingRow,
  LivestockGroupRow,
  LivestockIndividualRow,
  SlurryAllocationRow,
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
    plannedUse: row.planned_use,
    mappedSoil: row.mapped_soil,
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

export type NewFieldInput = Pick<Field, "name" | "areaHa" | "centroid" | "plannedUse" | "mappedSoil" | "fertility">;

export function fieldToInsertRow(farmId: string, input: NewFieldInput): Omit<FieldRow, "id" | "created_at" | "updated_at"> {
  return {
    farm_id: farmId,
    name: input.name,
    area_ha: input.areaHa,
    centroid_lng: input.centroid[0],
    centroid_lat: input.centroid[1],
    polygon: null,
    polygon_source: null,
    polygon_captured_at: null,
    lpis_ref: null,
    planned_use: input.plannedUse,
    mapped_soil: input.mappedSoil,
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
