/**
 * Cattle C8 — the ONE consumed-field schema for predecessor outputs
 * (CAT-INV-028) and the owned-record shape check.
 *
 * Every C1–C7 output C8 reads is produced IN-PROCESS by the frozen
 * predecessor engine at C8's one construction boundary
 * (`evaluation-context.ts`) from canonical evidence — authoritative by
 * construction, never caller-supplied (C7 architecture review 2026-10-14;
 * CAT-INV-023). The schema below is still applied to every consumed surface
 * before any authoritative use: owner, payload version, presence, null
 * semantics, runtime type, frozen vocabulary, identifier / instant / date
 * format and nested structure. `consume(spec, value)` returns a FRESH copy
 * holding only the declared fields (typed by the schema alone), so a field
 * not declared here can neither be read nor type-check (drift guard). No
 * consistency predicate restates predecessor derivation.
 *
 * The schema machinery (`valid`, `consume`, `FieldSpec`, `ConsumedOf`) and the
 * C2 / C3 surfaces (`C2_EVALUATION`, `C3_PROJECTION`, which already declare the
 * fields the frozen C2 / C3 hard-gate projectors read) are reused from C7's
 * consumed-field module — generic machinery is implemented once
 * (constraint 14). The C4 / C5 / C6 / C7 / gate surfaces C8 adds are declared
 * here. Vocabularies are frozen runtime constants exported by their owners,
 * or lists compile-checked to equal the frozen unions.
 */

import { CATTLE_ANIMAL_SNAPSHOT_SCHEMA_VERSION } from "../animal-snapshot";
import { rawIdentityKey } from "../health/health-input";
import { compareStrings } from "../integrity";
import { canonicalObligationInstant } from "../regulatory/obligation-time";
import { PRODUCTION_GOAL_TYPES, CATTLE_GOAL_PAYLOAD_VERSION, type GoalProjectionStatus, type GoalRoutingState, type IntentConflictKind } from "../goals";
import { CATTLE_PERFORMANCE_PAYLOAD_VERSION } from "../performance";
import {
  C0_EVALUATION_STATES,
  C0_GATE_ROLES,
  C0_RULE_CLASSIFICATIONS,
  C2_EVALUATION,
  C3_PROJECTION,
  consume,
  valid,
  type ConsumedOf,
  type FieldSpec,
} from "../programmes/programme-consumed";
import { CATTLE_PROGRAMME_PAYLOAD_VERSION, PROGRAMME_CLASSIFICATIONS, PROGRAMME_OCCURRENCE_STATES, type ProgrammeStatusEvaluation } from "../programmes";
import { CATTLE_WEIGHT_PAYLOAD_VERSION, type LatestWeightState } from "../weights";

export { C2_EVALUATION, C3_PROJECTION, consume, valid, type ConsumedOf, type FieldSpec };

// ---------------------------------------------------------------------------
// Spec constructors (plain data; interpreted by C7's `valid` / `consume`)
// ---------------------------------------------------------------------------

export const ref = { t: "ref" } as const;
export const code = { t: "code" } as const;
export const instant = { t: "instant" } as const;
export const date = { t: "date" } as const;
export const bool = { t: "bool" } as const;
export const int = { t: "int" } as const;
export const fingerprint = { t: "fingerprint" } as const;
export const literal = <const V extends string | number | null>(value: V) => ({ t: "literal", value }) as const;
export const oneOfValues = <const V extends readonly string[]>(values: V) => ({ t: "enum", values }) as const;
export const nullable = <const S extends FieldSpec>(of: S) => ({ t: "nullable", of }) as const;
export const arrayOf = <const S extends FieldSpec>(of: S) => ({ t: "array", of }) as const;
export const object = <const F extends Record<string, FieldSpec>>(fields: F) => ({ t: "object", fields }) as const;
export const kinded = <const C extends Record<string, FieldSpec>, const V extends Record<string, Record<string, FieldSpec>>>(tag: string, common: C, variants: V) =>
  ({ t: "kinded", tag, common, variants }) as const;

