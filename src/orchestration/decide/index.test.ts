import { describe, expect, it } from "vitest";
import type { EngineOutcome } from "@/domain/evidence";
import { decideAsFarmer } from "./index";

describe("decideAsFarmer", () => {
  const basis: EngineOutcome<{ weightKg: number }> = { status: "OK", value: { weightKg: 320 }, evidenceState: "MEASURED" };
  const prompt = { id: "prompt-1", farmId: "farm-1", kind: "weight_observation_due", basis };

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it("builds an accepted Decision carrying the prompt's id/farmId/kind/basis and decidedBy: farmer", () => {
    const decision = decideAsFarmer(prompt, "accepted", "2026-08-29T09:00:00Z", { animalId: "animal-1" });
    // Codex audit round 4 (Medium) — id must be a real uuid, matching the
    // decisions table's primary key, not a hand-built string.
    expect(decision.id).toMatch(UUID_RE);
    expect(decision).toEqual({
      id: decision.id,
      promptId: "prompt-1",
      farmId: "farm-1",
      calculationKind: "weight_observation_due",
      estimateSnapshot: basis,
      outcome: "accepted",
      edits: { animalId: "animal-1" },
      decidedBy: "farmer",
      decidedAt: "2026-08-29T09:00:00Z",
    });
  });

  it("builds a dismissed Decision with no edits", () => {
    const decision = decideAsFarmer(prompt, "dismissed", "2026-08-29T09:00:00Z");
    expect(decision.outcome).toBe("dismissed");
    expect(decision.edits).toBeUndefined();
    expect(decision.decidedBy).toBe("farmer");
  });

  // Codex audit round 6 (HIGH) — accepting/editing a Prompt whose basis
  // isn't "OK" would persist a Decision saying the farmer accepted a
  // blocked/legally-prohibited suggestion. Only dismissal is valid then.
  it("rejects accepting or editing a Prompt whose basis is not OK", () => {
    const blockedPrompt = {
      id: "prompt-3",
      farmId: "farm-1",
      kind: "spreading_window",
      basis: { status: "LEGAL_PROHIBITION", reasonCode: "CLOSED_PERIOD", consequence: "Spreading is prohibited now." } as const,
    };
    expect(() => decideAsFarmer(blockedPrompt, "accepted", "2026-08-29T09:00:00Z")).toThrow(/cannot accepted prompt/);
    expect(() => decideAsFarmer(blockedPrompt, "edited", "2026-08-29T09:00:00Z")).toThrow(/cannot edited prompt/);
    // Dismissing a blocked Prompt is still fine.
    expect(() => decideAsFarmer(blockedPrompt, "dismissed", "2026-08-29T09:00:00Z")).not.toThrow();
  });

  // Codex audit round 4 (Medium) — estimateSnapshot must be a real,
  // independent snapshot: mutating the Prompt's basis afterwards must
  // never change a Decision already built from it.
  it("estimateSnapshot is an independent snapshot, not a shared reference to the Prompt's basis", () => {
    const mutableBasis: EngineOutcome<{ weightKg: number }> = { status: "OK", value: { weightKg: 320 }, evidenceState: "MEASURED" };
    const mutablePrompt = { id: "prompt-2", farmId: "farm-1", kind: "weight_observation_due", basis: mutableBasis };
    const decision = decideAsFarmer(mutablePrompt, "accepted", "2026-08-29T09:00:00Z");
    expect(decision.estimateSnapshot).toEqual(mutableBasis);
    if (mutableBasis.status === "OK") {
      mutableBasis.value.weightKg = 999;
    }
    expect(decision.estimateSnapshot).toEqual({ status: "OK", value: { weightKg: 320 }, evidenceState: "MEASURED" });
  });
});
