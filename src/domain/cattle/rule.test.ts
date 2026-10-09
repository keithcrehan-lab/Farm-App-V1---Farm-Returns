import { describe, expect, it } from "vitest";
import {
  computeRuleFingerprint,
  evaluateRuleReviews,
  getRuleVersion,
  resolveEffectiveRuleVersion,
  validateRuleVersion,
} from "./rule";
import { sourceVersionRef } from "./source";
import { CATALOGUE, LEGAL_SOURCE, SCIENCE_SOURCE, VET_SOURCE, approve, descriptor, hash, synthRule } from "./test-fixtures";

const V1 = synthRule({ version: 1, effectiveFrom: "2026-01-01", effectiveTo: "2026-07-01", productionState: "SUPERSEDED" });
const V2 = synthRule({ version: 2, effectiveFrom: "2026-07-01", effectiveTo: null, supersedes: { ruleId: "SYNTH-RULE-GATE", version: 1 } });

describe("rule fingerprint", () => {
  it("is deterministic and independent of key order and unordered-list order", () => {
    const a = synthRule({ assumptions: ["a", "b"], limitations: ["x", "y"] });
    const reordered = Object.fromEntries(Object.entries(synthRule({ assumptions: ["b", "a"], limitations: ["y", "x"] })).reverse());
    expect(computeRuleFingerprint(a, hash)).toEqual(computeRuleFingerprint(reordered as typeof a, hash));
  });

  it("ignores productionState but changes on any material field", () => {
    const base = computeRuleFingerprint(synthRule(), hash).digest;
    expect(computeRuleFingerprint(synthRule({ productionState: "DRAFT" }), hash).digest).toBe(base);
    expect(computeRuleFingerprint(synthRule({ version: 2 }), hash).digest).not.toBe(base);
    expect(computeRuleFingerprint(synthRule({ effectiveTo: "2027-01-01" }), hash).digest).not.toBe(base);
    expect(computeRuleFingerprint(synthRule({ requiredInputs: [descriptor("synth.other")] }), hash).digest).not.toBe(base);
    expect(computeRuleFingerprint(synthRule({ sourceBindings: [sourceVersionRef(SCIENCE_SOURCE)] }), hash).digest).not.toBe(base);
  });
});

describe("resolveEffectiveRuleVersion", () => {
  const versions = [V1, V2];

  it("selects correctly at effective-date boundaries (from inclusive, to exclusive)", () => {
    expect(resolveEffectiveRuleVersion(versions, "SYNTH-RULE-GATE", "2026-01-01")).toMatchObject({ status: "RESOLVED", rule: { version: 1 } });
    expect(resolveEffectiveRuleVersion(versions, "SYNTH-RULE-GATE", "2026-06-30")).toMatchObject({ status: "RESOLVED", rule: { version: 1 } });
    expect(resolveEffectiveRuleVersion(versions, "SYNTH-RULE-GATE", "2026-07-01")).toMatchObject({ status: "RESOLVED", rule: { version: 2 } });
  });

  it("fails closed when no version is effective", () => {
    expect(resolveEffectiveRuleVersion(versions, "SYNTH-RULE-GATE", "2025-12-31").status).toBe("NO_EFFECTIVE_VERSION");
    expect(resolveEffectiveRuleVersion(versions, "SYNTH-UNKNOWN", "2026-03-01").status).toBe("NO_EFFECTIVE_VERSION");
    expect(resolveEffectiveRuleVersion([synthRule({ productionState: "DRAFT" })], "SYNTH-RULE-GATE", "2026-03-01").status).toBe("NO_EFFECTIVE_VERSION");
  });

  it("rejects an invalid evaluation date", () => {
    expect(resolveEffectiveRuleVersion(versions, "SYNTH-RULE-GATE", "2026-02-30").status).toBe("INVALID_EVALUATION_DATE");
  });

  it("does not select a superseded version as current when its successor overlaps", () => {
    const openV1 = { ...V1, effectiveTo: null };
    expect(resolveEffectiveRuleVersion([openV1, V2], "SYNTH-RULE-GATE", "2026-08-01")).toMatchObject({ status: "RESOLVED", rule: { version: 2 } });
    expect(resolveEffectiveRuleVersion([openV1, V2], "SYNTH-RULE-GATE", "2026-03-01")).toMatchObject({ status: "RESOLVED", rule: { version: 1 } });
  });

  it("fails closed on unrelated overlapping versions", () => {
    const rogue = synthRule({ version: 3, effectiveFrom: "2026-07-01" });
    expect(resolveEffectiveRuleVersion([V1, V2, rogue], "SYNTH-RULE-GATE", "2026-08-01")).toMatchObject({
      status: "AMBIGUOUS_EFFECTIVE_VERSIONS",
      versions: [2, 3],
    });
  });

  it("keeps superseded versions addressable for historical audit", () => {
    expect(getRuleVersion(versions, { ruleId: "SYNTH-RULE-GATE", version: 1 })).toBe(V1);
  });
});

