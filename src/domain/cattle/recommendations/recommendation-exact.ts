/**
 * Cattle C8 — exact consumed contracts for the C0 records C8 CARRIES
 * (CAT-INV-028; C8 architecture review 2026-10-15, findings F005 / R3–R5).
 *
 * C8 never carries a raw predecessor or C0 object into its sealed context or
 * its evidence pack. A record C8 carries (C2 / C3 / C7 hard-gate
 * `RuleEvaluationRecord`s, C0 model rule evaluations, the C0 pack it stores)
 * is first validated against an EXACT schema — every field of the owner's
 * published type, at every nesting level, with its runtime type, frozen
 * vocabulary and format — and only the projected copy (`exact(spec, value)`)
 * is carried. An undeclared field is malformed (exactness), never dropped:
 * a drift in the owner's output fails closed instead of passing unseen.
 *
 * Completeness is checked by the COMPILER, not by review: `Covers<S, T>`
 * requires the schema's keys to equal `keyof T` at every nesting level and the
 * projected type to be assignable to the owner's type, so omitting a field of
 * a frozen C0 type is a type error (the F005 defect class cannot recur
 * silently). The schema validates structure only — no consistency predicate
 * restates C0 / C2 / C3 / C7 derivation.
 *
 * Leaf kinds reuse the C7 consumed-field leaf validators (`valid`); C8 adds the
 * kinds C0 records need that the C7 machinery cannot express: `text` (any
 * string), `scalar` (`CattleInputScalar`) and `map` (string-keyed record).
 */

import type { AssessmentFingerprint } from "../../assessment-integrity";
import type { ConflictingInputRecord, RuleEvaluationRecord, SuppliedImplementationRef } from "../evaluation";
import type { CandidateAction, EvidencePackCalculationStep, EvidencePackReview, HardGateOutcome, IntentRef, RecommendationEvidencePack, RejectedAlternative, TargetScopeRef } from "../evidence-pack";
import type { CattleInputItem, ProvenanceRef, RejectedInput } from "../information";
import type { RuleVersionRef } from "../rule";
import type { SourceBindingCheck, SourceVersionRef } from "../source";
import { fingerprintOf } from "../health/health-input";
import { CATTLE_EVIDENCE_ARCHITECTURE_VERSION } from "../version";
import { C0_EVALUATION_STATES, C0_GATE_ROLES, C0_RULE_CLASSIFICATIONS, valid } from "../programmes/programme-consumed";
import { vocabulary } from "./recommendation-consumed";
import type { CattleInformationClass, ProvenanceKind } from "../information";
import type { SourceBindingStatus } from "../source";
import type { CattleReviewDimension, ReviewDimensionState } from "../rule";
import type { RecommendationOutcome } from "../evidence-pack";

// ---------------------------------------------------------------------------
// Spec language
// ---------------------------------------------------------------------------

export type ExactSpec =
  | { t: "text" }
  | { t: "ref" }
  | { t: "int" }
  | { t: "bool" }
  | { t: "scalar" }
  | { t: "date" }
  | { t: "fingerprint" }
  | { t: "literal"; value: string }
  | { t: "enum"; values: readonly string[] }
  | { t: "nullable"; of: ExactSpec }
  | { t: "array"; of: ExactSpec }
  | { t: "map"; of: ExactSpec }
  | { t: "object"; fields: Record<string, ExactSpec> };

const text = { t: "text" } as const;
const ref = { t: "ref" } as const;
const int = { t: "int" } as const;
const bool = { t: "bool" } as const;
const scalar = { t: "scalar" } as const;
const date = { t: "date" } as const;
const fingerprint = { t: "fingerprint" } as const;
const literal = <const V extends string>(value: V) => ({ t: "literal", value }) as const;
const oneOf = <const V extends readonly string[]>(values: V) => ({ t: "enum", values }) as const;
const nullable = <const S extends ExactSpec>(of: S) => ({ t: "nullable", of }) as const;
const arrayOf = <const S extends ExactSpec>(of: S) => ({ t: "array", of }) as const;
const mapOf = <const S extends ExactSpec>(of: S) => ({ t: "map", of }) as const;
const object = <const F extends Record<string, ExactSpec>>(fields: F) => ({ t: "object", fields }) as const;

