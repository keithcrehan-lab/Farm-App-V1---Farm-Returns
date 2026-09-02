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
