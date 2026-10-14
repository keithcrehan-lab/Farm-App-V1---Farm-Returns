/**
 * Cattle C7 — the ONE consumed-field schema for predecessor outputs
 * (CAT-INV-028, human architecture decision 2026-10-14 after finding F007).
 *
 * Predecessor outputs are canonical plain data but NOT trusted domain data
 * until the fields C7 consumes are validated. A fingerprint proves integrity
 * only: an internally consistent, re-sealed object can still be malformed.
 * Every C1 / C2 / C3 / C4 value C7 reads is described here — owner, payload
 * version, presence, null semantics, runtime type, frozen vocabulary,
 * identifier / instant / date format and nested structure — and validated
 * once, at the predecessor-consumption boundary (`programme-predecessors.ts`),
 * before any authoritative reasoning. Only the consumed surface is
 * described; frozen predecessor validators are called where they exist
 * (`rematerialiseAnimalLedger`, `verifyAnimalHealthProjection`,
 * `projectObligationHardGates`) and this schema covers what they do not.
 *
 * Coverage rule: every field C7 reads AND every field a frozen predecessor
 * function reads on C7's behalf from supplied data (C2
 * `projectObligationHardGates`, C3 `projectWithdrawalHardGates`) is declared.
 *
 * Mechanical drift guard: `consume(spec, value)` returns a FRESH projected
 * copy holding only the declared fields, typed `ConsumedOf<S>` — a field the
 * schema does not declare neither type-checks nor exists at runtime (a cast
 * cannot reach it). Every other C7 module sees only C7's internal evidence
 * representation.
 *
 * Trust bound (CAT-INV-028, human decision): the schema plus the boundary's
 * consistency predicates detect MALFORMED and SELF-CONTRADICTORY predecessor
 * outputs. A fully consistent output cannot be authenticated here —
 * fingerprints are change detection, not signatures; authenticity belongs to
 * the adapter / the C8 sealed context.
 *
 * Vocabularies come from the frozen contracts: runtime constants where the
 * predecessor exports them; otherwise a list checked at compile time to be
 * exactly the frozen union (`vocabulary<T>()`), never invented.
 */

import type { AssessmentFingerprint } from "../../assessment-integrity";
import { ANIMAL_DATA_SOURCE_CATEGORIES, BIOLOGICAL_SEXES, isOpaqueRef, isValidAnimalInstant } from "../animal-ledger";
import type { AnimalResolutionState } from "../animal-snapshot";
import type { CattleEvaluationState } from "../evaluation";
import { CATTLE_HEALTH_PAYLOAD_VERSION, HEALTH_ACTOR_ROLES, HEALTH_RECORD_KINDS, VETERINARY_EVENT_TYPES, type HealthRecordStatus, type ProductBindingState, type WithdrawalGateState } from "../health";
import { fingerprintOf, isRecord } from "../health/health-input";
import { CATTLE_OBLIGATION_PAYLOAD_VERSION, OBLIGATION_STATES } from "../regulatory";
import { isValidCalendarDate, type CattleRuleClassification, type CattleRuleGateRole } from "../rule";
import type { ScopeMembershipState } from "../weights";

// ---------------------------------------------------------------------------
// Frozen vocabularies
// ---------------------------------------------------------------------------

/** A runtime list that is compile-time checked to contain EVERY member of the frozen union `T` (and nothing else). */
function vocabulary<T extends string>() {
  return <const V extends readonly T[]>(values: V & ([T] extends [V[number]] ? unknown : never)): V => values;
}