/** The projected (TypeScript) type of a value an exact spec accepts. */
export type ExactOf<S> = S extends { t: "text" | "ref" | "date" }
  ? string
  : S extends { t: "int" }
    ? number
    : S extends { t: "bool" }
      ? boolean
      : S extends { t: "scalar" }
        ? string | number | boolean
        : S extends { t: "fingerprint" }
          ? AssessmentFingerprint
          : S extends { t: "literal"; value: infer V }
            ? V
            : S extends { t: "enum"; values: readonly (infer V)[] }
              ? V
              : S extends { t: "nullable"; of: infer O }
                ? ExactOf<O> | null
                : S extends { t: "array"; of: infer O }
                  ? ExactOf<O>[]
                  : S extends { t: "map"; of: infer O }
                    ? Record<string, ExactOf<O>>
                    : S extends { t: "object"; fields: infer F }
                      ? { [K in keyof F]: ExactOf<F[K]> }
                      : never;

/**
 * Compile-time completeness: the object spec `S` declares exactly the keys of
 * `T` and its projection is assignable to `T`. Evaluates to `true` or a type
 * error at the `satisfies` site.
 */
export type Covers<S, T> = S extends { t: "object"; fields: infer F }
  ? [Exclude<keyof F, keyof T>, Exclude<keyof T, keyof F>] extends [never, never]
    ? ExactOf<S> extends T
      ? true
      : "projection not assignable to the owner type"
    : { missingOrExtraKeys: Exclude<keyof F, keyof T> | Exclude<keyof T, keyof F> }
  : "not an object spec";

// ---------------------------------------------------------------------------
// Validation and projection
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** True when `value` matches `spec` exactly: every declared field present and valid, no undeclared field, at every level. */
export function exactValid(spec: ExactSpec, value: unknown): boolean {
  switch (spec.t) {
    case "text":
      return typeof value === "string";
    case "scalar":
      return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
    case "ref":
    case "int":
    case "bool":
    case "date":
    case "fingerprint":
    case "literal":
    case "enum":
      return valid(spec as never, value);
    case "nullable":
      return value === null || exactValid(spec.of, value);
    case "array":
      return Array.isArray(value) && value.every((x) => exactValid(spec.of, x));
    case "map":
      return isRecord(value) && Object.values(value).every((x) => exactValid(spec.of, x));
    case "object": {
      if (!isRecord(value)) return false;
      const keys = Object.keys(value);
      if (keys.some((k) => !Object.hasOwn(spec.fields, k))) return false;
      return Object.entries(spec.fields).every(([k, f]) => Object.hasOwn(value, k) && exactValid(f, value[k]));
    }
  }
}

function project(spec: ExactSpec, value: unknown): unknown {
  switch (spec.t) {
    case "nullable":
      return value === null ? null : project(spec.of, value);
    case "array":
      return (value as unknown[]).map((x) => project(spec.of, x));
    case "map":
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, x]) => [k, project(spec.of, x)]));
    case "object":
      return Object.fromEntries(Object.entries(spec.fields).map(([k, f]) => [k, project(f, (value as Record<string, unknown>)[k])]));
    case "fingerprint":
      return fingerprintOf(value);
    default:
      return value;
  }
}

/** The validated, freshly projected copy of `value`, or `null` when it does not match `spec` exactly. */
export function exact<const S extends ExactSpec>(spec: S, value: unknown): ExactOf<S> | null {
  return exactValid(spec, value) ? (project(spec, value) as never) : null;
}

// ---------------------------------------------------------------------------
// Frozen C0 vocabularies not exported as runtime constants by C0
// ---------------------------------------------------------------------------

