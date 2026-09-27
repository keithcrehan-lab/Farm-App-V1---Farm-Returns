import { afterEach, describe, expect, it, vi } from "vitest";

// Same mocking convention every other orchestration test file in this
// campaign already established — mock every real farm-data/orchestration
// I/O boundary this module touches, exercise its own real glue logic.
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry", () => ({ listSlurryAllocationsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry-composition", () => ({ listSlurryCompositionRecordsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/job-sessions", () => ({ getJobSessionById: vi.fn() }));
vi.mock("@/lib/farm-data/job-actuals", () => ({ getCurrentActualForJobSession: vi.fn() }));
vi.mock("@/lib/farm-data/decisions", () => ({ getDecisionById: vi.fn(), listDecisionsForFarm: vi.fn() }));
vi.mock("@/orchestration/lab-result", () => ({ getLabStatusForCompositeSample: vi.fn() }));
vi.mock("@/orchestration/fertiliser-plan", () => ({ getFieldRemainingFertiliserRequirement: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { listSlurryCompositionRecordsForFarm } from "@/lib/farm-data/slurry-composition";
import type { SlurryComposition } from "@/domain/slurry-composition";
import { getJobSessionById } from "@/lib/farm-data/job-sessions";
import { getCurrentActualForJobSession } from "@/lib/farm-data/job-actuals";
import { getDecisionById, listDecisionsForFarm } from "@/lib/farm-data/decisions";
import { getLabStatusForCompositeSample } from "@/orchestration/lab-result";
import { getFieldRemainingFertiliserRequirement } from "@/orchestration/fertiliser-plan";
import { buildScientificEvidenceReport, buildScientificEvidenceReportForField } from "./index";
import type { Farm, Field } from "@/domain/types";
import type { JobSessionRecord, JobActualRecord, DecisionRecord } from "@/lib/farm-data/mappers";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockListLivestockGroups = vi.mocked(listLivestockGroupsForFarm);
const mockListSlurryAllocations = vi.mocked(listSlurryAllocationsForFarm);
const mockListSlurryCompositionRecords = vi.mocked(listSlurryCompositionRecordsForFarm);
const mockGetJobSessionById = vi.mocked(getJobSessionById);
const mockGetCurrentActual = vi.mocked(getCurrentActualForJobSession);
const mockGetDecisionById = vi.mocked(getDecisionById);
const mockListDecisionsForFarm = vi.mocked(listDecisionsForFarm);
const mockGetLabStatus = vi.mocked(getLabStatusForCompositeSample);
const mockGetFieldRemainingFertiliserRequirement = vi.mocked(getFieldRemainingFertiliserRequirement);

afterEach(() => {
  vi.clearAllMocks();
});

const FARM_ID = "farm-1";
const FIELD_ID = "field-1";
const SESSION_ID = "session-1";

function farm(): Farm {
  return {
    id: FARM_ID,
    name: "Green Acres",
    location: { county: "Cork", centroid: [0, 0] },
    primaryEnterprises: [],
    units: "metric",
    ownerName: "Keith",
  };
}

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: FIELD_ID,
    farmId: FARM_ID,
    name: "Back Meadow",
    areaHa: 4.2,
    centroid: [0, 0],
    fertility: { pIndex: { value: 1, status: "verified", source: "Soil test" }, kIndex: { value: 1, status: "verified", source: "Soil test" } },
    ...overrides,
  } as Field;
}

function confirmedSession(overrides: Partial<JobSessionRecord> = {}): JobSessionRecord {
  return {
    id: SESSION_ID,
    farmId: FARM_ID,
    decisionId: "decision-plan-1",
    activityType: "soil_sampling",
    origin: "prompt",
    status: "confirmed_actual",
    primaryFieldId: FIELD_ID,
    fieldSegments: [],
    activeIntervals: [],
    interruptionGaps: [],
    createdAt: "2026-09-01T09:00:00Z",
    updatedAt: "2026-09-01T09:30:00Z",
    ...overrides,
  };
}

function confirmedActual(overrides: Partial<JobActualRecord> = {}): JobActualRecord {
  return {
    id: "actual-1",
    farmId: FARM_ID,
    jobSessionId: SESSION_ID,
    revision: 1,
    activityType: "soil_sampling",
    completionType: "whole",
    payload: { samplingZoneId: "zone-1", coreCount: 22, methodologyVersion: "soil_sampling_plan_v1.0.0", fieldIds: [FIELD_ID] },
    confirmedBy: "farmer",
    confirmedAt: "2026-09-01T09:30:00Z",
    createdAt: "2026-09-01T09:30:00Z",
    ...overrides,
  };
}

const REAL_LIVESTOCK_GROUPS = [
  {
    id: "g1",
    farmId: FARM_ID,
    category: "suckler_cow" as const,
    label: "Cows",
    count: { value: 20, status: "verified" as const, source: "Farmer" },
    system: "grazing" as const,
    value: { value: 30000, status: "estimated" as const, source: "Farm Return estimate" },
  },
];

function defaultMocks() {
  mockGetFarm.mockResolvedValue(farm());
  mockListFields.mockResolvedValue([field()]);
  mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS as never);
  mockListSlurryAllocations.mockResolvedValue([]);
  mockListSlurryCompositionRecords.mockResolvedValue([]);
  mockGetJobSessionById.mockResolvedValue(confirmedSession());
  mockGetCurrentActual.mockResolvedValue(confirmedActual());
  mockGetDecisionById.mockResolvedValue({
    id: "decision-plan-1",
    farmId: FARM_ID,
    promptId: "prompt-1",
    calculationKind: "soil_sampling_plan",
    estimateSnapshot: { status: "OK", value: {}, evidenceState: "MEASURED" },
    outcome: "accepted",
    decidedBy: "farmer",
    decidedAt: "2026-09-01T09:00:00Z",
    createdAt: "2026-09-01T09:00:00Z",
    inputsSnapshot: { zoneAreaHa: 4.2 },
  } as DecisionRecord);
  mockGetLabStatus.mockResolvedValue({});
  mockListDecisionsForFarm.mockResolvedValue({ decisions: [], truncated: false });
  mockGetFieldRemainingFertiliserRequirement.mockResolvedValue({
    requirementKgHa: { n: 35, p: 4, k: 0 },
    confirmedAppliedKgHa: { n: 0, p: 0, k: 0 },
    remainingKgHa: { n: 35, p: 4, k: 0 },
    confirmedApplications: 0,
    applicationsWithUnknownComposition: 0,
    applicationsExcludedMultiField: 0,
    truncated: false,
  });
}

describe("buildScientificEvidenceReport", () => {
  it("fails closed with not_found when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    const result = await buildScientificEvidenceReport(SESSION_ID);
    expect(result).toEqual({ status: "not_found", reasonCode: "NO_REAL_FARM_FOR_CURRENT_SESSION" });
  });

  it("fails closed with not_found when the job session does not exist on this farm", async () => {
    defaultMocks();
    mockGetJobSessionById.mockResolvedValue(null);
    const result = await buildScientificEvidenceReport(SESSION_ID);
    expect(result).toEqual({ status: "not_found", reasonCode: "JOB_SESSION_NOT_FOUND" });
  });

  it("fails closed with not_a_soil_sample for a session of a different real activity type — never presents a non-sample as a sample", async () => {
    defaultMocks();
    mockGetJobSessionById.mockResolvedValue(confirmedSession({ activityType: "fertiliser_spreading" }));
    const result = await buildScientificEvidenceReport(SESSION_ID);
    expect(result).toEqual({ status: "not_a_soil_sample", reasonCode: "NOT_A_SOIL_SAMPLING_SESSION" });
  });

  it("fails closed with not_confirmed for a soil_sampling session still in progress — never a report for an unconfirmed sample", async () => {
    defaultMocks();
    mockGetJobSessionById.mockResolvedValue(confirmedSession({ status: "active" }));
    const result = await buildScientificEvidenceReport(SESSION_ID);
    expect(result).toEqual({ status: "not_confirmed", reasonCode: "SAMPLE_NOT_YET_CONFIRMED" });
  });

  it("fails closed with not_confirmed when the confirmed Actual itself says did_not_happen", async () => {
    defaultMocks();
    mockGetCurrentActual.mockResolvedValue(confirmedActual({ completionType: "did_not_happen" }));
    const result = await buildScientificEvidenceReport(SESSION_ID);
    expect(result).toEqual({ status: "not_confirmed", reasonCode: "SAMPLE_NOT_YET_CONFIRMED" });
  });

  it("fails closed with not_found when the field no longer exists on this farm", async () => {
    defaultMocks();
    mockListFields.mockResolvedValue([]);
    const result = await buildScientificEvidenceReport(SESSION_ID);
    expect(result).toEqual({ status: "not_found", reasonCode: "FIELD_NOT_FOUND_ON_THIS_FARM" });
  });

  it("assembles the real composite sample and lab status from the real evidence chain, unmodified", async () => {
    defaultMocks();
    mockGetLabStatus.mockResolvedValue({
      labResult: { id: "lab-1", farmId: FARM_ID, jobSessionId: SESSION_ID, fieldId: FIELD_ID, laboratory: "Lab Co", labReportRef: "REF1", analysisDate: "2026-09-02", ph: 6.2, pMgL: 7.1, kMgL: 95, enteredBy: "farmer", enteredAt: "2026-09-02T10:00:00Z", createdAt: "2026-09-02T10:00:00Z" },
      interpretation: { labResultId: "lab-1", methodologyVersion: "soil_interpretation_v1.0.0", calculatedAt: "2026-09-02T10:00:00Z", pIndexOutcome: { status: "OK", value: 2, evidenceState: "MEASURED" }, pIndex: 2, pIndexConservativeTreatment: false, kIndex: 3, pH: 6.2, cropGroup: "grassland", soilMaterial: "mineral" },
    });

    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error(`expected a real report, got ${result.reasonCode}`);
    if (!result.compositeSample) throw new Error("expected a real composite sample for the GPS-guided report path");

    expect(result.compositeSample.jobSessionId).toBe(SESSION_ID);
    expect(result.compositeSample.coreCount).toBe(22);
    expect(result.labStatus.labResult?.id).toBe("lab-1");
    expect(result.labStatus.interpretation?.pIndex).toBe(2);
  });

  it("discloses fertilityBasisStatus: current when this exact sample is still the field's real active fertility evidence", async () => {
    defaultMocks();
    mockListFields.mockResolvedValue([
      field({ fertility: { pIndex: { value: 2, status: "verified", source: "Lab" }, kIndex: { value: 3, status: "verified", source: "Lab" }, verifiedTest: { sampleDate: "2026-09-02", laboratory: "Lab Co", sampleRef: "REF1", p: 7.1, k: 95, pH: 6.2, compositeSampleId: SESSION_ID, labResultId: "lab-1" } } }),
    ]);
    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    expect(result.fertilityBasisStatus).toBe("current");
  });

  // Codex audit HIGH (round 1): a different active test's own id alone
  // is never proof of anything about time order — only a real, later
  // `sampleDate` on the active evidence genuinely establishes
  // supersession.
  it("discloses fertilityBasisStatus: superseded_by_newer_test only when the active evidence has a real, later sample date — never from an id mismatch alone", async () => {
    defaultMocks();
    mockListFields.mockResolvedValue([
      field({ fertility: { pIndex: { value: 3, status: "verified", source: "Lab" }, kIndex: { value: 3, status: "verified", source: "Lab" }, verifiedTest: { sampleDate: "2026-10-01", laboratory: "Lab Co", sampleRef: "REF2", p: 9, k: 100, pH: 6.4, compositeSampleId: "session-2", labResultId: "lab-2" } } }),
    ]);
    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    expect(result.fertilityBasisStatus).toBe("superseded_by_newer_test");
  });

  it("discloses fertilityBasisStatus: unknown for a field with no active fertility evidence at all — never asserts 'superseded' without one", async () => {
    defaultMocks();
    mockListFields.mockResolvedValue([field({ fertility: { pIndex: { value: 1, status: "verified", source: "Lab" }, kIndex: { value: 1, status: "verified", source: "Lab" } } })]);
    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    expect(result.fertilityBasisStatus).toBe("unknown");
  });

  it("discloses fertilityBasisStatus: unknown for a real legacy/manual active test with no compositeSampleId link and no later date — never fabricates a 'superseded' claim it cannot back with dated proof", async () => {
    defaultMocks();
    mockListFields.mockResolvedValue([
      field({ fertility: { pIndex: { value: 2, status: "verified", source: "Farmer" }, kIndex: { value: 2, status: "verified", source: "Farmer" }, verifiedTest: { sampleDate: "2026-08-01", laboratory: "Legacy Lab", sampleRef: "OLD-1", p: 6, k: 80, pH: 6.0 } } }),
    ]);
    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    expect(result.fertilityBasisStatus).toBe("unknown");
  });

  it("includes the field's real, current nutrient decision chain (requirement, net requirement, regulatory gates, product allocation) when evidence supports it", async () => {
    defaultMocks();
    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    expect(result.nutrientPlan).toBeDefined();
    expect(result.nutrientPlan?.requirement.status).toBe("estimated");
    expect(result.nutrientPlan?.netRequirement.status).toBe("estimated");
    expect(result.nutrientPlanUnavailableReason).toBeUndefined();
  });

  // Campaign A audit HIGH: recorded composition must reach both the
  // report's direct nutrient plan and its recomputed recommendation.
  it("Campaign A audit HIGH: conflicting recorded slurry composition blocks the report's nutrient plan and recommendation", async () => {
    defaultMocks();
    const method = { value: "splashplate" as const, status: "farmer_adjusted" as const, source: "Farmer" };
    mockListSlurryAllocations.mockResolvedValue([
      { fieldId: FIELD_ID, housingId: "h1", volumeM3: 50, applicationMethod: method },
      { fieldId: FIELD_ID, housingId: "h2", volumeM3: 50, applicationMethod: method },
    ]);
    const comp = (id: string, housingId: string, dmPct: number): SlurryComposition => ({
      id,
      farmId: FARM_ID,
      housingId,
      slurryType: "cattle_slurry",
      status: "verified",
      dmPct,
      sampleDate: "2026-02-10",
      source: "Laboratory report",
      recordedAt: "2026-02-11T09:00:00Z",
    });
    mockListSlurryCompositionRecords.mockResolvedValue([comp("c1", "h1", 4), comp("c2", "h2", 7)]);

    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    expect(mockListSlurryCompositionRecords).toHaveBeenCalledWith(FARM_ID);
    expect(result.nutrientPlan?.organicApplication.availableNutrientAssessment.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(result.productAllocationKgField ?? []).toEqual([]);
    expect(result.currentRecommendation).toBeUndefined();
    expect(result.fieldFertiliserStatus).toEqual({ status: "blocked", reasonCode: "SLURRY_COMPOSITION_SOURCES_UNRESOLVED" });
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2): `listFieldsForFarm` returns every field regardless of
  // `archivedAt` — a real archived field's own area must never dilute
  // the farm-wide grassland-area/stocking-rate denominator the
  // "current" nutrient plan in this report is computed from.
  it("excludes a real archived field's area from the current nutrient plan's stocking-rate denominator", async () => {
    defaultMocks();
    const baseline = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in baseline) throw new Error("expected a real report");

    // A huge archived field — if wrongly included, would drastically
    // dilute the farm's real grassland-area denominator and change the
    // stocking-rate-driven N requirement.
    mockListFields.mockResolvedValue([field(), field({ id: "archived-field", areaHa: 500, archivedAt: "2026-09-01T00:00:00Z" })]);
    const withArchivedField = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in withArchivedField) throw new Error("expected a real report");

    expect(withArchivedField.nutrientPlan?.requirement.value).toEqual(baseline.nutrientPlan?.requirement.value);

    // Proves the assertion above is meaningful — a real ACTIVE field of
    // the same huge area genuinely does change the result, so "no
    // change" for the archived case is real exclusion, not insensitivity.
    mockListFields.mockResolvedValue([field(), field({ id: "active-field", areaHa: 500 })]);
    const withActiveField = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in withActiveField) throw new Error("expected a real report");
    expect(withActiveField.nutrientPlan?.requirement.value).not.toEqual(baseline.nutrientPlan?.requirement.value);
  });

  it("discloses the real, honest unavailable reason instead of a fabricated nutrient plan when this field's own evidence cannot support one", async () => {
    defaultMocks();
    mockListFields.mockResolvedValue([field({ fertility: {} })]);
    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    expect(result.nutrientPlan).toBeUndefined();
    expect(result.nutrientPlanUnavailableReason).toBeTruthy();
    expect(result.productAllocationKgField).toBeUndefined();
  });

  it("multiplies the real per-ha product allocation out to this field's real areaHa — kg/field, never a second independently-derived figure", async () => {
    defaultMocks();
    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    if (!result.nutrientPlan) throw new Error("expected a real nutrient plan");
    expect(result.productAllocationKgField).toEqual(result.nutrientPlan.purchasedProducts.map((p) => ({ product: p.name, totalKg: p.totalKg })));
  });

  // Codex audit round 5 HIGH — a report for a since-archived TARGET
  // field must never compute/expose a "current" nutrient plan/
  // recommendation for it, while real HISTORICAL sections (accepted
  // plans genuinely made while the field was active) remain visible.
  it("suppresses current planning sections but keeps real historical acceptedPlans for an archived target field", async () => {
    defaultMocks();
    mockListFields.mockResolvedValue([field({ archivedAt: "2026-09-01T00:00:00Z" })]);
    mockListDecisionsForFarm.mockResolvedValue({
      decisions: [
        { id: "d1", farmId: FARM_ID, fieldId: FIELD_ID, promptId: "p1", calculationKind: "fertiliser_recommendation", estimateSnapshot: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" }, outcome: "accepted", decidedBy: "farmer", decidedAt: "2026-05-01T09:00:00Z", createdAt: "2026-05-01T09:00:00Z" },
      ] as DecisionRecord[],
      truncated: false,
    });

    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");

    expect(result.nutrientPlan).toBeUndefined();
    expect(result.productAllocationKgField).toBeUndefined();
    expect(result.currentRecommendation).toBeUndefined();
    expect(result.fieldFertiliserStatus).toEqual({ status: "blocked", reasonCode: "FIELD_ARCHIVED" });
    expect(result.nutrientPlanUnavailableReason).toMatch(/archived/i);
    // Real historical record is genuinely unaffected.
    expect(result.acceptedPlans.map((d) => d.id)).toEqual(["d1"]);
    // getFieldRemainingFertiliserRequirement (a "current" calculation)
    // must never even be called for an archived field.
    expect(mockGetFieldRemainingFertiliserRequirement).not.toHaveBeenCalled();
  });

  it("includes only this field's real, accepted fertiliser_recommendation Decisions — never another field's or another kind's", async () => {
    defaultMocks();
    mockListDecisionsForFarm.mockResolvedValue({
      decisions: [
        { id: "d1", farmId: FARM_ID, fieldId: FIELD_ID, promptId: "p1", calculationKind: "fertiliser_recommendation", estimateSnapshot: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" }, outcome: "accepted", decidedBy: "farmer", decidedAt: "2026-09-03T00:00:00Z", createdAt: "2026-09-03T00:00:00Z" },
        { id: "d2", farmId: FARM_ID, fieldId: "field-2", promptId: "p2", calculationKind: "fertiliser_recommendation", estimateSnapshot: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" }, outcome: "accepted", decidedBy: "farmer", decidedAt: "2026-09-03T00:00:00Z", createdAt: "2026-09-03T00:00:00Z" },
        { id: "d3", farmId: FARM_ID, fieldId: FIELD_ID, promptId: "p3", calculationKind: "fertiliser_recommendation", estimateSnapshot: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" }, outcome: "declined", decidedBy: "farmer", decidedAt: "2026-09-03T00:00:00Z", createdAt: "2026-09-03T00:00:00Z" },
        { id: "d4", farmId: FARM_ID, fieldId: FIELD_ID, promptId: "p4", calculationKind: "soil_sampling_plan", estimateSnapshot: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" }, outcome: "accepted", decidedBy: "farmer", decidedAt: "2026-09-03T00:00:00Z", createdAt: "2026-09-03T00:00:00Z" },
      ] as DecisionRecord[],
      truncated: false,
    });
    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    expect(result.acceptedPlans.map((d) => d.id)).toEqual(["d1"]);
  });

  // Codex audit HIGH (round 1): the farm-wide decisions read this
  // filters over its own real row cap — a truncation there could
  // silently exclude an older real accepted plan for this exact field
  // before the field filter ever runs, while the report's own doc
  // comment claims "every real" plan.
  it("discloses when the real farm-wide decisions read was truncated — acceptedPlans may understate the truth", async () => {
    defaultMocks();
    mockListDecisionsForFarm.mockResolvedValue({ decisions: [], truncated: true });
    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    expect(result.acceptedPlansTruncated).toBe(true);
  });

  it("carries the real requirement/confirmed/remaining kg/ha field status through unmodified, including its own real disclosures", async () => {
    defaultMocks();
    mockGetFieldRemainingFertiliserRequirement.mockResolvedValue({
      requirementKgHa: { n: 35, p: 4, k: 0 },
      confirmedAppliedKgHa: { n: 10, p: 0, k: 0 },
      remainingKgHa: { n: 25, p: 4, k: 0 },
      confirmedApplications: 1,
      applicationsWithUnknownComposition: 1,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });
    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    expect(result.fieldFertiliserStatus).toEqual({
      status: "ok",
      requirementKgHa: { n: 35, p: 4, k: 0 },
      confirmedAppliedKgHa: { n: 10, p: 0, k: 0 },
      remainingKgHa: { n: 25, p: 4, k: 0 },
      confirmedApplications: 1,
      applicationsWithUnknownComposition: 1,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });
  });

  it("reports fieldFertiliserStatus not_applicable for a real tillage field — never a fabricated grassland status", async () => {
    defaultMocks();
    mockListFields.mockResolvedValue([field({ plannedUse: { value: "tillage", status: "verified", source: "Farmer" } })]);
    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    expect(result.fieldFertiliserStatus).toEqual({ status: "not_applicable" });
  });

  it("reports fieldFertiliserStatus blocked with the real reason for a farm with no recorded livestock", async () => {
    defaultMocks();
    mockListLivestockGroups.mockResolvedValue([]);
    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    expect(result.fieldFertiliserStatus.status).toBe("blocked");
  });

  it("stamps a real generatedAt and the current report version — never omitted, never a fabricated placeholder", async () => {
    defaultMocks();
    const result = await buildScientificEvidenceReport(SESSION_ID);
    if ("reasonCode" in result) throw new Error("expected a real report");
    expect(result.reportVersion).toBe("scientific_evidence_report_v1.0.0");
    expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
  });
});

// Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
// F6/F10) — the legacy/manual entry path. Reuses `defaultMocks()` above
// for every real evidence-chain dependency (`buildFieldEvidenceSections`
// is the exact same code the GPS-guided path already exercises), only
// the field's own real `fertility.verifiedTest` differs.
describe("buildScientificEvidenceReportForField (Grassland Fertiliser Pilot Completion, Checkpoint B, audit finding F6/F10)", () => {
  function fieldWithVerifiedTest(overrides: Partial<Field> = {}): Field {
    return field({
      fertility: {
        pIndex: { value: 2, status: "verified", source: "Lab" },
        kIndex: { value: 3, status: "verified", source: "Lab" },
        verifiedTest: {
          sampleDate: "2026-08-20",
          laboratory: "Southern Agri Labs",
          sampleRef: "SAL-2026-0113",
          p: 8.16,
          k: 95.4,
          pH: 6.23,
          limeRequirement: 2.5,
        },
      },
      ...overrides,
    });
  }

  it("returns not_found when there is no real farm for the current session", async () => {
    defaultMocks();
    mockGetFarm.mockResolvedValue(undefined as never);
    const result = await buildScientificEvidenceReportForField(FIELD_ID);
    expect(result).toEqual({ status: "not_found", reasonCode: "NO_REAL_FARM_FOR_CURRENT_SESSION" });
  });

  it("returns not_found when the field does not belong to this farm — never leaks another farm's field", async () => {
    defaultMocks();
    mockListFields.mockResolvedValue([]);
    const result = await buildScientificEvidenceReportForField(FIELD_ID);
    expect(result).toEqual({ status: "not_found", reasonCode: "FIELD_NOT_FOUND_ON_THIS_FARM" });
  });

  // Codex audit round 3 HIGH — an archived field must never receive a
  // "current" nutrient plan/recommendation; this entry point has no
  // historical anchor (unlike the GPS-guided path) to justify rendering
  // one for a field no longer part of any real farm-wide calculation.
  it("rejects an archived field outright — never generates a 'current' recommendation for a field excluded from every farm-wide calculation", async () => {
    defaultMocks();
    mockListFields.mockResolvedValue([field({ archivedAt: "2026-09-01T00:00:00Z", fertility: fieldWithVerifiedTest().fertility })]);
    const result = await buildScientificEvidenceReportForField(FIELD_ID);
    expect(result).toEqual({ status: "not_found", reasonCode: "FIELD_ARCHIVED" });
  });

  it("returns not_confirmed with a real reason when the field has no real soil test on file — never fabricates one", async () => {
    defaultMocks();
    mockListFields.mockResolvedValue([field()]);
    const result = await buildScientificEvidenceReportForField(FIELD_ID);
    expect(result).toEqual({ status: "not_confirmed", reasonCode: "NO_REAL_SOIL_TEST_ON_FILE" });
  });

  it("builds a real report from the field's own verifiedTest — manualEntry populated, compositeSample absent, interpretation recomputed via interpretLabResult (not a second engine)", async () => {
    defaultMocks();
    mockListFields.mockResolvedValue([fieldWithVerifiedTest()]);

    const result = await buildScientificEvidenceReportForField(FIELD_ID);
    if ("reasonCode" in result) throw new Error(`expected a real report, got ${result.reasonCode}`);

    expect(result.compositeSample).toBeUndefined();
    expect(result.manualEntry).toEqual({
      sampleRef: "SAL-2026-0113",
      sampleDate: "2026-08-20",
      laboratory: "Southern Agri Labs",
      pH: 6.23,
      p: 8.16,
      k: 95.4,
      limeRequirement: 2.5,
    });
    // Recomputed from the raw mg/l values, never rounded — same "never
    // trust a persisted derived value" discipline as the GPS path.
    expect(result.labStatus.interpretation?.pH).toBe(6.23);
    expect(result.labStatus.labResult).toBeUndefined();
    expect(result.fertilityBasisStatus).toBe("current");
    // The shared tail (nutrient plan, product allocation, field status)
    // is the exact same real code path — proven here by the same real
    // fieldFertiliserStatus shape the GPS-path tests above assert.
    expect(result.fieldFertiliserStatus.status).toBe("ok");
    expect(result.acceptedPlansTruncated).toBe(false);
  });
});
