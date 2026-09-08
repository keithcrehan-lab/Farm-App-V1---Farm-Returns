import { afterEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/orchestration/job-session", () => ({ startJobSessionFromPlan: vi.fn() }));
vi.mock("@/orchestration/fertiliser-plan", () => ({ getFieldRemainingFertiliserRequirement: vi.fn(), getFarmFertiliserDemand: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listDecisionsForFarm, getDecisionById } from "@/lib/farm-data/decisions";
import { listJobSessionDecisionIdsForFarm, getJobSessionById } from "@/lib/farm-data/job-sessions";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { startJobSessionFromPlan } from "@/orchestration/job-session";
import { getFieldRemainingFertiliserRequirement, getFarmFertiliserDemand } from "@/orchestration/fertiliser-plan";
import {
  getMatchablePlanForFieldAction,
  startJobSessionFromPlanAction,
  getLinkedFertiliserPlanForJobSessionAction,
  getFieldFertiliserStatusAction,
  getFarmFertiliserDemandAction,
} from "./fertiliser-plan";
import type { Farm, Field } from "@/domain/types";
import type { DecisionRecord, JobSessionRecord } from "@/lib/farm-data/mappers";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockListDecisions = vi.mocked(listDecisionsForFarm);
const mockGetDecisionById = vi.mocked(getDecisionById);
const mockListJobSessionDecisionIds = vi.mocked(listJobSessionDecisionIdsForFarm);
const mockGetJobSessionById = vi.mocked(getJobSessionById);
const mockStartJobSessionFromPlan = vi.mocked(startJobSessionFromPlan);
const mockListLivestockGroups = vi.mocked(listLivestockGroupsForFarm);
const mockListSlurryAllocations = vi.mocked(listSlurryAllocationsForFarm);
const mockGetFieldRemainingFertiliserRequirement = vi.mocked(getFieldRemainingFertiliserRequirement);
const mockGetFarmFertiliserDemand = vi.mocked(getFarmFertiliserDemand);

afterEach(() => {
  vi.clearAllMocks();
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
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "none" });
  });

  it("returns the single real matchable plan when exactly one unlinked accepted plan exists for this field", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "matched", plan: plan() });
  });

  it("returns 'ambiguous' — never auto-selects — when more than one real plan matches this field", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListDecisions.mockResolvedValue({
      decisions: [plan({ id: "decision-plan-1" }), plan({ id: "decision-plan-2" })],
      truncated: false,
    });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "ambiguous", candidateCount: 2 });
  });

  it("excludes a plan already linked to a job session — never a second, competing link to the same real plan", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(["decision-plan-1"]), truncated: false });

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "none" });
  });

  it("excludes a dismissed decision and a decision for a different field/calculationKind — never a false match", async () => {
    mockGetFarm.mockResolvedValue(farm);
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

    await expect(getMatchablePlanForFieldAction("field-1")).resolves.toEqual({ status: "matched", plan: multiProductEditedPlan });
  });
});

describe("startJobSessionFromPlanAction", () => {
  const stubbedJobSession = { id: "session-1" } as JobSessionRecord;

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
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({ decisions: [plan()], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(["decision-plan-1"]), truncated: false });

    await expect(
      startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" }),
    ).rejects.toThrow(/already linked/);
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
  });

  it("starts a real job session from a real, valid, unlinked accepted plan", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
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
    mockListFields.mockResolvedValue([field()]);
    mockListDecisions.mockResolvedValue({ decisions: [plan({ outcome: "edited", edits: { plannedQuantityKg: 240 } })], truncated: false });
    mockListJobSessionDecisionIds.mockResolvedValue({ decisionIds: new Set(), truncated: false });
    mockStartJobSessionFromPlan.mockResolvedValue({ decision: plan(), jobSession: stubbedJobSession });

    await startJobSessionFromPlanAction({ planDecisionId: "decision-plan-1", fieldId: "field-1", activityType: "fertiliser_spreading", jobSessionId: "session-1" });
    expect(mockStartJobSessionFromPlan).toHaveBeenCalledTimes(1);
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

    await expect(getLinkedFertiliserPlanForJobSessionAction("session-1")).resolves.toEqual({
      decisionId: "decision-plan-1",
      fieldId: "field-1",
      recommendedProducts: [{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7, costEur: 165 }],
      plannedProduct: "18-6-12",
      plannedQuantityKg: 240,
      plannedDate: "2026-09-20",
    });
    expect(mockGetDecisionById).toHaveBeenCalledWith("farm-1", "decision-plan-1");
    expect(mockListDecisions).not.toHaveBeenCalled();
  });

  it("returns undefined plannedProduct/plannedQuantityKg/plannedDate for a plan accepted as-is (no farmer edit)", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockGetJobSessionById.mockResolvedValue({ id: "session-1", farmId: "farm-1", decisionId: "decision-plan-1", activityType: "fertiliser_spreading", origin: "plan", status: "active", fieldSegments: [], activeIntervals: [], interruptionGaps: [], createdAt: "x", updatedAt: "x" });
    mockGetDecisionById.mockResolvedValue(plan());

    const result = await getLinkedFertiliserPlanForJobSessionAction("session-1");
    expect(result?.plannedProduct).toBeUndefined();
    expect(result?.plannedQuantityKg).toBeUndefined();
    expect(result?.plannedDate).toBeUndefined();
  });
});

