import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/farm-data/job-sessions", () => ({ listConfirmedJobSessionsForFarm: vi.fn(), listActiveJobSessionsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/decisions", () => ({ listDecisionsForFarm: vi.fn() }));

import { listConfirmedJobSessionsForFarm, listActiveJobSessionsForFarm } from "@/lib/farm-data/job-sessions";
import { listDecisionsForFarm } from "@/lib/farm-data/decisions";
import { getFieldRemainingFertiliserRequirement, getFarmFertiliserDemand, sanitiseDecisionRecordForClient } from "./index";
import type { JobSessionWithActual } from "@/lib/farm-data/job-sessions";
import type { JobActualRecord, DecisionRecord, JobSessionRecord } from "@/lib/farm-data/mappers";
import type { Field } from "@/domain/types";

const mockListConfirmed = vi.mocked(listConfirmedJobSessionsForFarm);
const mockListDecisions = vi.mocked(listDecisionsForFarm);
const mockListActive = vi.mocked(listActiveJobSessionsForFarm);

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

  it("excludes a real confirmed 'did_not_happen' Actual entirely — its own real product/quantity are absent, not merely unknown", async () => {
    mockListConfirmed.mockResolvedValue({
      sessions: [confirmedSession({ actual: actual({}, { completionType: "did_not_happen" }) })],
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
    expect(result.applicationsWithUnknownComposition).toBe(0);
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
  // Codex audit CRITICAL (round 7): an empty herd is now genuinely
  // excluded from "recommended" entirely (see this module's own
  // `getFarmFertiliserDemand` doc comment) — every test below needs a
  // real, non-empty herd for `field()`'s own recommendation to
  // legitimately exist, unless it is itself testing that exclusion.
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

  const asOfDate = "2026-12-31";

  beforeEach(() => {
    mockListActive.mockResolvedValue({ sessions: [], truncated: false });
  });

  it("returns the real recommended totals with zero planned/confirmed when no real Decisions/Actuals exist yet", async () => {
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const { demand, truncated } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });

    expect(truncated).toBe(false);
    expect(demand.length).toBeGreaterThan(0);
    for (const row of demand) {
      expect(row.plannedTotalKg).toBe(0);
      expect(row.confirmedAppliedTotalKg).toBe(0);
      expect(row.remainingTotalKg).toBe(row.recommendedTotalKg);
    }
  });

  // Codex audit CRITICAL (round 7): this second, independent aggregation
  // over the same real fields must apply the identical fail-closed
  // rules `promptForFertiliserRecommendation` itself enforces per
  // field — it used to call `calculateNutrientPlan` for every field
  // unconditionally, bypassing round 6's own tillage/missing-livestock
  // gates entirely.
  it("excludes a tillage field from the recommended total entirely — this app has no tillage N/P/K table", async () => {
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const tillageField = field({ id: "field-2", plannedUse: { value: "tillage", status: "verified", source: "Farmer" } });
    const { demand } = await getFarmFertiliserDemand({
      farmId: "farm-1",
      fields: [tillageField],
      livestockGroups: REAL_LIVESTOCK_GROUPS,
      slurryAllocations: [],
      asOfDate,
    });

    expect(demand).toEqual([]);
  });

  it("excludes every field's recommended total when the farm has no recorded livestock — genuinely ambiguous, never the clamped 35 kg N/ha", async () => {
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: [], slurryAllocations: [], asOfDate });

    expect(demand).toEqual([]);
  });

  // Codex audit HIGH (round 7): a bare "accepted" Decision whose own
  // real recommendation snapshot named exactly one product is just as
  // unambiguous as an explicit edit — the identical reasoning
  // `isUnambiguouslySingleProductPlan` already uses to treat it as
  // safely GPS-matchable/startable (round 4).
  it("counts a bare-accepted Decision toward the planned total when its own real recommendation snapshot names exactly one product", async () => {
    mockListDecisions.mockResolvedValue({
      decisions: [
        planDecision({
          id: "d1",
          outcome: "accepted",
          estimateSnapshot: {
            status: "OK",
            value: { fieldId: "field-1", products: [{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7 }] },
            evidenceState: "IRISH_MODEL",
          },
        }),
      ],
      truncated: false,
    });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.plannedTotalKg).toBe(266.7);
  });

  // Codex audit HIGH (round 13): field eligibility alone ("some
  // recommendation exists") was not enough — the identical
  // isPlanProductStillRecommended check getMatchablePlanForFieldAction/
  // startJobSessionFromPlanAction already apply (round 10) must also
  // gate what counts toward the farm-wide Planned total.
  it("excludes a stored plan's own product from Planned once it is no longer part of the field's current live recommendation", async () => {
    mockListDecisions.mockResolvedValue({
      decisions: [
        planDecision({
          id: "d1",
          outcome: "accepted",
          fieldId: "field-1",
          estimateSnapshot: {
            status: "OK",
            // "CAN 27%" is not one of this app's own catalogue products
            // at all — genuinely not part of field()'s own real current
            // live recommendation (Index 1/1 + real livestock -> "0-7-30"/
            // "18-6-12"/"Protected Urea").
            value: { fieldId: "field-1", products: [{ name: "CAN 27%", npkAnalysis: "27-0-0", rateKgHa: 40, totalKg: 160 }] },
            evidenceState: "IRISH_MODEL",
          },
        }),
      ],
      truncated: false,
    });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    const row = demand.find((r) => r.product === "CAN 27%");
    expect(row?.plannedTotalKg ?? 0).toBe(0);
  });

  it("still excludes a bare-accepted Decision naming more than one real product — no real way to say which one the farmer means", async () => {
    mockListDecisions.mockResolvedValue({
      decisions: [
        planDecision({
          id: "d1",
          outcome: "accepted",
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
        }),
      ],
      truncated: false,
    });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.plannedTotalKg).toBe(0);
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

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.plannedTotalKg).toBe(240);
  });

  // Codex audit MEDIUM (round 15): a product-only edit used to be
  // silently excluded entirely (the old check required BOTH
  // `plannedProduct` and `plannedQuantityKg` to trust any explicit
  // edit), even though the same plan is already treated elsewhere as
  // unambiguous and executable (GPS matching/starting, Confirm Actual
  // prefill correctly derives its quantity from the named product's own
  // real recommended totalKg).
  it("counts a product-only edit toward Planned, using that product's own real recommended quantity", async () => {
    mockListDecisions.mockResolvedValue({
      decisions: [
        planDecision({
          id: "d1",
          outcome: "edited",
          edits: { plannedProduct: "Protected Urea" },
          estimateSnapshot: {
            status: "OK",
            value: {
              fieldId: "field-1",
              products: [
                { name: "0-7-30", npkAnalysis: "0-7-30", rateKgHa: 279.6, totalKg: 1118.3 },
                { name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 273.8, totalKg: 1095.3 },
                { name: "Protected Urea", npkAnalysis: "46-0-0", rateKgHa: 416.8, totalKg: 1667.1 },
              ],
            },
            evidenceState: "IRISH_MODEL",
          },
        }),
      ],
      truncated: false,
    });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    const row = demand.find((r) => r.product === "Protected Urea");
    expect(row?.plannedTotalKg).toBe(1667.1);
  });

  // Codex audit MEDIUM (round 15): a quantity-only edit on a
  // single-product recommendation used to be silently ignored, counting
  // the original recommended quantity instead of the farmer's own
  // explicit correction.
  it("counts a quantity-only edit toward Planned, overriding the recommended quantity rather than ignoring it", async () => {
    mockListDecisions.mockResolvedValue({
      decisions: [
        planDecision({
          id: "d1",
          outcome: "edited",
          edits: { plannedQuantityKg: 500 },
          estimateSnapshot: {
            status: "OK",
            value: { fieldId: "field-1", products: [{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 1095.3 }] },
            evidenceState: "IRISH_MODEL",
          },
        }),
      ],
      truncated: false,
    });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.plannedTotalKg).toBe(500);
  });

  function activeSession(overrides: Partial<JobSessionRecord> = {}): JobSessionRecord {
    return {
      id: "session-1",
      farmId: "farm-1",
      decisionId: "d1",
      activityType: "fertiliser_spreading",
      origin: "plan",
      status: "active",
      fieldSegments: [],
      activeIntervals: [],
      interruptionGaps: [],
      createdAt: "x",
      updatedAt: "x",
      ...overrides,
    };
  }

  it("excludes a real plan already linked to a genuinely in-flight job session from the planned total — it has moved past 'Planned' in this campaign's own lifecycle", async () => {
    mockListDecisions.mockResolvedValue({
      decisions: [planDecision({ id: "d1", outcome: "edited", edits: { plannedProduct: "18-6-12", plannedQuantityKg: 240 } })],
      truncated: false,
    });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });
    mockListActive.mockResolvedValue({ sessions: [activeSession()], truncated: false });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.plannedTotalKg).toBe(0);
  });

  // Codex audit HIGH, round 3 — the exact real gap round 2's own fix
  // introduced: a cancelled session produced no real Actual, so the
  // plan behind it must remain visible as still-outstanding demand,
  // never silently vanish from both planned and confirmed forever.
  it("does NOT exclude a plan linked only to a CANCELLED job session — a cancelled job never produced a real Actual, the plan is still genuinely outstanding", async () => {
    mockListDecisions.mockResolvedValue({
      decisions: [planDecision({ id: "d1", outcome: "edited", edits: { plannedProduct: "18-6-12", plannedQuantityKg: 240 } })],
      truncated: false,
    });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });
    // A cancelled session is neither "active" (listActiveJobSessionsForFarm
    // excludes cancelled/confirmed_actual by its own real query) nor
    // confirmed — it simply doesn't appear in either real read.
    mockListActive.mockResolvedValue({ sessions: [], truncated: false });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.plannedTotalKg).toBe(240);
  });

  it("excludes a real plan already linked to a real CONFIRMED job session from the planned total (it now counts as confirmed instead)", async () => {
    mockListDecisions.mockResolvedValue({
      decisions: [planDecision({ id: "d1", outcome: "edited", edits: { plannedProduct: "18-6-12", plannedQuantityKg: 240 } })],
      truncated: false,
    });
    mockListConfirmed.mockResolvedValue({
      sessions: [
        {
          ...activeSession({ status: "confirmed_actual" }),
          actual: {
            id: "actual-1",
            farmId: "farm-1",
            jobSessionId: "session-1",
            revision: 1,
            activityType: "fertiliser_spreading",
            completionType: "whole",
            payload: { product: "18-6-12", quantity: 240, quantityUnit: "kg" },
            confirmedBy: "farmer",
            confirmedAt: "2026-09-08T10:00:00Z",
            createdAt: "2026-09-08T10:00:00Z",
          } as JobActualRecord,
          hasGpsTrace: false,
        },
      ],
      truncated: false,
    });
    mockListActive.mockResolvedValue({ sessions: [], truncated: false });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.plannedTotalKg).toBe(0);
    expect(row?.confirmedAppliedTotalKg).toBe(240);
  });

  it("propagates truncated when the real active-session read (planned-exclusion set) hits its own cap", async () => {
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });
    mockListActive.mockResolvedValue({ sessions: [], truncated: true });

    const { truncated } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    expect(truncated).toBe(true);
  });

  it("propagates truncated when either the real decisions read or the real confirmed-session read hit its own cap", async () => {
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: true });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });
    const first = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    expect(first.truncated).toBe(true);

    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: true });
    const second = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
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
            confirmedAt: "2026-09-08T10:00:00Z",
            createdAt: "2026-09-08T10:00:00Z",
          } as JobActualRecord,
        },
      ],
      truncated: false,
    });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.confirmedAppliedTotalKg).toBe(300);
  });

  // Codex audit MEDIUM (round 21): a real confirmed Actual whose
  // quantity can't be resolved to a real kg figure (no verified bag
  // weight) is correctly excluded from `confirmedAppliedTotalKg` — but
  // that must be disclosed, not left indistinguishable from "genuinely
  // nothing confirmed yet".
  it("discloses a real confirmed Actual excluded from the confirmed total via applicationsWithUnknownComposition, never silently as if it never happened", async () => {
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListConfirmed.mockResolvedValue({
      sessions: [confirmedSession({ actual: actual({ product: "18-6-12", quantity: 10, quantityUnit: "bags" }) })],
      truncated: false,
    });

    const { demand, applicationsWithUnknownComposition } = await getFarmFertiliserDemand({
      farmId: "farm-1",
      fields: [field()],
      livestockGroups: REAL_LIVESTOCK_GROUPS,
      slurryAllocations: [],
      asOfDate,
    });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.confirmedAppliedTotalKg ?? 0).toBe(0);
    expect(applicationsWithUnknownComposition).toBe(1);
  });

  it("reports applicationsWithUnknownComposition as 0 when every real confirmed Actual resolved cleanly", async () => {
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListConfirmed.mockResolvedValue({
      sessions: [confirmedSession({ actual: actual({ product: "18-6-12", quantity: 300, quantityUnit: "kg" }) })],
      truncated: false,
    });

    const { applicationsWithUnknownComposition } = await getFarmFertiliserDemand({
      farmId: "farm-1",
      fields: [field()],
      livestockGroups: REAL_LIVESTOCK_GROUPS,
      slurryAllocations: [],
      asOfDate,
    });
    expect(applicationsWithUnknownComposition).toBe(0);
  });

  it("excludes a real confirmed Actual from a prior calendar year from the confirmed total — the same season boundary as field-level remaining", async () => {
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
            confirmedAt: "2025-06-01T10:00:00Z",
            createdAt: "2025-06-01T10:00:00Z",
          } as JobActualRecord,
        },
      ],
      truncated: false,
    });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate: "2026-06-01" });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.confirmedAppliedTotalKg ?? 0).toBe(0);
  });

  it("excludes a 'did_not_happen' confirmed Actual from the confirmed total — no real application occurred", async () => {
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
            completionType: "did_not_happen",
            payload: {},
            confirmedBy: "farmer",
            confirmedAt: "2026-09-08T10:00:00Z",
            createdAt: "2026-09-08T10:00:00Z",
          } as JobActualRecord,
        },
      ],
      truncated: false,
    });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    expect(demand.every((r) => r.confirmedAppliedTotalKg === 0)).toBe(true);
  });

  it("returns an empty array when no field has any real recommendation", async () => {
    mockListDecisions.mockResolvedValue({ decisions: [], truncated: false });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    // No soil index recorded — fertilityEvidence not OK, purchasedProducts forced to [].
    const bareField = field({ fertility: {} });
    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [bareField], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    expect(demand).toEqual([]);
  });

  // Codex audit CRITICAL (round 8): a legacy plan `getMatchablePlanForFieldAction`
  // now excludes (its own field is currently tillage, or the farm has
  // no recorded livestock) must not still contribute a real, concrete
  // "Planned" quantity here — a third active/executable interpretation
  // of a since-recognised-unsupported basis.
  it("excludes a real, single-product, unlinked plan from Planned once its own field is currently tillage", async () => {
    const tillageField = field({ id: "field-1", plannedUse: { value: "tillage", status: "verified", source: "Farmer" } });
    mockListDecisions.mockResolvedValue({
      decisions: [
        planDecision({
          id: "d1",
          outcome: "accepted",
          fieldId: "field-1",
          estimateSnapshot: {
            status: "OK",
            value: { fieldId: "field-1", products: [{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7 }] },
            evidenceState: "IRISH_MODEL",
          },
        }),
      ],
      truncated: false,
    });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [tillageField], livestockGroups: REAL_LIVESTOCK_GROUPS, slurryAllocations: [], asOfDate });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.plannedTotalKg ?? 0).toBe(0);
  });

  it("excludes a real, single-product, unlinked plan from Planned once the farm has no recorded livestock", async () => {
    mockListDecisions.mockResolvedValue({
      decisions: [
        planDecision({
          id: "d1",
          outcome: "accepted",
          fieldId: "field-1",
          estimateSnapshot: {
            status: "OK",
            value: { fieldId: "field-1", products: [{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7 }] },
            evidenceState: "IRISH_MODEL",
          },
        }),
      ],
      truncated: false,
    });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const { demand } = await getFarmFertiliserDemand({ farmId: "farm-1", fields: [field()], livestockGroups: [], slurryAllocations: [], asOfDate });
    const row = demand.find((r) => r.product === "18-6-12");
    expect(row?.plannedTotalKg ?? 0).toBe(0);
  });

  // Codex audit CRITICAL/HIGH (round 9): round 8's own fix only checked
  // the two named tillage/missing-livestock cases — not equivalent to a
  // full recompute. A field that now has no recorded P/K Soil Index (a
  // real, different reason the live recommendation is no longer OK)
  // must exclude a legacy plan from both Recommended and Planned too.
  it("excludes both Recommended and Planned for a field that no longer has a recorded P/K Soil Index", async () => {
    const noEvidenceField = field({ id: "field-1", fertility: {} });
    mockListDecisions.mockResolvedValue({
      decisions: [
        planDecision({
          id: "d1",
          outcome: "accepted",
          fieldId: "field-1",
          estimateSnapshot: {
            status: "OK",
            value: { fieldId: "field-1", products: [{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7 }] },
            evidenceState: "IRISH_MODEL",
          },
        }),
      ],
      truncated: false,
    });
    mockListConfirmed.mockResolvedValue({ sessions: [], truncated: false });

    const { demand } = await getFarmFertiliserDemand({
      farmId: "farm-1",
      fields: [noEvidenceField],
      livestockGroups: REAL_LIVESTOCK_GROUPS,
      slurryAllocations: [],
      asOfDate,
    });
    expect(demand).toEqual([]);
  });
});

