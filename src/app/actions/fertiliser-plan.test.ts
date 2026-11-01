import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fertiliser Vertical campaign — direct tests for the three new
 * fertiliser-plan actions at their own real boundary (mocking only the
 * farm-data reads/writes, exercising the real filtering/validation logic
 * in this file itself). Same mocking convention `decisions.test.ts`
 * already established.
 */
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/decisions", () => ({ listDecisionsForFarm: vi.fn(), getDecisionById: vi.fn() }));
vi.mock("@/lib/farm-data/job-sessions", () => ({ listJobSessionDecisionIdsForFarm: vi.fn(), getJobSessionById: vi.fn() }));
vi.mock("@/lib/farm-data/livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry", () => ({ listSlurryAllocationsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/housing", () => ({ listHousingForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry-composition", () => ({ listSlurryCompositionRecordsForFarm: vi.fn(async () => []) }));
vi.mock("@/lib/farm-data/grazing-field-sessions", () => ({ listGrazingFieldSessionsForFarm: vi.fn(async () => []) }));
vi.mock("@/orchestration/job-session", () => ({ startJobSessionFromPlan: vi.fn() }));
// `sanitiseDecisionRecordForClient` is a real, pure, no-I/O function
// (Codex audit CRITICAL, round 8) — imported from the real module
// rather than mocked, alongside the two real I/O functions this file's
// own tests still need mocked.
vi.mock("@/orchestration/fertiliser-plan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/orchestration/fertiliser-plan")>();
  return { ...actual, getFieldRemainingFertiliserRequirement: vi.fn(), getFarmFertiliserDemand: vi.fn() };
});
vi.mock("@/lib/farm-data/field-production-cycles", () => ({ getFieldProductionCycle: vi.fn(async () => null), listFieldProductionCyclesForSeason: vi.fn(async () => []) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listDecisionsForFarm, getDecisionById } from "@/lib/farm-data/decisions";
import { listJobSessionDecisionIdsForFarm, getJobSessionById } from "@/lib/farm-data/job-sessions";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { listSlurryCompositionRecordsForFarm } from "@/lib/farm-data/slurry-composition";
import { listGrazingFieldSessionsForFarm } from "@/lib/farm-data/grazing-field-sessions";
import { getFieldProductionCycle, listFieldProductionCyclesForSeason } from "@/lib/farm-data/field-production-cycles";
import { startJobSessionFromPlan } from "@/orchestration/job-session";
import { getFieldRemainingFertiliserRequirement, getFarmFertiliserDemand } from "@/orchestration/fertiliser-plan";
import {
  getMatchablePlanForFieldAction,
  startJobSessionFromPlanAction,
  getLinkedFertiliserPlanForJobSessionAction,
  getFieldFertiliserStatusAction,
  getFarmFertiliserDemandAction,
  previewSlurryFirstFertiliserPlanAction,
  getFarmLimeRequirementAction,
} from "./fertiliser-plan";
import type { Farm, Field } from "@/domain/types";
import type { FieldProductionCycle } from "@/domain/fertiliser-field-evidence";
import type { DecisionRecord, JobSessionRecord } from "@/lib/farm-data/mappers";
import { aggregateFarmFertiliserPurchasing } from "@/domain/fertiliser-plan";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockListDecisions = vi.mocked(listDecisionsForFarm);
const mockGetDecisionById = vi.mocked(getDecisionById);
const mockListJobSessionDecisionIds = vi.mocked(listJobSessionDecisionIdsForFarm);
const mockGetJobSessionById = vi.mocked(getJobSessionById);
const mockStartJobSessionFromPlan = vi.mocked(startJobSessionFromPlan);
const mockListLivestockGroups = vi.mocked(listLivestockGroupsForFarm);
const mockListSlurryAllocations = vi.mocked(listSlurryAllocationsForFarm);
const mockListHousing = vi.mocked(listHousingForFarm);
const mockListSlurryCompositionRecords = vi.mocked(listSlurryCompositionRecordsForFarm);
const mockListGrazingFieldSessions = vi.mocked(listGrazingFieldSessionsForFarm);
const mockGetFieldProductionCycle = vi.mocked(getFieldProductionCycle);
const mockListFieldProductionCyclesForSeason = vi.mocked(listFieldProductionCyclesForSeason);
const mockGetFieldRemainingFertiliserRequirement = vi.mocked(getFieldRemainingFertiliserRequirement);
const mockGetFarmFertiliserDemand = vi.mocked(getFarmFertiliserDemand);

afterEach(() => {
  vi.clearAllMocks();
  mockGetFieldProductionCycle.mockResolvedValue(null);
  mockListFieldProductionCyclesForSeason.mockResolvedValue([]);
  mockListGrazingFieldSessions.mockResolvedValue([]);
});

const farm: Farm = {
  id: "farm-1",
  name: "Green Acres",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: [],
  units: "metric",
  ownerName: "Keith",
};

function field(overrides: Partial<Field> = {}): Field {
  return { id: "field-1", farmId: "farm-1", name: "Back Meadow", areaHa: 4.2, centroid: [0, 0], fertility: {}, ...overrides } as Field;
}

// A field with real soil evidence — used wherever a test needs
// `promptForFertiliserRecommendation`'s own live recompute to actually
// reach `OK` (Codex audit CRITICAL, round 7: `getMatchablePlanForFieldAction`/
// `startJobSessionFromPlanAction` now both recompute this before treating
// a plan as matchable/startable — see `isPlanStillCurrentlyRecommendable`'s
// own doc comment in `./fertiliser-plan.ts`).
function fertiliserField(overrides: Partial<Field> = {}): Field {
  return field({
    fertility: { pIndex: { value: 1, status: "verified", source: "Soil test" }, kIndex: { value: 1, status: "verified", source: "Soil test" } },
    ...overrides,
  });
}

function p3Field(overrides: Partial<Field> = {}): Field {
  return field({
    fertility: {
      pIndex: { value: 1, status: "verified", source: "Soil test" },
      kIndex: { value: 1, status: "verified", source: "Soil test" },
      verifiedTest: { sampleDate: "2026-01-10", laboratory: "Lab", sampleRef: "S1", p: 4, k: 90, pH: 6.3 },
    },
    commonageStatus: { value: "not_commonage", status: "verified", source: "Farmer" },
    waterBufferContext: {
      value: { featureType: "surface_water", distanceM: 10, localOverrideStatus: "verified_none" },
      status: "verified",
      source: "Farmer",
    },
    ...overrides,
  });
}

function p3GrazingCycle(fieldId = "field-1"): FieldProductionCycle {
  return {
    id: `cycle-${fieldId}`,
    fieldId,
    season: "2026",
    cropSystem: "GRASS_GRAZING",
    status: "active",
    evidence: {
      cropSystem: { value: "GRASS_GRAZING", method: "FARMER_DECLARED", source: "Keith" },
      grazingProductionSystem: { value: "SUCKLER_CALF_TO_BEEF", method: "FARMER_DECLARED", source: "Keith" },
      chemicalNAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Keith" },
      chemicalPAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Keith" },
      chemicalKAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Keith" },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function p3FirstCutCycle(overrides: Partial<FieldProductionCycle> = {}): FieldProductionCycle {
  return {
    id: "cycle-1",
    fieldId: "field-1",
    season: "2026",
    cropSystem: "GRASS_FIRST_CUT_SILAGE",
    status: "active",
    evidence: {
      cropSystem: { value: "GRASS_FIRST_CUT_SILAGE", method: "FARMER_DECLARED", source: "Keith" },
      productionTargetTDMHa: { value: 5, method: "FARMER_DECLARED", source: "Keith" },
      chemicalNAppliedKgHa: { value: 10, method: "FARMER_DECLARED", source: "Keith" },
      chemicalPAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Keith" },
      chemicalKAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Keith" },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const REAL_LIVESTOCK_GROUPS = [
  {
    id: "g1",
    farmId: "farm-1",
    category: "suckler_cow" as const,
    label: "Cows",
    count: { value: 20, status: "verified" as const, source: "Farmer" },
    system: "grazing" as const,
    value: { value: 30000, status: "estimated" as const, source: "Farm Return estimate" },
  },
];

function plan(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: "decision-plan-1",
    farmId: "farm-1",
    promptId: "prompt-1",
    calculationKind: "fertiliser_recommendation",
    fieldId: "field-1",
    estimateSnapshot: {
      status: "OK",
      value: { fieldId: "field-1", areaHa: 4.2, products: [{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7, costEur: 165 }] },
      evidenceState: "IRISH_MODEL",
    },
    outcome: "accepted",
    decidedBy: "farmer",
    decidedAt: "2026-09-01T09:00:00Z",
    createdAt: "2026-09-01T09:00:00Z",
    ...overrides,
  };
}

describe("getMatchablePlanForFieldAction", () => {
  it("rejects when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(getMatchablePlanForFieldAction("field-1")).rejects.toThrow(/no real farm/i);
  });

  it("returns 'none' when no accepted fertiliser plan exists for this field", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "none" });
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2): an archived field must never be matchable — it should behave
  // exactly as if the field genuinely doesn't exist any more.
  it("returns 'none' for a real archived field, even with a real accepted plan on record — an archived field is never matchable", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field({ archivedAt: "2026-09-01T00:00:00Z" })]);
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "none" });
  });

  it("returns the single real matchable plan when exactly one unlinked accepted plan exists for this field", async () => {
    mockGetFarm.mockResolvedValue(farm);
    // Codex audit CRITICAL (round 7): a real, currently-recommendable
    // field/herd is required — `getMatchablePlanForFieldAction` now
    // recomputes the field's own live recommendation before treating any
    // candidate as matchable (see `isPlanStillCurrentlyRecommendable`).
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    // Codex audit CRITICAL (round 7): the returned plan's own products
    // are sanitised of their real per-product mock `costEur` too — see
    // `sanitiseDecisionRecordForClient`.
    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({
      status: "matched",
      plan: {
        ...plan(),
        estimateSnapshot: {
          status: "OK",
          value: { fieldId: "field-1", areaHa: 4.2, products: [{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7 }] },
          evidenceState: "IRISH_MODEL",
        },
      },
    });
  });

  it("returns 'ambiguous' — never auto-selects — when more than one real plan matches this field", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({
      decisions: [plan({ id: "decision-plan-1" }), plan({ id: "decision-plan-2" })],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "ambiguous", candidateCount: 2 });
  });

  it("excludes a plan already linked to a job session — never a second, competing link to the same real plan", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(["decision-plan-1"]), truncated: false });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "none" });
  });

  it("excludes a dismissed decision and a decision for a different field/calculationKind — never a false match", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({
      decisions: [
        plan({ id: "d-dismissed", outcome: "dismissed" }),
        plan({ id: "d-other-field", fieldId: "field-2" }),
        plan({ id: "d-other-kind", calculationKind: "commonage_status" }),
      ],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "none" });
  });

  // Codex audit HIGH (round 4) — a bare acceptance of a multi-product
  // recommendation can never safely stand in for one GPS-detected job.
  it("excludes a bare-accepted plan representing more than one real product — never GPS-matchable, no farmer-chosen single product exists", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({
      decisions: [
        plan({
          outcome: "accepted",
          estimateSnapshot: {
            status: "OK",
            value: {
              fieldId: "field-1",
              products: [
                { name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7, costEur: 165 },
                { name: "Protected Urea", npkAnalysis: "46-0-0", rateKgHa: 50, totalKg: 200, costEur: 111 },
              ],
            },
            evidenceState: "IRISH_MODEL",
          },
        }),
      ],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "none" });
  });

  it("still matches a multi-product recommendation once the farmer has explicitly chosen a single planned product (an 'edited' plan)", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    const multiProductEditedPlan = plan({
      outcome: "edited",
      edits: { plannedProduct: "Protected Urea", plannedQuantityKg: 200 },
      estimateSnapshot: {
        status: "OK",
        value: {
          fieldId: "field-1",
          products: [
            { name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7, costEur: 165 },
            { name: "Protected Urea", npkAnalysis: "46-0-0", rateKgHa: 50, totalKg: 200, costEur: 111 },
          ],
        },
        evidenceState: "IRISH_MODEL",
      },
    });
    mockListDecisions.mockResolvedValue({ decisions: [multiProductEditedPlan], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    // Codex audit CRITICAL (round 7): products sanitised of their real
    // per-product mock `costEur` — see `sanitiseDecisionRecordForClient`.
    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({
      status: "matched",
      plan: {
        ...multiProductEditedPlan,
        estimateSnapshot: {
          status: "OK",
          value: {
            fieldId: "field-1",
            products: [
              { name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7 },
              { name: "Protected Urea", npkAnalysis: "46-0-0", rateKgHa: 50, totalKg: 200 },
            ],
          },
          evidenceState: "IRISH_MODEL",
        },
      },
    });
  });

  // Codex audit CRITICAL (round 7): a plan persisted before the field
  // became tillage (or before this campaign's own tillage gate existed)
  // must not remain matchable once the field's *current* state no
  // longer supports a real recommendation — its own frozen snapshot
  // once being "OK" is not enough.
  it("excludes a real, single-product, unlinked plan whose field is now tillage — no longer currently recommendable", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField({ plannedUse: { value: "tillage", status: "verified", source: "Farmer" } })]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "none" });
  });

  it("excludes a real, single-product, unlinked plan whose farm no longer has any recorded livestock", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "none" });
  });

  // Codex audit HIGH (round 9, revised round 10 — the prior rejection is
  // withdrawn): the field still has *some* real, current "OK"
  // recommendation, but the stored plan's own selected product is no
  // longer among it — the live blend changed (e.g. new soil/slurry
  // evidence) since the plan was made. This is a distinct check from
  // quantity independence (round 9's own still-valid point, untouched
  // here): the plan's *product* must still be real and current, its
  // *quantity* never needs to match.
  it("excludes a real, single-product, unlinked plan whose own selected product is no longer part of the field's current live recommendation", async () => {
    mockGetFarm.mockResolvedValue(farm);
    // fertiliserField() (Index 1/1, 4.2 ha) + 20 cows, no slurry -> the
    // real, current live recommendation is ["0-7-30", "18-6-12",
    // "Protected Urea"] — verified directly against
    // calculateNutrientPlan for this exact fixture combination.
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({
      decisions: [
        plan({
          estimateSnapshot: {
            status: "OK",
            // "CAN 27%" is not one of this app's own catalogue products
            // at all (the same fixture `validateFertiliserPlanEdits`'s
            // own tests already use as "a completely fabricated
            // product") — genuinely not part of any live recommendation.
            value: { fieldId: "field-1", products: [{ name: "CAN 27%", npkAnalysis: "27-0-0", rateKgHa: 40, totalKg: 160 }] },
            evidenceState: "IRISH_MODEL",
          },
        }),
      ],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "none" });
  });

  it("still matches when the stored plan's own selected product remains part of the field's current live recommendation", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    // The real, unmodified plan() fixture names "18-6-12" — genuinely
    // still part of this exact fixture's real current live blend.
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    const result = await getMatchablePlanForFieldAction("field-1");
    expect(result.status).toBe("matched");
  });
});