describe("version-bound reviews", () => {
  it("approval of v1 does not approve v2", () => {
    const v1Reviews = approve(V1);
    expect(evaluateRuleReviews(V1, v1Reviews, hash).fullyApproved).toBe(true);
    expect(evaluateRuleReviews(V2, v1Reviews, hash).fullyApproved).toBe(false);
    const forged = v1Reviews.map((r) => ({ ...r, ruleVersion: 2 }));
    expect(evaluateRuleReviews(V2, forged, hash).fullyApproved).toBe(false);
  });

  it("an approval stops counting if the rule content changes under the same version", () => {
    const reviews = approve(V2);
    const edited = { ...V2, limitations: ["silently edited"] };
    expect(evaluateRuleReviews(edited, reviews, hash).fullyApproved).toBe(false);
  });

  it("keeps scientific, legal and veterinary dimensions separate", () => {
    const rule = synthRule({
      classification: "VETERINARY_PROGRAMME",
      gateRole: "HARD_GATE",
      requiredReviews: ["VETERINARY", "LEGAL", "SCIENTIFIC"],
      sourceBindings: [sourceVersionRef(VET_SOURCE)],
    });
    const status = evaluateRuleReviews(rule, approve(rule, ["LEGAL", "SCIENTIFIC"]), hash);
    expect(status.dimensions).toEqual([
      { dimension: "LEGAL", state: "APPROVED" },
      { dimension: "SCIENTIFIC", state: "APPROVED" },
      { dimension: "VETERINARY", state: "PENDING" },
    ]);
    expect(status.fullyApproved).toBe(false);
  });

  it("the latest review wins and a same-instant tie fails closed", () => {
    const approvals = approve(V2, ["LEGAL"], "2026-01-05T00:00:00Z");
    const rejection = { ...approvals[0], decision: "REJECTED" as const, reviewedAt: "2026-01-06T00:00:00Z" };
    expect(evaluateRuleReviews(V2, [...approvals, rejection], hash).dimensions[0].state).toBe("REJECTED");
    const tie = { ...rejection, reviewedAt: "2026-01-05T00:00:00.000Z" };
    expect(evaluateRuleReviews(V2, [...approvals, tie], hash).dimensions[0].state).toBe("REJECTED");
    const reApproval = { ...approvals[0], reviewedAt: "2026-01-07T00:00:00Z" };
    expect(evaluateRuleReviews(V2, [...approvals, rejection, reApproval], hash).dimensions[0].state).toBe("APPROVED");
  });
});

describe("validateRuleVersion", () => {
  it("accepts the synthetic fixture", () => {
    expect(validateRuleVersion(synthRule(), CATALOGUE)).toEqual({ valid: true, issues: [] });
  });

  it("does not let advisory science ground a legal rule", () => {
    const result = validateRuleVersion(synthRule({ sourceBindings: [sourceVersionRef(SCIENCE_SOURCE)] }), CATALOGUE);
    expect(result.issues).toContain("CATTLE_RULE_NO_AUTHORITATIVE_SOURCE_FOR_CLASSIFICATION");
  });

  it("requires the classification's minimum review dimension and gate role", () => {
    expect(validateRuleVersion(synthRule({ requiredReviews: ["SCIENTIFIC"] }), CATALOGUE).issues).toContain("CATTLE_RULE_MISSING_REQUIRED_REVIEW:LEGAL");
    expect(validateRuleVersion(synthRule({ gateRole: "ADVISORY" }), CATALOGUE).issues).toContain("CATTLE_RULE_LEGAL_MUST_BE_HARD_GATE");
    const inference = synthRule({ classification: "SYSTEM_INFERENCE", requiredReviews: ["SCIENTIFIC"] });
    expect(validateRuleVersion(inference, CATALOGUE).issues).toContain("CATTLE_RULE_CLASS_CANNOT_BE_HARD_GATE");
  });

  it("rejects bad windows, versions, supersession and non-authoritative sources", () => {
    const issues = validateRuleVersion(
      synthRule({
        version: 0,
        effectiveFrom: "2026-05-01",
        effectiveTo: "2026-05-01",
        supersedes: { ruleId: "SYNTH-OTHER", version: 1 },
        sourceBindings: [{ ...sourceVersionRef(VET_SOURCE), version: "v9" }],
      }),
      CATALOGUE,
    ).issues;
    expect(issues).toEqual(
      expect.arrayContaining([
        "CATTLE_RULE_INVALID_VERSION",
        "CATTLE_RULE_EMPTY_EFFECTIVE_WINDOW",
        "CATTLE_RULE_INVALID_SUPERSESSION",
        "CATTLE_RULE_NO_AUTHORITATIVE_SOURCE_FOR_CLASSIFICATION",
      ]),
    );
  });

  it("a rule bound to a version that left the catalogue is still a valid definition (source change, not defect)", () => {
    const rule = synthRule({ sourceBindings: [{ ...sourceVersionRef(LEGAL_SOURCE), version: "v0" }] });
    expect(validateRuleVersion(rule, CATALOGUE).valid).toBe(true);
    expect(validateRuleVersion(rule, []).issues).toContain("CATTLE_RULE_NO_AUTHORITATIVE_SOURCE_FOR_CLASSIFICATION");
  });
});