describe("sanitiseDecisionRecordForClient", () => {
  function fertiliserDecision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
    return {
      id: "decision-1",
      farmId: "farm-1",
      promptId: "prompt-1",
      calculationKind: "fertiliser_recommendation",
      fieldId: "field-1",
      estimateSnapshot: {
        status: "OK",
        value: { fieldId: "field-1", areaHa: 4, products: [{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7, costEur: 165 }] },
        evidenceState: "IRISH_MODEL",
      },
      outcome: "accepted",
      decidedBy: "farmer",
      decidedAt: "2026-09-01T09:00:00Z",
      createdAt: "2026-09-01T09:00:00Z",
      ...overrides,
    };
  }

  // Codex audit CRITICAL (round 8): a third, independent path
  // (`src/app/(app)/records/page.tsx`) forwards a real, persisted
  // Decision straight to a client component — a Decision persisted
  // before round 6's own `sanitiseRecommendedProduct` fix existed can
  // still carry a real per-product mock `costEur` inside it.
  it("strips a real per-product mock costEur from a legacy fertiliser Decision's own frozen snapshot", () => {
    const sanitised = sanitiseDecisionRecordForClient(fertiliserDecision());
    expect(sanitised.estimateSnapshot.status).toBe("OK");
    if (sanitised.estimateSnapshot.status !== "OK") throw new Error("expected OK");
    const value = sanitised.estimateSnapshot.value as { products: Array<Record<string, unknown>> };
    expect(value.products[0]).not.toHaveProperty("costEur");
    expect(value.products[0]).toEqual({ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7 });
  });

  it("never touches a non-fertiliser Decision", () => {
    const decision = fertiliserDecision({ calculationKind: "commonage_status", estimateSnapshot: { status: "NOT_APPLICABLE", reasonCode: "X" } });
    expect(sanitiseDecisionRecordForClient(decision)).toEqual(decision);
  });

  it("never touches a non-OK fertiliser Decision", () => {
    const decision = fertiliserDecision({ estimateSnapshot: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "X", missingInputs: [] } });
    expect(sanitiseDecisionRecordForClient(decision)).toEqual(decision);
  });

  it("is a no-op for a Decision whose products already carry no costEur", () => {
    const decision = fertiliserDecision({
      estimateSnapshot: {
        status: "OK",
        value: { fieldId: "field-1", areaHa: 4, products: [{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7 }] },
        evidenceState: "IRISH_MODEL",
      },
    });
    expect(sanitiseDecisionRecordForClient(decision)).toEqual(decision);
  });
});
