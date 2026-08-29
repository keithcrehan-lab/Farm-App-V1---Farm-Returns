import { describe, expect, it } from "vitest";
import { describeBlockedBasis } from "./index";
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
