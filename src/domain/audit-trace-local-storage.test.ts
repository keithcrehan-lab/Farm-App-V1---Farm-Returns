import { beforeEach, describe, expect, it } from "vitest";
import { createLocalStorageAuditTraceStore } from "./audit-trace-local-storage";
import { recordDecision, sealCalculationRun, startCalculationRun, type CalculationRun, type DecisionRecord } from "./audit-trace";
import { CURRENT_RULESET } from "./source-register";

function sampleDecision(recommendationId = "REC_TEST_001"): DecisionRecord {
  return {
    recommendationId,
    decisionType: "WARNING",
    scope: { type: "FIELD", id: "field-back" },
    action: "Example warning for local-storage store tests.",
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

const STORAGE_KEY = "farm-return:audit-trace:v1";
const FARM_STATE_STORAGE_KEY = "farm-return:v1";

beforeEach(() => {
  window.localStorage.clear();
});

describe("createLocalStorageAuditTraceStore", () => {
  it("starts empty when localStorage has nothing under its key", () => {
    const store = createLocalStorageAuditTraceStore();
    expect(store.list()).toEqual([]);
  });

  it("add() persists to localStorage under its own dedicated key", async () => {
    const store = createLocalStorageAuditTraceStore();
    const run = await sealedRun("RUN_A");
    store.add(run);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe(1);
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.runs[0].calculationRunId).toBe("RUN_A");
  });

  it("a new store instance reads back what a previous instance persisted (survives a page reload)", async () => {
    const storeA = createLocalStorageAuditTraceStore();
    storeA.add(await sealedRun("RUN_B"));

    const storeB = createLocalStorageAuditTraceStore();
    expect(storeB.get("RUN_B")?.calculationRunId).toBe("RUN_B");
    expect(storeB.list()).toHaveLength(1);
  });

  it("never touches farm-store.tsx's own localStorage key — fully isolated namespaces", async () => {
    window.localStorage.setItem(FARM_STATE_STORAGE_KEY, JSON.stringify({ version: 1, state: { marker: "untouched" } }));
    const store = createLocalStorageAuditTraceStore();
    store.add(await sealedRun("RUN_C"));
    const farmState = JSON.parse(window.localStorage.getItem(FARM_STATE_STORAGE_KEY)!);
    expect(farmState.state.marker).toBe("untouched");
  });

  it("refuses an unsealed run", () => {
    const store = createLocalStorageAuditTraceStore();
    const unsealed = startCalculationRun("RUN_D", "FARM_SNAPSHOT_TEST_001", CURRENT_RULESET);
    expect(() => store.add(unsealed)).toThrow(/unsealed/i);
  });

  it("refuses to replace an already-stored run with the same id", async () => {
    const store = createLocalStorageAuditTraceStore();
    store.add(await sealedRun("RUN_E"));
    const anotherRunSameId = await sealedRun("RUN_E");
    expect(() => store.add(anotherRunSameId)).toThrow(/already stored/i);
  });

  it("ignores a stored blob under a different schema version rather than crashing", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 999, runs: [{ calculationRunId: "STALE" }] }));
    const store = createLocalStorageAuditTraceStore();
    expect(store.list()).toEqual([]);
  });

  it("treats corrupt JSON under its key as empty rather than throwing", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json");
    const store = createLocalStorageAuditTraceStore();
    expect(store.list()).toEqual([]);
  });
});