export const C3_BINDING_STATES = vocabulary<ProductBindingState>()(["BOUND", "UNKNOWN", "INVALID", "EVIDENCE_CONFLICT", "REVIEW_REQUIRED", "UNSUPPORTED"]);
export const C3_RECORD_STATUSES = vocabulary<HealthRecordStatus>()(["LIVE", "SUPERSEDED"]);
export const C0_EVALUATION_STATES = vocabulary<CattleEvaluationState>()(["PASS", "FAIL", "INSUFFICIENT_EVIDENCE", "NOT_APPLICABLE", "CONFLICTING_EVIDENCE", "UNSUPPORTED", "REVIEW_REQUIRED"]);
export const C1_RESOLUTION_STATES = vocabulary<AnimalResolutionState>()(["KNOWN", "UNKNOWN", "CONFLICTING_EVIDENCE", "INVALID_EVIDENCE"]);
export const C4_MEMBERSHIP_STATES = vocabulary<ScopeMembershipState>()(["MEMBER", "NOT_MEMBER", "UNKNOWN", "EVIDENCE_CONFLICT", "INVALID"]);
export const C3_WITHDRAWAL_GATE_STATES = vocabulary<WithdrawalGateState>()(["CLEAR", "IN_WITHDRAWAL", "UNKNOWN", "EVIDENCE_CONFLICT"]);
export const C0_RULE_CLASSIFICATIONS = vocabulary<CattleRuleClassification>()([
  "LEGAL_REQUIRED",
  "LEGAL_CONDITIONAL",
  "SCHEME_CONDITIONAL",
  "VETERINARY_PROGRAMME",
  "SCIENCE_TARGET",
  "SCIENCE_CONSTRAINT",
  "FARMER_INTENT",
  "SYSTEM_INFERENCE",
]);
export const C0_GATE_ROLES = vocabulary<CattleRuleGateRole>()(["HARD_GATE", "ADVISORY"]);

// ---------------------------------------------------------------------------
// Schema combinators
// ---------------------------------------------------------------------------

export type FieldSpec =
  | { t: "ref" } // non-empty opaque identifier (C1 `isOpaqueRef`)
  | { t: "code" } // non-empty string code (e.g. a C1 issue code)
  | { t: "instant" } // strict UTC instant (C1 `isValidAnimalInstant`)
  | { t: "date" } // calendar date (C0 `isValidCalendarDate`)
  | { t: "bool" }
  | { t: "int" } // safe integer
  | { t: "literal"; value: string | number | null }
  | { t: "enum"; values: readonly string[] }
  | { t: "fingerprint" } // assessment-integrity shape (C3 `fingerprintOf`)
  | { t: "nullable"; of: FieldSpec }
  | { t: "array"; of: FieldSpec }
  | { t: "object"; fields: Readonly<Record<string, FieldSpec>> }
  | { t: "kinded"; tag: string; common: Readonly<Record<string, FieldSpec>>; variants: Readonly<Record<string, Readonly<Record<string, FieldSpec>>>> };

const ref = { t: "ref" } as const;
const code = { t: "code" } as const;
const instant = { t: "instant" } as const;
const date = { t: "date" } as const;
const bool = { t: "bool" } as const;
const int = { t: "int" } as const;
const fingerprint = { t: "fingerprint" } as const;
const literal = <const V extends string | number | null>(value: V) => ({ t: "literal", value }) as const;
const oneOfValues = <const V extends readonly string[]>(values: V) => ({ t: "enum", values }) as const;
const nullable = <const S extends FieldSpec>(of: S) => ({ t: "nullable", of }) as const;
const arrayOf = <const S extends FieldSpec>(of: S) => ({ t: "array", of }) as const;
const object = <const F extends Record<string, FieldSpec>>(fields: F) => ({ t: "object", fields }) as const;
const kinded = <const C extends Record<string, FieldSpec>, const V extends Record<string, Record<string, FieldSpec>>>(tag: string, common: C, variants: V) =>
  ({ t: "kinded", tag, common, variants }) as const;

type Fields<F> = { readonly [K in keyof F]: ConsumedOf<F[K]> };
/** The validated type of a schema: only the declared fields exist on it. */
export type ConsumedOf<S> = S extends { t: "ref" | "code" | "instant" | "date" }
  ? string
  : S extends { t: "bool" }
    ? boolean
    : S extends { t: "int" }
    ? number
    : S extends { t: "literal"; value: infer V }
      ? V
      : S extends { t: "enum"; values: readonly (infer E)[] }
        ? E
        : S extends { t: "fingerprint" }
          ? AssessmentFingerprint
          : S extends { t: "nullable"; of: infer O }
            ? ConsumedOf<O> | null
            : S extends { t: "array"; of: infer O }
              ? readonly ConsumedOf<O>[]
              : S extends { t: "object"; fields: infer F }
                ? Fields<F>
                : S extends { t: "kinded"; common: infer C; variants: infer V }
                  ? { [K in keyof V]: Fields<C> & Fields<V[K]> }[keyof V]
                  : never;

