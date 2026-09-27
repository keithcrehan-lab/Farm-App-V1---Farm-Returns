import { describe, expect, it } from "vitest";
import {
  buildSlurryEvidenceContext,
  commonageStatusEvidence,
  fieldSlurryDryMatterEvidence,
  resolveFieldSlurryCompositionInput,
  slurryEstimateNutrientEvidence,
  slurryStoreEvidence,
  waterBufferContextEvidence,
} from "./slurry-evidence-context";
import { calculateNutrientPlan, NATIONAL_AVG_SLURRY_DM_PCT } from "./nutrients";
import { currentSlurryCompositionByHousing, type SlurryComposition } from "./slurry-composition";
import type { SlurryAllocationRecord } from "./slurry-allocation-lifecycle";
import { tracked, type Field, type SlurryAllocation } from "./types";
import { rowToField, rowToHousing, rowToSlurryAllocationRecord } from "@/lib/farm-data/mappers";
import type { FieldRow, HousingRow, SlurryAllocationRow } from "@/lib/farm-data/row-types";

// Persisted-row fixtures go through the real mappers so each test proves the
// evidence survives persistence → data layer → evidence context.
const FIELD_ROW: FieldRow = {
  id: "field-1",
  farm_id: "farm-1",
  name: "Home Field",
  area_ha: 8,
  centroid_lng: -8.49,
  centroid_lat: 51.9,
  polygon: null,
  polygon_source: null,
  polygon_captured_at: null,
  lpis_ref: null,
  planned_use: { value: "grazing", status: "farmer_adjusted", source: "Keith" },
  mapped_soil: null,
  fertility: {
    pIndex: { value: 3, status: "verified", source: "Lab soil test", sourceDate: "2025-03-01" },
    kIndex: { value: 3, status: "verified", source: "Lab soil test", sourceDate: "2025-03-01" },
  },
  commonage_status: null,
  water_buffer_context: null,
  history: [],
  thumbnail: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const HOUSING_ROW: HousingRow = {
  id: "housing-1",
  farm_id: "farm-1",
  shed_name: "Shed 1",
  shed_type: "slatted",
  housing_period_start: "2025-11-01",
  housing_period_end: "2026-03-31",
  tank_refinement: null,
  slurry_estimate: {
    volumeM3: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableN: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableP: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableK: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    ruleSetVersion: "slurry_engine_v1.0.0 (mock)",
  },
  storage_capacity_m3: 500,
  storage_fill_pct: 60,
  storage_fill_status: "farmer_recorded",
  storage_fill_recorded_at: "2026-02-01T00:00:00Z",
  store_observation_seq: 1,
  store_observed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function allocationRow(overrides: Partial<SlurryAllocationRow>): SlurryAllocationRow {
  return {
    id: "sa-1",
    farm_id: "farm-1",
    field_id: "field-1",
    housing_id: "housing-1",
    priority: null,
    volume_m3: 100,
    score: null,
    application_method: null,
    application_date: null,
    status: "planned",
    actual_volume_m3: null,
    actual_spread_date: null,
    store_reconciliation: null,
    store_observation_seq: null,
    completed_at: null,
    completed_by: null,
    cancelled_at: null,
    cancelled_by: null,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    ...overrides,
  };
}

function composition(overrides: Partial<SlurryComposition> = {}): SlurryComposition {
  return {
    id: "comp-1",
    farmId: "farm-1",
    housingId: "housing-1",
    slurryType: "cattle_slurry",
    status: "verified",
    dmPct: 4,
    sampleDate: "2026-02-10",
    source: "Laboratory report",
    laboratory: "Teagasc Johnstown",
    recordedAt: "2026-02-11T09:00:00Z",
    ...overrides,
  };
}

const field = (overrides: Partial<FieldRow> = {}): Field => rowToField({ ...FIELD_ROW, ...overrides });
const housing = (overrides: Partial<HousingRow> = {}) => rowToHousing({ ...HOUSING_ROW, ...overrides }, []);
const record = (overrides: Partial<SlurryAllocationRow> = {}): SlurryAllocationRecord => rowToSlurryAllocationRecord(allocationRow(overrides));

function context(input: Partial<Parameters<typeof buildSlurryEvidenceContext>[0]> = {}) {
  return buildSlurryEvidenceContext({ fields: [field()], housing: [housing()], allocationRecords: [], compositionRecords: [], asOfDate: "2026-03-01", ...input });
}

describe("A1.1 / Q — archived fields do not enter current planning", () => {
  it("excludes an archived field from candidates and farm grassland area, but leaves its records intact", () => {
    const archived = field({ id: "field-2", name: "Old Field", area_ha: 20, archived_at: "2026-01-15T00:00:00Z" });
    const archivedPlan = record({ id: "sa-archived", field_id: "field-2" });
    const archivedDone = record({ id: "sa-done", field_id: "field-2", status: "completed", actual_volume_m3: 40, actual_spread_date: "2025-04-01" });
    const allocationRecords = [record(), archivedPlan, archivedDone];
    const before = structuredClone(allocationRecords);

    const ctx = context({ fields: [field(), archived], allocationRecords });

    expect(ctx.activeFields.map((f) => f.id)).toEqual(["field-1"]);
    expect(ctx.fields.map((f) => f.fieldId)).toEqual(["field-1"]);
    expect(ctx.archivedFieldIds).toEqual(["field-2"]);
    expect(ctx.farmGrasslandAreaHa).toBe(8);
    expect(allocationRecords).toEqual(before);
  });
});

describe("A2.1 — farmer answers already held are reused, never manufactured", () => {
  it("G: a stored commonage answer reaches the evidence context with its provenance", () => {
    const f = field({ commonage_status: { value: "not_commonage", status: "farmer_adjusted", source: "Keith", sourceDate: "2026-01-20" } });
    const fact = context({ fields: [f] }).fields[0].commonageStatus;
    expect(fact).toEqual({ state: "known", value: "not_commonage", status: "farmer_adjusted", source: "Keith", recordedAt: "2026-01-20", freshness: "NO_FRESHNESS_POLICY" });
  });

  it("H: a stored water-buffer answer reaches the evidence context as recorded", () => {
    const f = field({
      water_buffer_context: { value: { featureType: "surface_water", distanceM: 25, localOverrideStatus: "verified_none" }, status: "farmer_adjusted", source: "Keith", sourceDate: "2026-01-21" },
    });
    const fact = context({ fields: [f] }).fields[0].waterBufferContext;
    expect(fact).toMatchObject({ state: "known", value: { featureType: "surface_water", distanceM: 25, localOverrideStatus: "verified_none" }, status: "farmer_adjusted", recordedAt: "2026-01-21" });
  });

  it("I: missing answers stay missing — never false, 'not commonage', or distance 0", () => {
    expect(commonageStatusEvidence(field())).toEqual({ state: "missing", reasonCode: "COMMONAGE_STATUS_NOT_RECORDED" });
    expect(commonageStatusEvidence(field({ commonage_status: { value: "unknown", status: "farmer_adjusted", source: "Keith" } }))).toEqual({
      state: "missing",
      reasonCode: "COMMONAGE_STATUS_DECLARED_UNKNOWN",
    });
    expect(waterBufferContextEvidence(field())).toEqual({ state: "missing", reasonCode: "WATER_BUFFER_CONTEXT_NOT_RECORDED" });
    const partial = waterBufferContextEvidence(field({ water_buffer_context: { value: { localOverrideStatus: "unknown" }, status: "farmer_adjusted", source: "Keith" } }));
    expect(partial.state).toBe("known");
    if (partial.state === "known") {
      expect(partial.value.distanceM).toBeUndefined();
      expect(partial.value.featureType).toBeUndefined();
    }
  });
});

describe("A2.2 — recorded slurry dry matter", () => {
  it("J: recorded DM reaches the field evidence and the nutrient plan with its provenance", () => {
    const ctx = context({ allocationRecords: [record()], compositionRecords: [composition()] });
    const fe = ctx.fields[0];
    expect(fe.slurryDryMatter).toMatchObject({ state: "known", value: { dmPct: 4, housingId: "housing-1" }, status: "verified", recordedAt: "2026-02-10", recordId: "comp-1" });

    const allocation = record({ application_method: { value: "LESS", status: "farmer_adjusted", source: "Keith" }, application_date: { value: "2026-03-10", status: "farmer_adjusted", source: "Keith" } });
    const plan = calculateNutrientPlan({
      field: ctx.activeFields[0],
      farmGrasslandAreaHa: ctx.farmGrasslandAreaHa,
      livestockGroups: [],
      slurryAllocation: allocation,
      asOfDate: "2026-03-01",
      slurryComposition: fe.nutrientPlanComposition.composition,
      slurryCompositionUnresolved: fe.nutrientPlanComposition.unresolved,
    });
    expect(plan.organicApplication.dmPct).toBe(4);
    expect(plan.organicApplication.dmPctEvidence).toMatchObject({ status: "verified", compositionRecordId: "comp-1" });
  });

  it("K: missing DM stays missing in the evidence context", () => {
    expect(context({ allocationRecords: [record()] }).fields[0].slurryDryMatter).toEqual({ state: "missing", reasonCode: "NO_RECORDED_SLURRY_COMPOSITION" });
    expect(context().fields[0].slurryDryMatter).toEqual({ state: "missing", reasonCode: "NO_PLANNED_SLURRY_SOURCE" });
  });

  it("L / P: a multi-store field with recorded DM is conflicting, and the plan does not silently use the national average", () => {
    const compositions = [composition(), composition({ id: "comp-2", housingId: "housing-2", dmPct: 7 })];
    const allocations = [record(), record({ id: "sa-2", housing_id: "housing-2" })];
    const fe = context({ housing: [housing(), housing({ id: "housing-2" })], allocationRecords: allocations, compositionRecords: compositions }).fields[0];

    expect(fe.slurryDryMatter.state).toBe("conflicting");
    if (fe.slurryDryMatter.state === "conflicting") {
      expect(fe.slurryDryMatter.candidates.map((c) => c.value.dmPct).sort()).toEqual([4, 7]);
    }
    expect(fe.nutrientPlanComposition).toEqual({ unresolved: { housingIds: ["housing-1", "housing-2"], compositionRecordIds: ["comp-1", "comp-2"] } });

    const combined: SlurryAllocation = { fieldId: "field-1", housingId: "multiple", volumeM3: 200, applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") };
    const plan = calculateNutrientPlan({
      field: field(),
      farmGrasslandAreaHa: 8,
      livestockGroups: [],
      slurryAllocation: combined,
      asOfDate: "2026-03-01",
      slurryCompositionUnresolved: fe.nutrientPlanComposition.unresolved,
    });
    expect(plan.organicApplication.availableNutrientAssessment).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "SLURRY_COMPOSITION_SOURCES_UNRESOLVED" });
    expect(plan.organicApplication.dmPctEvidence.status).toBe("unavailable");
    expect(plan.organicApplication.offsetN).toBe(0);
  });

  it("unresolved composition suppresses every quantity sized on the slurry credit (Campaign A audit HIGH)", () => {
    const groups = [
      {
        id: "g1",
        farmId: "farm-1",
        category: "suckler_cow" as const,
        label: "Cows",
        count: tracked(20, "verified", "Farmer"),
        system: "grazing" as const,
        value: tracked(30000, "estimated", "Farm Return estimate"),
      },
    ];
    const lowIndexField = field({
      fertility: { pIndex: { value: 1, status: "verified", source: "Lab soil test" }, kIndex: { value: 1, status: "verified", source: "Lab soil test" } },
    });
    const combined: SlurryAllocation = { fieldId: "field-1", housingId: "multiple", volumeM3: 200, applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") };
    const base = { field: lowIndexField, farmGrasslandAreaHa: 8, livestockGroups: groups, slurryAllocation: combined, asOfDate: "2026-03-01" };
    expect(calculateNutrientPlan(base).purchasedProducts.length).toBeGreaterThan(0);

    const plan = calculateNutrientPlan({ ...base, slurryCompositionUnresolved: { housingIds: ["housing-1", "housing-2"], compositionRecordIds: ["comp-1", "comp-2"] } });
    expect(plan.purchasedProducts).toEqual([]);
    expect(plan.estimatedFieldCostEur).toBe(0);
    expect(plan.netRequirement.status).toBe("unavailable");
    expect(plan.napCompliance).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "SLURRY_COMPOSITION_SOURCES_UNRESOLVED" });
    expect(plan.requirement.status).toBe("estimated");
  });

  it("a multi-store field with no recorded composition anywhere keeps the disclosed standard assumption", () => {
    const allocations: SlurryAllocation[] = [record(), record({ id: "sa-2", housing_id: "housing-2" })];
    expect(resolveFieldSlurryCompositionInput(allocations, "field-1", new Map())).toEqual({});
    const plan = calculateNutrientPlan({ field: field(), farmGrasslandAreaHa: 8, livestockGroups: [], slurryAllocation: { fieldId: "field-1", housingId: "multiple", volumeM3: 200 }, asOfDate: "2026-03-01" });
    expect(plan.organicApplication.dmPct).toBe(NATIONAL_AVG_SLURRY_DM_PCT);
    expect(plan.organicApplication.dmPctEvidence.status).toBe("estimated");
  });

  it("M: recorded DM is passed through raw — no new DM → N/P/K transformation appears anywhere", () => {
    const ctx = context({ allocationRecords: [record()], compositionRecords: [composition({ dmPct: 5 })] });
    const store = ctx.stores[0];
    expect(store.recordedDryMatterPct).toMatchObject({ state: "known", value: 5 });
    // Total N/P/K were not recorded on the composition: they stay missing,
    // not derived from DM.
    expect(store.recordedTotals.nPerM3).toEqual({ state: "missing", reasonCode: "NUTRIENT_NOT_RECORDED_ON_COMPOSITION" });
    expect(store.estimatedAvailableNutrients.n.state).toBe("missing");
    // The existing LESS table needs an exact published DM row: 5 % stays
    // blocked — no interpolation was introduced.
    const fe = ctx.fields[0];
    const plan = calculateNutrientPlan({
      field: ctx.activeFields[0],
      farmGrasslandAreaHa: 8,
      livestockGroups: [],
      slurryAllocation: record({ application_method: { value: "LESS", status: "farmer_adjusted", source: "Keith" }, application_date: { value: "2026-03-10", status: "farmer_adjusted", source: "Keith" } }),
      asOfDate: "2026-03-01",
      slurryComposition: fe.nutrientPlanComposition.composition,
    });
    expect(plan.organicApplication.availableNutrientAssessment.status).not.toBe("OK");
  });

  it("the per-store view uses the tier/recency-resolved current record", () => {
    const records = [composition({ id: "old", sampleDate: "2025-01-01", dmPct: 7 }), composition({ id: "new", sampleDate: "2026-02-10", dmPct: 4 })];
    expect(fieldSlurryDryMatterEvidence([record()], "field-1", currentSlurryCompositionByHousing(records))).toMatchObject({ state: "known", recordId: "new" });
  });
});

