import { describe, expect, it } from "vitest";
import { recordDecision, sealCalculationRun, startCalculationRun, type CalculationRun, type DecisionRecord } from "./audit-trace";
import { createInMemoryAuditTraceStore } from "./audit-trace-store";
import { CURRENT_RULESET } from "./source-register";

function sampleDecision(recommendationId = "REC_TEST_001"): DecisionRecord {
  return {
    recommendationId,
    decisionType: "WARNING",
    scope: { type: "FIELD", id: "field-back" },
    action: "Example warning for store tests.",
    reasonCodes: ["FLAG_STALE_INPUT"],
    evidenceState: "IRISH_DEFAULT",
    inputs: [],
    calculationSteps: [],
    complianceChecks: [],
    assumptions: [],
    dataGaps: [],
    sources: [{ sourceId: "ENGINE_AUDIT_RULE", authority: "Farm Return", effectiveStatus: "CURRENT" }],
  };
}

async function sealedRun(runId: string): Promise<CalculationRun> {
  const run = recordDecision(startCalculationRun(runId, "FARM_SNAPSHOT_TEST_001", CURRENT_RULESET), sampleDecision());
  return sealCalculationRun(run);
}

describe("createInMemoryAuditTraceStore", () => {
  it("starts empty", () => {
    const store = createInMemoryAuditTraceStore();
    expect(store.list()).toEqual([]);
    expect(store.get("RUN_MISSING")).toBeUndefined();
  });

  it("add() then get()/list() returns the stored run", async () => {
    const store = createInMemoryAuditTraceStore();
    const run = await sealedRun("RUN_A");
    store.add(run);
    expect(store.get("RUN_A")).toBe(run);
    expect(store.list()).toEqual([run]);
  });

  it("add() refuses an unsealed run", () => {
    const store = createInMemoryAuditTraceStore();
    const unsealed = startCalculationRun("RUN_B", "FARM_SNAPSHOT_TEST_001", CURRENT_RULESET);
    expect(() => store.add(unsealed)).toThrow(/unsealed/i);
  });

  it("add() refuses to replace an already-stored run with the same id", async () => {
    const store = createInMemoryAuditTraceStore();
    const run = await sealedRun("RUN_C");
    store.add(run);
    const anotherRunSameId = await sealedRun("RUN_C");
    expect(() => store.add(anotherRunSameId)).toThrow(/already stored/i);
  });

  it("list() returns runs in insertion (oldest-first) order", async () => {
    const store = createInMemoryAuditTraceStore();
    const runOne = await sealedRun("RUN_ONE");
    const runTwo = await sealedRun("RUN_TWO");
    store.add(runOne);
    store.add(runTwo);
    expect(store.list().map((r) => r.calculationRunId)).toEqual(["RUN_ONE", "RUN_TWO"]);
  });

  it("never mutates a sealed run it holds", async () => {
    const store = createInMemoryAuditTraceStore();
    const run = await sealedRun("RUN_D");
    const snapshotBeforeStore = JSON.parse(JSON.stringify(run));
    store.add(run);
    store.get("RUN_D");
    store.list();
    expect(JSON.parse(JSON.stringify(store.get("RUN_D")))).toEqual(snapshotBeforeStore);
  });
});
