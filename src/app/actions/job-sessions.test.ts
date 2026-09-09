import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Farm Return Next v1.1 — direct tests for `applyQueuedJobActualConfirmationAction`
 * itself, added in response to Codex audit HIGH (round 3, docs/overnight/
 * audits/gps-job-session-actual-contract-codex-audit-round3.md, finding
 * 2): this offline-sync action previously passed a client-supplied
 * `ConfirmJobActualInput.payload` straight to the farm-data layer's
 * `confirmJobSessionActual`, which explicitly trusts its caller already
 * ran `validateJobActualInput` — but nothing on this path ever had. The
 * online action (`confirmJobSessionActualAction`) already re-validates
 * against real, freshly fetched fields (see its own tests via
 * `job-actuals.test.ts` and `src/orchestration/job-session`); these tests
 * prove the offline-sync target now gets the identical treatment, using
 * the real `validateJobActualInput` (not mocked) against a mocked
 * `listFieldsForFarm`/`confirmJobSessionActual`.
 */
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/job-actuals", () => ({ confirmJobSessionActual: vi.fn() }));
vi.mock("@/lib/farm-data/job-sessions", () => ({
  insertJobSession: vi.fn(),
  updateJobSessionStatus: vi.fn(),
}));
vi.mock("@/lib/farm-data/decisions", () => ({ insertDecision: vi.fn() }));
vi.mock("@/lib/farm-data/livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry", () => ({ listSlurryAllocationsForFarm: vi.fn() }));
vi.mock("@/orchestration/job-session", () => ({
  cancelJobSessionAction: vi.fn(),
  confirmJobSessionActualAction: vi.fn(),
  finishJobSessionAction: vi.fn(),
  pauseJobSessionAction: vi.fn(),
  resumeJobSessionAction: vi.fn(),
  startJobSessionFromPrompt: vi.fn(),
  startManualJobSession: vi.fn(),
}));
vi.mock("@/orchestration/prompt/recompute", () => ({ recomputePromptByKind: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { confirmJobSessionActual, type ConfirmJobActualInput } from "@/lib/farm-data/job-actuals";
import { insertDecision, type DecisionInput } from "@/lib/farm-data/decisions";
import { insertJobSession, type NewJobSessionInput } from "@/lib/farm-data/job-sessions";
import { startJobSessionFromPrompt, startManualJobSession } from "@/orchestration/job-session";
import { recomputePromptByKind } from "@/orchestration/prompt/recompute";
import {
  applyQueuedJobActualConfirmationAction,
  applyQueuedManualJobSessionStartAction,
  startManualJobSessionAction,
  startJobSessionFromPromptAction,
} from "./job-sessions";
import type { Farm, Field } from "@/domain/types";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockListLivestockGroups = vi.mocked(listLivestockGroupsForFarm);
const mockListSlurryAllocations = vi.mocked(listSlurryAllocationsForFarm);
const mockConfirmJobSessionActual = vi.mocked(confirmJobSessionActual);
const mockStartManualJobSession = vi.mocked(startManualJobSession);
const mockStartJobSessionFromPrompt = vi.mocked(startJobSessionFromPrompt);
const mockRecomputePromptByKind = vi.mocked(recomputePromptByKind);
const mockInsertDecision = vi.mocked(insertDecision);
const mockInsertJobSession = vi.mocked(insertJobSession);

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
  return {
    id: "field-7",
    farmId: "farm-1",
    name: "Field 7",
    areaHa: 6.8,
    centroid: [0, 0],
    fertility: {},
    ...overrides,
  } as Field;
}

const validInput: ConfirmJobActualInput = {
  id: "actual-1",
  farmId: "farm-1",
  jobSessionId: "session-1",
  activityType: "fertiliser_spreading",
  completionType: "whole",
  payload: {
    activityType: "fertiliser_spreading",
    completionType: "whole",
    fieldIds: ["field-7"],
    product: "CAN",
    quantity: 250,
    quantityUnit: "kg",
    areaHa: 6.8,
  },
  confirmedAt: "2026-09-02T11:00:00Z",
};

describe("applyQueuedJobActualConfirmationAction", () => {
  it("re-validates a queued payload against real, freshly fetched fields before ever calling confirmJobSessionActual", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockConfirmJobSessionActual.mockResolvedValue({
      actual: { id: "actual-1", revision: 1 } as never,
      sessionStatusUpdateError: undefined,
    });

    const result = await applyQueuedJobActualConfirmationAction(validInput);

    expect(mockListFields).toHaveBeenCalledWith("farm-1");
    expect(mockConfirmJobSessionActual).toHaveBeenCalledWith(
      expect.objectContaining({ id: "actual-1", farmId: "farm-1" }),
    );
    expect(result.actual.id).toBe("actual-1");
  });

  it("rejects a queued payload missing a required field (Codex audit HIGH, round 3) rather than silently forwarding it to confirmJobSessionActual", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);

    await expect(
      applyQueuedJobActualConfirmationAction({
        ...validInput,
        payload: { activityType: "fertiliser_spreading", completionType: "whole", fieldIds: [] },
      }),
    ).rejects.toThrow(/invalid queued Actual payload/);
    expect(mockConfirmJobSessionActual).not.toHaveBeenCalled();
  });

  it("reconstructs the raw input from the queued payload plus the top-level completionType/note, so re-validation runs against the real submitted values", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockConfirmJobSessionActual.mockResolvedValue({
      actual: { id: "actual-1", revision: 1 } as never,
      sessionStatusUpdateError: undefined,
    });

    await applyQueuedJobActualConfirmationAction({ ...validInput, note: "queued while offline" });

    expect(mockConfirmJobSessionActual).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ note: "queued while offline" }) }),
    );
  });
});

