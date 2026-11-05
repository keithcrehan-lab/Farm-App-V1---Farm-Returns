import type { SchemeDataPoint } from "./contracts";
import type { StoredSchemeRule } from "./repository";

export type SchemeRuleEvaluationState =
  | "PASS"
  | "FAIL"
  | "UNKNOWN"
  | "EVIDENCE_CONFLICT"
  | "INVALID_EVIDENCE"
  | "UNSUPPORTED"
  | "REVIEW_REQUIRED"
  | "NOT_APPLICABLE";

export interface SchemeRuleEvaluation {
  ruleId: string;
  ruleKey: string;
  sourceId: string;
  state: SchemeRuleEvaluationState;
  inputKeys: string[];
  detail: string;
}

export type SchemeRuleOperatorResult =
  | { supported: true; passes: boolean; detail?: string }
  | { supported: false; detail: string };

export type SchemeRuleOperator = (input: {
  values: unknown[];
  parameters: Record<string, unknown>;
}) => SchemeRuleOperatorResult;

const primitive = (value: unknown): value is string | number | boolean | null =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

function oneValue(values: unknown[]): SchemeRuleOperatorResult | unknown {
  if (values.length !== 1) {
    return {
      supported: false,
      detail: "Operator requires exactly one input value.",
    } satisfies SchemeRuleOperatorResult;
  }
  return values[0];
}

const BUILTIN_OPERATORS: Readonly<Record<string, SchemeRuleOperator>> = {
  exists: ({ values }) => ({
    supported: true,
    passes: values.length === 1 && values[0] !== null && values[0] !== undefined,
  }),
  equals: ({ values, parameters }) => {
    const value = oneValue(values);
    if (
      typeof value === "object" &&
      value !== null &&
      "supported" in value
    ) {
      return value as SchemeRuleOperatorResult;
    }
    const expected = parameters.expected;
    if (!primitive(value) || !primitive(expected)) {
      return {
        supported: false,
        detail: "equals supports primitive values only.",
      };
    }
    return { supported: true, passes: value === expected };
  },
  not_equals: ({ values, parameters }) => {
    const result = BUILTIN_OPERATORS.equals({ values, parameters });
    return result.supported
      ? { supported: true, passes: !result.passes }
      : result;
  },
  gte: ({ values, parameters }) => numericCompare(values, parameters, ">="),
  gt: ({ values, parameters }) => numericCompare(values, parameters, ">"),
  lte: ({ values, parameters }) => numericCompare(values, parameters, "<="),
  lt: ({ values, parameters }) => numericCompare(values, parameters, "<"),
  between: ({ values, parameters }) => {
    const value = oneValue(values);
    if (
      typeof value === "object" &&
      value !== null &&
      "supported" in value
    ) {
      return value as SchemeRuleOperatorResult;
    }
    const min = parameters.min;
    const max = parameters.max;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      typeof min !== "number" ||
      !Number.isFinite(min) ||
      typeof max !== "number" ||
      !Number.isFinite(max)
    ) {
      return {
        supported: false,
        detail: "between requires finite numeric value/min/max.",
      };
    }
    return { supported: true, passes: value >= min && value <= max };
  },
  in: ({ values, parameters }) => {
    const value = oneValue(values);
    if (
      typeof value === "object" &&
      value !== null &&
      "supported" in value
    ) {
      return value as SchemeRuleOperatorResult;
    }
    const allowed = parameters.values;
    if (!primitive(value) || !Array.isArray(allowed) || !allowed.every(primitive)) {
      return {
        supported: false,
        detail: "in requires one primitive value and a primitive values array.",
      };
    }
    return { supported: true, passes: allowed.includes(value) };
  },
  all_true: ({ values }) => {
    if (!values.every((value) => typeof value === "boolean")) {
      return {
        supported: false,
        detail: "all_true requires boolean inputs.",
      };
    }
    return { supported: true, passes: values.every(Boolean) };
  },
};

function numericCompare(
  values: unknown[],
  parameters: Record<string, unknown>,
  operator: ">=" | ">" | "<=" | "<",
): SchemeRuleOperatorResult {
  const value = oneValue(values);
  if (
    typeof value === "object" &&
    value !== null &&
    "supported" in value
  ) {
    return value as SchemeRuleOperatorResult;
  }
  const threshold = parameters.threshold;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    typeof threshold !== "number" ||
    !Number.isFinite(threshold)
  ) {
    return {
      supported: false,
      detail: `${operator} requires a finite numeric value and threshold.`,
    };
  }

  const passes =
    operator === ">="
      ? value >= threshold
      : operator === ">"
        ? value > threshold
        : operator === "<="
          ? value <= threshold
          : value < threshold;

  return { supported: true, passes };
}

