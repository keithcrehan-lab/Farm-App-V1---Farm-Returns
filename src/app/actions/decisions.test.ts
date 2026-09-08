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
vi.mock("@/lib/farm-data/livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry", () => ({ listSlurryAllocationsForFarm: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { insertDecision } from "@/lib/farm-data/decisions";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { submitPromptDecisionAction } from "./decisions";
import type { Farm, Field } from "@/domain/types";
import type { DecisionRecord } from "@/lib/farm-data/mappers";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockInsertDecision = vi.mocked(insertDecision);
const mockListLivestockGroups = vi.mocked(listLivestockGroupsForFarm);
const mockListSlurryAllocations = vi.mocked(listSlurryAllocationsForFarm);

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

  // Codex audit MEDIUM (round 3, docs/overnight/audits/
  // phase-1-visual-nav-today-plan-records-codex-audit-round3.md): round
  // 2 only exercised the commonage_status branch of this action's real
  // switch — the other three real Prompt kinds' own recomputation paths
  // had no direct test at all.
  it.each(["soil_test_age", "local_buffer_override"] as const)(
    "also recomputes a real %s Prompt server-side and persists its own real calculationKind",
    async (promptKind) => {
      mockGetFarm.mockResolvedValue(farm);
      mockListFields.mockResolvedValue([field()]);
      mockInsertDecision.mockResolvedValue({ ...fakeDecisionRecord(), calculationKind: promptKind });

      await submitPromptDecisionAction({ promptKind, fieldId: "field-1", outcome: "dismissed" });

      expect(mockInsertDecision).toHaveBeenCalledTimes(1);
      expect(mockInsertDecision.mock.calls[0][0].calculationKind).toBe(promptKind);
    },
  );

  it("refuses to accept a Prompt whose recomputed evidence is not OK — decideAsFarmer's own real invariant, exercised through this action, not just unit-tested in isolation", async () => {
    mockGetFarm.mockResolvedValue(farm);
    // No recorded commonageStatus — recomputes to BLOCKED_INSUFFICIENT_EVIDENCE, never OK.
    mockListFields.mockResolvedValue([field({ commonageStatus: undefined })]);

    await expect(
      submitPromptDecisionAction({ promptKind: "commonage_status", fieldId: "field-1", outcome: "accepted" }),
    ).rejects.toThrow(/cannot accepted prompt/i);
    expect(mockInsertDecision).not.toHaveBeenCalled();
  });

  // Fertiliser Vertical campaign — "Plan this application" (items 3/4):
  // an accepted/edited fertiliser_recommendation Decision is the real,
  // canonical planned application. These tests exercise the new
  // fetch-livestock/slurry branch and the new edits allowlist wiring,
  // through this action's own real boundary — not just
  // `validateFertiliserPlanEdits` in isolation.
  describe("fertiliser_recommendation", () => {
    function fertiliserField(overrides: Partial<Field> = {}): Field {
      return field({
        fertility: { pIndex: { value: 1, status: "verified", source: "Soil test" }, kIndex: { value: 1, status: "verified", source: "Soil test" } },
        ...overrides,
      });
    }

    // Codex audit CRITICAL (round 6): a genuinely empty `[]` read is now
    // treated as ambiguous ("confirmed zero" vs. "never entered") and
    // fails closed, not a real "here is a live, recommendable field"
    // fixture any more — every test in this block that needs the
    // recomputed basis to reach `OK` uses this real, non-empty fixture
    // instead.
    const realLivestockGroups = [
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

    it("fetches this farm's real livestock groups and slurry allocations to recompute the recommendation, never a fixed/empty default silently", async () => {
      mockGetFarm.mockResolvedValue(farm);
      mockListFields.mockResolvedValue([fertiliserField()]);
      mockListLivestockGroups.mockResolvedValue(realLivestockGroups);
      mockListSlurryAllocations.mockResolvedValue([]);
      mockInsertDecision.mockResolvedValue({ ...fakeDecisionRecord(), calculationKind: "fertiliser_recommendation" });

      await submitPromptDecisionAction({ promptKind: "fertiliser_recommendation", fieldId: "field-1", outcome: "accepted" });

      expect(mockListLivestockGroups).toHaveBeenCalledWith("farm-1");
      expect(mockListSlurryAllocations).toHaveBeenCalledWith("farm-1");
      expect(mockInsertDecision).toHaveBeenCalledTimes(1);
      expect(mockInsertDecision.mock.calls[0][0].calculationKind).toBe("fertiliser_recommendation");
    });

    it("rejects edits supplied for any promptKind other than fertiliser_recommendation", async () => {
      mockGetFarm.mockResolvedValue(farm);
      mockListFields.mockResolvedValue([field()]);

      await expect(
        submitPromptDecisionAction({ promptKind: "commonage_status", fieldId: "field-1", outcome: "dismissed", edits: { plannedProduct: "18-6-12" } }),
      ).rejects.toThrow(/edits are only supported for "fertiliser_recommendation"/);
      expect(mockInsertDecision).not.toHaveBeenCalled();
    });

    it('rejects outcome "edited" for any promptKind other than fertiliser_recommendation', async () => {
      mockGetFarm.mockResolvedValue(farm);
      mockListFields.mockResolvedValue([field()]);

      await expect(
        submitPromptDecisionAction({ promptKind: "commonage_status", fieldId: "field-1", outcome: "edited" }),
      ).rejects.toThrow(/"edited" is only supported for "fertiliser_recommendation"/);
      expect(mockInsertDecision).not.toHaveBeenCalled();
    });

    it('rejects outcome "edited" with no real edits supplied', async () => {
      mockGetFarm.mockResolvedValue(farm);
      mockListFields.mockResolvedValue([fertiliserField()]);
      mockListLivestockGroups.mockResolvedValue(realLivestockGroups);
      mockListSlurryAllocations.mockResolvedValue([]);

      await expect(
        submitPromptDecisionAction({ promptKind: "fertiliser_recommendation", fieldId: "field-1", outcome: "edited" }),
      ).rejects.toThrow(/requires at least one real edit/);
      expect(mockInsertDecision).not.toHaveBeenCalled();
    });

    it('rejects outcome "edited" against a recommendation whose real recomputed basis is not OK — never lets a farmer "edit" a blocked recommendation', async () => {
      mockGetFarm.mockResolvedValue(farm);
      // No recorded soil index — recomputes to BLOCKED_INSUFFICIENT_EVIDENCE.
      mockListFields.mockResolvedValue([field()]);
      mockListLivestockGroups.mockResolvedValue([]);
      mockListSlurryAllocations.mockResolvedValue([]);

      await expect(
        submitPromptDecisionAction({
          promptKind: "fertiliser_recommendation",
          fieldId: "field-1",
          outcome: "edited",
          edits: { plannedQuantityKg: 100 },
        }),
      ).rejects.toThrow(/its basis is "BLOCKED_INSUFFICIENT_EVIDENCE"/);
      expect(mockInsertDecision).not.toHaveBeenCalled();
    });

    it('persists a real "edited" Decision whose edits were validated against the real, server-recomputed recommendation — a fabricated product is rejected before ever reaching insertDecision', async () => {
      mockGetFarm.mockResolvedValue(farm);
      mockListFields.mockResolvedValue([fertiliserField()]);
      mockListLivestockGroups.mockResolvedValue(realLivestockGroups);
      mockListSlurryAllocations.mockResolvedValue([]);

      await expect(
        submitPromptDecisionAction({
          promptKind: "fertiliser_recommendation",
          fieldId: "field-1",
          outcome: "edited",
          edits: { plannedProduct: "a completely fabricated product" },
        }),
      ).rejects.toThrow(/must be one of this recommendation's own real products/);
      expect(mockInsertDecision).not.toHaveBeenCalled();
    });

    it('persists a real "edited" Decision carrying the validated edits once they genuinely match the recomputed recommendation', async () => {
      mockGetFarm.mockResolvedValue(farm);
      mockListFields.mockResolvedValue([fertiliserField()]);
      mockListLivestockGroups.mockResolvedValue(realLivestockGroups);
      mockListSlurryAllocations.mockResolvedValue([]);
      mockInsertDecision.mockResolvedValue({ ...fakeDecisionRecord(), calculationKind: "fertiliser_recommendation", outcome: "edited" });

      await submitPromptDecisionAction({
        promptKind: "fertiliser_recommendation",
        fieldId: "field-1",
        outcome: "edited",
        edits: { plannedQuantityKg: 240, plannedDate: "2026-09-20" },
      });

      expect(mockInsertDecision).toHaveBeenCalledTimes(1);
      const persisted = mockInsertDecision.mock.calls[0][0];
      expect(persisted.outcome).toBe("edited");
      expect(persisted.edits).toEqual({ plannedQuantityKg: 240, plannedDate: "2026-09-20" });
    });
  });
});
