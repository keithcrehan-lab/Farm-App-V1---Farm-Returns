/**
 * Cattle C9 — THE admission boundary of C9's own canonical records
 * (CAT-INV-028 as clarified 2026-10-15; F004 architecture review 2026-10-19,
 * Outcome B).
 *
 * TRUST. The C2 / C4 / C7 / C8 outputs C9 obtains by invoking the frozen
 * engines in-process are TRUSTED to satisfy their owners' published
 * contracts. C9 never re-checks an owner-specific invariant and never uses a
 * predecessor fingerprint as a schema / semantic validator (fingerprints are
 * only carried as provenance and compared for B1 equivalence).
 *
 * OWNERSHIP. C9 owns the validity of every value it admits into its OWN
 * canonical records — the viewpoint, `CattlePlanWorkItem`,
 * `CattlePlanNoProposal`, `CattlePlanGroupScope` and the Plan
 * `CanonicalEvidence` it builds: values it relies on structurally, uses as a
 * cross-engine identity / reference, reads from a shared C0 structure (a
 * `SourceVersionRef`, an `AssessmentFingerprint`), or gives Plan meaning
 * (subjects, instants, deadline authority, vocabulary).
 *
 * BOUNDARY. trusted output → build the candidate record (`attempt`: a throw is
 * a missing structure) → `admit` it against its field table → only then is it
 * a canonical C9 record that grouping, merge and Plan projection may rely on.
 * Any failure is the issue `CATTLE_PLAN_ADMISSION_FAILED` (ref
 * `<where>:<field path>`), the whole request fails closed with no proposals,
 * and nothing crashes. Malformed records are never built and sanitised later.
 *
 * DRIFT GUARD. Each field table is declared with `satisfies Fields<T>` over
 * the C9 record type: a field added to a canonical record without a predicate
 * (or a predicate for a field that does not exist) is a type error, and at
 * runtime a record carrying an undeclared key is rejected. The tables are
 * keyed to C9's own records, never to the full C2 / C4 / C7 / C8 shapes, so a
 * new upstream owner invariant needs no C9 change unless C9 starts relying
 * on it.
 *
 * Reuses the shared predicates: `isOpaqueRef` / `isValidAnimalInstant` (C1),
 * `fingerprintOf` / `sourceVersionRefOf` (the shared C0 shapes, as C7 / C8
 * consume them) and C9's own compiled vocabulary tables.
 */

import type { CanonicalEvidence, CanonicalRecordRef, PlanBlockerKind, PlanBlockerStatus } from "../../plan";
import { SYSTEM_PRIORITY_TIERS } from "../../plan";
import type { SubjectRef } from "../../subject";
import { isOpaqueRef, isValidAnimalInstant } from "../animal-ledger";
import { fingerprintOf, isRecord, sourceVersionRefOf } from "../health/health-input";
import type {
  CattlePlanBlocker,
  CattlePlanFamily,
  CattlePlanGroupScope,
  CattlePlanIssue,
  CattlePlanNoProposal,
  CattlePlanOrigin,
  CattlePlanResult,
  CattlePlanSupport,
  CattlePlanTiming,
  CattlePlanWindow,
  CattlePlanWorkItem,
} from "./plan-contracts";
import { CATTLE_PLAN_VOCABULARY, obligationActionKey, programmeActionKey, recommendationActionKey } from "./plan-vocabulary";

/** `null` = admitted; otherwise the failing path relative to the checked value (`""` = the value itself). */
export type Check = (value: unknown) => string | null;

/** One predicate per field of `T` — exhaustive and exact (the drift guard). */
export type Fields<T> = { readonly [K in keyof T]-?: Check };

export const ADMISSION_FAILED = "CATTLE_PLAN_ADMISSION_FAILED";

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

const join = (head: string, tail: string) => (tail === "" ? head : tail.startsWith("[") ? `${head}${tail}` : `${head}.${tail}`);
const is = (p: (v: unknown) => boolean): Check => (v) => (p(v) ? null : "");

