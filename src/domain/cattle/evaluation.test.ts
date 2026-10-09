import { describe, expect, it, vi } from "vitest";
import { evaluateCattleRule, evaluateEffectiveCattleRule, type RuleEvaluationContext } from "./evaluation";
import { sourceVersionRef } from "./source";
import { CATALOGUE, LEGAL_SOURCE, approve, descriptor, flagPredicate, hash, impl, item, synthRule, synthSource } from "./test-fixtures";

const RULE = synthRule();
const ctx = (overrides: Partial<RuleEvaluationContext> = {}): RuleEvaluationContext => ({
  evaluationDate: "2026-03-01",
  inputs: [item("synth.flag", true)],
  catalogue: CATALOGUE,
  reviews: approve(RULE),
  ...overrides,
});

describe("evaluateCattleRule", () => {
  it("PASS/FAIL come only from the rule's own predicate on known inputs", () => {
    expect(evaluateCattleRule(RULE, flagPredicate, ctx(), hash).state).toBe("PASS");
    expect(evaluateCattleRule(RULE, flagPredicate, ctx({ inputs: [item("synth.flag", false)] }), hash).state).toBe("FAIL");
  });

  it("missing required input is INSUFFICIENT_EVIDENCE and never reaches the predicate as zero", () => {
    const predicate = impl(vi.fn(flagPredicate.evaluate));
    const numeric = synthRule({ requiredInputs: [descriptor("synth.count")] });
    const record = evaluateCattleRule(numeric, predicate, ctx({ inputs: [], reviews: approve(numeric) }), hash);
    expect(record.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(record.missingInputs).toEqual(["synth.count"]);
    expect(record.usedInputs).toEqual([]);
    expect(predicate.evaluate).not.toHaveBeenCalled();
  });

  it("conflicting input stays CONFLICTING_EVIDENCE with every candidate preserved", () => {
    const predicate = impl(vi.fn(flagPredicate.evaluate));
    const a = item("synth.flag", true);
    const b = item("synth.flag", false, { provenance: { kind: "DEVICE", ref: "dev-1", recordedAt: null } });
    const record = evaluateCattleRule(RULE, predicate, ctx({ inputs: [b, a] }), hash);
    expect(record.state).toBe("CONFLICTING_EVIDENCE");
    expect(record.conflictingInputs).toHaveLength(1);
    expect(record.conflictingInputs[0].items).toHaveLength(2);
    expect(predicate.evaluate).not.toHaveBeenCalled();
  });

  it("type-distinct values conflict (0 vs \"0\") and agreeing duplicates do not", () => {
    const rule = synthRule({ requiredInputs: [descriptor("synth.n")] });
    const c = ctx({ reviews: approve(rule) });
    const conflict = evaluateCattleRule(rule, impl(() => "PASS"), { ...c, inputs: [item("synth.n", 0), item("synth.n", "0")] }, hash);
    expect(conflict.state).toBe("CONFLICTING_EVIDENCE");
    const agree = evaluateCattleRule(rule, impl(() => "PASS"), { ...c, inputs: [item("synth.n", 0), item("synth.n", 0, { provenance: { kind: "DEVICE", ref: "d", recordedAt: null } })] }, hash);
    expect(agree.state).toBe("PASS");
    expect(agree.usedInputs).toHaveLength(2);
  });

  it("a prediction or inference cannot satisfy a fact requirement", () => {
    const record = evaluateCattleRule(RULE, flagPredicate, ctx({ inputs: [item("synth.flag", true, { informationClass: "PREDICTION" })] }), hash);
    expect(record.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(record.rejectedInputs.map((r) => r.reasonCode)).toEqual(["CATTLE_INPUT_CLASS_NOT_ACCEPTED"]);
  });

  it("a value in an undeclared unit is rejected, never converted", () => {
    const record = evaluateCattleRule(RULE, flagPredicate, ctx({ inputs: [item("synth.flag", true, { unit: "synth-unit" })] }), hash);
    expect(record.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(record.rejectedInputs.map((r) => r.reasonCode)).toEqual(["CATTLE_INPUT_UNIT_MISMATCH"]);
  });

  it("a bound source version missing from the catalogue is REVIEW_REQUIRED, not PASS", () => {
    const record = evaluateCattleRule(RULE, flagPredicate, ctx({ catalogue: [{ ...LEGAL_SOURCE, version: "v2" }] }), hash);
    expect(record.state).toBe("REVIEW_REQUIRED");
    expect(record.reasonCodes).toContain("CATTLE_SOURCE_SOURCE_VERSION_CHANGED:SYNTH-SRC-LEGAL");
  });

  it("applicability: unmatched is NOT_APPLICABLE, unknown is INSUFFICIENT_EVIDENCE", () => {
    const rule = synthRule({ applicability: [{ input: descriptor("synth.context", ["INTENT"]), equals: "SYNTH-A" }] });
    const c = ctx({ reviews: approve(rule) });
    const flag = item("synth.flag", true);
    expect(evaluateCattleRule(rule, flagPredicate, { ...c, inputs: [flag, item("synth.context", "SYNTH-B", { informationClass: "INTENT" })] }, hash).state).toBe("NOT_APPLICABLE");
    expect(evaluateCattleRule(rule, flagPredicate, { ...c, inputs: [flag] }, hash).state).toBe("INSUFFICIENT_EVIDENCE");
    expect(evaluateCattleRule(rule, flagPredicate, { ...c, inputs: [flag, item("synth.context", "SYNTH-A", { informationClass: "INTENT" })] }, hash).state).toBe("PASS");
  });

  it("an unapproved or non-production version is REVIEW_REQUIRED even with good inputs", () => {
    expect(evaluateCattleRule(RULE, flagPredicate, ctx({ reviews: [] }), hash).state).toBe("REVIEW_REQUIRED");
    const draft = { ...RULE, productionState: "DRAFT" as const };
    const record = evaluateCattleRule(draft, flagPredicate, ctx(), hash);
    expect(record.state).toBe("REVIEW_REQUIRED");
    expect(record.reasonCodes).toContain("CATTLE_RULE_NOT_IN_PRODUCTION:DRAFT");
  });

  it("a source change produces REVIEW_REQUIRED without mutating or re-approving the rule", () => {
    const frozenRule = Object.freeze(structuredClone(RULE));
    const reviews = approve(RULE);
    const amended = synthSource({}, { text: "synthetic clause A (amended)" });
    const catalogue = [amended, synthSource({ sourceId: "SYNTH-SRC-SCIENCE", authorityKind: "ADVISORY_SCIENCE" })];
    const record = evaluateCattleRule(frozenRule, flagPredicate, ctx({ catalogue, reviews }), hash);
    expect(record.state).toBe("REVIEW_REQUIRED");
    expect(record.sourceChecks[0].status).toBe("SOURCE_CONTENT_CHANGED");
    expect(record.sourceChecks[0].bound).toEqual(sourceVersionRef(LEGAL_SOURCE));
    expect(frozenRule).toEqual(RULE);
    // The rule's own approval is untouched — the gap is the source, not the review.
    expect(record.reviews).toEqual([{ dimension: "LEGAL", state: "APPROVED" }]);
    // A successor bound to the amended source is a new version needing its own approval.
    const v2 = synthRule({ version: 2, supersedes: { ruleId: RULE.ruleId, version: 1 }, sourceBindings: [sourceVersionRef(amended)] });
    expect(evaluateCattleRule(v2, flagPredicate, ctx({ catalogue: [amended], reviews }), hash).state).toBe("REVIEW_REQUIRED");
    expect(evaluateCattleRule(v2, flagPredicate, ctx({ catalogue: [amended], reviews: approve(v2) }), hash).state).toBe("PASS");
  });

  it("an invalid or out-of-window rule is UNSUPPORTED", () => {
    expect(evaluateCattleRule(RULE, flagPredicate, ctx({ evaluationDate: "2025-01-01" }), hash).state).toBe("UNSUPPORTED");
    const bad = synthRule({ gateRole: "ADVISORY" });
    expect(evaluateCattleRule(bad, flagPredicate, ctx({ reviews: approve(bad) }), hash).state).toBe("UNSUPPORTED");
  });

  it("a completed record is not rewritten by later mutation of caller inputs or rule bindings", () => {
    const rule = structuredClone(RULE);
    const inputs = [item("synth.flag", true)];
    const record = evaluateCattleRule(rule, flagPredicate, ctx({ inputs, reviews: approve(rule) }), hash);
    const snapshot = structuredClone(record);
    inputs[0].value = false;
    inputs[0].provenance.ref = "rec-tampered";
    rule.sourceBindings[0].version = "v-tampered";
    rule.sourceBindings[0].contentFingerprint.digest = "0".repeat(64);
    expect(record).toEqual(snapshot);
    expect(record.state).toBe("PASS");
    expect(record.usedInputs[0].value).toBe(true);
    expect(record.sourceChecks[0]).toMatchObject({ status: "CURRENT", bound: { version: "v1" } });
  });

  it("a record does not alias conflicting or rejected caller items", () => {
    const a = item("synth.flag", true);
    const b = item("synth.flag", false, { provenance: { kind: "DEVICE", ref: "dev-1", recordedAt: null } });
    const p = item("synth.flag", true, { informationClass: "PREDICTION" });
    const record = evaluateCattleRule(RULE, flagPredicate, ctx({ inputs: [a, b, p] }), hash);
    const snapshot = structuredClone(record);
    a.value = "x";
    b.provenance.ref = "x";
    p.value = "x";
    expect(record).toEqual(snapshot);
  });

  it("an implementation not matching the rule's bound implementation identity is UNSUPPORTED and never runs", () => {
    const failing = vi.fn(() => "FAIL" as const);
    const swapped = evaluateCattleRule(RULE, impl(failing, "SYNTH-IMPL-OTHER"), ctx(), hash);
    expect(swapped.state).toBe("UNSUPPORTED");
    expect(swapped.reasonCodes).toContain("CATTLE_RULE_IMPLEMENTATION_MISMATCH");
    expect(evaluateCattleRule(RULE, impl(failing, undefined, 2), ctx(), hash).state).toBe("UNSUPPORTED");
    expect(failing).not.toHaveBeenCalled();
    expect(evaluateCattleRule(RULE, flagPredicate, ctx(), hash).implementation).toEqual({ implementationId: "SYNTH-IMPL-GATE", version: 1 });
  });

  it("replacing the implementation changes the rule fingerprint and needs renewed approval", () => {
    const implV2 = impl(() => "FAIL", undefined, 2);
    const rebound = synthRule({ implementation: { implementationId: "SYNTH-IMPL-GATE", version: 2 } });
    const reused = evaluateCattleRule(rebound, implV2, ctx({ reviews: approve(RULE) }), hash);
    expect(reused.state).toBe("REVIEW_REQUIRED");
    expect(reused.reviews).toEqual([{ dimension: "LEGAL", state: "PENDING" }]);
    expect(reused.ruleFingerprint).not.toEqual(evaluateCattleRule(RULE, flagPredicate, ctx(), hash).ruleFingerprint);
    const v2 = synthRule({ version: 2, supersedes: { ruleId: RULE.ruleId, version: 1 }, implementation: { implementationId: "SYNTH-IMPL-GATE", version: 2 } });
    expect(evaluateCattleRule(v2, implV2, ctx({ reviews: approve(RULE) }), hash).state).toBe("REVIEW_REQUIRED");
    expect(evaluateCattleRule(v2, implV2, ctx({ reviews: approve(v2) }), hash).state).toBe("FAIL");
  });

  it("is deterministic regardless of input order", () => {
    const a = item("synth.flag", true);
    const b = item("synth.flag", true, { provenance: { kind: "DEVICE", ref: "dev-2", recordedAt: null } });
    expect(evaluateCattleRule(RULE, flagPredicate, ctx({ inputs: [a, b] }), hash)).toEqual(evaluateCattleRule(RULE, flagPredicate, ctx({ inputs: [b, a] }), hash));
  });
});

describe("evaluateEffectiveCattleRule", () => {
  it("fails closed as UNSUPPORTED when no version is effective", () => {
    const record = evaluateEffectiveCattleRule([RULE], RULE.ruleId, flagPredicate, ctx({ evaluationDate: "2025-06-01" }), hash);
    expect(record).toMatchObject({ state: "UNSUPPORTED", rule: null, gateRole: null, reasonCodes: ["CATTLE_RULE_NO_EFFECTIVE_VERSION"] });
  });

  it("evaluates the effective version and records its exact version + fingerprint", () => {
    const record = evaluateEffectiveCattleRule([RULE], RULE.ruleId, flagPredicate, ctx(), hash);
    expect(record.rule).toEqual({ ruleId: RULE.ruleId, version: 1 });
    expect(record.ruleFingerprint?.digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