// Fertiliser Vertical campaign, item 14 — remaining requirement.
describe("getFieldFertiliserStatusAction", () => {
  function fertiliserField(overrides: Partial<Field> = {}): Field {
    return field({
      fertility: { pIndex: { value: 1, status: "verified", source: "Soil test" }, kIndex: { value: 1, status: "verified", source: "Soil test" } },
      ...overrides,
    });
  }

  it("rejects when there is no real signed-in farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(getFieldFertiliserStatusAction("field-1")).rejects.toThrow(/no real farm/i);
  });

  it("rejects a fieldId not on this farm's own real fields", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field({ id: "field-1" })]);
    await expect(getFieldFertiliserStatusAction("someone-elses-field")).rejects.toThrow(/not found/i);
  });

  it("returns 'blocked' when the real recomputed recommendation itself is blocked (no soil index) — never fabricates a remaining figure", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]); // no fertility index
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    await expect(getFieldFertiliserStatusAction("field-1")).resolves.toEqual({
      status: "blocked",
      reasonCode: "MISSING_SOIL_FERTILITY_INDEX",
    });
    expect(mockGetFieldRemainingFertiliserRequirement).not.toHaveBeenCalled();
  });

  it("returns 'not_applicable' when a real recommendation genuinely recommends nothing (e.g. commonage-suppressed)", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField({ commonageStatus: { value: "commonage", status: "verified", source: "Farmer" } })]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    await expect(getFieldFertiliserStatusAction("field-1")).resolves.toEqual({ status: "not_applicable" });
    expect(mockGetFieldRemainingFertiliserRequirement).not.toHaveBeenCalled();
  });

  it("returns the real remaining requirement, derived from the recomputed recommendation and real confirmed applications", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([fertiliserField()]);
    // Codex audit CRITICAL (round 6): an empty read no longer reaches the
    // recomputed basis's `OK` arm (see fertiliser-recommendation.ts's own
    // `MISSING_LIVESTOCK_DATA` gate) — this test needs a real,
    // non-empty herd to exercise the "ok" branch it actually asserts on.
    mockListLivestockGroups.mockResolvedValue([
      {
        id: "g1",
        farmId: "farm-1",
        category: "suckler_cow",
        label: "Cows",
        count: { value: 20, status: "verified", source: "Farmer" },
        system: "grazing",
        value: { value: 30000, status: "estimated", source: "Farm Return estimate" },
      },
    ]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFieldRemainingFertiliserRequirement.mockResolvedValue({
      requirementKgHa: { n: 35, p: 4, k: 0 },
      confirmedAppliedKgHa: { n: 10, p: 0, k: 0 },
      remainingKgHa: { n: 25, p: 4, k: 0 },
      confirmedApplications: 1,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });

    const result = await getFieldFertiliserStatusAction("field-1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.remainingKgHa).toEqual({ n: 25, p: 4, k: 0 });

    // The requirement passed through is the real, server-recomputed
    // recommendation's own figure — never a client-supplied one.
    expect(mockGetFieldRemainingFertiliserRequirement).toHaveBeenCalledWith(
      expect.objectContaining({ farmId: "farm-1", fieldId: "field-1", areaHa: 4.2 }),
    );
  });
});

// Fertiliser Vertical campaign, items 19/20 — farm-wide demand.
describe("getFarmFertiliserDemandAction", () => {
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
    });

    const result = await getFarmFertiliserDemandAction();

    expect(mockGetFarmFertiliserDemand).toHaveBeenCalledWith(expect.objectContaining({ farmId: "farm-1" }));
    expect(result).toEqual({
      demand: [
        { farmId: "farm-1", product: "18-6-12", unit: "kg", totalRequirementKg: 1000, plannedRequirementKg: 400, confirmedRequirementKg: 300, remainingRequirementKg: 700, confidence: "estimated" },
      ],
      truncated: false,
    });
  });

  it("propagates truncated when a real farm-scoped read behind the aggregation hit its own cap", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({ demand: [], truncated: true });

    const result = await getFarmFertiliserDemandAction();
    expect(result.truncated).toBe(true);
  });
});