function fieldsValid(raw: Record<string, unknown>, fields: Readonly<Record<string, FieldSpec>>): boolean {
  return Object.entries(fields).every(([k, spec]) => Object.hasOwn(raw, k) && raw[k] !== undefined && valid(spec, raw[k]));
}

/** Runtime validation of one value against its spec. Never throws on canonical plain data. */
export function valid(spec: FieldSpec, value: unknown): boolean {
  switch (spec.t) {
    case "ref":
      return isOpaqueRef(value);
    case "code":
      return typeof value === "string" && value.length > 0;
    case "instant":
      return isValidAnimalInstant(value);
    case "date":
      return typeof value === "string" && isValidCalendarDate(value);
    case "bool":
      return typeof value === "boolean";
    case "int":
      return Number.isSafeInteger(value);
    case "literal":
      return value === spec.value;
    case "enum":
      return typeof value === "string" && spec.values.includes(value);
    case "fingerprint":
      return fingerprintOf(value) !== null;
    case "nullable":
      return value === null || valid(spec.of, value);
    case "array":
      return Array.isArray(value) && value.every((x) => valid(spec.of, x));
    case "object":
      return isRecord(value) && fieldsValid(value, spec.fields);
    case "kinded": {
      if (!isRecord(value) || typeof value[spec.tag] !== "string" || !Object.hasOwn(spec.variants, value[spec.tag] as string)) return false;
      return fieldsValid(value, spec.common) && fieldsValid(value, spec.variants[value[spec.tag] as string]);
    }
  }
}

/** A fresh copy of a valid value holding ONLY the declared fields (deep). */
function project(spec: FieldSpec, value: unknown): unknown {
  switch (spec.t) {
    case "nullable":
      return value === null ? null : project(spec.of, value);
    case "array":
      return (value as unknown[]).map((x) => project(spec.of, x));
    case "object":
      return Object.fromEntries(Object.entries(spec.fields).map(([k, f]) => [k, project(f, (value as Record<string, unknown>)[k])]));
    case "kinded": {
      const raw = value as Record<string, unknown>;
      const fields = { ...spec.common, ...spec.variants[raw[spec.tag] as string] };
      return Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, project(f, raw[k])]));
    }
    case "fingerprint":
      return fingerprintOf(value);
    default:
      return value;
  }
}

/**
 * Validates `value` against `spec` and returns a fresh copy holding only the
 * declared fields (typed by the schema alone), or `null` when invalid.
 */
export function consume<const S extends FieldSpec>(spec: S, value: unknown): ConsumedOf<S> | null {
  // `never`: the projected copy has exactly the schema's shape; avoids instantiating the recursive type at this generic site.
  return valid(spec, value) ? (project(spec, value) as never) : null;
}

// ---------------------------------------------------------------------------
// The consumed surfaces (owner · version · fields)
// ---------------------------------------------------------------------------

/** C3 `HealthRecord` fields C7 reads (common + the two completion kinds; other kinds carry no further consumed field). */
const C3_HEALTH_RECORD = kinded(
  "kind",
  {
    recordId: ref,
    animalId: ref,
    kind: oneOfValues(HEALTH_RECORD_KINDS),
    occurredAt: nullable(instant),
    provenance: object({ sourceCategory: oneOfValues(ANIMAL_DATA_SOURCE_CATEGORIES), actorRole: oneOfValues(HEALTH_ACTOR_ROLES), receivedAt: instant }),
    supersedes: arrayOf(ref),
  },
  {
    MEDICINE_ADMINISTRATION: { productId: nullable(ref) },
    VETERINARY_EVENT: { eventType: oneOfValues(VETERINARY_EVENT_TYPES) },
    ...Object.fromEntries(HEALTH_RECORD_KINDS.filter((k) => k !== "MEDICINE_ADMINISTRATION" && k !== "VETERINARY_EVENT").map((k) => [k, {}])),
  } as { MEDICINE_ADMINISTRATION: { productId: { t: "nullable"; of: { t: "ref" } } }; VETERINARY_EVENT: { eventType: { t: "enum"; values: typeof VETERINARY_EVENT_TYPES } }; OTHER: Record<string, never> },
);

