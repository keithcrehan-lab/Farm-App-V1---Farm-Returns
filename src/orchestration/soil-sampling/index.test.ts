import { afterEach, describe, expect, it, vi } from "vitest";

// Same mocking convention `job-session/index.test.ts` already
// establishes: mock every real I/O boundary this orchestration module
// touches, so its own authorization logic can be proven without a live
// database (Codex audit MEDIUM, round 3 of this checkpoint's own audit,
// 2026-09-12: the round 1/2 authorization fixes shipped with no test
// coverage at all).
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/decisions", () => ({ getDecisionById: vi.fn() }));
vi.mock("@/lib/farm-data/job-sessions", () => ({ getJobSessionById: vi.fn() }));
vi.mock("@/lib/farm-data/soil-core-observations", () => ({
  insertSoilCoreObservation: vi.fn(),
  listSoilCoreObservationsForSession: vi.fn(),
}));
vi.mock("@/orchestration/job-session", () => ({ startJobSessionFromPrompt: vi.fn() }));

import { recordSoilCoreObservation, listVerifiedSoilCoreObservationsForSession } from "./index";
import { getDecisionById } from "@/lib/farm-data/decisions";
import { getJobSessionById } from "@/lib/farm-data/job-sessions";
import { insertSoilCoreObservation, listSoilCoreObservationsForSession } from "@/lib/farm-data/soil-core-observations";
import type { JobSessionRecord, SoilCoreObservationRecord } from "@/lib/farm-data/mappers";
import type { DecisionRecord } from "@/lib/farm-data/mappers";

const mockGetDecisionById = vi.mocked(getDecisionById);
const mockGetJobSessionById = vi.mocked(getJobSessionById);
const mockInsertSoilCoreObservation = vi.mocked(insertSoilCoreObservation);
const mockListSoilCoreObservationsForSession = vi.mocked(listSoilCoreObservationsForSession);

afterEach(() => {
  vi.clearAllMocks();
});

const FARM_ID = "farm-1";
const SESSION_ID = "session-1";
const FIELD_ID = "field-1";
const OTHER_FIELD_ID = "field-2";
const DECISION_ID = "decision-1";

