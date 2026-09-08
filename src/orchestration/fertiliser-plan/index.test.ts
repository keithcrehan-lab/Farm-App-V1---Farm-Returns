import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/farm-data/job-sessions", () => ({ listConfirmedJobSessionsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/decisions", () => ({ listDecisionsForFarm: vi.fn() }));

import { listConfirmedJobSessionsForFarm } from "@/lib/farm-data/job-sessions";
import { listDecisionsForFarm } from "@/lib/farm-data/decisions";
import { getFieldRemainingFertiliserRequirement, getFarmFertiliserDemand } from "./index";
import type { JobSessionWithActual } from "@/lib/farm-data/job-sessions";
import type { JobActualRecord, DecisionRecord } from "@/lib/farm-data/mappers";
import type { Field } from "@/domain/types";

const mockListConfirmed = vi.mocked(listConfirmedJobSessionsForFarm);
const mockListDecisions = vi.mocked(listDecisionsForFarm);

afterEach(() => {
  vi.clearAllMocks();
});

function actual(payload: Record<string, unknown>, overrides: Partial<JobActualRecord> = {}): JobActualRecord {
  return {
    id: "actual-1",
    farmId: "farm-1",
    jobSessionId: "session-1",
    revision: 1,
    activityType: "fertiliser_spreading",
    completionType: "whole",
    // `fieldIds` is the real, authoritative field attribution this
    // module now uses (not `primaryFieldId`) — defaulted here so every
    // existing single-field test fixture keeps working without having
    // to repeat it, while a test exercising multi-field exclusion can
    // still override it explicitly.
    payload: { fieldIds: ["field-1"], ...payload },
    confirmedBy: "farmer",
    confirmedAt: "2026-09-08T10:00:00Z",
    createdAt: "2026-09-08T10:00:00Z",
    ...overrides,
  };
}

function confirmedSession(overrides: Partial<JobSessionWithActual> = {}): JobSessionWithActual {
  return {
    id: "session-1",
    farmId: "farm-1",
    decisionId: "decision-1",
    activityType: "fertiliser_spreading",
    origin: "plan",
    status: "confirmed_actual",
    primaryFieldId: "field-1",
    fieldSegments: [],
    activeIntervals: [],
    interruptionGaps: [],
    createdAt: "2026-09-08T09:00:00Z",
    updatedAt: "2026-09-08T10:00:00Z",
    hasGpsTrace: false,
    ...overrides,
  };
}

