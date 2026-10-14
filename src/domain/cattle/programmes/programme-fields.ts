/**
 * Cattle C7 — the ONE field-presence policy for every C7-owned canonical
 * record (human architecture decision B1, 2026-10-14).
 *
 * Canonical C7 data distinguishes a MISSING property from an explicit `null`
 * from an explicit empty collection. Every field a C7-owned record declares
 * must be present (and not `undefined`); a missing property is invalid
 * canonical C7 input and fails closed — it never acquires a meaning such as
 * "no gates", "open-ended", "no product restriction" or "no repeat"
 * (CAT-INV-022). Where the C7 contract gives `null` a meaning, that meaning
 * holds only for an explicit `null`; where a collection may hold nothing it
 * must be present as `[]`. Unknown properties are rejected, never dropped.
 *
 * C7 is deliberately stricter about its own records than C1–C4 are about
 * theirs; frozen predecessor readers keep their own semantics and are only
 * wrapped here (`explicitNullableRef`).
 *
 * The policy says only whether a field must be present and what shape class
 * it has; each reader still validates the value itself.
 */

import { isOpaqueRef } from "../animal-ledger";
import { compareStrings } from "../integrity";
import { isRecord, nullableRef } from "../health/health-input";
import type { HealthProgrammeDefinition, ProgrammeAction, ProgrammeCompletionCriteria, ProgrammeDeclarer, ProgrammeProductRef, ProgrammeProvenance, ProgrammeReviewRecord, ProgrammeSchedule } from "./programme-definition";
import type { ProgrammeCompletionProvenance, ProgrammeCompletionRecord } from "./programme-completion";

/**
 * - `REQUIRED`: present, not `null`;
 * - `REQUIRED_NULLABLE`: present; an explicit `null` carries the contract meaning;
 * - `REQUIRED_ARRAY`: present as an array; `[]` is an explicit "none";
 * - `REQUIRED_NON_EMPTY_ARRAY`: present as an array with at least one item.
 */
export type ProgrammeFieldRule = "REQUIRED" | "REQUIRED_NULLABLE" | "REQUIRED_ARRAY" | "REQUIRED_NON_EMPTY_ARRAY";

type PolicyOf<T> = { readonly [K in keyof Required<T>]: ProgrammeFieldRule };

const R = "REQUIRED";
const N = "REQUIRED_NULLABLE";
const A = "REQUIRED_ARRAY";
const NE = "REQUIRED_NON_EMPTY_ARRAY";

/**
 * Every C7-owned record type. Types with a TypeScript interface are checked
 * against it at compile time (`PolicyOf<T>`), so a field added to the
 * contract without a policy entry does not compile.
 */
export const PROGRAMME_FIELD_POLICY = Object.freeze({
  request: { definitions: A, reviews: A, completions: A, ledgers: A, health: A, obligations: A, query: R },
  query: { effectiveAt: R, knowledgeCutoff: R },
  definition: {
    programmeId: R,
    version: R,
    supersedesVersions: A,
    classification: R,
    declaredBy: R,
    validFrom: R,
    validTo: N,
    applicability: R,
    actions: NE,
    productionState: R,
    provenance: R,
  } satisfies PolicyOf<HealthProgrammeDefinition>,
  declarer: { role: R, actor: R } satisfies PolicyOf<ProgrammeDeclarer>,
  definitionProvenance: { sourceCategory: R, sourceSystem: N, sourceRecordRef: N, receivedAt: R, sourceDocument: N } satisfies PolicyOf<ProgrammeProvenance>,
  sourceDocument: { sourceId: R, version: R, contentFingerprint: R },
  fingerprint: { schemaVersion: R, algorithm: R, digest: R },
  applicabilityExplicitSet: { kind: R, animalIds: NE },
  applicabilityGroup: { kind: R, groupRef: R },
  applicabilityCriteria: { kind: R, sex: N, bornOnOrAfter: N, bornBefore: N },
  action: { actionId: R, actionKind: R, productRef: N, schedule: R, completion: R, gates: A, gateRole: R } satisfies PolicyOf<ProgrammeAction>,
  productRef: { productId: R, productVersion: N } satisfies PolicyOf<ProgrammeProductRef>,
  schedule: { anchor: R, window: R, repeat: N } satisfies PolicyOf<ProgrammeSchedule>,
  anchorFixedInstant: { kind: R, at: R },
  anchorDateOfBirth: { kind: R },
  window: { opensAfter: R, dueAfter: R, boundary: R },
  offset: { amount: R, unit: R },
  repeat: { interval: R, count: R },
  completionCriteria: { recordKind: N, eventTypes: N, matchCriteria: R } satisfies PolicyOf<ProgrammeCompletionCriteria>,
  review: {
    reviewId: R,
    programmeId: R,
    programmeVersion: R,
    definitionFingerprint: R,
    dimension: R,
    decision: R,
    reviewer: R,
    reviewedAt: R,
    supersedes: A,
  } satisfies PolicyOf<ProgrammeReviewRecord>,
  reviewer: { role: R, actor: R },
  completion: {
    recordId: R,
    animalId: R,
    programmeId: R,
    programmeVersion: R,
    actionId: R,
    occurrenceId: R,
    kind: R,
    evidence: N,
    declaredBy: R,
    provenance: R,
    supersedes: A,
  } satisfies PolicyOf<ProgrammeCompletionRecord>,
  completionProvenance: { sourceCategory: R, sourceSystem: N, sourceRecordRef: N, receivedAt: R } satisfies PolicyOf<ProgrammeCompletionProvenance>,
  evidenceDeclared: { kind: R, completedAt: R },
  evidenceHealthRecord: { kind: R, healthRecordId: R },
});

export type ProgrammeRecordType = keyof typeof PROGRAMME_FIELD_POLICY;

/**
 * True when `raw` is a record holding exactly the policy's fields: every
 * field present and not `undefined`, no other own property, `REQUIRED` not
 * `null`, array rules satisfied. Values are validated by the caller.
 */
export function conformsToPolicy(raw: unknown, type: ProgrammeRecordType): raw is Record<string, unknown> {
  if (!isRecord(raw)) return false;
  const policy = PROGRAMME_FIELD_POLICY[type] as Readonly<Record<string, ProgrammeFieldRule>>;
  const keys = Object.keys(raw);
  if (keys.length !== Object.keys(policy).length || !keys.every((k) => Object.hasOwn(policy, k))) return false;
  for (const [field, rule] of Object.entries(policy)) {
    if (!Object.hasOwn(raw, field)) return false;
    const value = raw[field];
    if (value === undefined) return false;
    if (rule === "REQUIRED" && value === null) return false;
    if ((rule === "REQUIRED_ARRAY" || rule === "REQUIRED_NON_EMPTY_ARRAY") && !Array.isArray(value)) return false;
    if (rule === "REQUIRED_NON_EMPTY_ARRAY" && (value as unknown[]).length === 0) return false;
  }
  return true;
}

/** C3 `nullableRef`, except that `undefined` (a missing property) is never read as `null`. */
export function explicitNullableRef(value: unknown): { ok: boolean; value: string | null } {
  return value === undefined ? { ok: false, value: null } : nullableRef(value);
}

/** An explicit array of distinct opaque refs (sorted); anything else — `null` and a missing value included — is `null`. */
export function explicitRefList(raw: unknown, minItems = 0): string[] | null {
  if (!Array.isArray(raw) || raw.length < minItems || !raw.every(isOpaqueRef) || new Set(raw).size !== raw.length) return null;
  return [...(raw as string[])].sort(compareStrings);
}