describe("startJobSessionFromPlanAction", () => {
  const stubbedJobSession = { id: "session-1" } as JobSessionRecord;

  // Codex audit HIGH (round 32): this action now re-verifies the real
  // statutory closed-period calendar at execution time, which reads the
  // real wall-clock date — every other test in this block needs a fixed
  // "clearly open" date so it doesn't start silently failing once the
  // real calendar date passes into `farm`'s (Cork, Zone A) chemical-
  // fertiliser closed period (15 Sep - 29 Jan).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T09:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects any activityType other than fertiliser_spreading — never links a fertiliser plan to an unrelated job type", async () => {
    mockGetFarm.mockResolvedValue(farm);
    await expect(
      // @ts-expect-error deliberately testing a runtime-only invalid value a direct caller could still send
      startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "slurry_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/must be "fertiliser_spreading"/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(
      startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/no real farm/i);
  });

  it("rejects a fieldId not on this farm's own real fields", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field({ id: "field-1" })]);

    await expect(
      startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "someone-elses-field", activityType: "fertiliser_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/not found/i);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2): a new job session must never be startable against a field the
  // farmer has archived — the same "not found" failure a genuinely
  // deleted field would produce.
  it("rejects a real archived field — never starts a new job session against it", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field({ id: "field-1", archivedAt: "2026-09-01T00:00:00Z" })]);

    await expect(
      startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/not found/i);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects a planDecisionId not found on this farm's own real decisions", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });

    await expect(
      startJobSessionFromPlanAction({ planDecisionId: "nonexistent", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/not found/i);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects a dismissed plan — only accepted/edited plans can start a job", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({ decisions: [plan({ outcome: "dismissed" })], truncated: false });

    await expect(
      startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/only an accepted\/edited plan/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects a decision that is not a real fertiliser plan", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({ decisions: [plan({ calculationKind: "commonage_status" })], truncated: false });

    await expect(
      startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/not a real fertiliser plan/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects a plan for a different field than requested — never links a mismatched field", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field({ id: "field-1" }), field({ id: "field-2" })]);
    mockListDecisions.mockResolvedValue({ decisions: [plan({ fieldId: "field-2" })], truncated: false });

    await expect(
      startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/different field/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects a plan already linked to a job session — defense in depth on top of the database's own unique constraint", async () => {
    mockGetFarm.mockResolvedValue(farm);
    // Codex audit CRITICAL (round 7): a real, currently-recommendable
    // field/herd is required to reach this check at all — see
    // `isPlanStillCurrentlyRecommendable`.
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(["decision-plan-1"]), truncated: false });

    await expect(
      startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/already linked/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects starting the job during the farm county's real statutory closed period for chemical fertiliser — re-verified at this real execution boundary, not trusted from the plan's own recompute alone", async () => {
    vi.setSystemTime(new Date("2026-10-01T09:00:00.000Z")); // Cork (Zone A) chemical-fertiliser closed period: 15 Sep - 29 Jan
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    await expect(
      startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/cannot start this job/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("starts a real job session from a real, valid, unlinked accepted plan", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });
    mockStartJobSessionFromPlan.mockResolvedValue({ decision: plan(), jobSession: stubbedJobSession });

    const result = await startJobSessionFromPlanAction({
      planDecisionId: "decision-plan-1",
      fieldId: "field-1",
      activityType: "fertiliser_spreading",
      jobSessionId: "session-1",
    });

    expect(mockStartJobSessionFromPlan).toHaveBeenCalledWith(
      expect.objectContaining({ planDecision: plan(), activityType: "fertiliser_spreading", jobSessionId: "session-1", primaryFieldId: "field-1" }),
    );
    expect(result.jobSession).toBe(stubbedJobSession);
  });

  // Codex audit HIGH (round 4) — defense in depth: a direct caller
  // bypassing getMatchablePlanForFieldAction's own identical check must
  // still be refused.
  it("rejects starting a job from a bare-accepted plan representing more than one real product — never safely executable as one job", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({
      decisions: [
        plan({
          outcome: "accepted",
          estimateSnapshot: {
            status: "OK",
            value: {
              fieldId: "field-1",
              products: [
                { name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7, costEur: 165 },
                { name: "Protected Urea", npkAnalysis: "46-0-0", rateKgHa: 50, totalKg: 200, costEur: 111 },
              ],
            },
            evidenceState: "IRISH_MODEL",
          },
        }),
      ],
      truncated: false,
    });

    await expect(
      startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/more than one product/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("also accepts an 'edited' plan (a farmer-adjusted quantity/product/date), not only 'accepted'", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({ decisions: [plan({ outcome: "edited", edits: { plannedQuantityKg: 240 } })], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });
    mockStartJobSessionFromPlan.mockResolvedValue({ decision: plan(), jobSession: stubbedJobSession });

    await startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" });
    expect(mockStartJobSessionFromPlan).toHaveBeenCalledTimes(1);
  });

  // Codex audit CRITICAL (round 7): defense in depth on top of
  // `getMatchablePlanForFieldAction`'s own identical check — a direct
  // caller bypassing the UI's own matching lookup must not be able to
  // start a job from a plan whose field is no longer currently
  // recommendable either.
  it("rejects starting a job from a plan whose field is now tillage — no longer currently recommendable", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField({ plannedUse: { value: "tillage", status: "verified", source: "Farmer" } })]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });

    await expect(
      startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/no longer currently recommendable/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("rejects starting a job from a plan whose farm no longer has any recorded livestock", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });

    await expect(
      startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/no longer currently recommendable/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });
});

