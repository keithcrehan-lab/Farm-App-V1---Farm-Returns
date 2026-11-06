import { describe, expect, it } from "vitest";
import type { SchemeDataPoint, SchemeDataState } from "../contracts";
import { deriveSchemeEligibility } from "../eligibility";
import type { StoredSchemeRule } from "../repository";
import {
  evaluateStoredSchemeRule,
  type SchemeRuleEvaluationState,
} from "../rule-evaluation";
import {
  dominantUnresolvedRuleState,
  SCHEME_DATA_STATE_PRECEDENCE,
  SCHEME_ELIGIBILITY_STATES,
  SCHEME_UNRESOLVED_RULE_PRECEDENCE,
} from "./states";

const NOW = "2031-06-01T00:00:00.000Z";

function ruleReading(keys: string[]): StoredSchemeRule {
  return {
    id: "SYNTH-RULE",
    schemeVersionId: "SYNTH-VERSION",
    sourceId: "SYNTH-SOURCE",
    ruleKey: "synth-rule",
    ruleType: "eligibility",
    description: "SYNTH rule",
    operator: "exists",
    parameters: {},
    consequence: {},
    hardGate: true,
    effectiveFrom: null,
    effectiveTo: null,
    inputs: keys.map((dataKey) => ({
      ruleId: "SYNTH-RULE",
      schemeVersionId: "SYNTH-VERSION",
      dataKey,
      label: "SYNTH input",
      owner: "cattle",
      subjectScope: "animal",
      required: true,
      resolutionOwner: "farmer",
      priority: 10,
      routeKey: null,
    })),
  };
}

function point(key: string, state: SchemeDataState): SchemeDataPoint {
  return { key, owner: "cattle", state, resolutionOwner: "farmer" };
}

/** The rule state each unresolved data state must surface as. */
const RULE_STATE_FOR: Record<
  (typeof SCHEME_DATA_STATE_PRECEDENCE)[number],
  SchemeRuleEvaluationState
> = {
  CONFLICTING: "EVIDENCE_CONFLICT",
  INVALID: "INVALID_EVIDENCE",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  UNSUPPORTED: "UNSUPPORTED",
  MISSING: "UNKNOWN",
  NOT_APPLICABLE: "NOT_APPLICABLE",
};

function evaluate(a: SchemeDataState, b: SchemeDataState) {
  const snapshot = new Map([
    ["synth.a", point("synth.a", a)],
    ["synth.b", point("synth.b", b)],
  ]);
  return evaluateStoredSchemeRule(ruleReading(["synth.a", "synth.b"]), snapshot, NOW).state;
}

describe("the published precedence matches the Schemes engine", () => {
  it("the strongest of any two input states decides the rule, in either order", () => {
    SCHEME_DATA_STATE_PRECEDENCE.forEach((stronger, index) => {
      for (const weaker of SCHEME_DATA_STATE_PRECEDENCE.slice(index)) {
        expect(evaluate(stronger, weaker)).toBe(RULE_STATE_FOR[stronger]);
        expect(evaluate(weaker, stronger)).toBe(RULE_STATE_FOR[stronger]);
      }
    });
  });

  it("any unresolved input beats KNOWN, and only KNOWN inputs reach the operator", () => {
    for (const state of SCHEME_DATA_STATE_PRECEDENCE) {
      expect(evaluate("KNOWN", state)).toBe(RULE_STATE_FOR[state]);
    }
  });

  it("keeps the unresolved list in the same order as the data states", () => {
    const fromData = SCHEME_DATA_STATE_PRECEDENCE.map((state) => RULE_STATE_FOR[state]).filter(
      (state) => state !== "NOT_APPLICABLE",
    );
    expect(fromData).toEqual([...SCHEME_UNRESOLVED_RULE_PRECEDENCE]);
  });

  it("treats a data point nobody supplied as UNSUPPORTED, not as farmer-missing", () => {
    expect(evaluateStoredSchemeRule(ruleReading(["synth.absent"]), new Map(), NOW).state).toBe("UNSUPPORTED");
  });
});

describe("dominantUnresolvedRuleState", () => {
  it("returns the strongest unresolved state in any order", () => {
    expect(dominantUnresolvedRuleState(["UNKNOWN", "UNSUPPORTED", "PASS"])).toBe("UNSUPPORTED");
    expect(dominantUnresolvedRuleState(["UNSUPPORTED", "REVIEW_REQUIRED"])).toBe("REVIEW_REQUIRED");
    expect(dominantUnresolvedRuleState(["INVALID_EVIDENCE", "EVIDENCE_CONFLICT"])).toBe("EVIDENCE_CONFLICT");
    expect(dominantUnresolvedRuleState(["UNKNOWN", "FAIL"])).toBe("UNKNOWN");
  });

  it("is null when nothing is unresolved", () => {
    expect(dominantUnresolvedRuleState([])).toBeNull();
    expect(dominantUnresolvedRuleState(["PASS", "FAIL", "NOT_APPLICABLE"])).toBeNull();
  });
});

describe("closed eligibility vocabulary", () => {
  it("names exactly the states the engine owns", () => {
    expect([...SCHEME_ELIGIBILITY_STATES].sort()).toEqual([
      "ELIGIBLE_CONFIRMED",
      "EXISTING_PARTICIPANT",
      "LIKELY_ELIGIBLE",
      "MORE_INFORMATION_REQUIRED",
      "NOT_RELEVANT",
      "POTENTIALLY_ELIGIBLE",
      "PROBABLY_NOT_ELIGIBLE",
    ]);
  });

  it.each(SCHEME_UNRESOLVED_RULE_PRECEDENCE)(
    "an eligibility rule that is %s never yields a confident state",
    (state) => {
      const rule = ruleReading(["synth.a"]);
      const assessment = deriveSchemeEligibility({
        rules: [rule],
        evaluations: [
          {
            ruleId: rule.id,
            ruleKey: rule.ruleKey,
            sourceId: rule.sourceId,
            state,
            inputKeys: ["synth.a"],
            detail: "SYNTH",
          },
        ],
        participationStatus: "unknown",
        authoritativeConditionsProven: true,
      });
      expect(assessment.state).toBe("MORE_INFORMATION_REQUIRED");
      expect(assessment.unresolvedRuleIds).toEqual([rule.id]);
    },
  );
});
