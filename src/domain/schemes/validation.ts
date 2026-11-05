import { registeredSchemeDataKey } from "./data-keys";
import type { StoredSchemeDefinition } from "./repository";

export interface SchemeDefinitionValidationIssue {
  code:
    | "VERIFIED_VERSION_WITHOUT_SOURCE"
    | "VERIFIED_SOURCE_NOT_FINGERPRINTED"
    | "RULE_SOURCE_MISSING"
    | "RULE_INPUT_KEY_UNREGISTERED"
    | "RULE_INPUT_OWNER_MISMATCH"
    | "HARD_DEADLINE_SOURCE_NOT_FINGERPRINTED";
  detail: string;
  ruleId?: string;
  dataKey?: string;
  sourceId?: string;
}

export function validateStoredSchemeDefinition(
  definition: StoredSchemeDefinition,
): SchemeDefinitionValidationIssue[] {
  const issues: SchemeDefinitionValidationIssue[] = [];
  const sourceById = new Map(
    definition.sources.map((source) => [source.id, source]),
  );

  if (
    definition.version.publicationState === "verified" &&
    definition.sources.length === 0
  ) {
    issues.push({
      code: "VERIFIED_VERSION_WITHOUT_SOURCE",
      detail: "A verified scheme version must carry at least one source.",
    });
  }

  if (definition.version.publicationState === "verified") {
    for (const source of definition.sources) {
      if (!source.contentFingerprintSha256) {
        issues.push({
          code: "VERIFIED_SOURCE_NOT_FINGERPRINTED",
          sourceId: source.id,
          detail:
            "Every source of a verified scheme version must be content-fingerprinted.",
        });
      }
    }
  }

  for (const rule of definition.rules) {
    const source = sourceById.get(rule.sourceId);
    if (!source) {
      issues.push({
        code: "RULE_SOURCE_MISSING",
        ruleId: rule.id,
        sourceId: rule.sourceId,
        detail: "Rule does not resolve to a source in this scheme version.",
      });
    }

    if (
      rule.ruleType === "deadline" &&
      rule.hardGate &&
      !source?.contentFingerprintSha256
    ) {
      issues.push({
        code: "HARD_DEADLINE_SOURCE_NOT_FINGERPRINTED",
        ruleId: rule.id,
        sourceId: rule.sourceId,
        detail:
          "A hard deadline cannot be promoted without a fingerprinted source.",
      });
    }

    for (const input of rule.inputs) {
      const registered = registeredSchemeDataKey(input.dataKey);
      if (!registered) {
        issues.push({
          code: "RULE_INPUT_KEY_UNREGISTERED",
          ruleId: rule.id,
          dataKey: input.dataKey,
          detail:
            "Rule input is not in Farm Return's canonical Schemes data-key registry.",
        });
        continue;
      }

      if (registered.owner !== input.owner) {
        issues.push({
          code: "RULE_INPUT_OWNER_MISMATCH",
          ruleId: rule.id,
          dataKey: input.dataKey,
          detail: `Stored owner ${input.owner} does not match canonical owner ${registered.owner}.`,
        });
      }
    }
  }

  return issues;
}

export function assertStoredSchemeDefinition(
  definition: StoredSchemeDefinition,
): void {
  const issues = validateStoredSchemeDefinition(definition);
  if (issues.length === 0) return;

  throw new Error(
    `INVALID_STORED_SCHEME_DEFINITION:${definition.version.schemeKey}:${definition.version.rulesVersion}:${issues
      .map((issue) => issue.code)
      .join(",")}`,
  );
}