function session(overrides: Partial<JobSessionRecord> = {}): JobSessionRecord {
  return {
    id: SESSION_ID,
    farmId: FARM_ID,
    decisionId: DECISION_ID,
    activityType: "soil_sampling",
    origin: "prompt",
    status: "active",
    primaryFieldId: FIELD_ID,
    fieldSegments: [],
    activeIntervals: [],
    interruptionGaps: [],
    createdAt: "2026-09-12T09:00:00.000Z",
    updatedAt: "2026-09-12T09:00:00.000Z",
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

function core(overrides: Partial<SoilCoreObservationRecord> = {}): SoilCoreObservationRecord {
  return {
    id: "core-1",
    farmId: FARM_ID,
    jobSessionId: SESSION_ID,
    fieldId: FIELD_ID,
    samplingZoneId: "A",
    sequence: 1,
    lat: 52.0,
    lng: -8.5,
    recordedAt: "2026-09-12T09:05:00.000Z",
    methodologyVersion: "soil_sampling_plan_v1.0.0",
    createdAt: "2026-09-12T09:05:00.000Z",
    ...overrides,
  };
}

describe("recordSoilCoreObservation", () => {
  it("rejects a core claiming a zone the session was not authorised for, even though it's the same farm/field", async () => {
    mockGetJobSessionById.mockResolvedValue(session());
    mockGetDecisionById.mockResolvedValue(decision({ zoneId: "A" }));

    await expect(
      recordSoilCoreObservation({
        id: "core-1",
        farmId: FARM_ID,
        jobSessionId: SESSION_ID,
        fieldId: FIELD_ID,
        samplingZoneId: "B", // not the authorised zone
        sequence: 1,
        lat: 52.0,
        lng: -8.5,
        recordedAt: "2026-09-12T09:05:00.000Z",
      }),
    ).rejects.toThrow(/not authorised for zone/);
    expect(mockInsertSoilCoreObservation).not.toHaveBeenCalled();
  });

  it("rejects a core claiming a different field than the session's own real field", async () => {
    mockGetJobSessionById.mockResolvedValue(session());
    mockGetDecisionById.mockResolvedValue(decision({ zoneId: "A" }));

    await expect(
      recordSoilCoreObservation({
        id: "core-1",
        farmId: FARM_ID,
        jobSessionId: SESSION_ID,
        fieldId: OTHER_FIELD_ID,
        samplingZoneId: "A",
        sequence: 1,
        lat: 52.0,
        lng: -8.5,
        recordedAt: "2026-09-12T09:05:00.000Z",
      }),
    ).rejects.toThrow(/scoped to a different field/);
    expect(mockInsertSoilCoreObservation).not.toHaveBeenCalled();
  });

  it("rejects when the authorising decision has no real zoneId at all", async () => {
    mockGetJobSessionById.mockResolvedValue(session());
    mockGetDecisionById.mockResolvedValue(null);

    await expect(
      recordSoilCoreObservation({
        id: "core-1",
        farmId: FARM_ID,
        jobSessionId: SESSION_ID,
        fieldId: FIELD_ID,
        samplingZoneId: "A",
        sequence: 1,
        lat: 52.0,
        lng: -8.5,
        recordedAt: "2026-09-12T09:05:00.000Z",
      }),
    ).rejects.toThrow(/no real zoneId/);
  });

  it("rejects while the session is not ready/active", async () => {
    mockGetJobSessionById.mockResolvedValue(session({ status: "paused" }));

    await expect(
      recordSoilCoreObservation({
        id: "core-1",
        farmId: FARM_ID,
        jobSessionId: SESSION_ID,
        fieldId: FIELD_ID,
        samplingZoneId: "A",
        sequence: 1,
        lat: 52.0,
        lng: -8.5,
        recordedAt: "2026-09-12T09:05:00.000Z",
      }),
    ).rejects.toThrow(/cores can only be recorded/);
  });

  it("accepts a core matching the session's real field/zone, and returns a verified count from persisted cores only", async () => {
    mockGetJobSessionById.mockResolvedValue(session());
    mockGetDecisionById.mockResolvedValue(decision({ zoneId: "A" }));
    mockInsertSoilCoreObservation.mockResolvedValue(core());
    // One matching core, one mismatched-zone core that must not be
    // counted — proves the post-insert count itself is verified, not a
    // raw row count.
    mockListSoilCoreObservationsForSession.mockResolvedValue([core(), core({ id: "core-2", samplingZoneId: "B" })]);

    const result = await recordSoilCoreObservation({
      id: "core-1",
      farmId: FARM_ID,
      jobSessionId: SESSION_ID,
      fieldId: FIELD_ID,
      samplingZoneId: "A",
      sequence: 1,
      lat: 52.0,
      lng: -8.5,
      recordedAt: "2026-09-12T09:05:00.000Z",
    });

    expect(mockInsertSoilCoreObservation).toHaveBeenCalledTimes(1);
    expect(result.totalCores).toBe(1);
  });
});

describe("listVerifiedSoilCoreObservationsForSession", () => {
  it("filters out a core whose own fieldId/samplingZoneId doesn't match the session's real authorised zone", async () => {
    mockGetJobSessionById.mockResolvedValue(session());
    mockGetDecisionById.mockResolvedValue(decision({ zoneId: "A" }));
    mockListSoilCoreObservationsForSession.mockResolvedValue([
      core({ id: "core-1", samplingZoneId: "A" }),
      core({ id: "core-2", samplingZoneId: "B" }), // wrong zone
      core({ id: "core-3", fieldId: OTHER_FIELD_ID }), // wrong field
    ]);

    const result = await listVerifiedSoilCoreObservationsForSession(FARM_ID, SESSION_ID);

    expect(result.map((c) => c.id)).toEqual(["core-1"]);
  });

  it("returns an empty list, never throwing, when the session is not a real soil_sampling session", async () => {
    mockGetJobSessionById.mockResolvedValue(session({ activityType: "fertiliser_spreading" }));

    const result = await listVerifiedSoilCoreObservationsForSession(FARM_ID, SESSION_ID);

    expect(result).toEqual([]);
  });

  it("returns an empty list when the session genuinely does not exist", async () => {
    mockGetJobSessionById.mockResolvedValue(null);

    const result = await listVerifiedSoilCoreObservationsForSession(FARM_ID, SESSION_ID);

    expect(result).toEqual([]);
  });
});