const ref: Check = is(isOpaqueRef);
const instant: Check = is(isValidAnimalInstant);
const text: Check = is((v) => typeof v === "string" && v.length > 0);
const fingerprint: Check = is((v) => fingerprintOf(v) !== null);
const sourceRef: Check = is((v) => sourceVersionRefOf(v) !== null);
const digest: Check = is((v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v));
const literal = (x: string): Check => is((v) => v === x);
const oneOf = (table: Readonly<Record<string, unknown>>): Check => is((v) => typeof v === "string" && Object.hasOwn(table, v));
const nullable = (c: Check): Check => (v) => (v === null ? null : c(v));
const optional = (c: Check): Check => (v) => (v === undefined ? null : c(v));
const never: Check = () => "";

const arrayOf = (c: Check): Check => (v) => {
  if (!Array.isArray(v)) return "";
  for (let i = 0; i < v.length; i++) {
    const p = c(v[i]);
    if (p !== null) return join(`[${i}]`, p);
  }
  return null;
};

const tuple = (...cs: Check[]): Check => (v) => {
  if (!Array.isArray(v) || v.length !== cs.length) return "";
  for (let i = 0; i < cs.length; i++) {
    const p = cs[i](v[i]);
    if (p !== null) return join(`[${i}]`, p);
  }
  return null;
};

/** A plain object with no key outside `fields`, every field passing its predicate, then the record's own relations. */
function record<T>(fields: Fields<T>, relation: (v: T) => string | null = () => null): Check {
  return (v) => {
    if (!isRecord(v)) return "";
    for (const k of Object.keys(v)) if (!Object.hasOwn(fields, k)) return k;
    for (const k of Object.keys(fields) as (keyof T & string)[]) {
      const p = fields[k](v[k]);
      if (p !== null) return join(k, p);
    }
    return relation(v as T);
  };
}

/** A plain object whose every key passes `key` and every value passes `value`. */
const keyedBy = (key: Check, value: Check): Check => (v) => {
  if (!isRecord(v)) return "";
  for (const [k, x] of Object.entries(v)) {
    if (key(k) !== null) return k;
    const p = value(x);
    if (p !== null) return join(k, p);
  }
  return null;
};

// ---------------------------------------------------------------------------
// C9-owned vocabularies
// ---------------------------------------------------------------------------

const FAMILIES = { C2_OBLIGATION: true, C7_PROGRAMME: true, C8_RECOMMENDATION: true } as const satisfies Record<CattlePlanFamily, true>;
const ORIGINS = { OBLIGATION: true, PROGRAMME: true, DATA_GAP: true, RECOMMENDATION: true } as const satisfies Record<CattlePlanOrigin, true>;
const BLOCKER_KINDS = { WEATHER: true, LEGAL_WINDOW: true, INPUT: true, OTHER: true } as const satisfies Record<PlanBlockerKind, true>;
const BLOCKER_STATUSES = { ACTIVE: true, CLEARED: true, UNKNOWN: true } as const satisfies Record<PlanBlockerStatus, true>;
const tier: Check = is((v) => (SYSTEM_PRIORITY_TIERS as readonly unknown[]).includes(v));

// ---------------------------------------------------------------------------
// Field tables — C9's own records (the drift guard)
// ---------------------------------------------------------------------------

export const VIEWPOINT_FIELDS = { effectiveAt: instant, knowledgeCutoff: instant } as const satisfies Fields<Pick<CattlePlanResult, "effectiveAt" | "knowledgeCutoff">>;

export const WINDOW_FIELDS = { opensAt: instant, dueAt: instant, boundary: ref } as const satisfies Fields<CattlePlanWindow>;

/** B5: the shared C0 `SourceVersionRef` C9 turns into Plan `VERSIONED_SOURCE` authority. */
export const HARD_DEADLINE_FIELDS = { dueIso: instant, authority: sourceRef } as const satisfies Fields<NonNullable<CattlePlanTiming["hardDeadline"]>>;

export const SOURCE_CHECK_FIELDS = { bound: sourceRef, status: ref } as const satisfies Fields<CattlePlanTiming["sourceChecks"][number]>;

