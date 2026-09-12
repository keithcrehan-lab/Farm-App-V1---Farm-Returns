import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Direct tests for the soil-sampling actions' own real filtering/
 * derivation logic (Codex audit MEDIUM, round 3 of this checkpoint's
 * own audit, 2026-09-12: the round 1/2 fixes to these two functions
 * shipped with no test coverage). Same mocking convention
 * `fertiliser-plan.test.ts` already established — mock every real farm-
 * data/action I/O boundary, exercise the real code in between.
 */
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/decisions", () => ({ getDecisionById: vi.fn() }));
vi.mock("@/lib/farm-data/job-sessions", () => ({
  getJobSessionById: vi.fn(),
  listActiveJobSessionsForFarm: vi.fn(),
  listConfirmedJobSessionsForFarm: vi.fn(),
}));
vi.mock("@/lib/farm-data/soil-core-observations", () => ({
  insertSoilCoreObservation: vi.fn(),
  listSoilCoreObservationsForSession: vi.fn(),
}));
vi.mock("@/orchestration/job-session", () => ({ startJobSessionFromPrompt: vi.fn() }));
vi.mock("@/app/actions/job-sessions", () => ({ confirmJobSessionActualAction: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { getDecisionById } from "@/lib/farm-data/decisions";
import { getJobSessionById, listConfirmedJobSessionsForFarm } from "@/lib/farm-data/job-sessions";
import { listSoilCoreObservationsForSession } from "@/lib/farm-data/soil-core-observations";
import { confirmJobSessionActualAction } from "@/app/actions/job-sessions";
import { listFieldCompositeSamplesAction, confirmSoilSamplingSessionAction } from "./soil-sampling";
import type { DecisionRecord, JobSessionRecord, SoilCoreObservationRecord } from "@/lib/farm-data/mappers";
import type { JobSessionWithActual } from "@/lib/farm-data/job-sessions";
import type { Farm } from "@/domain/types";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockGetDecisionById = vi.mocked(getDecisionById);
const mockGetJobSessionById = vi.mocked(getJobSessionById);
const mockListConfirmedJobSessionsForFarm = vi.mocked(listConfirmedJobSessionsForFarm);
const mockListSoilCoreObservationsForSession = vi.mocked(listSoilCoreObservationsForSession);
const mockConfirmJobSessionActualAction = vi.mocked(confirmJobSessionActualAction);

afterEach(() => {
  vi.clearAllMocks();
});

const FARM_ID = "farm-1";
const FIELD_ID = "field-1";
const DECISION_ID = "decision-1";

function farm(): Farm {
  return {
    id: FARM_ID,
    userId: "user-1",
    name: "Test Farm",
    county: "Cork",
    centroid: [-8.5, 52.0],
    primaryEnterprises: [],
    units: "metric",
    ownerName: "Farmer",
  } as unknown as Farm;
}

function confirmedSession(overrides: Partial<JobSessionWithActual> = {}): JobSessionWithActual {
  return {
    id: "session-1",
    farmId: FARM_ID,
    decisionId: DECISION_ID,
    activityType: "soil_sampling",
    origin: "prompt",
    status: "confirmed_actual",
    primaryFieldId: FIELD_ID,
    fieldSegments: [],
    activeIntervals: [],
    interruptionGaps: [],
    createdAt: "2026-09-12T09:00:00.000Z",
    updatedAt: "2026-09-12T09:00:00.000Z",
    hasGpsTrace: true,
    actual: {
      id: "actual-1",
      farmId: FARM_ID,
      jobSessionId: "session-1",
      revision: 1,
      activityType: "soil_sampling",
      completionType: "whole",
      payload: { activityType: "soil_sampling", fieldIds: [FIELD_ID], samplingZoneId: "A", coreCount: 20, methodologyVersion: "soil_sampling_plan_v1.0.0" },
      confirmedBy: "farmer",
      confirmedAt: "2026-09-12T10:00:00.000Z",
      createdAt: "2026-09-12T10:00:00.000Z",
    },
    ...overrides,
  };
}

function decision(inputsSnapshot: Record<string, unknown>): DecisionRecord {
  return {
    id: DECISION_ID,
    promptId: "prompt-1",
    farmId: FARM_ID,
    calculationKind: "soil_sampling_plan",
    fieldId: FIELD_ID,
    inputsSnapshot,
    estimateSnapshot: { status: "OK", value: {}, evidenceState: "IRISH_MODEL" },
    outcome: "accepted",
    decidedBy: "farmer",
    decidedAt: "2026-09-12T09:00:00.000Z",
    createdAt: "2026-09-12T09:00:00.000Z",
  };
}

describe("listFieldCompositeSamplesAction", () => {
  it("excludes a did_not_happen confirmation — no real sample was taken", async () => {
    mockGetFarm.mockResolvedValue(farm());
    mockListConfirmedJobSessionsForFarm.mockResolvedValue({
      sessions: [confirmedSession({ actual: { ...confirmedSession().actual!, completionType: "did_not_happen" } })],
      truncated: false,
    });

    const result = await listFieldCompositeSamplesAction(FIELD_ID);

    expect(result.samples).toEqual([]);
  });

  it("includes a real whole-completion confirmation, resolving its zone area from the uncapped decision lookup", async () => {
    mockGetFarm.mockResolvedValue(farm());
    mockListConfirmedJobSessionsForFarm.mockResolvedValue({ sessions: [confirmedSession()], truncated: false });
    mockGetDecisionById.mockResolvedValue(decision({ zoneId: "A", zoneAreaHa: 3.1 }));

    const result = await listFieldCompositeSamplesAction(FIELD_ID);

    expect(result.samples).toHaveLength(1);
    expect(result.samples[0].representedAreaHa).toBe(3.1);
    expect(result.samples[0].coreCount).toBe(20);
  });

  it("never fabricates a represented area when the decision cannot be resolved — leaves it undefined, not 0", async () => {
    mockGetFarm.mockResolvedValue(farm());
    mockListConfirmedJobSessionsForFarm.mockResolvedValue({ sessions: [confirmedSession()], truncated: false });
    mockGetDecisionById.mockResolvedValue(null);

    const result = await listFieldCompositeSamplesAction(FIELD_ID);

    expect(result.samples[0].representedAreaHa).toBeUndefined();
  });

  it("propagates the underlying reader's own truncation flag — never silently presents an incomplete list as complete", async () => {
    mockGetFarm.mockResolvedValue(farm());
    mockListConfirmedJobSessionsForFarm.mockResolvedValue({ sessions: [], truncated: true });

    const result = await listFieldCompositeSamplesAction(FIELD_ID);

    expect(result.truncated).toBe(true);
  });
});

describe("confirmSoilSamplingSessionAction", () => {
  it("derives fieldIds/samplingZoneId/coreCount server-side from the real session and decision, never from client input", async () => {
    mockGetFarm.mockResolvedValue(farm());
    mockGetJobSessionById.mockResolvedValue({
      id: "session-1",
      farmId: FARM_ID,
      decisionId: DECISION_ID,
      activityType: "soil_sampling",
      origin: "prompt",
      status: "completed_estimated",
      primaryFieldId: FIELD_ID,
      fieldSegments: [],
      activeIntervals: [],
      interruptionGaps: [],
      createdAt: "2026-09-12T09:00:00.000Z",
      updatedAt: "2026-09-12T09:00:00.000Z",
    } as JobSessionRecord);
    mockGetDecisionById.mockResolvedValue(decision({ zoneId: "A" }));
    const realCores: SoilCoreObservationRecord[] = Array.from({ length: 20 }, (_, i) => ({
      id: `core-${i}`,
      farmId: FARM_ID,
      jobSessionId: "session-1",
      fieldId: FIELD_ID,
      samplingZoneId: "A",
      sequence: i + 1,
      lat: 52.0,
      lng: -8.5,
      recordedAt: "2026-09-12T09:05:00.000Z",
      methodologyVersion: "soil_sampling_plan_v1.0.0",
      createdAt: "2026-09-12T09:05:00.000Z",
    }));
    mockListSoilCoreObservationsForSession.mockResolvedValue(realCores);
    mockConfirmJobSessionActualAction.mockResolvedValue({} as Awaited<ReturnType<typeof confirmJobSessionActualAction>>);

    await confirmSoilSamplingSessionAction({ id: "confirm-1", jobSessionId: "session-1", completionType: "whole" });

    expect(mockConfirmJobSessionActualAction).toHaveBeenCalledWith(
      expect.objectContaining({
        raw: expect.objectContaining({
          fieldIds: [FIELD_ID],
          samplingZoneId: "A",
          coreCount: 20,
        }),
      }),
    );
  });

  it("never trusts a client-supplied coreCount — the real persisted count wins, not a number in raw input", async () => {
    mockGetFarm.mockResolvedValue(farm());
    mockGetJobSessionById.mockResolvedValue({
      id: "session-1",
      farmId: FARM_ID,
      decisionId: DECISION_ID,
      activityType: "soil_sampling",
      origin: "prompt",
      status: "completed_estimated",
      primaryFieldId: FIELD_ID,
      fieldSegments: [],
      activeIntervals: [],
      interruptionGaps: [],
      createdAt: "2026-09-12T09:00:00.000Z",
      updatedAt: "2026-09-12T09:00:00.000Z",
    } as JobSessionRecord);
    mockGetDecisionById.mockResolvedValue(decision({ zoneId: "A" }));
    // Zero real cores recorded, whatever a caller might otherwise claim.
    mockListSoilCoreObservationsForSession.mockResolvedValue([]);
    mockConfirmJobSessionActualAction.mockResolvedValue({} as Awaited<ReturnType<typeof confirmJobSessionActualAction>>);

    await confirmSoilSamplingSessionAction({ id: "confirm-1", jobSessionId: "session-1", completionType: "whole" });

    expect(mockConfirmJobSessionActualAction).toHaveBeenCalledWith(expect.objectContaining({ raw: expect.objectContaining({ coreCount: 0 }) }));
  });
});