/**
 * Codex audit MEDIUM (round 10, GPS Job Mode campaign,
 * docs/farm-return-next/audit-logs/20260904T225928Z.md):
 * `startManualJobSession` inserts its Decision row *before* creating the
 * job session (the latter alone protected by the database's own
 * same-farm trigger) — a stale, deleted, or cross-farm `primaryFieldId`
 * previously let the Decision persist successfully while the job
 * session insert then failed, leaving an orphaned, misleading "accepted"
 * decision with no session behind it. `startManualJobSessionAction` now
 * validates the field against this farm's own real fields *before*
 * calling `startManualJobSession` at all — the same check
 * `startJobSessionFromPromptAction` already has.
 */
describe("startManualJobSessionAction — field validated before any row is persisted", () => {
  it("rejects a primaryFieldId that isn't a real field on the current farm, without ever calling startManualJobSession", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);

    await expect(
      startManualJobSessionAction({
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
        primaryFieldId: "field-does-not-exist",
      }),
    ).rejects.toThrow(/field field-does-not-exist not found/);
    expect(mockStartManualJobSession).not.toHaveBeenCalled();
  });

  // Codex audit HIGH (round 33) gave "fertiliser_spreading" its own real
  // fail-closed evidence gates below (a new describe block) — these two
  // pre-existing tests never intended to exercise that, so they're
  // retargeted to a genuinely gate-free activity type to keep testing
  // their own original, narrower intent (field validation only).
  it("proceeds when primaryFieldId is a real field on the current farm", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockStartManualJobSession.mockResolvedValue({
      decision: { id: "decision-1" } as never,
      jobSession: { id: "session-1" } as never,
    });

    const result = await startManualJobSessionAction({
      activityType: "livestock_work",
      jobSessionId: "session-1",
      primaryFieldId: "field-7",
    });

    expect(mockStartManualJobSession).toHaveBeenCalledWith(expect.objectContaining({ primaryFieldId: "field-7" }));
    expect(result.jobSession.id).toBe("session-1");
  });

  it("never looks up fields at all when no primaryFieldId is supplied — a fieldless manual start stays valid for a non-fertiliser activity", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockStartManualJobSession.mockResolvedValue({
      decision: { id: "decision-1" } as never,
      jobSession: { id: "session-1" } as never,
    });

    await startManualJobSessionAction({ activityType: "livestock_work", jobSessionId: "session-1" });

    expect(mockListFields).not.toHaveBeenCalled();
    expect(mockStartManualJobSession).toHaveBeenCalled();
  });
});

