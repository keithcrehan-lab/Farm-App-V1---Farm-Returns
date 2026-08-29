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

  // Checkpoint 2, Vertical B / Codex audit HIGH
  // (audit-logs/20260829T085836Z.md): a field-scoped Prompt's fieldId must
  // survive into its Decision, or the trace is lost the moment the Prompt
  // (never persisted) goes away.
  it("carries the prompt's fieldId onto the Decision when present", () => {
    const fieldScopedPrompt = { ...prompt, fieldId: "field-1" };
    const decision = decideAsFarmer(fieldScopedPrompt, "accepted", "2026-08-29T09:00:00Z", { animalId: "animal-1" });
    expect(decision.fieldId).toBe("field-1");
  });

  it("leaves fieldId undefined for a Prompt that isn't field-scoped", () => {
    const decision = decideAsFarmer(prompt, "dismissed", "2026-08-29T09:00:00Z");
    expect(decision.fieldId).toBeUndefined();
  });

  it("carries the prompt's calculationVersion onto the Decision when present, and leaves it undefined otherwise", () => {
    const versionedPrompt = { ...prompt, calculationVersion: "soil_test_validity_v1.0.0" };
    const decision = decideAsFarmer(versionedPrompt, "accepted", "2026-08-29T09:00:00Z", { animalId: "animal-1" });
    expect(decision.calculationVersion).toBe("soil_test_validity_v1.0.0");

    const unversioned = decideAsFarmer(prompt, "dismissed", "2026-08-29T09:00:00Z");
    expect(unversioned.calculationVersion).toBeUndefined();
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

  // Checkpoint 2, Vertical B / Codex audit HIGH (audit-logs/20260829T090928Z.md
  // through 20260829T094314Z.md) — the raw inputs behind a compliance
  // Estimate must survive into the Decision too, and as a real,
  // independent snapshot (same discipline as estimateSnapshot), not a
  // shared reference to the Prompt's own object.
  it("carries the prompt's inputsSnapshot onto the Decision as an independent snapshot, and leaves it undefined otherwise", () => {
    const mutableSnapshot: Record<string, unknown> = { sampleDate: "2025-08-29", rawPMgL: 4 };
    const snapshotPrompt = { ...prompt, inputsSnapshot: mutableSnapshot };
    const decision = decideAsFarmer(snapshotPrompt, "accepted", "2026-08-29T09:00:00Z", { animalId: "animal-1" });
    expect(decision.inputsSnapshot).toEqual({ sampleDate: "2025-08-29", rawPMgL: 4 });

    mutableSnapshot.rawPMgL = 999;
    expect(decision.inputsSnapshot).toEqual({ sampleDate: "2025-08-29", rawPMgL: 4 });

    const withoutSnapshot = decideAsFarmer(prompt, "dismissed", "2026-08-29T09:00:00Z");
    expect(withoutSnapshot.inputsSnapshot).toBeUndefined();
  });
});