/** C3 `ProductBinding`: a state from the frozen vocabulary and, when BOUND, a complete bound `ProductVersionRef`. */
const C3_PRODUCT_BINDING = object({
  state: oneOfValues(C3_BINDING_STATES),
  product: nullable(object({ productId: ref, version: ref, source: object({ sourceId: ref, version: ref, contentFingerprint: fingerprint }) })),
});

const C3_ENTRY_COMMON = { recordId: ref, occurredAt: nullable(instant), status: oneOfValues(C3_RECORD_STATUSES), inCompetition: bool, supersededBy: arrayOf(ref), record: C3_HEALTH_RECORD };

/**
 * C3 `AnimalHealthProjection` — owner C3, payload version
 * `CATTLE_HEALTH_PAYLOAD_VERSION`. (Its fingerprints are re-verified by C3
 * `verifyAnimalHealthProjection`; its withdrawal gate is read only through
 * C3 `projectWithdrawalHardGates`, whose output is `GATE_PROJECTION`.)
 */
export const C3_PROJECTION = object({
  healthPayloadVersion: literal(CATTLE_HEALTH_PAYLOAD_VERSION),
  animalId: ref,
  effectiveAt: instant,
  knowledgeCutoff: instant,
  snapshotFingerprint: fingerprint,
  foodProducts: arrayOf(ref),
  knownRecordIds: arrayOf(ref),
  timeline: object({
    filter: object({ kinds: nullable(arrayOf(oneOfValues(HEALTH_RECORD_KINDS))), occurredFrom: nullable(instant), occurredTo: nullable(instant) }),
    entries: arrayOf(object({ ...C3_ENTRY_COMMON, kind: oneOfValues(HEALTH_RECORD_KINDS) })),
    competitions: arrayOf(object({ targetId: ref, terminalIds: arrayOf(ref) })),
    notYetOccurredRecordIds: arrayOf(ref),
    fingerprint,
  }),
  medicineLedger: object({ entries: arrayOf(object({ ...C3_ENTRY_COMMON, binding: C3_PRODUCT_BINDING })), fingerprint }),
  // Read by C3 `projectWithdrawalHardGates` on C7's behalf.
  withdrawalGate: object({
    entries: arrayOf(
      object({
        foodProduct: ref,
        state: oneOfValues(C3_WITHDRAWAL_GATE_STATES),
        inWithdrawalUntil: nullable(instant),
        administrationIds: arrayOf(ref),
        productVersions: arrayOf(object({ productId: ref, version: ref })),
        reasonCodes: arrayOf(code),
      }),
    ),
    fingerprint,
  }),
});

/**
 * C2 `AnimalObligationEvaluation` — owner C2, payload version
 * `CATTLE_OBLIGATION_PAYLOAD_VERSION` (envelope and every record). Record
 * fingerprints are re-verified by C2 `projectObligationHardGates`.
 */
const C0_RULE_REF = object({ ruleId: ref, version: int });