export const TIMING_FIELDS = {
  window: nullable(record(WINDOW_FIELDS)),
  windowBasis: nullable(text),
  hardDeadline: nullable(record(HARD_DEADLINE_FIELDS)),
  sourceChecks: arrayOf(record(SOURCE_CHECK_FIELDS)),
} as const satisfies Fields<CattlePlanTiming>;

/** A window has a basis and vice versa; a hard deadline (B5) exists only on a window, due at its end. */
function timingRelation(t: CattlePlanTiming): string | null {
  if ((t.window === null) !== (t.windowBasis === null)) return "windowBasis";
  if (t.hardDeadline !== null && (t.window === null || t.hardDeadline.dueIso !== t.window.dueAt)) return "hardDeadline.dueIso";
  return null;
}

export const BLOCKER_FIELDS = {
  id: text,
  identity: tuple(ref, ref, digest, ref, literal("CATTLE_ANIMAL"), ref, nullable(ref)),
  kind: oneOf(BLOCKER_KINDS),
  status: oneOf(BLOCKER_STATUSES),
  gateState: ref,
  description: text,
} as const satisfies Fields<CattlePlanBlocker>;

const blockerRelation = (b: CattlePlanBlocker) => (b.id === `CATTLE_PLAN_BLOCKER:${JSON.stringify(b.identity)}` ? null : "id");

export const SUPPORT_FIELDS = {
  family: literal("C8_RECOMMENDATION"),
  origin: oneOf(ORIGINS),
  outputId: ref,
  outputFingerprint: fingerprint,
  actionKind: ref,
  consumedState: ref,
  reasonCodes: arrayOf(text),
} as const satisfies Fields<CattlePlanSupport>;

export const PRIORITY_FIELDS = { tier, basis: text } as const satisfies Fields<CattlePlanWorkItem["priority"]>;

export const WORK_ITEM_FIELDS = {
  key: text,
  family: oneOf(FAMILIES),
  origin: oneOf(ORIGINS),
  outputId: ref,
  outputFingerprint: fingerprint,
  animalId: ref,
  cites: nullable(text),
  consumedState: ref,
  reasonCodes: arrayOf(text),
  vocabularyRow: oneOf(CATTLE_PLAN_VOCABULARY),
  actionKey: text,
  timing: record(TIMING_FIELDS, timingRelation),
  blockers: arrayOf(record(BLOCKER_FIELDS, blockerRelation)),
  priority: record(PRIORITY_FIELDS),
  supporting: arrayOf(record(SUPPORT_FIELDS)),
} as const satisfies Fields<CattlePlanWorkItem>;

const parseJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

/**
 * The identities C9 itself relies on, exactly as C9 derives them from the
 * admitted ids: the item key, the citation it folds and completes by (D2),
 * the vocabulary row's family and the Plan action key.
 */
function workItemRelation(i: CattlePlanWorkItem): string | null {
  if (i.key !== JSON.stringify([i.family, i.outputId])) return "key";
  if (CATTLE_PLAN_VOCABULARY[i.vocabularyRow].family !== i.family) return "vocabularyRow";
  if (i.family === "C8_RECOMMENDATION") {
    if (i.cites !== null) return "cites";
    const kind = i.actionKey.slice("CATTLE_RECOMMENDATION:".length);
    return isOpaqueRef(kind) && i.actionKey === recommendationActionKey(kind) ? null : "actionKey";
  }
  const cites = i.cites === null ? undefined : parseJson(i.cites);
  if (i.family === "C2_OBLIGATION") {
    if (tuple(ref, nullable(ref))(cites) !== null) return "cites";
    return i.actionKey === obligationActionKey((cites as [string, string | null])[0]) ? null : "actionKey";
  }
  if (tuple(ref, ref, nullable(ref))(cites) !== null) return "cites";
  const key = i.actionKey.startsWith("CATTLE_PROGRAMME:") ? parseJson(i.actionKey.slice("CATTLE_PROGRAMME:".length)) : undefined;
  if (tuple(ref, ref)(key) !== null) return "actionKey";
  const [programmeId, actionKind] = key as [string, string];
  return programmeId === (cites as [string, string, string | null])[0] && i.actionKey === programmeActionKey(programmeId, actionKind) ? null : "actionKey";
}