describe("getFieldRemainingFertiliserRequirement", () => {
  const asOfDate = "2026-12-31";

  it("returns the real requirement unchanged with zero confirmed applied when no confirmed session exists for this field", async () => {
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const result = await getFieldRemainingFertiliserRequirement({
      farmId: "farm-1",
      fieldId: "field-1",
      requirementKgHa: { n: 35, p: 4, k: 0 },
      areaHa: 4,
      asOfDate,
    });

    expect(result.requirementKgHa).toEqual({ n: 35, p: 4, k: 0 });
    expect(result.confirmedAppliedKgHa).toEqual({ n: 0, p: 0, k: 0 });
    expect(result.remainingKgHa).toEqual({ n: 35, p: 4, k: 0 });
    expect(result.confirmedApplications).toBe(0);
    expect(result.applicationsWithUnknownComposition).toBe(0);
    expect(result.applicationsExcludedMultiField).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("only counts real confirmed sessions for THIS field (via the Actual's own real fieldIds, not primaryFieldId) and THIS activity type", async () => {
    mockListConfirmed.mockResolvedValue({
      sessions: [
        confirmedSession({ actual: actual({ product: "18-6-12", quantity: 100, quantityUnit: "kg", fieldIds: ["field-1"] }) }),
        // A different real field's own real application — codex audit
        // HIGH (round 1): the old filter used `primaryFieldId`, which
        // this session deliberately sets to "field-1" even though its
        // own real Actual covers a different field — proving the fix
        // reads the Actual's own authoritative fieldIds, not the
        // session's own start-location field.
        confirmedSession({ id: "session-2", primaryFieldId: "field-1", actual: actual({ product: "18-6-12", quantity: 999, quantityUnit: "kg", fieldIds: ["field-2"] }, { id: "actual-2" }) }),
        confirmedSession({ id: "session-3", activityType: "slurry_spreading", actual: actual({ quantity: 999 }, { activityType: "slurry_spreading", id: "actual-3" }) }),
      ],
      truncated: false,
    });

    const result = await getFieldRemainingFertiliserRequirement({
      farmId: "farm-1",
      fieldId: "field-1",
      requirementKgHa: { n: 100, p: 0, k: 0 },
      areaHa: 4,
      asOfDate,
    });

    // 100 kg of 18-6-12 -> 18 kg N, over 4 ha -> 4.5 kg N/ha applied.
    expect(result.confirmedApplications).toBe(1);
    expect(result.confirmedAppliedKgHa?.n).toBeCloseTo(4.5);
    expect(result.remainingKgHa?.n).toBeCloseTo(95.5);
  });

  it("excludes a real confirmed Actual covering more than one field — never attributes its whole quantity to just this one", async () => {
    mockListConfirmed.mockResolvedValue({
      sessions: [confirmedSession({ actual: actual({ product: "18-6-12", quantity: 1000, quantityUnit: "kg", fieldIds: ["field-1", "field-2"] }) })],
      truncated: false,
    });

    const result = await getFieldRemainingFertiliserRequirement({
      farmId: "farm-1",
      fieldId: "field-1",
      requirementKgHa: { n: 100, p: 0, k: 0 },
      areaHa: 4,
      asOfDate,
    });

    expect(result.confirmedApplications).toBe(0);
    expect(result.applicationsExcludedMultiField).toBe(1);
    expect(result.confirmedAppliedKgHa?.n).toBe(0);
    expect(result.remainingKgHa?.n).toBe(100);
  });

  it("excludes a real confirmed application from a prior calendar year — the season boundary, not permanent history, bounds remaining", async () => {
    mockListConfirmed.mockResolvedValue({
      sessions: [confirmedSession({ actual: actual({ product: "18-6-12", quantity: 100, quantityUnit: "kg" }, { confirmedAt: "2025-06-01T10:00:00Z" }) })],
      truncated: false,
    });

    const result = await getFieldRemainingFertiliserRequirement({
      farmId: "farm-1",
      fieldId: "field-1",
      requirementKgHa: { n: 100, p: 0, k: 0 },
      areaHa: 4,
      asOfDate: "2026-06-01",
    });

    expect(result.confirmedApplications).toBe(0);
    expect(result.confirmedAppliedKgHa?.n).toBe(0);
    expect(result.remainingKgHa?.n).toBe(100);
  });

  it("discloses, never silently drops, a confirmed application whose product/quantity could not be resolved to a real nutrient contribution", async () => {
    mockListConfirmed.mockResolvedValue({
      sessions: [confirmedSession({ actual: actual({ product: "CAN 27%", quantity: 100, quantityUnit: "kg" }) })],
      truncated: false,
    });

    const result = await getFieldRemainingFertiliserRequirement({
      farmId: "farm-1",
      fieldId: "field-1",
      requirementKgHa: { n: 100, p: 0, k: 0 },
      areaHa: 4,
      asOfDate,
    });

    expect(result.confirmedApplications).toBe(1);
    expect(result.applicationsWithUnknownComposition).toBe(1);
    // Unresolved contribution counts as zero, not silently ignored from the total.
    expect(result.confirmedAppliedKgHa?.n).toBe(0);
    expect(result.remainingKgHa?.n).toBe(100);
  });

  it("fails closed on a missing/invalid field area — never fabricates a per-ha confirmed-applied figure", async () => {
    mockListConfirmed.mockResolvedValue({
      sessions: [confirmedSession({ actual: actual({ product: "18-6-12", quantity: 100, quantityUnit: "kg" }) })],
      truncated: false,
    });

    const result = await getFieldRemainingFertiliserRequirement({
      farmId: "farm-1",
      fieldId: "field-1",
      requirementKgHa: { n: 100, p: 0, k: 0 },
      areaHa: undefined,
      asOfDate,
    });

    expect(result.blockedReasonCode).toBe("MISSING_VALID_FIELD_AREA");
    expect(result.confirmedAppliedKgHa).toBeUndefined();
    expect(result.remainingKgHa).toBeUndefined();
    // The field's own real requirement is still shown — only the
    // remaining/applied conversion is blocked, not the whole result.
    expect(result.requirementKgHa).toEqual({ n: 100, p: 0, k: 0 });
  });

  it("sums multiple real confirmed applications across separate sessions", async () => {
    mockListConfirmed.mockResolvedValue({
      sessions: [
        confirmedSession({ id: "session-1", actual: actual({ product: "18-6-12", quantity: 100, quantityUnit: "kg" }) }),
        confirmedSession({ id: "session-4", actual: actual({ product: "Protected Urea", quantity: 50, quantityUnit: "kg" }, { id: "actual-2" }) }),
      ],
      truncated: false,
    });

    const result = await getFieldRemainingFertiliserRequirement({
      farmId: "farm-1",
      fieldId: "field-1",
      requirementKgHa: { n: 100, p: 0, k: 0 },
      areaHa: 4,
      asOfDate,
    });

    // 100kg 18-6-12 -> 18kg N; 50kg Protected Urea -> 23kg N. Total 41kg N / 4ha = 10.25 kg N/ha.
    expect(result.confirmedApplications).toBe(2);
    expect(result.confirmedAppliedKgHa?.n).toBeCloseTo(10.25);
  });

  it("propagates truncated when the real confirmed-session read hit its own cap", async () => {
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: true });

    const result = await getFieldRemainingFertiliserRequirement({
      farmId: "farm-1",
      fieldId: "field-1",
      requirementKgHa: { n: 100, p: 0, k: 0 },
      areaHa: 4,
      asOfDate,
    });

    expect(result.truncated).toBe(true);
  });
});

