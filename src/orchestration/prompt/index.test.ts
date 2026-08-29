import { describe, expect, it } from "vitest";
import { buildPrompt, describeBlockedBasis } from "./index";
import type { EngineOutcome } from "@/domain/evidence";

describe("describeBlockedBasis", () => {
  it("describes BLOCKED_INSUFFICIENT_EVIDENCE with its reason code and missing inputs", () => {
    const basis: EngineOutcome<unknown> = {
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "MISSING_SOIL_FERTILITY_INDEX",
      missingInputs: ["pIndex", "kIndex"],
    };
    expect(describeBlockedBasis(basis as Exclude<EngineOutcome<unknown>, { status: "OK" }>)).toBe(
      "Not enough evidence yet (MISSING_SOIL_FERTILITY_INDEX) — missing: pIndex, kIndex.",
    );
  });

  it("describes AMBIGUOUS with its detail", () => {
    const basis: EngineOutcome<unknown> = {
      status: "AMBIGUOUS",
      reasonCode: "AMBIGUOUS_STATUTORY_BOUNDARY",
      detail: "boundary interpretation unclear",
    };
    expect(describeBlockedBasis(basis as Exclude<EngineOutcome<unknown>, { status: "OK" }>)).toBe(
      "Unresolved: boundary interpretation unclear",
    );
  });

  it("describes NOT_APPLICABLE with its reason code", () => {
    const basis: EngineOutcome<unknown> = { status: "NOT_APPLICABLE", reasonCode: "LESS_GATE_NOT_APPLICABLE" };
    expect(describeBlockedBasis(basis as Exclude<EngineOutcome<unknown>, { status: "OK" }>)).toBe(
      "Not applicable here (LESS_GATE_NOT_APPLICABLE).",
    );
  });

  it("describes LEGAL_PROHIBITION with its consequence", () => {
    const basis: EngineOutcome<unknown> = {
      status: "LEGAL_PROHIBITION",
      reasonCode: "COMMONAGE_NO_CHEMICAL_FERTILISER",
      consequence: "chemical fertiliser is prohibited on commonage land",
    };
    expect(describeBlockedBasis(basis as Exclude<EngineOutcome<unknown>, { status: "OK" }>)).toBe(
      "Not permitted: chemical fertiliser is prohibited on commonage land",
    );
  });

  it("describes UNKNOWN with its reason code", () => {
    const basis: EngineOutcome<unknown> = { status: "UNKNOWN", reasonCode: "UNKNOWN_BLOCK" };
    expect(describeBlockedBasis(basis as Exclude<EngineOutcome<unknown>, { status: "OK" }>)).toBe(
      "Status unknown (UNKNOWN_BLOCK).",
    );
  });
});