describe("getLinkedFertiliserPlanForJobSessionAction", () => {
  it("rejects when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(getLinkedFertiliserPlanForJobSessionAction("session-1")).rejects.toThrow(/no real farm/i);
  });

  it("returns null when the job session doesn't exist on this farm", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue(null);
    await expect(getLinkedFertiliserPlanForJobSessionAction("session-1")).resolves.toBeNull();
  });

  it("returns null for a non-'plan'-origin job session — nothing genuine to prefill from", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({ id: "session-1", farmId: "farm-1", decisionId: "d1", activityType: "fertiliser_spreading", origin: "manual", status: "active", fieldSegments: [], activeIntervals: [], interruptionGaps: [], createdAt: "x", updatedAt: "x" });
    await expect(getLinkedFertiliserPlanForJobSessionAction("session-1")).resolves.toBeNull();
  });

  it("returns null when the linked decision is not a real fertiliser plan", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({ id: "session-1", farmId: "farm-1", decisionId: "decision-plan-1", activityType: "fertiliser_spreading", origin: "plan", status: "active", fieldSegments: [], activeIntervals: [], interruptionGaps: [], createdAt: "x", updatedAt: "x" });
    mockGetDecisionById.mockResolvedValue(plan({ calculationKind: "commonage_status" }));
    await expect(getLinkedFertiliserPlanForJobSessionAction("session-1")).resolves.toBeNull();
  });

  it("returns null when the linked decision id does not resolve to any real decision on this farm", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({ id: "session-1", farmId: "farm-1", decisionId: "decision-plan-1", activityType: "fertiliser_spreading", origin: "plan", status: "active", fieldSegments: [], activeIntervals: [], interruptionGaps: [], createdAt: "x", updatedAt: "x" });
    mockGetDecisionById.mockResolvedValue(null);
    await expect(getLinkedFertiliserPlanForJobSessionAction("session-1")).resolves.toBeNull();
  });

  it("returns the real recommended products plus the farmer's own real planned edits for a genuine 'plan'-origin session — via a real, uncapped single-decision lookup, never the capped history list", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({ id: "session-1", farmId: "farm-1", decisionId: "decision-plan-1", activityType: "fertiliser_spreading", origin: "plan", status: "active", fieldSegments: [], activeIntervals: [], interruptionGaps: [], createdAt: "x", updatedAt: "x" });
    mockGetDecisionById.mockResolvedValue(plan({ outcome: "edited", edits: { plannedProduct: "18-6-12", plannedQuantityKg: 240, plannedDate: "2026-09-20" } }));

    // Codex audit CRITICAL (round 7): `recommendedProducts` is sanitised
    // of its real per-product mock `costEur`, defensively, regardless of
    // whether the persisted snapshot predates round 6's own fix.
    await expect(getLinkedFertiliserPlanForJobSessionAction("session-1")).resolves.toEqual({
      decisionId: "decision-plan-1",
      fieldId: "field-1",
      recommendedProducts: [{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7 }],
      plannedProduct: "18-6-12",
      plannedQuantityKg: 240,
      plannedDate: "2026-09-20",
    });
    expect(mockGetDecisionById).toHaveBeenCalledWith("farm-1", "decision-plan-1");
    expect(mockListDecisions).not.toHaveBeenCalled();
  });

  it("falls back to the single-product recommendation's own real product/quantity for a plan accepted as-is (no farmer edit) — Codex audit HIGH, round 14", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({ id: "session-1", farmId: "farm-1", decisionId: "decision-plan-1", activityType: "fertiliser_spreading", origin: "plan", status: "active", fieldSegments: [], activeIntervals: [], interruptionGaps: [], createdAt: "x", updatedAt: "x" });
    mockGetDecisionById.mockResolvedValue(plan());

    // "Accept as recommended" for a single-product recommendation is
    // already treated elsewhere (Planned demand, GPS matching/starting)
    // as authoritative enough to execute — Confirm Actual must prefill
    // the identical real product/quantity, not leave a farmer to confirm
    // an unresolved-composition Actual. `plannedDate` genuinely has no
    // fallback (no real "planned date" exists anywhere but a farmer's
    // own explicit edit), so it correctly stays undefined.
    const result = await getLinkedFertiliserPlanForJobSessionAction("session-1");
    expect(result?.plannedProduct).toBe("18-6-12");
    expect(result?.plannedQuantityKg).toBe(266.7);
    expect(result?.plannedDate).toBeUndefined();
  });

  it("does not fall back to a recommended quantity for a multi-product recommendation accepted as-is (no unambiguous single product)", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({ id: "session-1", farmId: "farm-1", decisionId: "decision-plan-1", activityType: "fertiliser_spreading", origin: "plan", status: "active", fieldSegments: [], activeIntervals: [], interruptionGaps: [], createdAt: "x", updatedAt: "x" });
    mockGetDecisionById.mockResolvedValue(
      plan({
        estimateSnapshot: {
          status: "OK",
          value: {
            fieldId: "field-1",
            areaHa: 4.2,
            products: [
              { name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7, costEur: 165 },
              { name: "Protected Urea", npkAnalysis: "46-0-0", rateKgHa: 20, totalKg: 84, costEur: 40 },
            ],
          },
          evidenceState: "IRISH_MODEL",
        },
      }),
    );

    const result = await getLinkedFertiliserPlanForJobSessionAction("session-1");
    expect(result?.plannedProduct).toBeUndefined();
    expect(result?.plannedQuantityKg).toBeUndefined();
  });

  it("falls back to the named product's own real recommended quantity when a farmer edited plannedProduct but never overrode plannedQuantityKg", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({ id: "session-1", farmId: "farm-1", decisionId: "decision-plan-1", activityType: "fertiliser_spreading", origin: "plan", status: "active", fieldSegments: [], activeIntervals: [], interruptionGaps: [], createdAt: "x", updatedAt: "x" });
    mockGetDecisionById.mockResolvedValue(
      plan({
        outcome: "edited",
        estimateSnapshot: {
          status: "OK",
          value: {
            fieldId: "field-1",
            areaHa: 4.2,
            products: [
              { name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7, costEur: 165 },
              { name: "Protected Urea", npkAnalysis: "46-0-0", rateKgHa: 20, totalKg: 84, costEur: 40 },
            ],
          },
          evidenceState: "IRISH_MODEL",
        },
        edits: { plannedProduct: "Protected Urea" },
      }),
    );

    const result = await getLinkedFertiliserPlanForJobSessionAction("session-1");
    expect(result?.plannedProduct).toBe("Protected Urea");
    expect(result?.plannedQuantityKg).toBe(84);
  });
});

