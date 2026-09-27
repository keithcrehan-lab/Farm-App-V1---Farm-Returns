import { describe, expect, it } from "vitest";
import {
  fieldToInsertRow,
  farmToInsertRow,
  groupLivestockIdsByHousing,
  latestWeightObservation,
  rowToDecision,
  rowToFarm,
  rowToField,
  rowToFinancialAssumption,
  rowToHousing,
  rowToIndividualAnimal,
  rowToJob,
  rowToLivestockGroup,
  rowToSlurryAllocation,
  rowToSlurryAllocationRecord,
  rowToWeightObservation,
  withdrawnSinceObservationByHousing,
} from "./mappers";
import type {
  DecisionRow,
  FarmRow,
  FieldRow,
  FinancialAssumptionRow,
  HousingRow,
  JobRow,
  LivestockGroupRow,
  LivestockIndividualRow,
  SlurryAllocationRow,
  WeightObservationRow,
} from "./row-types";

const FARM_ROW: FarmRow = {
  id: "farm-1",
  user_id: "user-1",
  name: "Ballybeg Farm",
  county: "Cork",
  centroid_lng: -8.49,
  centroid_lat: 51.9,
  primary_enterprises: ["suckler_beef"],
  units: "metric",
  owner_name: "Keith Crehan",
  p_build_up_compliance: null,
  onboarding_completed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("rowToFarm", () => {
  it("assembles the centroid tuple from the two flat lng/lat columns", () => {
    const farm = rowToFarm(FARM_ROW);
    expect(farm.location.centroid).toEqual([-8.49, 51.9]);
    expect(farm.location.county).toBe("Cork");
  });

  it("omits pBuildUpCompliance when the row column is null rather than setting it to null", () => {
    const farm = rowToFarm(FARM_ROW);
    expect(farm).not.toHaveProperty("pBuildUpCompliance");
  });

  it("includes pBuildUpCompliance when the row has it", () => {
    const farm = rowToFarm({
      ...FARM_ROW,
      p_build_up_compliance: {
        value: { adviserEngaged: true, nmpSubmitted: false, trainingCompleted: false },
        status: "farmer_adjusted",
        source: "Keith Crehan",
      },
    });
    expect(farm.pBuildUpCompliance?.value.adviserEngaged).toBe(true);
  });
});

describe("farmToInsertRow", () => {
  it("splits the centroid tuple back into the two flat columns", () => {
    const row = farmToInsertRow("user-1", {
      name: "Ballybeg Farm",
      ownerName: "Keith Crehan",
      county: "Cork",
      centroid: [-8.49, 51.9],
      primaryEnterprises: ["suckler_beef"],
    });
    expect(row.centroid_lng).toBe(-8.49);
    expect(row.centroid_lat).toBe(51.9);
    expect(row.user_id).toBe("user-1");
  });
});

const FIELD_ROW: FieldRow = {
  id: "field-1",
  farm_id: "farm-1",
  name: "Home Field",
  area_ha: 8.6,
  centroid_lng: -8.49,
  centroid_lat: 51.9,
  polygon: null,
  polygon_source: null,
  polygon_captured_at: null,
  lpis_ref: null,
  planned_use: { value: "grazing", status: "farmer_adjusted", source: "Keith Crehan" },
  mapped_soil: {
    soilAssociation: "Pending mapping",
    dominantSeries: "Pending mapping",
    texture: "Unknown",
    drainage: "moderately_drained",
    coveragePct: 0,
    datasetVersion: "Not yet mapped",
    source: "Awaiting automatic mapping",
  },
  fertility: {
    pIndex: { value: 2, status: "estimated", source: "Farm Return assumption" },
    kIndex: { value: 2, status: "estimated", source: "Farm Return assumption" },
  },
  commonage_status: null,
  water_buffer_context: null,
  history: [],
  thumbnail: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("rowToField", () => {
  it("assembles the centroid tuple and omits unset optional fields", () => {
    const field = rowToField(FIELD_ROW);
    expect(field.centroid).toEqual([-8.49, 51.9]);
    expect(field).not.toHaveProperty("polygon");
    expect(field).not.toHaveProperty("commonageStatus");
    expect(field).not.toHaveProperty("waterBufferContext");
  });

  it("omits archivedAt for an active field, includes it once archived", () => {
    expect(rowToField(FIELD_ROW)).not.toHaveProperty("archivedAt");
    const archived = rowToField({ ...FIELD_ROW, archived_at: "2026-06-01T00:00:00Z" });
    expect(archived.archivedAt).toBe("2026-06-01T00:00:00Z");
  });

  it("carries a real farmer-drawn polygon through untouched", () => {
    const polygon: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [[[-8.5, 51.9], [-8.49, 51.9], [-8.49, 51.91], [-8.5, 51.9]]],
    };
    const field = rowToField({ ...FIELD_ROW, polygon, polygon_source: "farmer_drawn" });
    expect(field.polygon).toEqual(polygon);
    expect(field.polygonSource).toBe("farmer_drawn");
  });
});

describe("fieldToInsertRow", () => {
  // Codex remediation Priority 6 — boundary-first: a new field is seeded
  // from a real drawn polygon, not a manually-typed area/centroid, and
  // with no plannedUse/mappedSoil (Priority 2 removed those fabricated
  // defaults).
  const NEW_FIELD_POLYGON: GeoJSON.Polygon = {
    type: "Polygon",
    coordinates: [[[-8.5, 51.9], [-8.48, 51.9], [-8.48, 51.91], [-8.5, 51.91], [-8.5, 51.9]]],
  };

  it("derives area/centroid from the drawn polygon, with no fabricated planned use or mapped soil", () => {
    const row = fieldToInsertRow("farm-1", {
      name: "New Field",
      polygon: NEW_FIELD_POLYGON,
      fertility: {},
    });
    expect(row.polygon).toEqual(NEW_FIELD_POLYGON);
    expect(row.polygon_source).toBe("farmer_drawn");
    expect(row.planned_use).toBeNull();
    expect(row.mapped_soil).toBeNull();
    expect(row.area_ha).toBeGreaterThan(0);
    expect(row.farm_id).toBe("farm-1");
  });
});

const HOUSING_ROW: HousingRow = {
  id: "housing-1",
  farm_id: "farm-1",
  shed_name: "Shed 1",
  shed_type: "slatted",
  housing_period_start: "2025-11-01",
  housing_period_end: "2026-03-31",
  tank_refinement: null,
  slurry_estimate: {
    volumeM3: { value: 100, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableN: { value: 10, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableP: { value: 5, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableK: { value: 20, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    ruleSetVersion: "slurry_engine_v1.0.0 (mock)",
  },
  storage_capacity_m3: 500,
  storage_fill_pct: 60,
  storage_fill_status: "farmer_recorded",
  storage_fill_recorded_at: "2026-01-01T00:00:00Z",
  store_observation_seq: 1,
  store_observed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("rowToHousing / groupLivestockIdsByHousing", () => {
  it("attaches the linkedGroupIds computed from a separate livestock_groups query, not a stored column", () => {
    const groups: Pick<LivestockGroupRow, "id" | "housing_id">[] = [
      { id: "lg-1", housing_id: "housing-1" },
      { id: "lg-2", housing_id: "housing-1" },
      { id: "lg-3", housing_id: "housing-2" },
      { id: "lg-4", housing_id: null },
    ];
    const byHousing = groupLivestockIdsByHousing(groups);
    const housing = rowToHousing(HOUSING_ROW, byHousing.get("housing-1") ?? []);
    expect(housing.linkedGroupIds).toEqual(["lg-1", "lg-2"]);
  });

  it("gives housing with no linked groups an empty array, not undefined", () => {
    const housing = rowToHousing(HOUSING_ROW, []);
    expect(housing.linkedGroupIds).toEqual([]);
  });
});

describe("rowToLivestockGroup", () => {
  it("maps required and optional fields correctly", () => {
    const row: LivestockGroupRow = {
      id: "lg-1",
      farm_id: "farm-1",
      category: "weanling",
      label: "Spring weanlings",
      count: { value: 12, status: "verified", source: "Keith Crehan" },
      avg_weight_kg: { value: 335, status: "estimated", source: "Farm Return assumption" },
      avg_age_months: null,
      breed: null,
      sex: null,
      system: "grazing",
      housing_id: "housing-1",
      goal: "sell_store",
      value: { value: 940, status: "estimated", source: "Farm Return assumption" },
      status_label: "On Track",
      avg_milk_yield_kg_per_year: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const group = rowToLivestockGroup(row);
    expect(group.housingId).toBe("housing-1");
    expect(group.avgWeightKg?.value).toBe(335);
    expect(group).not.toHaveProperty("avgMilkYieldKgPerYear");
  });
});

const PLANNED_LIFECYCLE = {
  status: "planned",
  actual_volume_m3: null,
  actual_spread_date: null,
  store_reconciliation: null,
  store_observation_seq: null,
  completed_at: null,
  completed_by: null,
  cancelled_at: null,
  cancelled_by: null,
} as const;

describe("rowToSlurryAllocation", () => {
  it("maps a full allocation row", () => {
    const row: SlurryAllocationRow = {
      id: "sa-1",
      farm_id: "farm-1",
      field_id: "field-1",
      housing_id: "housing-1",
      priority: "high",
      volume_m3: 120,
      score: 91,
      application_method: { value: "LESS", status: "farmer_adjusted", source: "Keith Crehan" },
      application_date: { value: "2026-03-14", status: "farmer_adjusted", source: "Keith Crehan" },
      ...PLANNED_LIFECYCLE,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const allocation = rowToSlurryAllocation(row);
    expect(allocation.applicationMethod?.value).toBe("LESS");
    expect(allocation.applicationDate?.value).toBe("2026-03-14");
    expect(allocation.fieldId).toBe("field-1");
  });

  it("a farmer-planned row with NULL priority/score maps to an unranked allocation, never a zero score", () => {
    const row: SlurryAllocationRow = {
      id: "sa-2",
      farm_id: "farm-1",
      field_id: "field-1",
      housing_id: "housing-1",
      priority: null,
      volume_m3: 80,
      score: null,
      application_method: { value: "LESS", status: "farmer_adjusted", source: "Keith Crehan" },
      application_date: { value: "2026-09-26", status: "farmer_adjusted", source: "Keith Crehan" },
      ...PLANNED_LIFECYCLE,
      created_at: "2026-09-25T00:00:00Z",
      updated_at: "2026-09-25T00:00:00Z",
    };
    const allocation = rowToSlurryAllocation(row);
    expect("priority" in allocation).toBe(false);
    expect("score" in allocation).toBe(false);
    expect(allocation.volumeM3).toBe(80);
  });

  it("omits applicationDate when the row has no application_date", () => {
    const row: SlurryAllocationRow = {
      id: "sa-2",
      farm_id: "farm-1",
      field_id: "field-1",
      housing_id: "housing-1",
      priority: "high",
      volume_m3: 120,
      score: 91,
      application_method: null,
      application_date: null,
      ...PLANNED_LIFECYCLE,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const allocation = rowToSlurryAllocation(row);
    expect(allocation).not.toHaveProperty("applicationDate");
  });
});

const COMPLETED_ROW: SlurryAllocationRow = {
  id: "sa-3",
  farm_id: "farm-1",
  field_id: "field-1",
  housing_id: "housing-1",
  priority: null,
  volume_m3: 80,
  score: null,
  application_method: null,
  application_date: null,
  status: "completed",
  actual_volume_m3: 65,
  actual_spread_date: "2026-03-02",
  store_reconciliation: "withdrawn_after_observation",
  store_observation_seq: 1,
  completed_at: "2026-03-02T15:00:00Z",
  completed_by: "user-1",
  cancelled_at: null,
  cancelled_by: null,
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-03-02T15:00:00Z",
};

describe("rowToSlurryAllocationRecord (Phase 1A lifecycle)", () => {
  it("keeps planned and actual volume as separate fields", () => {
    const record = rowToSlurryAllocationRecord(COMPLETED_ROW);
    expect(record).toMatchObject({ id: "sa-3", status: "completed", volumeM3: 80, actualVolumeM3: 65, storeObservationSeq: 1, completedBy: "user-1" });
    expect(record).not.toHaveProperty("cancelledAt");
  });

  it("a planned row carries no lifecycle values — absent, never zero", () => {
    const record = rowToSlurryAllocationRecord({ ...COMPLETED_ROW, ...PLANNED_LIFECYCLE });
    expect(record.status).toBe("planned");
    for (const key of ["actualVolumeM3", "actualSpreadDate", "storeReconciliation", "storeObservationSeq", "completedAt", "cancelledAt"]) {
      expect(record).not.toHaveProperty(key);
    }
  });
});

describe("withdrawnSinceObservationByHousing", () => {
  const housing = [
    { id: "housing-1", store_observation_seq: 2 },
    { id: "housing-2", store_observation_seq: 1 },
  ];

  it("sums only withdrawals against each store's CURRENT observation", () => {
    const rows = [
      { ...COMPLETED_ROW, store_observation_seq: 2, actual_volume_m3: 30 },
      { ...COMPLETED_ROW, store_observation_seq: 1, actual_volume_m3: 50 }, // superseded by observation 2
      { ...COMPLETED_ROW, store_observation_seq: 2, store_reconciliation: "reflected_in_observation" as const, actual_volume_m3: 40 },
      { ...COMPLETED_ROW, housing_id: "housing-2", store_observation_seq: 1, actual_volume_m3: 12 },
    ];
    const withdrawn = withdrawnSinceObservationByHousing(housing, rows);
    expect(withdrawn.get("housing-1")).toBe(30);
    expect(withdrawn.get("housing-2")).toBe(12);
  });

  it("rowToHousing exposes the reconciliation inputs", () => {
    const mapped = rowToHousing({ ...HOUSING_ROW, store_observation_seq: 3, store_observed_at: "2026-03-01T09:00:00Z" }, [], 25);
    expect(mapped).toMatchObject({ storeObservationSeq: 3, storeObservedAt: "2026-03-01T09:00:00Z", storeWithdrawnSinceObservationM3: 25 });
  });
});

describe("rowToFinancialAssumption", () => {
  it("defaults unit to an empty string rather than null", () => {
    const row: FinancialAssumptionRow = {
      id: "fa-1",
      farm_id: "farm-1",
      key: "fertiliser_price_eur_per_t",
      value: { value: 520, status: "estimated", source: "CSO reference" },
      unit: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const assumption = rowToFinancialAssumption(row);
    expect(assumption.unit).toBe("");
    expect(assumption.key).toBe("fertiliser_price_eur_per_t");
  });
});

describe("rowToIndividualAnimal", () => {
  it("omits optional fields when null, includes them when set", () => {
    const row: LivestockIndividualRow = {
      id: "ia-1",
      farm_id: "farm-1",
      group_id: null,
      tag_number: null,
      category: "suckler_cow",
      sex: null,
      breed: null,
      date_of_birth: null,
      goal_status: null,
      notes: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const bare = rowToIndividualAnimal(row);
    expect(bare).not.toHaveProperty("tagNumber");
    expect(bare).not.toHaveProperty("groupId");

    const full = rowToIndividualAnimal({ ...row, tag_number: "IE123", group_id: "lg-1", breed: "Angus", sex: "female" });
    expect(full.tagNumber).toBe("IE123");
    expect(full.groupId).toBe("lg-1");
    expect(full.breed).toBe("Angus");
    expect(full.sex).toBe("female");
  });
});

describe("rowToWeightObservation / latestWeightObservation", () => {
  const makeObservation = (id: string, weightKg: number, observedDate: string): WeightObservationRow => ({
    id,
    farm_id: "farm-1",
    animal_id: "ia-1",
    weight_kg: weightKg,
    observed_date: observedDate,
    source: "Farmer entered",
    created_at: "2026-01-01T00:00:00Z",
  });

  it("maps a row to a WeightObservation", () => {
    const observation = rowToWeightObservation(makeObservation("wo-1", 335, "2026-06-01"));
    expect(observation.weightKg).toBe(335);
    expect(observation.observedDate).toBe("2026-06-01");
  });

  it("returns the most recent observation by date, not insertion order", () => {
    const observations = [
      rowToWeightObservation(makeObservation("wo-1", 300, "2026-01-01")),
      rowToWeightObservation(makeObservation("wo-3", 380, "2026-08-01")),
      rowToWeightObservation(makeObservation("wo-2", 335, "2026-06-01")),
    ];
    expect(latestWeightObservation(observations)?.weightKg).toBe(380);
  });

  it("returns undefined for an animal with no observations", () => {
    expect(latestWeightObservation([])).toBeUndefined();
  });
});

describe("rowToDecision", () => {
  const DECISION_ROW: DecisionRow = {
    id: "decision-1",
    farm_id: "farm-1",
    prompt_id: "prompt-1",
    calculation_kind: "weight_observation_due",
    estimate_snapshot: { status: "OK", value: null, evidenceState: "MEASURED" },
    outcome: "accepted",
    edits: { animalId: "animal-1", weightKg: 320, observedDate: "2026-08-29" },
    decided_by: "farmer",
    decided_at: "2026-08-29T09:00:00Z",
    field_id: null,
    calculation_version: null,
    inputs_snapshot: null,
    created_at: "2026-08-29T09:00:01Z",
  };

  it("maps every real decisions column to camelCase, unchanged in value", () => {
    const decision = rowToDecision(DECISION_ROW);
    expect(decision).toEqual({
      id: "decision-1",
      farmId: "farm-1",
      promptId: "prompt-1",
      calculationKind: "weight_observation_due",
      estimateSnapshot: { status: "OK", value: null, evidenceState: "MEASURED" },
      outcome: "accepted",
      edits: { animalId: "animal-1", weightKg: 320, observedDate: "2026-08-29" },
      decidedBy: "farmer",
      decidedAt: "2026-08-29T09:00:00Z",
      createdAt: "2026-08-29T09:00:01Z",
    });
  });

  it("omits edits when the row has none (a dismissed decision)", () => {
    const dismissed = rowToDecision({ ...DECISION_ROW, outcome: "dismissed", edits: null });
    expect(dismissed).not.toHaveProperty("edits");
    expect(dismissed.outcome).toBe("dismissed");
  });

  it("includes fieldId/calculationVersion/inputsSnapshot when the row carries them, omits them when null", () => {
    const withTrace = rowToDecision({
      ...DECISION_ROW,
      field_id: "field-1",
      calculation_version: "v1",
      inputs_snapshot: { soilTestDate: "2024-01-01" },
    });
    expect(withTrace.fieldId).toBe("field-1");
    expect(withTrace.calculationVersion).toBe("v1");
    expect(withTrace.inputsSnapshot).toEqual({ soilTestDate: "2024-01-01" });

    const bare = rowToDecision(DECISION_ROW);
    expect(bare).not.toHaveProperty("fieldId");
    expect(bare).not.toHaveProperty("calculationVersion");
    expect(bare).not.toHaveProperty("inputsSnapshot");
  });
});

describe("rowToJob", () => {
  it("maps every real jobs column to camelCase, unchanged in value, and omits weightObservationId when null", () => {
    const row: JobRow = {
      id: "job-1",
      farm_id: "farm-1",
      decision_id: "decision-1",
      job_type: "record_weight_observation",
      status: "confirmed",
      weight_observation_id: null,
      created_at: "2026-08-29T09:00:01Z",
      updated_at: "2026-08-29T09:00:01Z",
    };
    expect(rowToJob(row)).toEqual({
      id: "job-1",
      farmId: "farm-1",
      decisionId: "decision-1",
      jobType: "record_weight_observation",
      status: "confirmed",
      createdAt: "2026-08-29T09:00:01Z",
      updatedAt: "2026-08-29T09:00:01Z",
    });
  });

  it("maps a real weight_observation_id to weightObservationId when present", () => {
    const row: JobRow = {
      id: "job-1",
      farm_id: "farm-1",
      decision_id: "decision-1",
      job_type: "record_weight_observation",
      status: "confirmed",
      weight_observation_id: "observation-1",
      created_at: "2026-08-29T09:00:01Z",
      updated_at: "2026-08-29T09:00:01Z",
    };
    expect(rowToJob(row).weightObservationId).toBe("observation-1");
  });
});
