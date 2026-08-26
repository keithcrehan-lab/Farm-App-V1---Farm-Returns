import { describe, expect, it } from "vitest";
import {
  canonicalJsonStringify,
  computeTraceSha256,
  recordDecision,
  sealCalculationRun,
  startCalculationRun,
  type CalculationRun,
  type DecisionRecord,
} from "./audit-trace";
import { CURRENT_RULESET } from "./source-register";

/** A minimal, valid LEGAL_PROHIBITION decision — modelled directly on
 * `reports/sample_recommendation_audit.json`'s own worked example
 * (waterlogged-ground spreading stop), so this fixture is grounded in the
 * V3 pack's own reference case, not an arbitrary shape. */
function sampleDecision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    recommendationId: "REC_TEST_001",
    decisionType: "LEGAL_PROHIBITION",
    scope: { type: "FIELD", id: "field-back" },
    action: "Do not spread cattle slurry on this field at this time.",
    reasonCodes: ["GROUND_WATERLOGGED"],
    evidenceState: "IRISH_MODEL",
    inputs: [
      {
        name: "ground_status",
        rawValue: "waterlogged",
        normalisedValue: "waterlogged",
        unit: null,
        sourceKind: "FIELD_OR_WEATHER_ASSESSMENT",
        evidenceState: "IRISH_MODEL",
        override: false,
      },
    ],
    calculationSteps: [
      {
        sequence: 1,
        formulaRuleId: "SPREADING_LEGAL_GATE",
        description: "Evaluate statutory ground condition",
        formulaExpression: "ground_status == waterlogged",
        result: "FAIL",
        sourceIds: ["LAW_IE_SI_588_2025"],
      },
    ],
    complianceChecks: [
      {
        checkId: "SPREAD_STOP_WATERLOGGED",
        rule: "Land is waterlogged",
        result: "FAIL",
        consequence: "Spreading recommendation suppressed",
        sourceId: "LAW_IE_SI_588_2025",
      },
    ],
    assumptions: [],
    dataGaps: [],
    sources: [{ sourceId: "LAW_IE_SI_588_2025", authority: "Irish Statute Book", section: "Article 19(2)(a)", effectiveStatus: "CURRENT" }],
    ...overrides,
  };
}

function freshRun(runId = "RUN_TEST_001"): CalculationRun {
  return startCalculationRun(runId, "FARM_SNAPSHOT_TEST_001", CURRENT_RULESET, { calculatedAt: "2026-08-26T10:00:00+01:00" });
}

describe("startCalculationRun", () => {
  it("produces an unsealed run with no decisions and no traceSha256", () => {
    const run = freshRun();
    expect(run.sealed).toBe(false);
    expect(run.decisionRecords).toEqual([]);
    expect(run.traceSha256).toBeUndefined();
  });
});

describe("recordDecision", () => {
  it("appends a decision without mutating the original run object", () => {
    const run = freshRun();
    const updated = recordDecision(run, sampleDecision());
    expect(run.decisionRecords).toEqual([]); // original untouched
    expect(updated.decisionRecords).toHaveLength(1);
    expect(updated).not.toBe(run);
  });

  it("throws when called on a sealed run (GFT164: historical run immutable)", async () => {
    const run = recordDecision(freshRun(), sampleDecision());
    const sealed = await sealCalculationRun(run);
    expect(() => recordDecision(sealed, sampleDecision({ recommendationId: "REC_TEST_002" }))).toThrow(/immutable/i);
  });

  it("throws for an empty reasonCodes array, even if the type system was bypassed", () => {
    const run = freshRun();
    const badDecision = sampleDecision({ reasonCodes: [] as unknown as string[] });
    expect(() => recordDecision(run, badDecision)).toThrow(/reason code/i);
  });

  it("throws for an empty sources array, even if the type system was bypassed", () => {
    const run = freshRun();
    const badDecision = { ...sampleDecision(), sources: [] } as unknown as DecisionRecord;
    expect(() => recordDecision(run, badDecision)).toThrow(/source/i);
  });

  it("accepts a LEGAL_PROHIBITION decision whose compliance check FAILs — a hard fail and an action-suppressing decision coexist validly (GFT161-style)", () => {
    const run = recordDecision(freshRun(), sampleDecision());
    expect(run.decisionRecords[0].decisionType).toBe("LEGAL_PROHIBITION");
    expect(run.decisionRecords[0].complianceChecks[0].result).toBe("FAIL");
  });
});

describe("sealCalculationRun", () => {
  it("sets sealed: true and populates a 64-hex-char traceSha256", async () => {
    const run = recordDecision(freshRun(), sampleDecision());
    const sealed = await sealCalculationRun(run);
    expect(sealed.sealed).toBe(true);
    expect(sealed.traceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is idempotent — sealing an already-sealed run returns it unchanged", async () => {
    const run = recordDecision(freshRun(), sampleDecision());
    const sealedOnce = await sealCalculationRun(run);
    const sealedTwice = await sealCalculationRun(sealedOnce);
    expect(sealedTwice.traceSha256).toBe(sealedOnce.traceSha256);
  });
});

describe("computeTraceSha256 — determinism and sensitivity", () => {
  it("hashes the same run content to the same value (determinism)", async () => {
    const runA = recordDecision(freshRun(), sampleDecision());
    const runB = recordDecision(freshRun(), sampleDecision());
    expect(await computeTraceSha256(runA)).toBe(await computeTraceSha256(runB));
  });

  it("hashes differently when a normalised input value changes (GFT170-style sensitivity)", async () => {
    const runA = recordDecision(
      freshRun(),
      sampleDecision({ inputs: [{ name: "input_A", rawValue: 10, normalisedValue: 10, sourceKind: "FARMER", evidenceState: "MEASURED", override: false }] }),
    );
    const runB = recordDecision(
      freshRun(),
      sampleDecision({ inputs: [{ name: "input_B", rawValue: 11, normalisedValue: 11, sourceKind: "FARMER", evidenceState: "MEASURED", override: false }] }),
    );
    expect(await computeTraceSha256(runA)).not.toBe(await computeTraceSha256(runB));
  });

  it("does NOT change when only calculatedAt differs (timestamp excluded from the fingerprint on purpose)", async () => {
    const runA = recordDecision(freshRun(), sampleDecision());
    const runB = recordDecision(
      startCalculationRun("RUN_TEST_001", "FARM_SNAPSHOT_TEST_001", CURRENT_RULESET, { calculatedAt: "2026-08-27T09:00:00+01:00" }),
      sampleDecision(),
    );
    expect(await computeTraceSha256(runA)).toBe(await computeTraceSha256(runB));
  });
});

describe("canonicalJsonStringify", () => {
  it("produces identical output for objects that differ only in key insertion order", () => {
    const a = { z: 1, a: 2, nested: { b: 3, a: 4 } };
    const b = { a: 2, z: 1, nested: { a: 4, b: 3 } };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
  });

  it("preserves array element order (order is meaningful data, unlike object keys)", () => {
    const a = { steps: [1, 2, 3] };
    const b = { steps: [3, 2, 1] };
    expect(canonicalJsonStringify(a)).not.toBe(canonicalJsonStringify(b));
  });
});
