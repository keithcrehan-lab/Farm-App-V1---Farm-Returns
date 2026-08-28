import { describe, expect, it } from "vitest";
import {
  fieldToInsertRow,
  farmToInsertRow,
  groupLivestockIdsByHousing,
  rowToFarm,
  rowToField,
  rowToFinancialAssumption,
  rowToHousing,
  rowToLivestockGroup,
  rowToSlurryAllocation,
} from "./mappers";
import type {
  FarmRow,
  FieldRow,
  FinancialAssumptionRow,
  HousingRow,
  LivestockGroupRow,
  SlurryAllocationRow,
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
  it("seeds a new field with no polygon yet, matching farm-store.tsx's addField semantics", () => {
    const row = fieldToInsertRow("farm-1", {
      name: "New Field",
      areaHa: 5,
      centroid: [-8.49, 51.9],
      plannedUse: { value: "grazing", status: "farmer_adjusted", source: "Keith Crehan" },
      mappedSoil: FIELD_ROW.mapped_soil,
      fertility: FIELD_ROW.fertility,
    });
    expect(row.polygon).toBeNull();
    expect(row.centroid_lng).toBe(-8.49);
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
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const allocation = rowToSlurryAllocation(row);
    expect(allocation.applicationMethod?.value).toBe("LESS");
    expect(allocation.fieldId).toBe("field-1");
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