export const NO_PROPOSAL_FIELDS = {
  family: oneOf(FAMILIES),
  outputId: ref,
  outputFingerprint: fingerprint,
  animalId: ref,
  consumedState: ref,
  reason: text,
} as const satisfies Fields<CattlePlanNoProposal>;

/** B2: every C4 member id C9 turns into a Plan subject. */
export const GROUP_SCOPE_FIELDS = {
  groupRef: ref,
  scopeFingerprint: fingerprint,
  members: arrayOf(ref),
  notMembers: arrayOf(ref),
  unknown: arrayOf(ref),
  conflict: arrayOf(ref),
  invalid: arrayOf(ref),
} as const satisfies Fields<CattlePlanGroupScope>;

/** Every Plan subject C9 constructs is a `CATTLE_ANIMAL` with an admitted id (B2). */
export const SUBJECT_FIELDS = { type: literal("CATTLE_ANIMAL"), id: ref } as const satisfies Fields<SubjectRef>;

export const RECORD_REF_FIELDS = { recordId: ref, recordKind: text, subjects: arrayOf(record(SUBJECT_FIELDS)), occurredAt: instant } as const satisfies Fields<CanonicalRecordRef>;

type PresenceMember = Extract<CanonicalEvidence["dataPresence"][string], { status: "AVAILABLE" }>["members"][number];
export const PRESENCE_MEMBER_FIELDS = { subject: record(SUBJECT_FIELDS), state: oneOf({ PRESENT: true, MISSING: true }), sourceRecordId: optional(ref) } as const satisfies Fields<PresenceMember>;

const unavailable = record<{ status: "UNAVAILABLE"; reason: string }>({ status: literal("UNAVAILABLE"), reason: text });
const presenceEntry: Check = (v) => (isRecord(v) && v.status === "UNAVAILABLE" ? unavailable(v) : record<{ status: "AVAILABLE"; members: unknown }>({ status: literal("AVAILABLE"), members: arrayOf(record(PRESENCE_MEMBER_FIELDS)) })(v));
const recordsEntry: Check = (v) => (isRecord(v) && v.status === "UNAVAILABLE" ? unavailable(v) : record<{ status: "AVAILABLE"; records: unknown }>({ status: literal("AVAILABLE"), records: arrayOf(record(RECORD_REF_FIELDS)) })(v));

/** C9 builds no decision evidence: `decisions` is always empty. */
export const EVIDENCE_FIELDS = {
  dataPresence: keyedBy(text, presenceEntry),
  records: keyedBy(text, recordsEntry),
  decisions: keyedBy(never, never),
} as const satisfies Fields<CanonicalEvidence>;

// ---------------------------------------------------------------------------
// The admission path
// ---------------------------------------------------------------------------

export const viewpointCheck = record(VIEWPOINT_FIELDS);
export const workItemCheck = record(WORK_ITEM_FIELDS, workItemRelation);
export const noProposalCheck = record(NO_PROPOSAL_FIELDS);
export const groupScopeCheck = record(GROUP_SCOPE_FIELDS);
export const evidenceCheck = record(EVIDENCE_FIELDS);

export const admissionIssue = (where: string, path: string): CattlePlanIssue => ({ code: ADMISSION_FAILED, ref: path === "" ? where : `${where}:${path}` });

/** Admits `value` as a canonical C9 record, or returns the issue naming the first failing field. */
export function admit(where: string, check: Check, value: unknown): CattlePlanIssue | null {
  const p = check(value);
  return p === null ? null : admissionIssue(where, p);
}

/** Builds a candidate record from trusted output; a throw is missing structure C9 relies on — an issue, never a crash. */
export function attempt<T>(where: string, build: () => T): { ok: true; value: T } | { ok: false; issue: CattlePlanIssue } {
  try {
    return { ok: true, value: build() };
  } catch {
    return { ok: false, issue: admissionIssue(where, "STRUCTURE") };
  }
}