/** A runtime list compile-time checked to contain EVERY member of the frozen union `T` (and nothing else). */
export function vocabulary<T extends string>() {
  return <const V extends readonly T[]>(values: V & ([T] extends [V[number]] ? unknown : never)): V => values;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** True when no object anywhere in `value` carries a field `spec` does not declare (owned records: an unknown field is malformed, never dropped). */
function noUndeclaredFields(spec: FieldSpec, value: unknown): boolean {
  switch (spec.t) {
    case "nullable":
      return value === null || noUndeclaredFields(spec.of, value);
    case "array":
      return (value as unknown[]).every((x) => noUndeclaredFields(spec.of, x));
    case "object":
      return Object.keys(value as object).every((k) => Object.hasOwn(spec.fields, k) && noUndeclaredFields(spec.fields[k], (value as Record<string, unknown>)[k]));
    case "kinded": {
      const raw = value as Record<string, unknown>;
      const fields = { ...spec.common, ...spec.variants[raw[spec.tag] as string] };
      return Object.keys(raw).every((k) => k === spec.tag || (Object.hasOwn(fields, k) && noUndeclaredFields(fields[k], raw[k])));
    }
    default:
      return true;
  }
}

/** Owned-record shape check: every declared field present and valid (never `undefined`), and no undeclared field (field-presence policy). */
export function ownedValid(spec: FieldSpec, value: unknown): boolean {
  return valid(spec, value) && noUndeclaredFields(spec, value);
}

export { isPlainObject };

/**
 * Identity-comparison key of a (possibly invalid) owned raw record with its
 * readable instant fields replaced by their canonical spelling, so equivalent
 * instant spellings are the same content (CAT-INV-010) while every other
 * difference — invalid copies included — is a different content (CAT-INV-008).
 */
export function ownedContentKey(raw: unknown, instantFields: readonly string[]): string {
  if (!isPlainObject(raw)) return rawIdentityKey(raw);
  const copy: Record<string, unknown> = { ...raw };
  for (const f of instantFields) {
    const canonical = canonicalObligationInstant(copy[f]);
    if (canonical !== null) copy[f] = canonical;
  }
  return rawIdentityKey(copy);
}

/**
 * A validated owned record with its instant fields in the one canonical
 * nine-digit spelling: C8's admitted copies, and every C8 fingerprint over
 * them, are spelling-independent (FINGERPRINTS.md rule 2). The supplied
 * record keeps its original spelling in the caller's store (CAT-INV-011).
 */
export function withCanonicalInstants<T>(record: T, instantFields: readonly string[]): T {
  const copy: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  for (const f of instantFields) {
    const canonical = canonicalObligationInstant(copy[f]);
    if (canonical !== null) copy[f] = canonical;
  }
  return copy as T;
}

/** Among identical duplicates, one spelling chosen independently of input order (CAT-INV-012). */
export function preferredSpelling<T>(a: T, b: T): T {
  return compareStrings(rawIdentityKey(a), rawIdentityKey(b)) <= 0 ? a : b;
}

// ---------------------------------------------------------------------------
// Frozen vocabularies (compile-checked against the owners' unions)
// ---------------------------------------------------------------------------

export const C4_LATEST_WEIGHT_STATES = vocabulary<LatestWeightState>()(["KNOWN", "NONE", "EVIDENCE_CONFLICT", "UNSUPPORTED"]);
export const C6_GOAL_STATUSES = vocabulary<GoalProjectionStatus>()(["ACTIVE", "NONE", "INTENT_CONFLICT", "INVALID"]);
export const C6_ROUTING_STATES = vocabulary<GoalRoutingState>()(["ROUTED", "NO_ROUTED_RULES", "NO_ACTIVE_GOAL", "GOAL_INTENT_CONFLICT", "GOAL_INVALID"]);
export const C6_CONFLICT_KINDS = vocabulary<IntentConflictKind>()(["COMPETING_VERSIONS", "MUTUALLY_EXCLUSIVE_GOAL_TYPES", "SAME_TYPE_DIFFERENT_OUTCOME"]);
export const C7_OUTCOMES = vocabulary<ProgrammeStatusEvaluation["outcome"]>()(["NO_PROGRAMME", "NONE_IN_FORCE", "EVALUATED"]);
export const C7_VERSION_STATES = vocabulary<ProgrammeStatusEvaluation["programmes"][number]["versionState"]>()(["GOVERNING", "NOT_IN_FORCE", "VERSION_CONFLICT"]);
const REVIEW_DIMENSION_STATES = ["APPROVED", "REJECTED", "PENDING"] as const;
const REVIEW_DIMENSIONS = ["SCIENTIFIC", "LEGAL", "VETERINARY"] as const;

// ---------------------------------------------------------------------------
// The consumed surfaces (owner · version · fields)
// ---------------------------------------------------------------------------

export const SOURCE_REF = object({ sourceId: ref, version: ref, contentFingerprint: fingerprint });

/** C1 `AnimalSnapshot` — owner C1, `projectAnimalSnapshot` over a C1-rematerialised ledger. C8 reads its identity and times (the fingerprint is C1's own). */
export const C1_SNAPSHOT_IDENTITY = object({
  snapshotSchemaVersion: literal(CATTLE_ANIMAL_SNAPSHOT_SCHEMA_VERSION),
  animalId: ref,
  effectiveAt: instant,
  knowledgeCutoff: instant,
});

/**
 * One C0 `RuleEvaluationRecord` of a C2 / C3 / C7 hard-gate projection, as
 * READ from the projection surface. The record is never carried from here:
 * the copy C8 carries into its context and pack is validated against the
 * exact, compile-checked C0 contract `RULE_EVALUATION_RECORD`
 * (`recommendation-exact.ts`; C8 architecture review 2026-10-15, F005).
 */
export const GATE_RECORD = object({
  requestedRuleId: ref,
  gateRole: nullable(oneOfValues(C0_GATE_ROLES)),
  classification: nullable(oneOfValues(C0_RULE_CLASSIFICATIONS)),
  evaluationDate: date,
  state: oneOfValues(C0_EVALUATION_STATES),
  missingInputs: arrayOf(code),
  conflictingInputs: arrayOf(object({ inputKey: code })),
  sourceChecks: arrayOf(object({ bound: SOURCE_REF })),
});

/** C2 `projectObligationHardGates` output. */
export const C2_GATES = object({ animalId: ref, effectiveAt: instant, knowledgeCutoff: instant, evaluationDate: date, ruleEvaluations: arrayOf(GATE_RECORD), requiredHardGateRuleIds: arrayOf(ref) });

/** C3 `projectWithdrawalHardGates` / C7 `projectProgrammeHardGates` outputs (gates + bound source versions). */
export const SOURCED_GATES = object({ ruleEvaluations: arrayOf(GATE_RECORD), requiredHardGateRuleIds: arrayOf(ref), sourceRefs: arrayOf(SOURCE_REF) });

/** C4 `WeightReadContract` — owner C4, `buildWeightReadContract` over canonical C4 observations for one animal. */
export const C4_CONTRACT = object({
  weightPayloadVersion: literal(CATTLE_WEIGHT_PAYLOAD_VERSION),
  effectiveAt: instant,
  knowledgeCutoff: instant,
  fingerprint,
  series: arrayOf(object({ animalId: ref, effectiveAt: instant, knowledgeCutoff: instant, fingerprint, latest: object({ state: oneOfValues(C4_LATEST_WEIGHT_STATES), observedAt: nullable(instant) }) })),
});

/** C5 `PerformanceEvaluation` — owner C5, `evaluatePerformance` over that C4 contract. */
export const C5_EVALUATION = object({
  performancePayloadVersion: literal(CATTLE_PERFORMANCE_PAYLOAD_VERSION),
  effectiveAt: instant,
  knowledgeCutoff: instant,
  fingerprint,
  animals: arrayOf(object({ animalId: ref, fingerprint })),
});

const GOAL_VERSION_REF = object({ goalId: ref, version: ref });

/** C6 `GoalSnapshotRef` — carried verbatim into the recommendation as the goal snapshot reference. */
export const C6_SNAPSHOT = object({
  goalPayloadVersion: literal(CATTLE_GOAL_PAYLOAD_VERSION),
  subject: kinded("kind", {}, { ANIMAL: { kind: literal("ANIMAL"), animalId: ref }, SCOPE: { kind: literal("SCOPE"), scopeRef: ref } }),
  effectiveAt: instant,
  knowledgeCutoff: instant,
  status: oneOfValues(C6_GOAL_STATUSES),
  goals: arrayOf(GOAL_VERSION_REF),
  conflicts: arrayOf(object({ kind: oneOfValues(C6_CONFLICT_KINDS), goals: arrayOf(GOAL_VERSION_REF) })),
  fingerprint,
});

/** C6 `GoalProjection` — owner C6, `projectProductionGoals`. */
export const C6_PROJECTION = object({
  goalPayloadVersion: literal(CATTLE_GOAL_PAYLOAD_VERSION),
  effectiveAt: instant,
  knowledgeCutoff: instant,
  status: oneOfValues(C6_GOAL_STATUSES),
  activeGoals: arrayOf(object({ declaration: object({ goalId: ref, version: ref, goalType: oneOfValues(PRODUCTION_GOAL_TYPES) }) })),
  snapshot: C6_SNAPSHOT,
});

/** C6 `GoalRouting` (`routeProductionGoals`) and `GoalTargetApplicability` (`resolveGoalTargetApplicability`). */
export const C6_ROUTING = object({ goalPayloadVersion: literal(CATTLE_GOAL_PAYLOAD_VERSION), effectiveAt: instant, knowledgeCutoff: instant, state: oneOfValues(C6_ROUTING_STATES), fingerprint });
export const C6_TARGET_APPLICABILITY = object({ goalPayloadVersion: literal(CATTLE_GOAL_PAYLOAD_VERSION), animalId: ref, effectiveAt: instant, knowledgeCutoff: instant, fingerprint });

/** The programme version fields C7 `projectProgrammeHardGates` reads on C8's behalf. */
const C7_VERSION = object({
  definition: object({ actions: arrayOf(object({ actionId: ref, gateRole: oneOfValues(C0_GATE_ROLES) })), provenance: object({ sourceDocument: nullable(SOURCE_REF) }) }),
});

/** C7 `ProgrammeStatusEvaluation` — owner C7, `evaluateHealthProgrammes` over the request's canonical C7 / C3 / C2 evidence. */
export const C7_EVALUATION = object({
  programmePayloadVersion: literal(CATTLE_PROGRAMME_PAYLOAD_VERSION),
  effectiveAt: instant,
  knowledgeCutoff: instant,
  outcome: oneOfValues(C7_OUTCOMES),
  animalIds: arrayOf(ref),
  fingerprint,
  programmes: arrayOf(
    object({
      programmeId: ref,
      classification: oneOfValues(PROGRAMME_CLASSIFICATIONS),
      versionState: oneOfValues(C7_VERSION_STATES),
      governing: nullable(object({ version: C7_VERSION, review: object({ dimensions: arrayOf(object({ dimension: oneOfValues(REVIEW_DIMENSIONS), state: oneOfValues(REVIEW_DIMENSION_STATES) })) }) })),
      conflictingVersions: arrayOf(C7_VERSION),
      animals: arrayOf(
        object({
          animalId: ref,
          fingerprint,
          records: arrayOf(
            object({
              actionId: nullable(ref),
              actionKind: nullable(code),
              occurrence: nullable(object({ occurrenceId: code })),
              state: oneOfValues(PROGRAMME_OCCURRENCE_STATES),
              reasonCodes: arrayOf(code),
            }),
          ),
        }),
      ),
    }),
  ),
});

/** The consumed-output contract, by surface (documentation and test generation). */
export const RECOMMENDATION_CONSUMED_SURFACES = Object.freeze({
  C1_SNAPSHOT_IDENTITY: { owner: "C1", producer: "projectAnimalSnapshot (in-process)", spec: C1_SNAPSHOT_IDENTITY },
  C2_EVALUATION: { owner: "C2", producer: "evaluateHerdObligations (in-process)", spec: C2_EVALUATION },
  C2_GATES: { owner: "C2", producer: "projectObligationHardGates (in-process)", spec: C2_GATES },
  C3_PROJECTION: { owner: "C3", producer: "projectAnimalHealth (in-process)", spec: C3_PROJECTION },
  C3_GATES: { owner: "C3", producer: "projectWithdrawalHardGates (in-process)", spec: SOURCED_GATES },
  C4_CONTRACT: { owner: "C4", producer: "buildWeightReadContract (in-process)", spec: C4_CONTRACT },
  C5_EVALUATION: { owner: "C5", producer: "evaluatePerformance (in-process)", spec: C5_EVALUATION },
  C6_PROJECTION: { owner: "C6", producer: "projectProductionGoals (in-process)", spec: C6_PROJECTION },
  C6_ROUTING: { owner: "C6", producer: "routeProductionGoals (in-process)", spec: C6_ROUTING },
  C6_TARGET_APPLICABILITY: { owner: "C6", producer: "resolveGoalTargetApplicability (in-process)", spec: C6_TARGET_APPLICABILITY },
  C7_EVALUATION: { owner: "C7", producer: "evaluateHealthProgrammes (in-process)", spec: C7_EVALUATION },
  C7_GATES: { owner: "C7", producer: "projectProgrammeHardGates (in-process)", spec: SOURCED_GATES },
});

export type ConsumedC2Evaluation = ConsumedOf<typeof C2_EVALUATION>;
export type ConsumedC3Projection = ConsumedOf<typeof C3_PROJECTION>;
export type ConsumedGoalSnapshot = ConsumedOf<typeof C6_SNAPSHOT>;
export type ConsumedC7Evaluation = ConsumedOf<typeof C7_EVALUATION>;
