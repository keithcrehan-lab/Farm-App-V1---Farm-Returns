import { describe, expect, it } from "vitest";
import type { StoredSchemeRule } from "./repository";
import type { SchemeRuleEvaluation } from "./rule-evaluation";
import { deriveSchemeEligibility } from "./eligibility";

function rule(
  id: string,
  ruleType: StoredSchemeRule["ruleType"],
  hardGate = false,
): StoredSchemeRule {
  return {
    id,
    schemeVersionId: "version-1",
    sourceId: "source-1",
    ruleKey: id,
    ruleType,
    description: id,
    operator: "exists",
    parameters: {},
    consequence: {},
    hardGate,
    effectiveFrom: null,
    effectiveTo: null,
    inputs: [],
  };
}

function evaluation(
  ruleId: string,
  state: SchemeRuleEvaluation["state"],
): SchemeRuleEvaluation {
  return {
    ruleId,
    ruleKey: ruleId,
    sourceId: "source-1",
    state,
    inputKeys: [],
    detail: state,
  };
}

describe("deriveSchemeEligibility", () => {
  it("keeps readiness/eligibility semantics conservative when data is unresolved", () => {
    const rules = [
      rule("relevant", "relevance"),
      rule("gate", "eligibility", true),
    ];
    const result = deriveSchemeEligibility({
      rules,
      evaluations: [
        evaluation("relevant", "PASS"),
        evaluation("gate", "UNKNOWN"),
      ],
      participationStatus: "unknown",
      authoritativeConditionsProven: false,
    });

    expect(result.state).toBe("POTENTIALLY_ELIGIBLE");
    expect(result.unresolvedRuleIds).toEqual(["gate"]);
  });

  it("reports a proven hard-gate failure as probably not eligible, not a formal DAFM refusal", () => {
    const rules = [rule("gate", "eligibility", true)];
    const result = deriveSchemeEligibility({
      rules,
      evaluations: [evaluation("gate", "FAIL")],
      participationStatus: "unknown",
      authoritativeConditionsProven: true,
    });

    expect(result.state).toBe("PROBABLY_NOT_ELIGIBLE");
  });

  it("uses likely eligible when conditions pass but authoritative confirmation remains", () => {
    const rules = [rule("gate", "eligibility", true)];
    const result = deriveSchemeEligibility({
      rules,
      evaluations: [evaluation("gate", "PASS")],
      participationStatus: "unknown",
      authoritativeConditionsProven: false,
    });

    expect(result.state).toBe("LIKELY_ELIGIBLE");
  });

  it("reserves confirmed eligibility for explicitly authoritative conditions", () => {
    const rules = [rule("gate", "eligibility", true)];
    const result = deriveSchemeEligibility({
      rules,
      evaluations: [evaluation("gate", "PASS")],
      participationStatus: "unknown",
      authoritativeConditionsProven: true,
    });

    expect(result.state).toBe("ELIGIBLE_CONFIRMED");
  });

  it("keeps an existing participant distinct from fresh eligibility inference", () => {
    const result = deriveSchemeEligibility({
      rules: [],
      evaluations: [],
      participationStatus: "existing_participant",
      authoritativeConditionsProven: false,
    });

    expect(result.state).toBe("EXISTING_PARTICIPANT");
  });

  it("uses NOT_RELEVANT only when all applicable relevance rules fail", () => {
    const rules = [
      rule("r1", "relevance"),
      rule("r2", "relevance"),
    ];
    const result = deriveSchemeEligibility({
      rules,
      evaluations: [
        evaluation("r1", "FAIL"),
        evaluation("r2", "FAIL"),
      ],
      participationStatus: "unknown",
      authoritativeConditionsProven: false,
    });

    expect(result.state).toBe("NOT_RELEVANT");
  });
});