describe("A1.3 — store nutrient content unknown vs zero (E, F)", () => {
  it("E: the placeholder slurry estimate is unknown, never 0 kg", () => {
    const facts = slurryEstimateNutrientEvidence(housing().slurryEstimate);
    expect(facts.n).toEqual({ state: "missing", reasonCode: "SLURRY_NUTRIENT_CONTENT_NOT_CALCULATED" });
    expect(facts.p.state).toBe("missing");
    expect(facts.k.state).toBe("missing");
  });

  it("a genuine calculated zero stays representable as a known 0", () => {
    const estimate = {
      volumeM3: tracked(100, "estimated", "Real engine v2"),
      availableN: tracked(0, "estimated", "Real engine v2"),
      availableP: tracked(3, "estimated", "Real engine v2"),
      availableK: tracked(9, "estimated", "Real engine v2"),
      ruleSetVersion: "real_engine_v2",
    };
    expect(slurryEstimateNutrientEvidence(estimate).n).toMatchObject({ state: "known", value: 0 });
  });

  it("F: physical tank volume is known while nutrient composition is unknown", () => {
    const store = slurryStoreEvidence(housing(), undefined);
    expect(store.physicalVolumeM3).toMatchObject({ state: "known", value: 300, status: "farmer_adjusted", recordedAt: "2026-02-01T00:00:00Z" });
    expect(store.recordedDryMatterPct).toEqual({ state: "missing", reasonCode: "NO_RECORDED_SLURRY_COMPOSITION" });
    expect(store.recordedTotals.nPerM3.state).toBe("missing");
    expect(store.estimatedAvailableNutrients.n.state).toBe("missing");
  });

  it("a blank fill (persisted as 0/estimated) is missing, never a known empty store (Campaign A audit HIGH)", () => {
    const blank = slurryStoreEvidence(housing({ storage_fill_pct: 0, storage_fill_status: "estimated", storage_fill_recorded_at: null }), undefined);
    expect(blank.physicalVolumeM3).toEqual({ state: "missing", reasonCode: "STORE_CAPACITY_OR_FILL_NOT_RECORDED" });

    const recordedEmpty = slurryStoreEvidence(housing({ storage_fill_pct: 0 }), undefined);
    expect(recordedEmpty.physicalVolumeM3).toMatchObject({ state: "known", value: 0, status: "farmer_adjusted" });

    const legacyEstimate = slurryStoreEvidence(housing({ storage_fill_pct: 40, storage_fill_status: "estimated", storage_fill_recorded_at: null }), undefined);
    expect(legacyEstimate.physicalVolumeM3).toMatchObject({ state: "known", value: 200, status: "estimated" });
    if (legacyEstimate.physicalVolumeM3.state === "known") expect(legacyEstimate.physicalVolumeM3.source).not.toContain("recorded fill");
  });
});