// Codex audit HIGH (round 33): `startManualJobSessionAction` is the one
// real fertiliser-spreading job-start boundary round 32 never covered —
// a manual/detected start (this is the exact fallback
// `GpsActivityCandidateCard.confirm()` calls whenever GPS plan matching
// returns "none"/"ambiguous") bypassed every fail-closed evidence/legal
// gate this vertical has built, since `constructManualJobStartDecision`
// builds a bare, ungated Decision for every activity type by design.
describe("startManualJobSessionAction — fertiliser_spreading gets real fail-closed gates", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T09:00:00.000Z")); // clearly open: Cork (Zone A) closed period is 15 Sep - 29 Jan
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a fieldless fertiliser_spreading start outright — every gate this vertical enforces is field-scoped", async () => {
    mockGetFarm.mockResolvedValue(farm);

    await expect(startManualJobSessionAction({ activityType: "fertiliser_spreading", jobSessionId: "session-1" })).rejects.toThrow(
      /must specify primaryFieldId/,
    );
    expect(mockRecomputePromptByKind).not.toHaveBeenCalled();
    expect(mockStartManualJobSession).not.toHaveBeenCalled();
  });

  it("rejects when the live recomputed recommendation basis is blocked", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockRecomputePromptByKind.mockReturnValue({
      id: "prompt-1",
      farmId: "farm-1",
      fieldId: "field-7",
      kind: "fertiliser_recommendation",
      title: "x",
      description: "x",
      basis: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: ["FIELD_SOIL_TEST"] },
      createdAt: "2026-06-15T09:00:00Z",
    });

    await expect(
      startManualJobSessionAction({ activityType: "fertiliser_spreading", jobSessionId: "session-1", primaryFieldId: "field-7" }),
    ).rejects.toThrow(/MISSING_SOIL_FERTILITY_INDEX/);
    expect(mockStartManualJobSession).not.toHaveBeenCalled();
  });

  it("rejects when the closed-period calendar prohibits chemical fertiliser for this farm county/date, even with an OK recommendation basis", async () => {
    vi.setSystemTime(new Date("2026-10-01T09:00:00.000Z")); // Cork (Zone A) closed period: 15 Sep - 29 Jan
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockRecomputePromptByKind.mockReturnValue({
      id: "prompt-1",
      farmId: "farm-1",
      fieldId: "field-7",
      kind: "fertiliser_recommendation",
      title: "x",
      description: "x",
      basis: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" },
      createdAt: "2026-10-01T09:00:00Z",
    });

    await expect(
      startManualJobSessionAction({ activityType: "fertiliser_spreading", jobSessionId: "session-1", primaryFieldId: "field-7" }),
    ).rejects.toThrow(/cannot start this job/);
    expect(mockStartManualJobSession).not.toHaveBeenCalled();
  });

  it("lets a tillage field's NOT_APPLICABLE basis through — a scope limitation, not a real prohibition", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockRecomputePromptByKind.mockReturnValue({
      id: "prompt-1",
      farmId: "farm-1",
      fieldId: "field-7",
      kind: "fertiliser_recommendation",
      title: "x",
      description: "x",
      basis: { status: "NOT_APPLICABLE", reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED" },
      createdAt: "2026-06-15T09:00:00Z",
    });
    mockStartManualJobSession.mockResolvedValue({ decision: { id: "decision-1" } as never, jobSession: { id: "session-1" } as never });

    await startManualJobSessionAction({ activityType: "fertiliser_spreading", jobSessionId: "session-1", primaryFieldId: "field-7" });

    expect(mockStartManualJobSession).toHaveBeenCalled();
  });

  it("proceeds when the live basis is OK and the calendar is open", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockRecomputePromptByKind.mockReturnValue({
      id: "prompt-1",
      farmId: "farm-1",
      fieldId: "field-7",
      kind: "fertiliser_recommendation",
      title: "x",
      description: "x",
      basis: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" },
      createdAt: "2026-06-15T09:00:00Z",
    });
    mockStartManualJobSession.mockResolvedValue({ decision: { id: "decision-1" } as never, jobSession: { id: "session-1" } as never });

    await startManualJobSessionAction({ activityType: "fertiliser_spreading", jobSessionId: "session-1", primaryFieldId: "field-7" });

    expect(mockStartManualJobSession).toHaveBeenCalled();
  });
});

