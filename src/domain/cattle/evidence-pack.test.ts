import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateCattleRule, type RuleEvaluationRecord } from "./evaluation";
import { buildRecommendationEvidencePack, verifyRecommendationEvidencePack, type RecommendationEvidencePack, type RecommendationEvidencePackInput } from "./evidence-pack";
import { computeCattleFingerprint } from "./integrity";
import { sourceVersionRef } from "./source";
import { CATALOGUE, SCIENCE_SOURCE, approve, descriptor, flagPredicate, hash, impl, item, synthRule } from "./test-fixtures";

const GATE = synthRule();
const ADVISORY = synthRule({
  ruleId: "SYNTH-RULE-ADVICE",
  classification: "SCIENCE_TARGET",
  gateRole: "ADVISORY",
  jurisdiction: null,
  requiredInputs: [descriptor("synth.score", ["DERIVED_VALUE"])],
  sourceBindings: [sourceVersionRef(SCIENCE_SOURCE)],
  requiredReviews: ["SCIENTIFIC"],
});
const reviews = [...approve(GATE), ...approve(ADVISORY)];

function gateRecord(flag: boolean | null): RuleEvaluationRecord {
  const inputs = flag === null ? [] : [item("synth.flag", flag)];
  return evaluateCattleRule(GATE, flagPredicate, { evaluationDate: "2026-03-01", inputs, catalogue: CATALOGUE, reviews }, hash);
}

const adviceRecord = evaluateCattleRule(
  ADVISORY,
  impl(() => "PASS"),
  { evaluationDate: "2026-03-01", inputs: [item("synth.score", "0.97", { informationClass: "DERIVED_VALUE" })], catalogue: CATALOGUE, reviews },
  hash,
);

function packInput(overrides: Partial<RecommendationEvidencePackInput> = {}): RecommendationEvidencePackInput {
  return {
    recommendationId: "SYNTH-REC-1",
    engineVersion: "synthetic-engine-0",
    rulesetVersion: "synthetic-ruleset-0",
    evaluationDate: "2026-03-01",
    knownAt: "2026-03-01T08:00:00Z",
    generatedAt: "2026-03-01T08:00:01Z",
    targetScope: { kind: "SYNTH_GROUP", id: "group-1", snapshotRef: "snap-1" },
    intent: { intentId: "intent-1", description: "synthetic farmer intent" },
    inputs: [item("synth.flag", true), item("synth.score", "0.97", { informationClass: "DERIVED_VALUE" })],
    ruleEvaluations: [gateRecord(true), adviceRecord],
    requiredHardGateRuleIds: [GATE.ruleId],
    calculationSteps: [
      { sequence: 1, description: "synthetic step", formula: "a + b", inputs: { a: "1", b: "2" }, output: "3", unit: null, rounding: null, rule: null },
    ],
    additionalSourceRefs: [],
    assumptions: ["assumption b", "assumption a"],
    limitations: ["synthetic limitation"],
    uncertainties: ["synthetic uncertainty"],
    candidateActions: [
      { actionId: "act-a", description: "synthetic action A", favourability: "0.97" },
      { actionId: "act-b", description: "synthetic action B", favourability: "0.10" },
    ],
    rejectedAlternatives: [{ actionId: "act-b", reasonCodes: ["SYNTH_LOWER_FAVOURABILITY"] }],
    proposedActionId: "act-a",
    review: { state: "UNREVIEWED", reviewerRef: null, reviewedAt: null, notes: [] },
    ...overrides,
  };
}

function built(input: RecommendationEvidencePackInput): RecommendationEvidencePack {
  const result = buildRecommendationEvidencePack(input, hash);
  if (result.status !== "BUILT") throw new Error(result.issues.join(", "));
  return result.pack;
}