function time(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function unresolvedInputState(
  points: SchemeDataPoint[],
): SchemeRuleEvaluationState | null {
  if (points.some((point) => point.state === "CONFLICTING")) {
    return "EVIDENCE_CONFLICT";
  }
  if (points.some((point) => point.state === "INVALID")) {
    return "INVALID_EVIDENCE";
  }
  if (points.some((point) => point.state === "REVIEW_REQUIRED")) {
    return "REVIEW_REQUIRED";
  }
  if (points.some((point) => point.state === "UNSUPPORTED")) {
    return "UNSUPPORTED";
  }
  if (points.some((point) => point.state === "MISSING")) {
    return "UNKNOWN";
  }
  if (points.some((point) => point.state === "NOT_APPLICABLE")) {
    return "NOT_APPLICABLE";
  }
  return null;
}

/**
 * Deterministic rule evaluation only. Unknown operators fail closed to
 * UNSUPPORTED; AI is not an operator fallback.
 */
export function evaluateStoredSchemeRule(
  rule: StoredSchemeRule,
  snapshot: ReadonlyMap<string, SchemeDataPoint>,
  nowIso: string,
  customOperators: Readonly<Record<string, SchemeRuleOperator>> = {},
): SchemeRuleEvaluation {
  const now = Date.parse(nowIso);
  const from = time(rule.effectiveFrom);
  const to = time(rule.effectiveTo);

  if ((from !== null && now < from) || (to !== null && now > to)) {
    return {
      ruleId: rule.id,
      ruleKey: rule.ruleKey,
      sourceId: rule.sourceId,
      state: "NOT_APPLICABLE",
      inputKeys: rule.inputs.map((input) => input.dataKey),
      detail: "Rule is outside its effective window.",
    };
  }

  const points: SchemeDataPoint[] = rule.inputs.map(
    (input) =>
      snapshot.get(input.dataKey) ?? {
        key: input.dataKey,
        owner: input.owner,
        state: "UNSUPPORTED",
        resolutionOwner: "system",
      },
  );

  const unresolved = unresolvedInputState(points);
  if (unresolved) {
    return {
      ruleId: rule.id,
      ruleKey: rule.ruleKey,
      sourceId: rule.sourceId,
      state: unresolved,
      inputKeys: rule.inputs.map((input) => input.dataKey),
      detail:
        unresolved === "UNKNOWN"
          ? "Required canonical data is not recorded yet."
          : unresolved === "UNSUPPORTED"
            ? "Farm Return cannot evaluate one or more required data inputs yet."
            : unresolved === "EVIDENCE_CONFLICT"
              ? "Canonical records disagree."
              : unresolved === "INVALID_EVIDENCE"
                ? "A required canonical record is invalid."
                : unresolved === "REVIEW_REQUIRED"
                  ? "A required input needs review before it can count."
                  : "This rule does not apply to the current subject.",
    };
  }

  const operator =
    customOperators[rule.operator] ?? BUILTIN_OPERATORS[rule.operator];
  if (!operator) {
    return {
      ruleId: rule.id,
      ruleKey: rule.ruleKey,
      sourceId: rule.sourceId,
      state: "UNSUPPORTED",
      inputKeys: rule.inputs.map((input) => input.dataKey),
      detail: `No deterministic evaluator is registered for operator ${rule.operator}.`,
    };
  }

  const result = operator({
    values: points.map((point) => point.value),
    parameters: rule.parameters,
  });

  if (!result.supported) {
    return {
      ruleId: rule.id,
      ruleKey: rule.ruleKey,
      sourceId: rule.sourceId,
      state: "UNSUPPORTED",
      inputKeys: rule.inputs.map((input) => input.dataKey),
      detail: result.detail,
    };
  }

  return {
    ruleId: rule.id,
    ruleKey: rule.ruleKey,
    sourceId: rule.sourceId,
    state: result.passes ? "PASS" : "FAIL",
    inputKeys: rule.inputs.map((input) => input.dataKey),
    detail:
      result.detail ??
      (result.passes
        ? "The deterministic rule passed."
        : "The deterministic rule failed."),
  };
}