describe("buildPrompt", () => {
  // Structural assertion for the deferred BLOCKERS.md finding ("Prompt's
  // blocked-description isn't yet structurally enforced"): buildPrompt
  // takes no `description` parameter for the non-OK branch at all — there
  // is no argument a caller could pass to override it, so this test
  // exercises the *only* code path a real caller has.
  it("for a non-OK basis, description always equals describeBlockedBasis(basis) — no parameter can override it", () => {
    const basis: EngineOutcome<{ weightKg: number }> = {
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "MISSING_SOIL_FERTILITY_INDEX",
      missingInputs: ["pIndex"],
    };
    const prompt = buildPrompt({
      id: "prompt-1",
      farmId: "farm-1",
      fieldId: "field-1",
      kind: "some_kind",
      basis,
      createdAt: "2026-08-29T09:00:00Z",
      titleWhenBlocked: "Needs review",
      describeOk: () => {
        throw new Error("describeOk must never be called for a non-OK basis");
      },
    });
    expect(prompt.description).toBe(describeBlockedBasis(basis as Exclude<EngineOutcome<unknown>, { status: "OK" }>));
    expect(prompt.title).toBe("Needs review");
    // Codex audit HIGH (audit-logs/20260829T104708Z.md): basis is now a
    // real, independent clone, not the same object reference — see the
    // dedicated mutation-independence test below.
    expect(prompt.basis).toEqual(basis);
    // Codex audit HIGH (audit-logs/20260829T085255Z.md): a field-scoped
    // Prompt must carry a real, inspectable fieldId — not just bake the
    // field into freeform title/description prose.
    expect(prompt.fieldId).toBe("field-1");
  });

  it("fieldId is absent (not empty-string) when the caller doesn't supply one — not every Prompt kind is field-scoped", () => {
    const basis: EngineOutcome<{ weightKg: number }> = { status: "OK", value: { weightKg: 320 }, evidenceState: "MEASURED" };
    const prompt = buildPrompt({
      id: "prompt-3",
      farmId: "farm-1",
      kind: "some_kind",
      basis,
      createdAt: "2026-08-29T09:00:00Z",
      titleWhenBlocked: "unused",
      describeOk: () => ({ title: "t", description: "d" }),
    });
    expect(prompt.fieldId).toBeUndefined();
  });

  it("for an OK basis, title/description come from describeOk, and basis is carried through unchanged", () => {
    const basis: EngineOutcome<{ weightKg: number }> = { status: "OK", value: { weightKg: 320 }, evidenceState: "MEASURED" };
    const prompt = buildPrompt({
      id: "prompt-2",
      farmId: "farm-1",
      kind: "some_kind",
      basis,
      createdAt: "2026-08-29T09:00:00Z",
      regulatory: "planning_advice",
      titleWhenBlocked: "unused",
      describeOk: (value, evidenceState) => ({
        title: `Weight: ${value.weightKg}kg`,
        description: `Evidence: ${evidenceState}`,
      }),
    });
    expect(prompt.title).toBe("Weight: 320kg");
    expect(prompt.description).toBe("Evidence: MEASURED");
    expect(prompt.regulatory).toBe("planning_advice");
    expect(prompt.basis).toEqual(basis);
  });

  // Codex audit HIGH (audit-logs/20260829T104708Z.md): a shared reference
  // to the caller's basis would let it be mutated after the Prompt was
  // built, silently rewriting the Prompt's own calculation result while
  // inputsSnapshot stayed frozen — an internal inconsistency between a
  // Prompt's own two trace fields. Same discipline as inputsSnapshot's
  // own mutation-independence test below.
  it("basis is an independent snapshot, not a shared reference to the caller's object", () => {
    const mutableBasis: EngineOutcome<{ weightKg: number }> = { status: "OK", value: { weightKg: 320 }, evidenceState: "MEASURED" };
    const prompt = buildPrompt({
      id: "prompt-9",
      farmId: "farm-1",
      kind: "some_kind",
      basis: mutableBasis,
      createdAt: "2026-08-29T09:00:00Z",
      titleWhenBlocked: "unused",
      describeOk: (value) => ({ title: `Weight: ${value.weightKg}kg`, description: "d" }),
    });
    if (mutableBasis.status === "OK") {
      mutableBasis.value.weightKg = 999;
    }
    expect(prompt.basis).toEqual({ status: "OK", value: { weightKg: 320 }, evidenceState: "MEASURED" });
  });

  it("carries calculationVersion through when supplied, and leaves it undefined otherwise", () => {
    const basis: EngineOutcome<{ weightKg: number }> = { status: "OK", value: { weightKg: 320 }, evidenceState: "MEASURED" };
    const withVersion = buildPrompt({
      id: "prompt-4",
      farmId: "farm-1",
      kind: "some_kind",
      basis,
      createdAt: "2026-08-29T09:00:00Z",
      calculationVersion: "soil_test_validity_v1.0.0",
      titleWhenBlocked: "unused",
      describeOk: () => ({ title: "t", description: "d" }),
    });
    expect(withVersion.calculationVersion).toBe("soil_test_validity_v1.0.0");

    const withoutVersion = buildPrompt({
      id: "prompt-5",
      farmId: "farm-1",
      kind: "some_kind",
      basis,
      createdAt: "2026-08-29T09:00:00Z",
      titleWhenBlocked: "unused",
      describeOk: () => ({ title: "t", description: "d" }),
    });
    expect(withoutVersion.calculationVersion).toBeUndefined();
  });

  it("carries inputsSnapshot through when supplied, and leaves it undefined otherwise", () => {
    const basis: EngineOutcome<{ weightKg: number }> = { status: "OK", value: { weightKg: 320 }, evidenceState: "MEASURED" };
    const snapshot = { sampleDate: "2025-08-29", rawPMgL: 4 };
    const withSnapshot = buildPrompt({
      id: "prompt-6",
      farmId: "farm-1",
      kind: "some_kind",
      basis,
      createdAt: "2026-08-29T09:00:00Z",
      inputsSnapshot: snapshot,
      titleWhenBlocked: "unused",
      describeOk: () => ({ title: "t", description: "d" }),
    });
    expect(withSnapshot.inputsSnapshot).toEqual(snapshot);

    const withoutSnapshot = buildPrompt({
      id: "prompt-7",
      farmId: "farm-1",
      kind: "some_kind",
      basis,
      createdAt: "2026-08-29T09:00:00Z",
      titleWhenBlocked: "unused",
      describeOk: () => ({ title: "t", description: "d" }),
    });
    expect(withoutSnapshot.inputsSnapshot).toBeUndefined();
  });

  // Codex audit HIGH (audit-logs/20260829T095253Z.md): buildPrompt stored
  // the caller's inputsSnapshot object by reference, so mutating it after
  // the Prompt was built silently rewrote the Prompt's own trace — the
  // same independent-snapshot guarantee decideAsFarmer already applies to
  // estimateSnapshot, now applied to inputsSnapshot at the point it first
  // enters a Prompt (before decideAsFarmer's own clone even runs).
  it("inputsSnapshot is an independent snapshot, not a shared reference to the caller's object", () => {
    const basis: EngineOutcome<{ weightKg: number }> = { status: "OK", value: { weightKg: 320 }, evidenceState: "MEASURED" };
    const mutableSnapshot: Record<string, unknown> = { sampleDate: "2025-08-29", rawPMgL: 4 };
    const prompt = buildPrompt({
      id: "prompt-8",
      farmId: "farm-1",
      kind: "some_kind",
      basis,
      createdAt: "2026-08-29T09:00:00Z",
      inputsSnapshot: mutableSnapshot,
      titleWhenBlocked: "unused",
      describeOk: () => ({ title: "t", description: "d" }),
    });
    mutableSnapshot.rawPMgL = 999;
    expect(prompt.inputsSnapshot).toEqual({ sampleDate: "2025-08-29", rawPMgL: 4 });
  });
});