// Codex audit HIGH (round 33): the offline-sync twin of the block above
// — a queued fertiliser_spreading start previously bypassed the same
// gates unconditionally, dated by `now()` at sync time rather than the
// real, disclosed `decision.decidedAt` the job actually started at.
describe("applyQueuedManualJobSessionStartAction — fertiliser_spreading is re-verified at sync time, dated to when it was actually queued", () => {
  const decisionInput: DecisionInput = {
    id: "decision-1",
    farmId: "farm-1",
    promptId: "prompt-1",
    calculationKind: "manual_job_start",
    estimateSnapshot: { status: "OK", value: { manual: true, activityType: "fertiliser_spreading" }, evidenceState: "MEASURED" },
    outcome: "accepted",
    decidedBy: "farmer",
    decidedAt: "2026-06-15T09:00:00Z",
    fieldId: "field-7",
  };
  const jobSessionInput: NewJobSessionInput = {
    id: "session-1",
    farmId: "farm-1",
    decisionId: "decision-1",
    activityType: "fertiliser_spreading",
    origin: "manual",
    status: "active",
    primaryFieldId: "field-7",
  };

  it("never touches farm-scoped evidence for a non-fertiliser queued start — the pre-existing, unrestricted offline path is unchanged", async () => {
    mockInsertDecision.mockResolvedValue({ ...decisionInput, createdAt: "2026-06-15T09:00:01Z" } as never);
    mockInsertJobSession.mockResolvedValue({ id: "session-1" } as never);

    await applyQueuedManualJobSessionStartAction({
      decision: { ...decisionInput, calculationKind: "manual_job_start" },
      jobSession: { ...jobSessionInput, activityType: "livestock_work" },
    });

    expect(mockGetFarm).not.toHaveBeenCalled();
    expect(mockInsertDecision).toHaveBeenCalled();
    expect(mockInsertJobSession).toHaveBeenCalled();
  });

  it("rejects a fieldless queued fertiliser_spreading start", async () => {
    mockGetFarm.mockResolvedValue(farm);

    await expect(
      applyQueuedManualJobSessionStartAction({ decision: { ...decisionInput, fieldId: undefined }, jobSession: jobSessionInput }),
    ).rejects.toThrow(/must carry decision.fieldId/);
    expect(mockInsertDecision).not.toHaveBeenCalled();
    expect(mockInsertJobSession).not.toHaveBeenCalled();
  });

  // Codex audit HIGH (round 34): the gates above ran against
  // `decision.fieldId`, but nothing verified the *persisted* jobSession
  // actually corresponds to that same validated Decision/field — both
  // are independently client-supplied on this offline-sync path.
  it("rejects when jobSession.decisionId does not match decision.id — never persist a job for a Decision that wasn't the one validated", async () => {
    await expect(
      applyQueuedManualJobSessionStartAction({ decision: decisionInput, jobSession: { ...jobSessionInput, decisionId: "some-other-decision" } }),
    ).rejects.toThrow(/jobSession.decisionId must match decision.id/);
    expect(mockGetFarm).not.toHaveBeenCalled();
    expect(mockInsertDecision).not.toHaveBeenCalled();
    expect(mockInsertJobSession).not.toHaveBeenCalled();
  });

  it("rejects when jobSession.primaryFieldId does not match decision.fieldId — a validated field-A Decision can never authorise a field-B job", async () => {
    await expect(
      applyQueuedManualJobSessionStartAction({ decision: decisionInput, jobSession: { ...jobSessionInput, primaryFieldId: "field-B" } }),
    ).rejects.toThrow(/jobSession.primaryFieldId must equal decision.fieldId/);
    expect(mockInsertDecision).not.toHaveBeenCalled();
    expect(mockInsertJobSession).not.toHaveBeenCalled();
  });

  it("rejects when a fieldSegments entry references a field other than the one validated", async () => {
    await expect(
      applyQueuedManualJobSessionStartAction({
        decision: decisionInput,
        jobSession: { ...jobSessionInput, fieldSegments: [{ fieldId: "field-7" }, { fieldId: "field-B" }] },
      }),
    ).rejects.toThrow(/every fieldSegments entry must reference the same validated field/);
    expect(mockInsertDecision).not.toHaveBeenCalled();
    expect(mockInsertJobSession).not.toHaveBeenCalled();
  });

  it("rejects when the recommendation basis at the queued decidedAt was blocked", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockRecomputePromptByKind.mockReturnValue({
      id: "prompt-1",
      farmId: "farm-1",
      fieldId: "field-7",
      kind: "fertiliser_recommendation",
      title: "x",
      description: "x",
      basis: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: ["FIELD_SOIL_TEST"] },
      createdAt: decisionInput.decidedAt,
    });

    await expect(applyQueuedManualJobSessionStartAction({ decision: decisionInput, jobSession: jobSessionInput })).rejects.toThrow(
      /MISSING_SOIL_FERTILITY_INDEX/,
    );
    expect(mockRecomputePromptByKind).toHaveBeenCalledWith(expect.objectContaining({ now: decisionInput.decidedAt }));
    expect(mockInsertDecision).not.toHaveBeenCalled();
  });

  it("rejects when the queued decidedAt fell inside the statutory closed period, even with an OK recommendation basis", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockRecomputePromptByKind.mockReturnValue({
      id: "prompt-1",
      farmId: "farm-1",
      fieldId: "field-7",
      kind: "fertiliser_recommendation",
      title: "x",
      description: "x",
      basis: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" },
      createdAt: "2026-10-01T09:00:00Z",
    });

    await expect(
      applyQueuedManualJobSessionStartAction({ decision: { ...decisionInput, decidedAt: "2026-10-01T09:00:00Z" }, jobSession: jobSessionInput }),
    ).rejects.toThrow(/cannot sync this job/);
    expect(mockInsertDecision).not.toHaveBeenCalled();
  });

  it("syncs successfully when the basis was OK and the queued date was outside the closed period", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockRecomputePromptByKind.mockReturnValue({
      id: "prompt-1",
      farmId: "farm-1",
      fieldId: "field-7",
      kind: "fertiliser_recommendation",
      title: "x",
      description: "x",
      basis: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" },
      createdAt: decisionInput.decidedAt,
    });
    mockInsertDecision.mockResolvedValue({ ...decisionInput, createdAt: "2026-06-15T09:00:01Z" } as never);
    mockInsertJobSession.mockResolvedValue({ id: "session-1" } as never);

    const result = await applyQueuedManualJobSessionStartAction({ decision: decisionInput, jobSession: jobSessionInput });

    expect(result.jobSession.id).toBe("session-1");
    expect(mockInsertDecision).toHaveBeenCalled();
  });
});

