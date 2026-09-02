import { afterEach, describe, expect, it, vi } from "vitest";

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
import { confirmJobSessionActual, type ConfirmJobActualInput } from "@/lib/farm-data/job-actuals";
import { applyQueuedJobActualConfirmationAction } from "./job-sessions";
import type { Farm, Field } from "@/domain/types";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockConfirmJobSessionActual = vi.mocked(confirmJobSessionActual);

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
