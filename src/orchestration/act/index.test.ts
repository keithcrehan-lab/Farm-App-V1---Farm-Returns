import { afterEach, describe, expect, it, vi } from "vitest";
import type { Decision } from "@/orchestration/decide";
import type { EngineOutcome } from "@/domain/evidence";
import type { WeightObservation } from "@/domain/types";

/**
 * Proves `ARCHITECTURE.md`'s reuse boundary end-to-end: Act calls the
 * *existing* `farm-data/individual-animals.ts` mutation, never a
 * reimplementation of it. Mocking that one function (not Supabase itself)
 * mirrors `farm-store.sync.test.tsx`'s existing pattern for testing a
 * caller of a `server-only` mutation module without a real database.
 */
vi.mock("@/lib/farm-data/individual-animals", () => ({
  addWeightObservation: vi.fn(),
}));

import { addWeightObservation } from "@/lib/farm-data/individual-animals";
import { actRecordWeightObservation } from "./index";

const mockAddWeightObservation = vi.mocked(addWeightObservation);

afterEach(() => {
  vi.clearAllMocks();
});

const testBasis: EngineOutcome<unknown> = { status: "OK", value: null, evidenceState: "MEASURED" };

const baseDecision: Decision = {
  id: "decision-1",
  promptId: "prompt-1",
  farmId: "farm-1",
  calculationKind: "weight_observation_due",
  estimateSnapshot: testBasis,
  outcome: "accepted",
  edits: { animalId: "animal-1", weightKg: 320, observedDate: "2026-08-29" },
  decidedBy: "farmer",
  decidedAt: "2026-08-29T09:00:00Z",
};

describe("actRecordWeightObservation", () => {
  it("calls the existing farm-data mutation with the Decision's farmId/edits, never reimplementing the write", async () => {
    const observation: WeightObservation = {
      id: "obs-1",
      animalId: "animal-1",
      weightKg: 320,
      observedDate: "2026-08-29",
      source: "GPS job mode",
    };
    mockAddWeightObservation.mockResolvedValue(observation);

    const result = await actRecordWeightObservation(baseDecision, "GPS job mode");

    expect(mockAddWeightObservation).toHaveBeenCalledWith("farm-1", "animal-1", 320, "2026-08-29", "GPS job mode");
    expect(result).toEqual({ jobType: "record_weight_observation", decisionId: "decision-1", record: observation });
  });

  it("fails closed on a Decision missing the required edits, rather than silently coercing it", async () => {
    const malformed: Decision = { ...baseDecision, edits: { animalId: "animal-1" } };
    await expect(actRecordWeightObservation(malformed, "GPS job mode")).rejects.toThrow(/missing valid animalId\/weightKg\/observedDate/);
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });

  it("fails closed on a dismissed Decision with no edits at all", async () => {
    const dismissed: Decision = { ...baseDecision, outcome: "dismissed", edits: undefined };
    await expect(actRecordWeightObservation(dismissed, "GPS job mode")).rejects.toThrow();
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });

  // Codex audit finding, docs/farm-return-next/audit-logs/20260829T001857Z.md
  // (HIGH): the first version only validated edits' shape, never
  // decision.outcome/decidedBy — a dismissed decision that still carried
  // edits, or a structurally-valid auto_rule decision, would have written
  // a real record with no farmer confirmation. These pin the fix.
  it("fails closed on a dismissed Decision that still carries edits (never trust edits' presence over outcome)", async () => {
    const dismissedWithEdits: Decision = { ...baseDecision, outcome: "dismissed" };
    await expect(actRecordWeightObservation(dismissedWithEdits, "GPS job mode")).rejects.toThrow(/outcome "dismissed"/);
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });

  it("fails closed on a structurally-valid auto_rule Decision — no reviewed auto-rule may call Act yet", async () => {
    const autoRule: Decision = { ...baseDecision, decidedBy: "auto_rule" };
    await expect(actRecordWeightObservation(autoRule, "GPS job mode")).rejects.toThrow(/decided by "auto_rule"/);
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });

  // Codex audit finding (MEDIUM): edit parsing accepted NaN/infinite/
  // zero/negative weights and empty-string ids/dates through to the
  // persistence mutation.
  it.each([
    ["NaN weight", { animalId: "animal-1", weightKg: NaN, observedDate: "2026-08-29" }],
    ["infinite weight", { animalId: "animal-1", weightKg: Infinity, observedDate: "2026-08-29" }],
    ["zero weight", { animalId: "animal-1", weightKg: 0, observedDate: "2026-08-29" }],
    ["negative weight", { animalId: "animal-1", weightKg: -10, observedDate: "2026-08-29" }],
    ["empty animalId", { animalId: "", weightKg: 320, observedDate: "2026-08-29" }],
    ["empty observedDate", { animalId: "animal-1", weightKg: 320, observedDate: "" }],
  ])("fails closed on %s", async (_label, edits) => {
    const invalid: Decision = { ...baseDecision, edits };
    await expect(actRecordWeightObservation(invalid, "GPS job mode")).rejects.toThrow(/missing valid/);
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });

  // Codex audit round 11 (HIGH) — the first version never checked *which*
  // Prompt a Decision was for, or whether its own snapshot was genuinely
  // OK, so any accepted Decision with suitably-shaped edits could create
  // a real weight observation.
  it("fails closed on an accepted Decision for a different calculationKind", async () => {
    const wrongKind: Decision = { ...baseDecision, calculationKind: "spreading_window" };
    await expect(actRecordWeightObservation(wrongKind, "GPS job mode")).rejects.toThrow(/calculationKind "spreading_window"/);
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });

  it("fails closed on an accepted Decision whose estimateSnapshot is not OK", async () => {
    const blockedSnapshot: Decision = {
      ...baseDecision,
      estimateSnapshot: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_LIVESTOCK_AGE", missingInputs: ["age"] },
    };
    await expect(actRecordWeightObservation(blockedSnapshot, "GPS job mode")).rejects.toThrow(
      /estimateSnapshot has status "BLOCKED_INSUFFICIENT_EVIDENCE"/,
    );
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });
});