const INFORMATION_CLASSES = vocabulary<CattleInformationClass>()(["FACT", "OBSERVATION", "INTENT", "RULE", "DERIVED_VALUE", "PREDICTION", "OBLIGATION_OR_CONSTRAINT", "RECOMMENDATION"]);
const PROVENANCE_KINDS = vocabulary<ProvenanceKind>()(["CANONICAL_RECORD", "OFFICIAL_SOURCE", "FARMER_ENTRY", "DEVICE", "ENGINE_DERIVATION"]);
const SOURCE_BINDING_STATUSES = vocabulary<SourceBindingStatus>()([
  "CURRENT",
  "SOURCE_VERSION_CHANGED",
  "SOURCE_CONTENT_CHANGED",
  "SOURCE_REVIEW_REQUIRED",
  "SOURCE_NO_ACTIVE_VERSION",
  "SOURCE_MULTIPLE_ACTIVE_VERSIONS",
  "SOURCE_NOT_FOUND",
]);
const REVIEW_DIMENSIONS = vocabulary<CattleReviewDimension>()(["SCIENTIFIC", "LEGAL", "VETERINARY"]);
const REVIEW_STATES = vocabulary<ReviewDimensionState>()(["APPROVED", "REJECTED", "PENDING"]);
const REJECTED_INPUT_REASONS = vocabulary<RejectedInput["reasonCode"]>()(["CATTLE_INPUT_CLASS_NOT_ACCEPTED", "CATTLE_INPUT_UNIT_MISMATCH"]);
const PACK_OUTCOMES = vocabulary<RecommendationOutcome>()(["ACTIONABLE", "NO_RECOMMENDATION", "INSUFFICIENT_EVIDENCE", "BLOCKED", "REVIEW_REQUIRED"]);
const HARD_GATE_STATES = [...C0_EVALUATION_STATES, "NOT_EVALUATED"] as const;
const PACK_REVIEW_STATES = vocabulary<EvidencePackReview["state"]>()(["UNREVIEWED", "REVIEWED"]);

// ---------------------------------------------------------------------------
// Exact C0 record schemas (compile-checked against the frozen C0 types)
// ---------------------------------------------------------------------------

export const SOURCE_VERSION_REF = object({ sourceId: ref, version: ref, contentFingerprint: fingerprint });
const RULE_VERSION_REF = object({ ruleId: ref, version: int });
const PROVENANCE_REF = object({ kind: oneOf(PROVENANCE_KINDS), ref: text, recordedAt: nullable(text) });
const INPUT_ITEM = object({ inputKey: text, value: scalar, unit: nullable(text), informationClass: oneOf(INFORMATION_CLASSES), provenance: PROVENANCE_REF });
const SUPPLIED_IMPLEMENTATION = object({ implementationId: text, version: int, logicFingerprint: nullable(fingerprint) });
const CONFLICTING_INPUT = object({ inputKey: text, items: arrayOf(INPUT_ITEM) });
const REJECTED_INPUT = object({ item: INPUT_ITEM, reasonCode: oneOf(REJECTED_INPUT_REASONS) });
const SOURCE_CHECK = object({ bound: SOURCE_VERSION_REF, status: oneOf(SOURCE_BINDING_STATUSES), current: nullable(SOURCE_VERSION_REF) });
const REVIEW_DIMENSION = object({ dimension: oneOf(REVIEW_DIMENSIONS), state: oneOf(REVIEW_STATES) });

/** C0 `RuleEvaluationRecord` — every field (C2 / C3 / C7 hard gates; C0 model evaluations). */
export const RULE_EVALUATION_RECORD = object({
  architectureVersion: literal(CATTLE_EVIDENCE_ARCHITECTURE_VERSION),
  requestedRuleId: ref,
  rule: nullable(RULE_VERSION_REF),
  ruleFingerprint: nullable(fingerprint),
  implementation: nullable(SUPPLIED_IMPLEMENTATION),
  classification: nullable(oneOf(C0_RULE_CLASSIFICATIONS)),
  gateRole: nullable(oneOf(C0_GATE_ROLES)),
  evaluationDate: date,
  state: oneOf(C0_EVALUATION_STATES),
  reasonCodes: arrayOf(text),
  usedInputs: arrayOf(INPUT_ITEM),
  missingInputs: arrayOf(text),
  conflictingInputs: arrayOf(CONFLICTING_INPUT),
  rejectedInputs: arrayOf(REJECTED_INPUT),
  sourceChecks: arrayOf(SOURCE_CHECK),
  reviews: arrayOf(REVIEW_DIMENSION),
});

