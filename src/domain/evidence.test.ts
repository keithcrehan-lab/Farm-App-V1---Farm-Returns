import { describe, expect, it } from "vitest";
import {
  EVIDENCE_STATE_PRIORITY,
  EVIDENCE_STATE_UI_LABEL,
  REASON_CODES,
  ambiguous,
  blockedInsufficientEvidence,
  isEvidenceState,
  isOk,
  isRegisteredReasonCode,
  legalProhibition,
  notApplicable,
  ok,
  unknown,
  type EvidenceState,
} from "./evidence";

const EVIDENCE_STATES: EvidenceState[] = [
  "MEASURED",
  "DERIVED",
  "IRISH_MODEL",
  "IRISH_DEFAULT",
  "GENERIC_FALLBACK",
  "INSUFFICIENT",
];

describe("EvidenceState", () => {
  it("has a priority and a UI label for all six states", () => {
    for (const state of EVIDENCE_STATES) {
      expect(EVIDENCE_STATE_PRIORITY[state]).toBeTypeOf("number");
      expect(EVIDENCE_STATE_UI_LABEL[state]).toBeTypeOf("string");
    }
  });

  it("ranks MEASURED strongest and INSUFFICIENT weakest", () => {
    expect(EVIDENCE_STATE_PRIORITY.MEASURED).toBeLessThan(EVIDENCE_STATE_PRIORITY.DERIVED);
    expect(EVIDENCE_STATE_PRIORITY.DERIVED).toBeLessThan(EVIDENCE_STATE_PRIORITY.IRISH_MODEL);
    expect(EVIDENCE_STATE_PRIORITY.IRISH_MODEL).toBeLessThan(EVIDENCE_STATE_PRIORITY.IRISH_DEFAULT);
    expect(EVIDENCE_STATE_PRIORITY.IRISH_DEFAULT).toBeLessThan(EVIDENCE_STATE_PRIORITY.GENERIC_FALLBACK);
    expect(EVIDENCE_STATE_PRIORITY.GENERIC_FALLBACK).toBeLessThan(EVIDENCE_STATE_PRIORITY.INSUFFICIENT);
  });

  it("never labels a state as a numeric confidence percentage", () => {
    for (const state of EVIDENCE_STATES) {
      expect(EVIDENCE_STATE_UI_LABEL[state]).not.toMatch(/%/);
    }
  });
});

describe("REASON_CODES / isRegisteredReasonCode", () => {
  it("registers no duplicates", () => {
    expect(new Set(REASON_CODES).size).toBe(REASON_CODES.length);
  });

  it("recognises a registered code and rejects an unregistered one", () => {
    expect(isRegisteredReasonCode("AMBIGUOUS_STATUTORY_BOUNDARY")).toBe(true);
    expect(isRegisteredReasonCode("SOMETHING_MADE_UP")).toBe(false);
  });
});

describe("EngineOutcome constructors + narrowing", () => {
  it("ok() carries a value and evidence state, and narrows via isOk", () => {
    const outcome = ok(23, "DERIVED");
    expect(isOk(outcome)).toBe(true);
    if (isOk(outcome)) {
      // Only reachable after the status check — this is the point of the
      // discriminated union: .value does not exist on the wider type.
      expect(outcome.value).toBe(23);
      expect(outcome.evidenceState).toBe("DERIVED");
    }
  });

  it("blockedInsufficientEvidence() carries reasonCode + missingInputs, no value", () => {
    const outcome = blockedInsufficientEvidence("BLOCK_MISSING_PERIOD", ["planned_months"]);
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(isOk(outcome)).toBe(false);
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.missingInputs).toEqual(["planned_months"]);
    }
  });

  it("ambiguous() carries reasonCode + detail", () => {
    const outcome = ambiguous("AMBIGUOUS_STATUTORY_BOUNDARY", "Morgan P 8.01 mg/L falls in the literal source gap");
    expect(outcome.status).toBe("AMBIGUOUS");
    if (outcome.status === "AMBIGUOUS") {
      expect(outcome.detail).toContain("8.01");
    }
  });

  it("notApplicable() carries only a reasonCode", () => {
    const outcome = notApplicable("NOT_APPLICABLE_TO_SEASONAL_RULE");
    expect(outcome.status).toBe("NOT_APPLICABLE");
  });

  it("legalProhibition() carries reasonCode + consequence", () => {
    const outcome = legalProhibition("GROUND_WATERLOGGED", "Spreading recommendation suppressed");
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    if (outcome.status === "LEGAL_PROHIBITION") {
      expect(outcome.consequence).toBe("Spreading recommendation suppressed");
    }
  });

  it("unknown() carries only a reasonCode", () => {
    const outcome = unknown("UNKNOWN_BLOCK");
    expect(outcome.status).toBe("UNKNOWN");
  });

  it("every non-OK branch is rejected by isOk", () => {
    const outcomes = [
      blockedInsufficientEvidence("BLOCK_MISSING_PERIOD", []),
      ambiguous("AMBIGUOUS_STATUTORY_BOUNDARY", "x"),
      notApplicable("NOT_APPLICABLE_TO_SEASONAL_RULE"),
      legalProhibition("GROUND_WATERLOGGED", "x"),
      unknown("UNKNOWN_BLOCK"),
    ];
    for (const outcome of outcomes) {
      expect(isOk(outcome)).toBe(false);
    }
  });
});

