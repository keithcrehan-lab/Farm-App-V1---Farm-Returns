/**
 * Synthetic fixtures for the Cattle C0 tests. Every source, rule, input and
 * value here is fictional (`SYNTH-*` ids) — no cattle science, law or
 * veterinary content.
 */

import { createHash } from "node:crypto";
import type { CattleRuleImplementation, CattleRulePredicate } from "./evaluation";
import type { CattleInputItem, CattleInformationClass, RequiredInputDescriptor } from "./information";
import { FAIL_CLOSED_UNKNOWN_POLICY, computeRuleFingerprint, type CattleReviewDimension, type CattleRuleVersion, type RuleReviewRecord } from "./rule";
import { computeSourceContentFingerprint, sourceVersionRef, type CattleEvidenceSource } from "./source";

export const hash = (input: string): string => createHash("sha256").update(input, "utf8").digest("hex");

export function synthSource(overrides: Partial<CattleEvidenceSource> = {}, material: unknown = { text: "synthetic clause A" }): CattleEvidenceSource {
  return {
    sourceId: "SYNTH-SRC-LEGAL",
    publisher: "Synthetic Publisher",
    title: "Synthetic legal instrument",
    authorityKind: "LEGISLATION",
    jurisdiction: "SYNTH-JURISDICTION",
    context: null,
    version: "v1",
    contentFingerprint: computeSourceContentFingerprint(material, hash),
    retrievedAt: "2026-01-01T00:00:00Z",
    checkedAt: "2026-01-02T00:00:00Z",
    lifecycle: "ACTIVE",
    supersededByVersion: null,
    registeredSourceId: null,
    ...overrides,
  };
}

export const LEGAL_SOURCE = synthSource();
export const SCIENCE_SOURCE = synthSource(
  { sourceId: "SYNTH-SRC-SCIENCE", title: "Synthetic advisory note", authorityKind: "ADVISORY_SCIENCE", jurisdiction: null },
  { text: "synthetic advisory content" },
);
export const VET_SOURCE = synthSource(
  { sourceId: "SYNTH-SRC-VET", title: "Synthetic programme", authorityKind: "VETERINARY_PROGRAMME", jurisdiction: null },
  { text: "synthetic programme content" },
);
export const CATALOGUE: CattleEvidenceSource[] = [LEGAL_SOURCE, SCIENCE_SOURCE, VET_SOURCE];

export function descriptor(inputKey: string, acceptedClasses: CattleInformationClass[] = ["FACT", "OBSERVATION"]): RequiredInputDescriptor {
  return { inputKey, description: `synthetic input ${inputKey}`, unit: null, acceptedClasses };
}

export const SYNTH_IMPLEMENTATION_ID = "SYNTH-IMPL-GATE";

export function synthRule(overrides: Partial<CattleRuleVersion> = {}): CattleRuleVersion {
  return {
    ruleId: "SYNTH-RULE-GATE",
    version: 1,
    title: "Synthetic hard gate",
    classification: "LEGAL_REQUIRED",
    gateRole: "HARD_GATE",
    jurisdiction: "SYNTH-JURISDICTION",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    applicability: [],
    requiredInputs: [descriptor("synth.flag")],
    assumptions: ["synthetic assumption"],
    limitations: ["synthetic limitation"],
    unknownPolicy: FAIL_CLOSED_UNKNOWN_POLICY,
    sourceBindings: [sourceVersionRef(LEGAL_SOURCE)],
    implementation: { implementationId: SYNTH_IMPLEMENTATION_ID, version: 1 },
    supersedes: null,
    requiredReviews: ["LEGAL"],
    productionState: "PRODUCTION",
    ...overrides,
  };
}

export function approve(rule: CattleRuleVersion, dimensions: CattleReviewDimension[] = rule.requiredReviews, at = "2026-01-05T00:00:00Z"): RuleReviewRecord[] {
  return dimensions.map((dimension) => ({
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    ruleFingerprint: computeRuleFingerprint(rule, hash),
    dimension,
    decision: "APPROVED",
    reviewerRef: `synthetic-${dimension.toLowerCase()}-reviewer`,
    reviewedAt: at,
  }));
}

export function item(inputKey: string, value: CattleInputItem["value"], overrides: Partial<CattleInputItem> = {}): CattleInputItem {
  return {
    inputKey,
    value,
    unit: null,
    informationClass: "FACT",
    provenance: { kind: "CANONICAL_RECORD", ref: `rec-${inputKey}-${String(value)}`, recordedAt: "2026-02-01T00:00:00Z" },
    ...overrides,
  };
}

/** Wraps a synthetic predicate with an implementation identity (defaults
 * match `synthRule`'s bound implementation). */
export function impl(evaluate: CattleRulePredicate, implementationId = SYNTH_IMPLEMENTATION_ID, version = 1): CattleRuleImplementation {
  return { implementationId, version, evaluate };
}

/** Synthetic predicate: PASS when `synth.flag` is `true`, FAIL when `false`. */
export const flagPredicate = impl((values) => (values["synth.flag"] === true ? "PASS" : "FAIL"));