// Codex audit HIGH (round 8) — this pre-existing, cross-cutting action
// never validated `activityType` against `promptKind` at all; for the
// fertiliser_recommendation kind this campaign added, a direct caller
// could submit any activityType alongside a real, recomputed fertiliser
// recommendation, producing a real accepted fertiliser Decision linked
// to a semantically unrelated job.
describe("startJobSessionFromPromptAction — activityType must match a fertiliser_recommendation Prompt", () => {
  // Codex audit HIGH (round 32, extended): this action now re-verifies
  // the real statutory closed-period calendar for a fertiliser_recommendation
  // Prompt — a fixed "clearly open" date keeps every other test in this
  // block stable regardless of the real wall-clock date (`farm` is Cork,
  // Zone A, closed for chemical fertiliser 15 Sep - 29 Jan).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T09:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects any activityType other than "fertiliser_spreading" for a fertiliser_recommendation Prompt', async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);

    await expect(
      startJobSessionFromPromptAction({
        promptKind: "fertiliser_recommendation",
        fieldId: "field-7",
        activityType: "slurry_spreading",
        jobSessionId: "session-1",
        origin: "prompt",
      }),
    ).rejects.toThrow(/must be "fertiliser_spreading"/);
    expect(mockRecomputePromptByKind).not.toHaveBeenCalled();
    expect(mockStartJobSessionFromPrompt).not.toHaveBeenCalled();
  });

  it('accepts "fertiliser_spreading" for a real fertiliser_recommendation Prompt', async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockRecomputePromptByKind.mockReturnValue({
      id: "prompt-1",
      farmId: "farm-1",
      fieldId: "field-7",
      kind: "fertiliser_recommendation",
      title: "x",
      description: "x",
      basis: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" },
      createdAt: "2026-09-08T09:00:00Z",
    });
    mockStartJobSessionFromPrompt.mockResolvedValue({ decision: { id: "decision-1" } as never, jobSession: { id: "session-1" } as never });

    await startJobSessionFromPromptAction({
      promptKind: "fertiliser_recommendation",
      fieldId: "field-7",
      activityType: "fertiliser_spreading",
      jobSessionId: "session-1",
      origin: "prompt",
    });

    expect(mockStartJobSessionFromPrompt).toHaveBeenCalledWith(expect.objectContaining({ activityType: "fertiliser_spreading" }));
  });

  it("rejects starting a fertiliser_recommendation job during the farm county's real statutory closed period — the recomputed Prompt's own basis never carries this check", async () => {
    vi.setSystemTime(new Date("2026-10-01T09:00:00.000Z")); // Cork (Zone A) chemical-fertiliser closed period: 15 Sep - 29 Jan
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockListLivestockGroups.mockResolvedValue([]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockRecomputePromptByKind.mockReturnValue({
      id: "prompt-1",
      farmId: "farm-1",
      fieldId: "field-7",
      kind: "fertiliser_recommendation",
      title: "x",
      description: "x",
      basis: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" },
      createdAt: "2026-10-01T09:00:00Z",
    });

    await expect(
      startJobSessionFromPromptAction({
        promptKind: "fertiliser_recommendation",
        fieldId: "field-7",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
        origin: "prompt",
      }),
    ).rejects.toThrow(/cannot start this job/);
    expect(mockStartJobSessionFromPrompt).not.toHaveBeenCalled();
  });

  it("never validates activityType for a non-fertiliser Prompt kind — that pre-existing behaviour is unchanged", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);
    mockRecomputePromptByKind.mockReturnValue({
      id: "prompt-1",
      farmId: "farm-1",
      fieldId: "field-7",
      kind: "commonage_status",
      title: "x",
      description: "x",
      basis: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" },
      createdAt: "2026-09-08T09:00:00Z",
    });
    mockStartJobSessionFromPrompt.mockResolvedValue({ decision: { id: "decision-1" } as never, jobSession: { id: "session-1" } as never });

    await startJobSessionFromPromptAction({
      promptKind: "commonage_status",
      fieldId: "field-7",
      activityType: "fertiliser_spreading",
      jobSessionId: "session-1",
      origin: "prompt",
    });

    expect(mockStartJobSessionFromPrompt).toHaveBeenCalled();
  });
});