describe("ok() with explain — Checkpoint 1.5, non-breaking additive change", () => {
  it("omits explain entirely when not supplied — the exact shape every pre-existing call site already produces", () => {
    const outcome = ok(23, "DERIVED");
    expect(isOk(outcome)).toBe(true);
    if (isOk(outcome)) {
      expect("explain" in outcome).toBe(false);
    }
  });

  it("carries a structured explanation when a calculation opts in", () => {
    const outcome = ok(185, "IRISH_MODEL", {
      inputs: { grasslandStockingRateKgHa: 165 },
      assumptions: ["Field's own mapped soil is representative of the whole polygon"],
      warnings: ["Soil test is 3.5 years old"],
      sourceIds: ["TEAGASC_GREENBOOK_2020"],
      calculatedAt: "2026-09-08T09:00:00.000Z",
    });
    expect(isOk(outcome)).toBe(true);
    if (isOk(outcome)) {
      expect(outcome.explain?.inputs).toEqual({ grasslandStockingRateKgHa: 165 });
      expect(outcome.explain?.sourceIds).toEqual(["TEAGASC_GREENBOOK_2020"]);
    }
  });

  it("never appears on a non-OK outcome — explain is only meaningful for a real computed value", () => {
    const outcome = blockedInsufficientEvidence("BLOCK_MISSING_PERIOD", []);
    // TypeScript itself refuses `outcome.explain` here (not a field on this
    // branch) — this asserts the same fact at runtime.
    expect("explain" in outcome).toBe(false);
  });

  it("Codex audit HIGH (round 1): mutating the caller's own explain object after ok() returns never changes the stored outcome", () => {
    const inputs = { grasslandStockingRateKgHa: 165 };
    const assumptions = ["Field's own mapped soil is representative of the whole polygon"];
    const warnings = ["Soil test is 3.5 years old"];
    const sourceIds: Array<"TEAGASC_GREENBOOK_2020"> = ["TEAGASC_GREENBOOK_2020"];
    const outcome = ok(185, "IRISH_MODEL", { inputs, assumptions, warnings, sourceIds });

    // Mutate every mutable field of the caller's own objects/arrays after
    // the fact — none of this may leak into the already-returned outcome.
    inputs.grasslandStockingRateKgHa = 999;
    assumptions.push("A fabricated assumption added after the fact");
    warnings.push("A fabricated warning added after the fact");
    sourceIds.push("TEAGASC_GREENBOOK_2020");

    expect(isOk(outcome)).toBe(true);
    if (isOk(outcome)) {
      expect(outcome.explain?.inputs).toEqual({ grasslandStockingRateKgHa: 165 });
      expect(outcome.explain?.assumptions).toEqual(["Field's own mapped soil is representative of the whole polygon"]);
      expect(outcome.explain?.warnings).toEqual(["Soil test is 3.5 years old"]);
      expect(outcome.explain?.sourceIds).toEqual(["TEAGASC_GREENBOOK_2020"]);
    }
  });

  it("Codex audit HIGH (round 2): a nested object inside explain.inputs is also genuinely deep-copied, not just the top-level inputs object", () => {
    const inputs = { weather: { rainfallMm: 12 }, thresholds: [1, 2, 3] };
    const outcome = ok(185, "IRISH_MODEL", { inputs });

    // Mutate a nested value inside the caller's own inputs object after
    // the fact — a shallow `{ ...inputs }` copy would still leak this
    // through, since the nested `weather` object itself would be the
    // same reference.
    inputs.weather.rainfallMm = 999;
    inputs.thresholds.push(4);

    expect(isOk(outcome)).toBe(true);
    if (isOk(outcome)) {
      expect(outcome.explain?.inputs).toEqual({ weather: { rainfallMm: 12 }, thresholds: [1, 2, 3] });
    }
  });
});

describe("isEvidenceState — Codex audit round 1 of Phase D (HIGH), fail-closed against unvalidated persisted data", () => {
  it("accepts every real EvidenceState value", () => {
    for (const state of EVIDENCE_STATES) {
      expect(isEvidenceState(state)).toBe(true);
    }
  });

  it("rejects a genuinely unrecognised string — the exact shape a dismissed decision's own estimate_snapshot could persist (the real database CHECK exempts dismissed rows from shape validation)", () => {
    expect(isEvidenceState("NOT_A_REAL_EVIDENCE_STATE")).toBe(false);
  });

  it("rejects non-string values without throwing", () => {
    expect(isEvidenceState(undefined)).toBe(false);
    expect(isEvidenceState(null)).toBe(false);
    expect(isEvidenceState(42)).toBe(false);
    expect(isEvidenceState({})).toBe(false);
  });
});