describe("Recommendation Evidence Pack", () => {
  it("binds exact rule versions, fingerprints and source versions", () => {
    const pack = built(packInput());
    expect(pack.outcome).toBe("ACTIONABLE");
    expect(pack.actionableActionId).toBe("act-a");
    expect(pack.ruleEvaluations.map((e) => e.rule)).toEqual([
      { ruleId: "SYNTH-RULE-ADVICE", version: 1 },
      { ruleId: "SYNTH-RULE-GATE", version: 1 },
    ]);
    expect(pack.sourceRefs.map((r) => r.sourceId)).toEqual(["SYNTH-SRC-LEGAL", "SYNTH-SRC-SCIENCE"]);
    expect(verifyRecommendationEvidencePack(pack, hash)).toEqual({ valid: true });
  });

  it("reproduces the same fingerprint for the same content, regardless of list order or generatedAt", () => {
    const a = built(packInput());
    const b = built(
      packInput({
        generatedAt: "2026-03-02T00:00:00Z",
        assumptions: ["assumption a", "assumption b"],
        ruleEvaluations: [adviceRecord, gateRecord(true)],
        candidateActions: [...packInput().candidateActions].reverse(),
      }),
    );
    expect(b.fingerprint).toEqual(a.fingerprint);
  });

  it("a material mutation changes the fingerprint and fails verification", () => {
    const pack = built(packInput());
    expect(built(packInput({ limitations: ["other limitation"] })).fingerprint.digest).not.toBe(pack.fingerprint.digest);
    expect(built(packInput({ targetScope: { kind: "SYNTH_GROUP", id: "group-2", snapshotRef: "snap-1" } })).fingerprint.digest).not.toBe(pack.fingerprint.digest);
    const tampered = { ...pack, calculationSteps: [{ ...pack.calculationSteps[0], output: "4" }] };
    expect(verifyRecommendationEvidencePack(tampered, hash)).toMatchObject({ valid: false, reasonCode: "ASSESSMENT_INTEGRITY_FINGERPRINT_MISMATCH" });
  });

  it("detects a forged outcome even if the attacker refreshes the fingerprint", () => {
    const blocked = built(packInput({ ruleEvaluations: [gateRecord(false), adviceRecord] }));
    expect(blocked.outcome).toBe("BLOCKED");
    const { fingerprint, generatedAt, ...content } = { ...blocked, outcome: "ACTIONABLE" as const, actionableActionId: "act-a", outcomeReasonCodes: [] };
    void fingerprint;
    const forged = { ...content, generatedAt, fingerprint: computeCattleFingerprint("CATTLE_EVIDENCE_PACK", content, hash) };
    expect(verifyRecommendationEvidencePack(forged, hash)).toMatchObject({ valid: false, reasonCode: "CATTLE_PACK_DERIVED_CONTENT_INCONSISTENT" });
  });

  it("is immune to later mutation of the caller's input", () => {
    const input = packInput();
    const pack = built(input);
    input.assumptions.push("late addition");
    input.inputs[0].value = false;
    expect(verifyRecommendationEvidencePack(pack, hash)).toEqual({ valid: true });
  });

  it("represents BLOCKED, INSUFFICIENT_EVIDENCE, REVIEW_REQUIRED and NO_RECOMMENDATION explicitly", () => {
    expect(built(packInput({ ruleEvaluations: [gateRecord(false), adviceRecord] }))).toMatchObject({ outcome: "BLOCKED", actionableActionId: null });
    const insufficient = built(packInput({ ruleEvaluations: [gateRecord(null), adviceRecord] }));
    expect(insufficient).toMatchObject({ outcome: "INSUFFICIENT_EVIDENCE", actionableActionId: null, missingInputs: ["synth.flag"] });
    const unreviewed = evaluateCattleRule(GATE, flagPredicate, { evaluationDate: "2026-03-01", inputs: [item("synth.flag", true)], catalogue: CATALOGUE, reviews: [] }, hash);
    expect(built(packInput({ ruleEvaluations: [unreviewed, adviceRecord] })).outcome).toBe("REVIEW_REQUIRED");
    expect(built(packInput({ proposedActionId: null }))).toMatchObject({ outcome: "NO_RECOMMENDATION", actionableActionId: null });
  });

  it("a synthetic hard gate stops a favourable advisory result from being actionable", () => {
    expect(adviceRecord.state).toBe("PASS");
    const pack = built(packInput({ ruleEvaluations: [gateRecord(false), adviceRecord] }));
    expect(pack.outcome).toBe("BLOCKED");
    expect(pack.proposedActionId).toBe("act-a");
    expect(pack.actionableActionId).toBeNull();
    expect(pack.outcomeReasonCodes).toEqual(["CATTLE_HARD_GATE_FAIL:SYNTH-RULE-GATE"]);
  });

  it("a required hard gate that was never evaluated fails closed", () => {
    const pack = built(packInput({ ruleEvaluations: [adviceRecord] }));
    expect(pack.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(pack.hardGateOutcomes).toEqual([{ ruleId: GATE.ruleId, rule: null, state: "NOT_EVALUATED", satisfied: false }]);
  });

  it("conflicting gate input stays visible as conflict", () => {
    const conflicted = evaluateCattleRule(
      GATE,
      flagPredicate,
      { evaluationDate: "2026-03-01", inputs: [item("synth.flag", true), item("synth.flag", false)], catalogue: CATALOGUE, reviews },
      hash,
    );
    const pack = built(packInput({ ruleEvaluations: [conflicted, adviceRecord] }));
    expect(pack).toMatchObject({ outcome: "INSUFFICIENT_EVIDENCE", conflictingInputs: ["synth.flag"] });
    expect(pack.hardGateOutcomes[0].state).toBe("CONFLICTING_EVIDENCE");
  });

  it("rejects structurally invalid packs rather than repairing them", () => {
    const result = buildRecommendationEvidencePack(
      packInput({
        proposedActionId: "act-z",
        rejectedAlternatives: [{ actionId: "act-b", reasonCodes: [] }],
        requiredHardGateRuleIds: [GATE.ruleId, ADVISORY.ruleId],
        calculationSteps: [{ ...packInput().calculationSteps[0], sequence: 2 }],
      }),
      hash,
    );
    expect(result).toEqual({
      status: "INVALID",
      issues: [
        "CATTLE_PACK_CALCULATION_STEPS_NOT_CONTIGUOUS",
        "CATTLE_PACK_PROPOSED_ACTION_NOT_A_CANDIDATE",
        "CATTLE_PACK_REJECTION_WITHOUT_REASON:act-b",
        "CATTLE_PACK_REQUIRED_HARD_GATE_IS_ADVISORY:SYNTH-RULE-ADVICE",
      ],
    });
  });
});

describe("no AI dependency in the deterministic path", () => {
  const dir = __dirname;
  const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "test-fixtures.ts");

  it("production modules import only local domain modules", () => {
    const allowedParents = new Set(["../assessment-integrity", "../iso-datetime", "../source-register"]);
    for (const file of sources) {
      const text = readFileSync(join(dir, file), "utf8");
      const specifiers = [...text.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec.startsWith("./") || allowedParents.has(spec), `${file} imports ${spec}`).toBe(true);
      }
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/\bfetch\s*\(|openai|anthropic|@ai-sdk|\bllm\b|\bawait\b|\basync\b/i);
    }
    expect(sources.length).toBeGreaterThanOrEqual(7);
  });
});