describe("A2.3 — planned vs completed application evidence (N, O)", () => {
  it("N: planned stays planned, completed stays actual, and a completed plan is not a current reservation", () => {
    const planned = record({ id: "sa-plan", volume_m3: 120, application_date: { value: "2026-04-01", status: "farmer_adjusted", source: "Keith" } });
    const done = record({ id: "sa-done", status: "completed", volume_m3: 80, actual_volume_m3: 65, actual_spread_date: "2026-02-20", completed_at: "2026-02-20T15:00:00Z", completed_by: "Keith" });
    const cancelled = record({ id: "sa-cancel", status: "cancelled", cancelled_at: "2026-02-01T00:00:00Z" });
    const fe = context({ allocationRecords: [planned, done, cancelled] }).fields[0];

    expect(fe.plannedApplications).toHaveLength(1);
    expect(fe.plannedApplications[0]).toMatchObject({ basis: "planned", allocationId: "sa-plan", plannedPhysicalVolumeM3: 120, plannedDate: { state: "known", value: "2026-04-01" } });
    expect(fe.completedApplications).toHaveLength(1);
    expect(fe.completedApplications[0]).toMatchObject({ basis: "completed_actual", allocationId: "sa-done", actualPhysicalVolumeM3: { state: "known", value: 65 }, actualSpreadDate: { state: "known", value: "2026-02-20" } });
    // Only the planned allocation's store feeds the DM evidence.
    expect(fe.slurryDryMatter).toEqual({ state: "missing", reasonCode: "NO_RECORDED_SLURRY_COMPOSITION" });
  });

  it("O: a past application's method is never reused for a future planned application", () => {
    const done = record({ id: "sa-done", status: "completed", application_method: { value: "LESS", status: "farmer_adjusted", source: "Keith" }, actual_volume_m3: 50, actual_spread_date: "2026-02-20" });
    const future = record({ id: "sa-future", housing_id: "housing-1" });
    const fe = context({ allocationRecords: [done, future] }).fields[0];
    expect(fe.plannedApplications[0].plannedMethod).toEqual({ state: "missing", reasonCode: "PLANNED_METHOD_NOT_RECORDED" });
    // The completed allocation's method is labelled as planned, not observed.
    expect(fe.completedApplications[0].methodAsPlanned).toMatchObject({ state: "known", value: "LESS" });
    expect(fe.completedApplications[0]).not.toHaveProperty("actualMethod");
  });
});