// Fertiliser Vertical campaign, item 14 — remaining requirement.
describe("getFieldFertiliserStatusAction", () => {

  it("rejects when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(getFieldFertiliserStatusAction("field-1")).rejects.toThrow(/no real farm/i);
  });

  it("rejects a fieldId not on this farm's own real fields", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field({ id: "field-1" })]);
    await expect(getFieldFertiliserStatusAction("someone-elses-field")).rejects.toThrow(/not found/i);
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2): an archived field's own current fertiliser status must not be
  // computable — the field is treated as not found, same as above.
  it("rejects a real archived field — its own current status is never computed", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field({ id: "field-1", archivedAt: "2026-09-01T00:00:00Z" })]);
    await expect(getFieldFertiliserStatusAction("field-1")).rejects.toThrow(/not found/i);
  });

  it("returns blocked when the P3 cycle exists but soil evidence is missing", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockGetFieldProductionCycle.mockResolvedValue(p3FirstCutCycle());
    mockListFieldProductionCyclesForSeason.mockResolvedValue([p3FirstCutCycle()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    const result = await getFieldFertiliserStatusAction("field-1");
    expect(result.status).toBe("blocked");
  });

  it("applies the existing commonage prohibition after P3 agronomy and before a recommendation is actionable", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      p3Field({ commonageStatus: { value: "commonage", status: "verified", source: "Farmer" } }),
    ]);
    mockGetFieldProductionCycle.mockResolvedValue(p3FirstCutCycle());
    mockListFieldProductionCyclesForSeason.mockResolvedValue([p3FirstCutCycle()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    await expect(getFieldFertiliserStatusAction("field-1")).resolves.toEqual({ status: "not_applicable" });
  });

  it("does not block a chemical recommendation when the local-authority organic setback status is unknown", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      p3Field({
        waterBufferContext: {
          value: { featureType: "surface_water", distanceM: 10, localOverrideStatus: "unknown" },
          status: "mapped",
          source: "EPA",
        },
      }),
    ]);
    mockGetFieldProductionCycle.mockResolvedValue(p3FirstCutCycle());
    mockListFieldProductionCyclesForSeason.mockResolvedValue([p3FirstCutCycle()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    const result = await getFieldFertiliserStatusAction("field-1");
    expect(result.status).toBe("ok");
  });

  it("returns the P3 gross and remaining first-cut requirement from explicit in-season chemical evidence", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockGetFieldProductionCycle.mockResolvedValue(p3FirstCutCycle());
    mockListFieldProductionCyclesForSeason.mockResolvedValue([p3FirstCutCycle()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    const result = await getFieldFertiliserStatusAction("field-1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.requirementKgHa).toEqual({ n: 100, p: 40, k: 175 });
    expect(result.confirmedAppliedKgHa).toEqual({ n: 10, p: 0, k: 0 });
    expect(result.remainingKgHa).toEqual({ n: 90, p: 40, k: 175 });
  });

  it("uses continuous cattle movement history as the grazing field's stocking input instead of the holding fallback", async () => {
    const target = p3Field({ id: "field-1", areaHa: 4.2 });
    const other = p3Field({ id: "field-2", name: "Other Field", areaHa: 10 });
    const targetCycle = p3GrazingCycle("field-1");
    const otherCycle = p3GrazingCycle("field-2");
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([target, other]);
    mockGetFieldProductionCycle.mockResolvedValue(targetCycle);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([targetCycle, otherCycle]);
    mockListLivestockGroups.mockResolvedValue(REAL_LIVESTOCK_GROUPS);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListGrazingFieldSessions.mockResolvedValue([
      {
        id: "session-a", farmId: "farm-1", livestockGroupId: "g1", fieldId: "field-1",
        startedAt: "2026-10-01T00:00:00.000Z", endedAt: "2026-10-11T00:00:00.000Z",
        headCountSnapshot: 20, livestockCategorySnapshot: "suckler_cow", livestockUnitsPerHeadSnapshot: 0.9,
        source: "Keith", createdAt: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "session-b", farmId: "farm-1", livestockGroupId: "g1", fieldId: "field-2",
        startedAt: "2026-10-11T00:00:00.000Z",
        headCountSnapshot: 20, livestockCategorySnapshot: "suckler_cow", livestockUnitsPerHeadSnapshot: 0.9,
        source: "Keith", createdAt: "2026-10-11T00:00:00.000Z",
      },
    ]);

    const result = await getFieldFertiliserStatusAction("field-1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.ruleTraces.n?.inputs.stockingEvidenceBasis).toBe("FIELD_GRAZING_SESSIONS");
    expect(result.ruleTraces.n?.inputs.sourceSessionCount).toBe(1);
    expect(Number(result.ruleTraces.n?.inputs.annualOrganicNStockingRateKgHa)).toBeGreaterThan(80);
    expect(result.limitations.join(" ")).toMatch(/field-specific.*movement/i);
  });

  it("does not call the legacy confirmed-application remaining calculator for a P3 cycle", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockGetFieldProductionCycle.mockResolvedValue(p3FirstCutCycle());
    mockListFieldProductionCyclesForSeason.mockResolvedValue([p3FirstCutCycle()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    await getFieldFertiliserStatusAction("field-1");
    expect(mockGetFieldRemainingFertiliserRequirement).not.toHaveBeenCalled();
  });

});

// Fertiliser Vertical campaign, items 19/20 — farm-wide demand.
describe("getFarmFertiliserDemandAction", () => {
  it("aggregates P3 field product lines directly into the procurement basket without calling the legacy farm-demand engine", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([p3FirstCutCycle()]);

    const result = await getFarmFertiliserDemandAction();

    expect(mockGetFarmFertiliserDemand).not.toHaveBeenCalled();
    expect(result.fieldsWithBlockedEvidence).toBe(0);
    expect(result.aggregation.engineVersions).toEqual(["grass_fertiliser_engine_v2.0.0"]);
    expect(result.aggregation.status).toBe("READY");
    expect(result.demand.map((row) => row.product).sort()).toEqual(["0-7-30", "Protected Urea"].sort());
    expect(result.purchaseRequirementTonnes.every((line) => line.remainingTotalKg > 0)).toBe(true);
  });

  it("keeps the farm chemical procurement basket actionable when the local organic setback status is unknown", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      p3Field({
        waterBufferContext: {
          value: { featureType: "surface_water", distanceM: 10, localOverrideStatus: "unknown" },
          status: "mapped",
          source: "EPA",
        },
      }),
    ]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([p3FirstCutCycle()]);

    const result = await getFarmFertiliserDemandAction();
    expect(result.fieldsWithBlockedEvidence).toBe(0);
    expect(result.aggregation.status).toBe("READY");
    expect(result.demand.length).toBeGreaterThan(0);
  });

  it("returns a partial P3 farm demand when another active field has no production cycle instead of crashing the overview", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      p3Field({ id: "field-1", name: "P Collins" }),
      p3Field({ id: "field-2", name: "Unclassified field" }),
    ]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([p3FirstCutCycle({ fieldId: "field-1" })]);

    const result = await getFarmFertiliserDemandAction();

    expect(mockGetFarmFertiliserDemand).not.toHaveBeenCalled();
    expect(result.fieldsWithBlockedEvidence).toBe(1);
    expect(result.aggregation.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: "field-1" }),
      expect.objectContaining({ fieldId: "field-2", purchaseStatus: expect.objectContaining({ status: "UNKNOWN", reasonCode: "P3_MISSING_PRODUCTION_CYCLE" }) }),
    ]));
    expect(result.demand.length).toBeGreaterThan(0);
  });

  it("rejects when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(getFarmFertiliserDemandAction()).rejects.toThrow(/no real farm/i);
  });

  it("maps the real farm-wide demand rows to FarmInputDemand, farm-scoped", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({
      demand: [
        { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalKg: 1000, recommendedTotalCostEur: 620, fieldsCount: 2, plannedTotalKg: 400, confirmedAppliedTotalKg: 300, remainingTotalKg: 700 },
      ],
      truncated: false,
      applicationsWithUnknownComposition: 0,
      fieldsWithBlockedEvidence: 0,
      aggregation: aggregateFarmFertiliserPurchasing([]),
    });

    const result = await getFarmFertiliserDemandAction();

    // Session 3b: the farm's recorded slurry composition reaches the farm aggregation.
    expect(mockGetFarmFertiliserDemand).toHaveBeenCalledWith(expect.objectContaining({ farmId: "farm-1", slurryCompositionRecords: [] }));
    expect(result).toEqual({
      demand: [
        { farmId: "farm-1", product: "18-6-12", unit: "kg", totalRequirementKg: 1000, plannedRequirementKg: 400, confirmedRequirementKg: 300, remainingRequirementKg: 700, confidence: "estimated" },
      ],
      purchaseRequirementTonnes: [
        { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalTonnes: 1, plannedTotalTonnes: 0.4, confirmedAppliedTotalTonnes: 0.3, remainingTotalTonnes: 0.7, remainingTotalKg: 700, fieldsCount: 2 },
      ],
      truncated: false,
      applicationsWithUnknownComposition: 0,
      fieldsWithBlockedEvidence: 0,
      aggregation: aggregateFarmFertiliserPurchasing([]),
      basket: expect.objectContaining({ farmId: "farm-1", status: "READY", lines: [], currency: "EUR" }),
    });
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2): `listFieldsForFarm` itself returns every field regardless of
  // `archivedAt` — an archived field must never reach the real farm-wide
  // aggregation this action drives (purchasing totals, stocking-rate
  // denominator), the exact real defect the audit found ("stocking
  // calculations and purchasing totals changed after an apparently
  // successful archive").
  it("excludes a real archived field from the farm-wide aggregation entirely", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field({ id: "field-1" }), field({ id: "field-2", archivedAt: "2026-09-01T00:00:00Z" })]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({ demand: [], truncated: false, applicationsWithUnknownComposition: 0, fieldsWithBlockedEvidence: 0, aggregation: aggregateFarmFertiliserPurchasing([]) });

    await getFarmFertiliserDemandAction();

    const call = mockGetFarmFertiliserDemand.mock.calls[0][0];
    expect(call.fields.map((f) => f.id)).toEqual(["field-1"]);
  });

  it("propagates truncated when a real farm-scoped read behind the aggregation hit its own cap", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({ demand: [], truncated: true, applicationsWithUnknownComposition: 0, fieldsWithBlockedEvidence: 0, aggregation: aggregateFarmFertiliserPurchasing([]) });

    const result = await getFarmFertiliserDemandAction();
    expect(result.truncated).toBe(true);
  });

  // Codex audit MEDIUM (round 21): a real confirmed Actual whose
  // quantity couldn't be resolved to a real kg figure (an unverified
  // "bags" unit) must not silently vanish from this farm-wide summary
  // with no disclosure — this action must propagate the real count
  // getFarmFertiliserDemand itself already computes.
  it("propagates applicationsWithUnknownComposition when a real confirmed Actual's quantity couldn't be resolved to a real kg figure", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({ demand: [], truncated: false, applicationsWithUnknownComposition: 1, fieldsWithBlockedEvidence: 0, aggregation: aggregateFarmFertiliserPurchasing([]) });

    const result = await getFarmFertiliserDemandAction();
    expect(result.applicationsWithUnknownComposition).toBe(1);
  });

  // Codex audit HIGH (round 22): a real grazing field excluded from
  // Recommended purely because the farm has no recorded livestock must
  // not silently vanish from this farm-wide summary with no disclosure
  // — this action must propagate the real count getFarmFertiliserDemand
  // itself already computes.
  it("propagates fieldsWithBlockedEvidence when a real field was excluded from Recommended due to blocked evidence", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({ demand: [], truncated: false, applicationsWithUnknownComposition: 0, fieldsWithBlockedEvidence: 1, aggregation: aggregateFarmFertiliserPurchasing([]) });

    const result = await getFarmFertiliserDemandAction();
    expect(result.fieldsWithBlockedEvidence).toBe(1);
  });

  // Fertiliser Vertical V1, Checkpoint 3 (item D/E): the farm-wide
  // Purchase Requirement (tonnes) must be a real conversion of this same
  // action's own kg totals, never a second independently-computed figure.
  it("converts the real farm-wide demand to a tonnes-based Purchase Requirement, product-for-product with the kg totals above", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({
      demand: [
        { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalKg: 1000, recommendedTotalCostEur: 620, fieldsCount: 2, plannedTotalKg: 400, confirmedAppliedTotalKg: 300, remainingTotalKg: 700 },
      ],
      truncated: false,
      applicationsWithUnknownComposition: 0,
      fieldsWithBlockedEvidence: 0,
      aggregation: aggregateFarmFertiliserPurchasing([]),
    });

    const result = await getFarmFertiliserDemandAction();
    expect(result.purchaseRequirementTonnes).toEqual([
      { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalTonnes: 1, plannedTotalTonnes: 0.4, confirmedAppliedTotalTonnes: 0.3, remainingTotalTonnes: 0.7, remainingTotalKg: 700, fieldsCount: 2 },
    ]);
  });
});


