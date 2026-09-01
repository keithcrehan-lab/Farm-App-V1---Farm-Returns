import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Farm Return Next v1.1 — direct tests for `submitPromptDecisionAction`
 * itself, added in response to Codex audit MEDIUM (round 2,
 * `docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit.md`):
 * every existing test up to this point only mocked this action away
 * (`ExpandedPromptSheet.test.tsx`), so the actual security/provenance
 * fix from round 1 — the server recomputes the Prompt itself rather than
 * trusting a client-supplied one — had no test at its own real boundary.
 *
 * Mocks the three real dependencies this action calls
 * (`getFarmForCurrentUser`, `listFieldsForFarm`, `insertDecision`) but
 * exercises the *real* `decideAsFarmer` and Prompt producers — the point
 * of these tests is proving this action recomputes evidence from real
 * farm/field data, not proving those already-tested pure functions work.
 */
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/decisions", () => ({ insertDecision: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { insertDecision } from "@/lib/farm-data/decisions";
import { submitPromptDecisionAction } from "./decisions";
import type { Farm, Field } from "@/domain/types";
import type { DecisionRecord } from "@/lib/farm-data/mappers";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockInsertDecision = vi.mocked(insertDecision);

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
    id: "field-1",
    farmId: "farm-1",
    name: "Back Meadow",
    areaHa: 4.2,
    centroid: [0, 0],
    fertility: {},
    ...overrides,
  } as Field;
}

function fakeDecisionRecord(): DecisionRecord {
  return {
    id: "decision-1",
    farmId: "farm-1",
    promptId: "prompt-1",
    calculationKind: "commonage_status",
    estimateSnapshot: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "R", missingInputs: [] },
    outcome: "dismissed",
    decidedBy: "farmer",
    decidedAt: "2026-09-01T09:00:00Z",
    createdAt: "2026-09-01T09:00:00Z",
  };
}

describe("submitPromptDecisionAction", () => {
  it("rejects when there is no real signed-in farm, without calling insertDecision", async () => {
    mockGetFarm.mockResolvedValue(null);

    await expect(
      submitPromptDecisionAction({ promptKind: "commonage_status", fieldId: "field-1", outcome: "dismissed" }),
    ).rejects.toThrow(/no real farm/i);
    expect(mockInsertDecision).not.toHaveBeenCalled();
  });

  it("rejects when the fieldId doesn't belong to this farm's own real fields, without calling insertDecision", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field({ id: "field-1" })]);

    await expect(
      submitPromptDecisionAction({ promptKind: "commonage_status", fieldId: "someone-elses-field", outcome: "dismissed" }),
    ).rejects.toThrow(/not found/i);
    expect(mockInsertDecision).not.toHaveBeenCalled();
    // listFieldsForFarm was called with *this session's own* farm.id, not
    // a caller-supplied one — there is no farmId parameter on this action
    // at all, so a request for another farm's field can only ever resolve
    // against this farm's own field list and fail to match.
    expect(mockListFields).toHaveBeenCalledWith("farm-1");
  });

  it("requires material to recompute a spreading_window Prompt, without calling insertDecision", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);

    await expect(
      submitPromptDecisionAction({ promptKind: "spreading_window", fieldId: "field-1", outcome: "dismissed" }),
    ).rejects.toThrow(/material is required/i);
    expect(mockInsertDecision).not.toHaveBeenCalled();
  });

  it("recomputes the real Prompt server-side from the freshly-read field and persists a Decision derived from it — never a client-supplied one", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field({ commonageStatus: undefined })]);
    mockInsertDecision.mockResolvedValue(fakeDecisionRecord());

    await submitPromptDecisionAction({ promptKind: "commonage_status", fieldId: "field-1", outcome: "dismissed" });

    expect(mockInsertDecision).toHaveBeenCalledTimes(1);
    const persisted = mockInsertDecision.mock.calls[0][0];
    expect(persisted.calculationKind).toBe("commonage_status");
    expect(persisted.fieldId).toBe("field-1");
    expect(persisted.farmId).toBe("farm-1");
    expect(persisted.outcome).toBe("dismissed");
    expect(persisted.decidedBy).toBe("farmer");
    // No caller-supplied basis/estimateSnapshot exists on this action's
    // own input type at all (Codex audit HIGH, round 1) — this asserts
    // the real, server-derived evidence classification for a field with
    // no recorded commonageStatus, proving it was actually recomputed,
    // not merely present.
    expect(persisted.estimateSnapshot.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("fails closed with an honest error for an unrecognised promptKind, without calling insertDecision", async () => {
    mockGetFarm.mockResolvedValue(farm);
    mockListFields.mockResolvedValue([field()]);

    // @ts-expect-error deliberately testing a runtime-only invalid value
    await expect(submitPromptDecisionAction({ promptKind: "not_a_real_kind", fieldId: "field-1", outcome: "dismissed" })).rejects.toThrow(
      /unrecognised promptKind/i,
    );
    expect(mockInsertDecision).not.toHaveBeenCalled();
  });
});