// Fertiliser Vertical campaign, items 19/20 — farm-wide demand.
describe("getFarmFertiliserDemand", () => {
  function field(overrides: Partial<Field> = {}): Field {
    return {
      id: "field-1",
      farmId: "farm-1",
      name: "Home Field",
      areaHa: 4,
      centroid: [0, 0],
      fertility: { pIndex: { value: 1, status: "verified", source: "Soil test" }, kIndex: { value: 1, status: "verified", source: "Soil test" } },
      ...overrides,
    } as Field;
  }

  function planDecision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
    return {
      id: "decision-1",
      farmId: "farm-1",
      promptId: "prompt-1",
      calculationKind: "fertiliser_recommendation",
      fieldId: "field-1",
      estimateSnapshot: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" },
      outcome: "accepted",
      decidedBy: "farmer",
      decidedAt: "2026-09-08T09:00:00Z",
      createdAt: "2026-09-08T09:00:00Z",
      ...overrides,
    };
  }

  it("returns the real recommended totals with zero planned/confirmed when no real Decisions/Actuals exist yet", async () => {
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const { demand, truncated } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: [], slurryAllocations: [] });

    expect(truncated).toBe(false);
    expect(demand.length).toBeGreaterThan(0);
    for (const row of demand) {
      expect(row.plannedTotalKg).toBe(0);
      expect(row.confirmedAppliedTotalKg).toBe(0);
      expect(row.remainingTotalKg).toBe(row.recommendedTotalKg);
    }
  });

  it("only counts an explicit, real farmer edit (plannedProduct + plannedQuantityKg) toward the planned total — a bare acceptance is excluded", async () => {
    mockListDecisions.mockResolvedValue({
      decisions: [
        planDecision({ id: "d1", outcome: "edited", edits: { plannedProduct: "18-6-12", plannedQuantityKg: 240 } }),
        planDecision({ id: "d2", outcome: "accepted" }), // no explicit edits — excluded
        planDecision({ id: "d3", outcome: "dismissed", edits: { plannedProduct: "18-6-12", plannedQuantityKg: 999 } }), // dismissed — excluded
      ],
      truncated: false,
    });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: [], slurryAllocations: [] });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.plannedTotalKg).toBe(240);
  });

  it("propagates truncated when either the real decisions read or the real confirmed-session read hit its own cap", async () => {
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: true });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });
    const first = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: [], slurryAllocations: [] });
    expect(first.truncated).toBe(true);

    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: true });
    const second = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: [], slurryAllocations: [] });
    expect(second.truncated).toBe(true);
  });

  it("sums real confirmed Actuals farm-wide into the confirmed total, by exact product name", async () => {
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListConfirmed.mockResolvedValue({
      sessions: [
        {
          id: "session-1",
          farmId: "farm-1",
          decisionId: "d1",
          activityType: "fertiliser_spreading",
          origin: "plan",
          status: "confirmed_actual",
          primaryFieldId: "field-1",
          fieldSegments: [],
          activeIntervals: [],
          interruptionGaps: [],
          createdAt: "x",
          updatedAt: "x",
          hasGpsTrace: false,
          actual: {
            id: "actual-1",
            farmId: "farm-1",
            jobSessionId: "session-1",
            revision: 1,
            activityType: "fertiliser_spreading",
            completionType: "whole",
            payload: { product: "18-6-12", quantity: 300, quantityUnit: "kg" },
            confirmedBy: "farmer",
            confirmedAt: "x",
            createdAt: "x",
          } as JobActualRecord,
        },
      ],
      truncated: false,
    });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: [], slurryAllocations: [] });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.confirmedAppliedTotalKg).toBe(300);
  });

  it("returns an empty array when no field has any real recommendation", async () => {
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    // No soil index recorded — fertilityEvidence not OK, purchasedProducts forced to [].
    const bareField = field({ fertility: {} });
    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [bareField], livestockGroups: [], slurryAllocations: [] });
    expect(demand).toEqual([]);
  });
});