/** C0 `RecommendationEvidencePack` — every field (the pack C8 stores and reads). */
export const EVIDENCE_PACK = object({
  recommendationId: text,
  engineVersion: text,
  rulesetVersion: text,
  evaluationDate: date,
  knownAt: text,
  generatedAt: text,
  targetScope: object({ kind: text, id: text, snapshotRef: nullable(text) }),
  intent: nullable(object({ intentId: text, description: text })),
  inputs: arrayOf(INPUT_ITEM),
  ruleEvaluations: arrayOf(RULE_EVALUATION_RECORD),
  requiredHardGateRuleIds: arrayOf(text),
  calculationSteps: arrayOf(
    object({ sequence: int, description: text, formula: text, inputs: mapOf(scalar), output: nullable(scalar), unit: nullable(text), rounding: nullable(text), rule: nullable(RULE_VERSION_REF) }),
  ),
  additionalSourceRefs: arrayOf(SOURCE_VERSION_REF),
  assumptions: arrayOf(text),
  limitations: arrayOf(text),
  uncertainties: arrayOf(text),
  candidateActions: arrayOf(object({ actionId: text, description: text, favourability: nullable(text) })),
  rejectedAlternatives: arrayOf(object({ actionId: text, reasonCodes: arrayOf(text) })),
  proposedActionId: nullable(text),
  review: object({ state: oneOf(PACK_REVIEW_STATES), reviewerRef: nullable(text), reviewedAt: nullable(text), notes: arrayOf(text) }),
  architectureVersion: literal(CATTLE_EVIDENCE_ARCHITECTURE_VERSION),
  missingInputs: arrayOf(text),
  conflictingInputs: arrayOf(text),
  hardGateOutcomes: arrayOf(object({ ruleId: text, rule: nullable(RULE_VERSION_REF), state: oneOf(HARD_GATE_STATES), satisfied: bool })),
  sourceRefs: arrayOf(SOURCE_VERSION_REF),
  outcome: oneOf(PACK_OUTCOMES),
  outcomeReasonCodes: arrayOf(text),
  actionableActionId: nullable(text),
  fingerprint,
});

// Compile-time completeness against the frozen C0 types — at every nesting level.
type Field<S, K extends string> = S extends { t: "object"; fields: infer F } ? (K extends keyof F ? F[K] : never) : never;
type Element<S> = S extends { t: "array" | "nullable"; of: infer O } ? Element<O> : S;
export const C0_EXACTNESS = {
  ruleEvaluationRecord: true satisfies Covers<typeof RULE_EVALUATION_RECORD, RuleEvaluationRecord>,
  ruleVersionRef: true satisfies Covers<typeof RULE_VERSION_REF, RuleVersionRef>,
  sourceVersionRef: true satisfies Covers<typeof SOURCE_VERSION_REF, SourceVersionRef>,
  provenanceRef: true satisfies Covers<typeof PROVENANCE_REF, ProvenanceRef>,
  inputItem: true satisfies Covers<typeof INPUT_ITEM, CattleInputItem>,
  suppliedImplementation: true satisfies Covers<typeof SUPPLIED_IMPLEMENTATION, SuppliedImplementationRef>,
  conflictingInput: true satisfies Covers<typeof CONFLICTING_INPUT, ConflictingInputRecord>,
  rejectedInput: true satisfies Covers<typeof REJECTED_INPUT, RejectedInput>,
  sourceCheck: true satisfies Covers<typeof SOURCE_CHECK, SourceBindingCheck>,
  reviewDimension: true satisfies Covers<typeof REVIEW_DIMENSION, RuleEvaluationRecord["reviews"][number]>,
  evidencePack: true satisfies Covers<typeof EVIDENCE_PACK, RecommendationEvidencePack>,
  targetScope: true satisfies Covers<Field<typeof EVIDENCE_PACK, "targetScope">, TargetScopeRef>,
  intent: true satisfies Covers<Element<Field<typeof EVIDENCE_PACK, "intent">>, IntentRef>,
  calculationStep: true satisfies Covers<Element<Field<typeof EVIDENCE_PACK, "calculationSteps">>, EvidencePackCalculationStep>,
  candidateAction: true satisfies Covers<Element<Field<typeof EVIDENCE_PACK, "candidateActions">>, CandidateAction>,
  rejectedAlternative: true satisfies Covers<Element<Field<typeof EVIDENCE_PACK, "rejectedAlternatives">>, RejectedAlternative>,
  review: true satisfies Covers<Field<typeof EVIDENCE_PACK, "review">, EvidencePackReview>,
  hardGateOutcome: true satisfies Covers<Element<Field<typeof EVIDENCE_PACK, "hardGateOutcomes">>, HardGateOutcome>,
} as const;

/** A carried C0 rule-evaluation record (validated exact copy). */
export type CarriedRuleEvaluation = ExactOf<typeof RULE_EVALUATION_RECORD>;
