import type { SchemeRequirement } from "./contracts";
import type { StoredSchemeDefinition } from "./repository";
import { purposeForStoredRule } from "./repository";

/**
 * Converts source-pinned rule inputs into readiness requirements after the
 * rule engine has determined which rules actually apply to this farm.
 *
 * The caller must pass the applicable rule ids. An empty set means "no
 * applicable rules proven", not "all rules apply". This prevents the
 * readiness denominator from asking for conditionally irrelevant data.
 */
export function requirementsForApplicableRules(
  definition: StoredSchemeDefinition,
  applicableRuleIds: ReadonlySet<string>,
): SchemeRequirement[] {
  const schemeVersionKey = `${definition.version.schemeKey}:${definition.version.schemeYear}:${definition.version.rulesVersion}`;

  return definition.rules.flatMap((rule) => {
    if (!applicableRuleIds.has(rule.id)) return [];

    return rule.inputs.map((input) => ({
      id: `${rule.ruleKey}:${input.dataKey}`,
      schemeVersionKey,
      dataKey: input.dataKey,
      label: input.label,
      owner: input.owner,
      purpose: purposeForStoredRule(rule.ruleType),
      required: input.required,
      applicable: true,
      priority: input.priority,
    }));
  });
}
