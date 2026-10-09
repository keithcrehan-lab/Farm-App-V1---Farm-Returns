import { describe, expect, it } from "vitest";
import { evaluateCompletion, NO_CANONICAL_EVIDENCE, type CompletionContract } from "./completion";
import { A1, A2, A3, DATA_CONTRACT, presence } from "./test-fixtures";

const scope = { status: "KNOWN" as const, members: [A1, A2, A3] };

describe("evaluateCompletion — DATA_COMPLETION", () => {
  it("counts members from canonical evidence and completes when all present", () => {
    const partial = evaluateCompletion(DATA_CONTRACT, scope, presence([A1], [A2, A3]));
    expect(partial.state).toBe("PARTIAL");
    expect(partial.progress).toEqual({ kind: "MEMBER_COUNT", complete: 1, missing: 2, unknown: 0, total: 3 });
    const done = evaluateCompletion(DATA_CONTRACT, scope, presence([A1, A2, A3]));
    expect(done.state).toBe("COMPLETE");
    expect(done.evidenceRefs).toEqual(["rec-a1", "rec-a2", "rec-a3"]);
  });

  it("treats unsupplied evidence as UNKNOWN, never zero progress", () => {
    const r = evaluateCompletion(DATA_CONTRACT, scope, NO_CANONICAL_EVIDENCE);
    expect(r.state).toBe("UNKNOWN");
    expect(r.progress).toEqual({ kind: "UNKNOWN", reason: "EVIDENCE_NOT_SUPPLIED" });
  });

  it("counts an unlisted member as unknown, not missing, and never completes", () => {
    const r = evaluateCompletion(DATA_CONTRACT, scope, presence([A1, A2]));
    expect(r.state).toBe("PARTIAL");
    expect(r.progress).toEqual({ kind: "MEMBER_COUNT", complete: 2, missing: 0, unknown: 1, total: 3 });
    expect(r.unknownMembers).toEqual([A3]);
    expect(evaluateCompletion(DATA_CONTRACT, scope, presence([], [])).state).toBe("UNKNOWN");
  });

  it("reports UNKNOWN when scope membership is unknown", () => {
    expect(evaluateCompletion(DATA_CONTRACT, { status: "UNKNOWN", members: [A1] }, presence([A1])).state).toBe("UNKNOWN");
  });
});

describe("evaluateCompletion — other contract kinds", () => {
  const records = (subjects: (typeof A1)[], occurredAt = "2026-10-09T08:00:00Z") => ({
    ...NO_CANONICAL_EVIDENCE,
    records: { "test.activity": { status: "AVAILABLE" as const, records: [{ recordId: "r1", recordKind: "test.activity", subjects, occurredAt }] } },
  });

  it("OPERATIONAL_RECORD EACH_MEMBER counts covered members; notBefore excludes old records", () => {
    const contract: CompletionContract = { kind: "OPERATIONAL_RECORD", recordKind: "test.activity", coverage: "EACH_MEMBER", notBeforeIso: "2026-10-01T00:00:00Z" };
    const r = evaluateCompletion(contract, scope, records([A1, A2]));
    expect(r.state).toBe("PARTIAL");
    expect(r.progress).toEqual({ kind: "MEMBER_COUNT", complete: 2, missing: 1, unknown: 0, total: 3 });
    expect(evaluateCompletion(contract, scope, records([A1, A2, A3], "2026-09-01T00:00:00Z")).state).toBe("NOT_STARTED");
  });

  it("OPERATIONAL_RECORD ANY_MEMBER and DECISION do not invent numeric progress", () => {
    const any: CompletionContract = { kind: "OPERATIONAL_RECORD", recordKind: "test.activity", coverage: "ANY_MEMBER", notBeforeIso: null };
    const r = evaluateCompletion(any, scope, records([A2]));
    expect(r.state).toBe("COMPLETE");
    expect(r.progress).toEqual({ kind: "NOT_MEASURABLE" });

    const decision: CompletionContract = { kind: "DECISION", decisionKind: "test.decision", notBeforeIso: null };
    expect(evaluateCompletion(decision, scope, NO_CANONICAL_EVIDENCE).state).toBe("UNKNOWN");
    const decided = evaluateCompletion(decision, scope, {
      ...NO_CANONICAL_EVIDENCE,
      decisions: { "test.decision": { status: "AVAILABLE", decisions: [{ decisionId: "d1", decisionKind: "test.decision", subjects: [A3], decidedAt: "2026-10-09T08:00:00Z" }] } },
    });
    expect(decided.state).toBe("COMPLETE");
    expect(decided.progress).toEqual({ kind: "NOT_MEASURABLE" });
    expect(decided.evidenceRefs).toEqual(["d1"]);
  });

  it("MANUAL is never evidence-derived", () => {
    const r = evaluateCompletion({ kind: "MANUAL" }, scope, presence([A1, A2, A3]));
    expect(r.state).toBe("NOT_EVIDENCE_LINKED");
    expect(r.progress).toEqual({ kind: "NOT_MEASURABLE" });
  });

  it("an empty known scope has NO_TARGETS rather than vacuous completion", () => {
    expect(evaluateCompletion(DATA_CONTRACT, { status: "KNOWN", members: [] }, presence([])).state).toBe("NO_TARGETS");
  });
});