describe("previewSlurryFirstFertiliserPlanAction", () => {
  it("uses forecast slurry first and reduces the P3 chemical procurement preview without writing current slurry state", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListHousing.mockResolvedValue([{
      id: "h1", farmId: farm.id, shedName: "Main tank", animalType: "cattle", headCount: 0, weeksHoused: 0,
      storageCapacityM3: 500, storageFillPct: 10, storageFillStatus: "farmer_recorded",
      slurryEstimate: { volumeM3: 0, nKg: 0, pKg: 0, kKg: 0, source: "mock" },
    } as any]);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([p3FirstCutCycle({ season: "2027", evidence: {
      cropSystem: { value: "GRASS_FIRST_CUT_SILAGE", method: "FARMER_DECLARED", source: "Keith" },
      productionTargetTDMHa: { value: 5, method: "FARMER_DECLARED", source: "Keith" },
      chemicalNAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Keith" },
      chemicalPAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Keith" },
      chemicalKAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Keith" },
    } })]);
    mockListSlurryCompositionRecords.mockResolvedValue([{
      id: "comp-1", farmId: farm.id, housingId: "h1", slurryType: "cattle_slurry", status: "farmer_adjusted", dmPct: 6,
      sampleDate: "2026-10-01", source: "Farmer estimate", recordedAt: "2026-10-01T12:00:00.000Z",
    }]);

    const result = await previewSlurryFirstFertiliserPlanAction({
      planningDate: "2027-01-30",
      expectedAvailableM3: 300,
      source: "FARMER_FORECAST",
      productionBasis: "TARGET_SEASON_SAVED",
      candidates: [{ fieldId: "field-1", housingId: "h1", volumeM3: 100, applicationMethod: "LESS", applicationDate: "2027-02-01" }],
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.scenario).toMatchObject({ expectedAvailableM3: 300, allocatedM3: 100, unallocatedM3: 200, source: "FARMER_FORECAST" });
    const baselineKg = result.baseline.purchaseRequirementTonnes.reduce((sum, line) => sum + line.remainingTotalKg, 0);
    const afterSlurryKg = result.withPlannedSlurry.purchaseRequirementTonnes.reduce((sum, line) => sum + line.remainingTotalKg, 0);
    expect(afterSlurryKg).toBeLessThan(baselineKg);
    expect(mockListSlurryAllocations).not.toHaveBeenCalled();
    expect(result.automaticOptimisation).toMatchObject({ status: "BLOCKED", reasonCode: "P3_ECONOMIC_ADAPTER_NOT_AVAILABLE" });
  });

  it("can explicitly carry current production settings into the future scenario and resets prior chemical applications to zero", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListHousing.mockResolvedValue([{ id: "h1", farmId: farm.id, shedName: "Main tank", storageCapacityM3: 500 } as any]);
    mockListSlurryCompositionRecords.mockResolvedValue([{
      id: "comp-1", farmId: farm.id, housingId: "h1", slurryType: "cattle_slurry", status: "farmer_adjusted", dmPct: 6,
      sampleDate: "2026-10-01", source: "Farmer estimate", recordedAt: "2026-10-01T12:00:00.000Z",
    }]);
    mockListFieldProductionCyclesForSeason
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([p3FirstCutCycle()]);

    const result = await previewSlurryFirstFertiliserPlanAction({
      planningDate: "2027-01-30", expectedAvailableM3: 300, source: "FARMER_FORECAST", productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS",
      candidates: [{ fieldId: "field-1", housingId: "h1", volumeM3: 100, applicationMethod: "LESS", applicationDate: "2027-02-01" }],
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.scenario).toMatchObject({ productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS", carriedForwardFromSeason: "2026" });
    expect(result.baseline.fieldsWithBlockedEvidence).toBe(0);
    expect(result.withPlannedSlurry.fieldsWithBlockedEvidence).toBe(0);
    const baselineKg = result.baseline.purchaseRequirementTonnes.reduce((sum, line) => sum + line.remainingTotalKg, 0);
    const afterSlurryKg = result.withPlannedSlurry.purchaseRequirementTonnes.reduce((sum, line) => sum + line.remainingTotalKg, 0);
    expect(baselineKg).toBeGreaterThan(0);
    expect(afterSlurryKg).toBeLessThan(baselineKg);
  });

  it("blocks a future preview until every active field has an explicit target-season production cycle", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([p3Field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListHousing.mockResolvedValue([{ id: "h1", farmId: farm.id, shedName: "Main tank", storageCapacityM3: 500 } as any]);
    mockListFieldProductionCyclesForSeason.mockResolvedValue([]);

    const result = await previewSlurryFirstFertiliserPlanAction({
      planningDate: "2027-01-30", expectedAvailableM3: 300, source: "FARMER_FORECAST", productionBasis: "TARGET_SEASON_SAVED",
      candidates: [{ fieldId: "field-1", housingId: "h1", volumeM3: 100, applicationMethod: "LESS", applicationDate: "2027-02-01" }],
    });
    expect(result).toMatchObject({ status: "blocked", reasonCode: "MISSING_TARGET_SEASON_PRODUCTION_CYCLES" });
  });
});

// Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding F5).
describe("getFarmLimeRequirementAction", () => {
  it("rejects when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(getFarmLimeRequirementAction()).rejects.toThrow(/no real farm/i);
  });

  it("aggregates the real farm-wide lime requirement from each field's own saved laboratory rate", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      field({ id: "field-1", areaHa: 4, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R1", p: 5, k: 90, pH: 5.8, limeRequirement: 2 } } }),
    ]);

    const result = await getFarmLimeRequirementAction();
    expect(result.farmTotalTonnes).toBe(8);
    expect(result.fieldsWithoutLimeEvidence).toBe(0);
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2) — the exact same archived-field scope bug, applied here too.
  it("excludes a real archived field from the farm-wide lime total", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([
      field({ id: "field-1", areaHa: 4, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R1", p: 5, k: 90, pH: 5.8, limeRequirement: 2 } } }),
      field({
        id: "field-2",
        areaHa: 100,
        archivedAt: "2026-09-01T00:00:00Z",
        fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R2", p: 5, k: 90, pH: 5.8, limeRequirement: 5 } },
      }),
    ]);

    const result = await getFarmLimeRequirementAction();
    expect(result.farmTotalTonnes).toBe(8);
    expect(result.fields.map((f) => f.fieldId)).toEqual(["field-1"]);
  });
});
