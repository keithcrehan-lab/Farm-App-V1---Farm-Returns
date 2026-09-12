import { afterEach, describe, expect, it, vi } from "vitest";

// Same mocking convention `soil-sampling/index.test.ts` already
// established — mock every real farm-data I/O boundary this
// orchestration module touches, exercise its own real glue logic.
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/job-sessions", () => ({ getJobSessionById: vi.fn() }));
vi.mock("@/lib/farm-data/lab-results", () => ({ insertLabResult: vi.fn(), getLabResultForSession: vi.fn() }));
vi.mock("@/lib/farm-data/soil-interpretations", () => ({ insertSoilInterpretation: vi.fn(), getCurrentSoilInterpretationForLabResult: vi.fn() }));
vi.mock("@/lib/farm-data/soil", () => ({ addSoilTestToField: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { getJobSessionById } from "@/lib/farm-data/job-sessions";
import { insertLabResult, getLabResultForSession } from "@/lib/farm-data/lab-results";
import { insertSoilInterpretation } from "@/lib/farm-data/soil-interpretations";
import { addSoilTestToField } from "@/lib/farm-data/soil";
import { recordLabResultForCompositeSample } from "./index";
import type { Farm, Field } from "@/domain/types";
import type { JobSessionRecord, LabResultRecord, SoilInterpretationRecord } from "@/lib/farm-data/mappers";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockGetJobSessionById = vi.mocked(getJobSessionById);
const mockInsertLabResult = vi.mocked(insertLabResult);
const mockGetLabResultForSession = vi.mocked(getLabResultForSession);
const mockInsertSoilInterpretation = vi.mocked(insertSoilInterpretation);
const mockAddSoilTestToField = vi.mocked(addSoilTestToField);

afterEach(() => {
  vi.clearAllMocks();
});

const FARM_ID = "farm-1";
const FIELD_ID = "field-1";
const SESSION_ID = "session-1";

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

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: FIELD_ID,
    farmId: FARM_ID,
    name: "Home Field",
    areaHa: 4.5,
    centroid: [-8.495, 52.005],
    fertility: {},
    history: [],
    ...overrides,
  };
}

function confirmedSession(overrides: Partial<JobSessionRecord> = {}): JobSessionRecord {
  return {
    id: SESSION_ID,
    farmId: FARM_ID,
    decisionId: "decision-1",
    activityType: "soil_sampling",
    origin: "prompt",
    status: "confirmed_actual",
    primaryFieldId: FIELD_ID,
    fieldSegments: [],
    activeIntervals: [],
    interruptionGaps: [],
    createdAt: "2026-09-13T09:00:00.000Z",
    updatedAt: "2026-09-13T09:00:00.000Z",
    ...overrides,
  };
}

const BASE_INPUT = {
  id: "lab-result-1",
  jobSessionId: SESSION_ID,
  laboratory: "Southern Labs",
  labReportRef: "SL-2026-001",
  analysisDate: "2026-09-10",
  ph: 6.3,
  pMgL: 4.0,
  kMgL: 90,
};

describe("recordLabResultForCompositeSample", () => {
  it("rejects when the session does not exist", async () => {
    mockGetFarm.mockResolvedValue(farm());
    mockGetJobSessionById.mockResolvedValue(null);
    await expect(recordLabResultForCompositeSample(BASE_INPUT)).rejects.toThrow(/not found/);
  });

  it("rejects when the session is not a soil sampling session", async () => {
    mockGetFarm.mockResolvedValue(farm());
    mockGetJobSessionById.mockResolvedValue(confirmedSession({ activityType: "fertiliser_spreading" }));
    await expect(recordLabResultForCompositeSample(BASE_INPUT)).rejects.toThrow(/not a soil sampling session/);
  });

  it("rejects when the composite sample is not yet confirmed — a lab result cannot attach to an in-progress session", async () => {
    mockGetFarm.mockResolvedValue(farm());
    mockGetJobSessionById.mockResolvedValue(confirmedSession({ status: "active" }));
    await expect(recordLabResultForCompositeSample(BASE_INPUT)).rejects.toThrow(/can only attach to a confirmed composite sample/);
  });

  it("rejects when this composite sample already has a lab result — at most one per sample", async () => {
    mockGetFarm.mockResolvedValue(farm());
    mockGetJobSessionById.mockResolvedValue(confirmedSession());
    mockGetLabResultForSession.mockResolvedValue({} as LabResultRecord);
    await expect(recordLabResultForCompositeSample(BASE_INPUT)).rejects.toThrow(/already has a lab result/);
    expect(mockInsertLabResult).not.toHaveBeenCalled();
  });

  it("on the happy path: persists the raw LabResult, a real SoilInterpretation, and applies it to Field.fertility via the existing addSoilTestToField — with composite-sample provenance attached", async () => {
    mockGetFarm.mockResolvedValue(farm());
    mockGetJobSessionById.mockResolvedValue(confirmedSession());
    mockGetLabResultForSession.mockResolvedValue(null);
    mockListFields.mockResolvedValue([field({ plannedUse: { value: "grazing", status: "verified", source: "farmer" } })]);
    const labResultRecord: LabResultRecord = {
      id: "lab-result-1",
      farmId: FARM_ID,
      jobSessionId: SESSION_ID,
      fieldId: FIELD_ID,
      laboratory: "Southern Labs",
      labReportRef: "SL-2026-001",
      analysisDate: "2026-09-10",
      ph: 6.3,
      pMgL: 4.0,
      kMgL: 90,
      enteredBy: "farmer",
      enteredAt: "2026-09-13T10:00:00.000Z",
      createdAt: "2026-09-13T10:00:00.000Z",
    };
    mockInsertLabResult.mockResolvedValue(labResultRecord);
    mockInsertSoilInterpretation.mockResolvedValue({} as SoilInterpretationRecord);
    mockAddSoilTestToField.mockResolvedValue(field());

    await recordLabResultForCompositeSample(BASE_INPUT);

    expect(mockInsertLabResult).toHaveBeenCalledWith(expect.objectContaining({ jobSessionId: SESSION_ID, fieldId: FIELD_ID, pMgL: 4.0, kMgL: 90 }));
    expect(mockInsertSoilInterpretation).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldId: FIELD_ID,
        interpretation: expect.objectContaining({ labResultId: "lab-result-1", kIndex: 2 }),
      }),
    );
    expect(mockAddSoilTestToField).toHaveBeenCalledWith(
      FIELD_ID,
      expect.objectContaining({
        p: 4.0,
        k: 90,
        pH: 6.3,
        compositeSampleId: SESSION_ID,
        labResultId: "lab-result-1",
      }),
    );
  });

  it("preserves an AMBIGUOUS_STATUTORY_BOUNDARY P Index outcome through the persisted interpretation, never silently resolving it", async () => {
    mockGetFarm.mockResolvedValue(farm());
    mockGetJobSessionById.mockResolvedValue(confirmedSession());
    mockGetLabResultForSession.mockResolvedValue(null);
    mockListFields.mockResolvedValue([field({ plannedUse: { value: "grazing", status: "verified", source: "farmer" } })]);
    mockInsertLabResult.mockResolvedValue({
      id: "lab-result-1",
      farmId: FARM_ID,
      jobSessionId: SESSION_ID,
      fieldId: FIELD_ID,
      laboratory: "Southern Labs",
      labReportRef: "SL-2026-001",
      analysisDate: "2026-09-10",
      ph: 6.3,
      pMgL: 8.005, // grassland ambiguous gap (8.0, 8.01]
      kMgL: 90,
      enteredBy: "farmer",
      enteredAt: "2026-09-13T10:00:00.000Z",
      createdAt: "2026-09-13T10:00:00.000Z",
    });
    mockInsertSoilInterpretation.mockResolvedValue({} as SoilInterpretationRecord);
    mockAddSoilTestToField.mockResolvedValue(field());

    await recordLabResultForCompositeSample({ ...BASE_INPUT, pMgL: 8.005 });

    expect(mockInsertSoilInterpretation).toHaveBeenCalledWith(
      expect.objectContaining({
        interpretation: expect.objectContaining({
          pIndexOutcome: expect.objectContaining({ status: "AMBIGUOUS" }),
          pIndex: 4,
          pIndexConservativeTreatment: true,
        }),
      }),
    );
  });
});