export const C2_EVALUATION = object({
  obligationPayloadVersion: literal(CATTLE_OBLIGATION_PAYLOAD_VERSION),
  animalId: ref,
  effectiveAt: instant,
  knowledgeCutoff: instant,
  evaluationDate: date,
  snapshotFingerprint: fingerprint,
  results: arrayOf(
    object({
      obligationPayloadVersion: literal(CATTLE_OBLIGATION_PAYLOAD_VERSION),
      animalId: ref,
      obligationId: ref,
      occurrence: nullable(object({ occurrenceId: ref })),
      snapshotFingerprint: fingerprint,
      effectiveAt: instant,
      knowledgeCutoff: instant,
      fingerprint,
      // Read by C2 `projectObligationHardGates` on C7's behalf.
      state: oneOfValues(OBLIGATION_STATES),
      gateRole: nullable(oneOfValues(C0_GATE_ROLES)),
      classification: nullable(oneOfValues(C0_RULE_CLASSIFICATIONS)),
      rule: nullable(C0_RULE_REF),
      ruleFingerprint: nullable(fingerprint),
      ruleEvaluation: object({
        requestedRuleId: ref,
        rule: nullable(C0_RULE_REF),
        classification: nullable(oneOfValues(C0_RULE_CLASSIFICATIONS)),
        gateRole: nullable(oneOfValues(C0_GATE_ROLES)),
        state: oneOfValues(C0_EVALUATION_STATES),
        reasonCodes: arrayOf(code),
      }),
      evidence: object({ countedEvidence: arrayOf(object({ evidenceId: ref })) }),
    }),
  ),
});

/** Hard-gate projections returned by C2 `projectObligationHardGates` / C3 `projectWithdrawalHardGates` (C0 `RuleEvaluationRecord` fields C7 reads). */
export const GATE_PROJECTION = arrayOf(object({ requestedRuleId: ref, state: oneOfValues(C0_EVALUATION_STATES) }));

const c1Resolution = <const S extends FieldSpec>(value: S) => object({ state: oneOfValues(C1_RESOLUTION_STATES), value: nullable(value), issues: arrayOf(code) });

/** C1 `AnimalSnapshot` dimensions C7 reads (computed in-process by C1 `projectAnimalSnapshot` from a C1-rematerialised ledger). */
export const C1_SNAPSHOT = object({ sex: c1Resolution(oneOfValues(BIOLOGICAL_SEXES)), dateOfBirth: c1Resolution(date) });

/** C4 `ScopeResolution` fields C7 reads (computed in-process by C4 `resolveGroupScope` from a C1-rematerialised ledger). */
export const C4_SCOPE = object({ fingerprint, animals: arrayOf(object({ animalId: ref, state: oneOfValues(C4_MEMBERSHIP_STATES), issues: arrayOf(code) })) });

/** The consumed-output contract, by surface (documentation and test generation). */
export const PROGRAMME_CONSUMED_SURFACES = Object.freeze({
  C1_SNAPSHOT: { owner: "C1", producer: "projectAnimalSnapshot (in-process, C1-rematerialised ledger)", spec: C1_SNAPSHOT },
  C2_EVALUATION: { owner: "C2", producer: "supplied AnimalObligationEvaluation", spec: C2_EVALUATION },
  C3_PROJECTION: { owner: "C3", producer: "supplied AnimalHealthProjection", spec: C3_PROJECTION },
  C4_SCOPE: { owner: "C4", producer: "resolveGroupScope (in-process, C1-rematerialised ledger)", spec: C4_SCOPE },
  GATE_PROJECTION: { owner: "C2 / C3", producer: "projectObligationHardGates / projectWithdrawalHardGates", spec: GATE_PROJECTION },
});

export type ConsumedHealthProjection = ConsumedOf<typeof C3_PROJECTION>;
export type ConsumedHealthEntry = ConsumedHealthProjection["timeline"]["entries"][number];
export type ConsumedMedicineEntry = ConsumedHealthProjection["medicineLedger"]["entries"][number];
export type ConsumedBinding = ConsumedOf<typeof C3_PRODUCT_BINDING>;
export type ConsumedObligationEvaluation = ConsumedOf<typeof C2_EVALUATION>;
export type ConsumedGates = ConsumedOf<typeof GATE_PROJECTION>;
export type ConsumedSnapshot = ConsumedOf<typeof C1_SNAPSHOT>;
export type ConsumedScope = ConsumedOf<typeof C4_SCOPE>;
