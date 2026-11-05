import { describe, expect, it } from "vitest";
import type { SchemeDataPoint } from "./contracts";
import type { StoredSchemeRule } from "./repository";
import { evaluateStoredSchemeRule } from "./rule-evaluation";

function rule(
  overrides: Partial<StoredSchemeRule> = {},
): StoredSchemeRule {
  return {
    id: "rule-1",
    schemeVersionId: "version-1",
    sourceId: "source-1",
    ruleKey: "minimum-weight",
    ruleType: "eligibility",
    description: "Weight must meet the threshold.",
    operator: "gte",
    parameters: { threshold: 300 },
    consequence: {},
    hardGate: true,
    effectiveFrom: null,
    effectiveTo: null,
    inputs: [
      {
        ruleId: "rule-1",
        schemeVersionId: "version-1",
        dataKey: "cattle.animal.weight",
        label: "Current weight",
        owner: "cattle",
        subjectScope: "animal",
        required: true,
        resolutionOwner: "farmer",
        priority: 10,
        routeKey: "cattle.weight",
      },
    ],
    ...overrides,
  };
}

function point(
  state: SchemeDataPoint["state"],
  value?: unknown,
): SchemeDataPoint {
  return {
    key: "cattle.animal.weight",
    owner: "cattle",
    state,
    value,
    resolutionOwner: "farmer",
  };
}

describe("evaluateStoredSchemeRule", () => {
  it("evaluates a supported deterministic rule without AI", () => {
    const snapshot = new Map([
      ["cattle.animal.weight", point("KNOWN", 325)],
    ]);

    expect(
      evaluateStoredSchemeRule(
        rule(),
        snapshot,
        "2027-03-01T00:00:00.000Z",
      ).state,
    ).toBe("PASS");

    snapshot.set("cattle.animal.weight", point("KNOWN", 250));
    expect(
      evaluateStoredSchemeRule(
        rule(),
        snapshot,
        "2027-03-01T00:00:00.000Z",
      ).state,
    ).toBe("FAIL");
  });

  it("keeps missing, conflicting and unsupported inputs distinct", () => {
    for (const [state, expected] of [
      ["MISSING", "UNKNOWN"],
      ["CONFLICTING", "EVIDENCE_CONFLICT"],
      ["UNSUPPORTED", "UNSUPPORTED"],
      ["REVIEW_REQUIRED", "REVIEW_REQUIRED"],
    ] as const) {
      const result = evaluateStoredSchemeRule(
        rule(),
        new Map([["cattle.animal.weight", point(state)]]),
        "2027-03-01T00:00:00.000Z",
      );
      expect(result.state).toBe(expected);
    }
  });

  it("treats an absent canonical adapter as unsupported, not farmer failure", () => {
    const result = evaluateStoredSchemeRule(
      rule(),
      new Map(),
      "2027-03-01T00:00:00.000Z",
    );

    expect(result.state).toBe("UNSUPPORTED");
  });

  it("fails closed when an operator has no deterministic evaluator", () => {
    const result = evaluateStoredSchemeRule(
      rule({ operator: "scheme_specific_magic" }),
      new Map([
        ["cattle.animal.weight", point("KNOWN", 325)],
      ]),
      "2027-03-01T00:00:00.000Z",
    );

    expect(result.state).toBe("UNSUPPORTED");
    expect(result.detail).toMatch(/No deterministic evaluator/i);
  });

  it("allows a source-reviewed custom operator to be registered explicitly", () => {
    const result = evaluateStoredSchemeRule(
      rule({ operator: "scheme_specific" }),
      new Map([
        ["cattle.animal.weight", point("KNOWN", 325)],
      ]),
      "2027-03-01T00:00:00.000Z",
      {
        scheme_specific: ({ values }) => ({
          supported: true,
          passes: values[0] === 325,
        }),
      },
    );

    expect(result.state).toBe("PASS");
  });

  it("does not evaluate a rule outside its own effective window", () => {
    const result = evaluateStoredSchemeRule(
      rule({
        effectiveFrom: "2027-04-01T00:00:00.000Z",
        effectiveTo: "2027-06-01T00:00:00.000Z",
      }),
      new Map([
        ["cattle.animal.weight", point("KNOWN", 325)],
      ]),
      "2027-03-01T00:00:00.000Z",
    );

    expect(result.state).toBe("NOT_APPLICABLE");
  });

  it("rejects wrong numeric parameter shapes as unsupported instead of coercing", () => {
    const result = evaluateStoredSchemeRule(
      rule({ parameters: { threshold: "300" } }),
      new Map([
        ["cattle.animal.weight", point("KNOWN", 325)],
      ]),
      "2027-03-01T00:00:00.000Z",
    );

    expect(result.state).toBe("UNSUPPORTED");
  });
});
