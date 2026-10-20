/**
 * Cattle C9 — the admission layer: C9's validated primitives, THE DTO
 * admission reader, and the defence-in-depth checks of C9's finished canonical
 * records (CAT-INV-028 as clarified 2026-10-15; F004 architecture review 2,
 * Outcome C, 2026-10-20).
 *
 * TRUST. The C2 / C4 / C7 / C8 outputs C9 obtains by invoking the frozen
 * engines in-process are TRUSTED to satisfy their owners' published
 * contracts. C9 never re-checks an owner-specific invariant and never uses a
 * predecessor fingerprint as a schema / semantic validator.
 *
 * PRIMARY BOUNDARY — admit BEFORE deriving (`plan-adapters.ts`). Every raw
 * predecessor operand C9 relies on (structure, identity / reference,
 * shared C0 protocol shape, vocabulary that drives a C9 decision, a value C9
 * turns into an identifier, a value C9 gives timing / priority / completion /
 * blocker / Plan meaning) is COPIED, untransformed, into a C9-owned DTO by
 * `admitDto` and checked against that DTO's exhaustive `DtoSpec` (presence,
 * runtime type, format, published vocabulary membership). No interpolation,
 * `JSON.stringify`, optional chaining, default or coercion touches a raw
 * operand first. Only an admitted DTO carries the C9 primitives (`C9Ref`,
 * `C9Text`, `C9Instant`, `C9Fingerprint`, `C9SourceRef`, `C9Vocab`): they are
 * brands minted exclusively by `admitDto`, and every C9 identifier / key /
 * reference constructor accepts only them. Any failure is
 * `CATTLE_PLAN_ADMISSION_FAILED` (ref `<where>:<raw path>`), the whole request
 * fails closed with no proposals, and nothing crashes.
 *
 * DRIFT GUARD. Each DTO spec is declared with `satisfies DtoSpec<Dto>`: a DTO
 * field added without its admission node (or a node for a field that does not
 * exist) is a type error. Specs are keyed to C9's own DTOs, never to the full
 * C2 / C4 / C7 / C8 shapes, so a new upstream owner field or invariant needs
 * no C9 change unless C9 starts consuming it.
 *
 * DEFENCE IN DEPTH (not the boundary). The finished canonical records — the
 * viewpoint, `CattlePlanWorkItem`, `CattlePlanNoProposal`,
 * `CattlePlanGroupScope` and the Plan `CanonicalEvidence` — are still checked
 * against their field tables (`satisfies Fields<T>`, undeclared keys rejected)
 * and the relations C9 derives (item key, citation, action key, blocker id)
 * before grouping, merge or projection. A check of a DERIVED value can never
 * establish that the operands it was derived from were valid; that guarantee
 * belongs to the DTO admission above.
 *
 * Reuses the shared predicates: `isOpaqueRef` / `isValidAnimalInstant` (C1),
 * `fingerprintOf` / `sourceVersionRefOf` (the shared C0 shapes, as C7 / C8
 * consume them) and C9's own compiled vocabulary tables.
 */

import type { AssessmentFingerprint } from "../../assessment-integrity";
import type { CanonicalEvidence, CanonicalRecordRef, PlanBlockerKind, PlanBlockerStatus } from "../../plan";
import { SYSTEM_PRIORITY_TIERS } from "../../plan";
import type { SubjectRef } from "../../subject";
import { isOpaqueRef, isValidAnimalInstant } from "../animal-ledger";
import { fingerprintOf, isRecord, sourceVersionRefOf } from "../health/health-input";
import type { SourceVersionRef } from "../source";
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
// C9 validated primitives — minted ONLY by `admitDto`
// ---------------------------------------------------------------------------

declare const ADMITTED: unique symbol;
type Admitted<T, K extends string> = T & { readonly [ADMITTED]: K };

/** An admitted opaque identifier / reference (`isOpaqueRef`). */
export type C9Ref = Admitted<string, "REF">;
/** An admitted non-empty text (reason codes). */
export type C9Text = Admitted<string, "TEXT">;
/** An admitted canonical-grammar instant (`isValidAnimalInstant`). */
export type C9Instant = Admitted<string, "INSTANT">;
/** An admitted shared C0 `AssessmentFingerprint` (`fingerprintOf`). */
export type C9Fingerprint = Admitted<AssessmentFingerprint, "FINGERPRINT">;
/** An admitted shared C0 `SourceVersionRef` (`sourceVersionRefOf`). */
export type C9SourceRef = Admitted<SourceVersionRef, "SOURCE_REF">;
/** An admitted member of a published vocabulary. */
export type C9Vocab<V extends string> = Admitted<V, "VOCAB">;

// ---------------------------------------------------------------------------
// DTO admission specs — what C9 copies from a raw predecessor output, and how each operand is admitted
// ---------------------------------------------------------------------------

/** The admission class of a raw leaf operand (drives the generated mutation matrix). */
export type LeafClass = "REF" | "NULLABLE_REF" | "TEXT" | "INSTANT" | "NULLABLE_INSTANT" | "FINGERPRINT" | "SOURCE_REF" | "VOCAB" | "NULLABLE_VOCAB" | "LITERAL";

/** A raw leaf copied verbatim from `from` (relative to its parent node) and admitted by `check`. */
export interface LeafSpec {
  readonly kind: "leaf";
  readonly from: readonly string[];
  readonly cls: LeafClass;
  readonly check: Check;
  /** The published vocabulary (VOCAB / NULLABLE_VOCAB / LITERAL), else `null`. */
  readonly values: readonly string[] | null;
}
/** A raw object at `from` whose admitted fields form a C9 DTO object (`nullable`: `null` is admitted as `null`). */
export interface ObjectSpec {
  readonly kind: "object";
  readonly from: readonly string[];
  readonly nullable: boolean;
  readonly fields: Readonly<Record<string, NodeSpec>>;
}
/** A raw array at `from`; every element is admitted by `item` (its `from` relative to the element). */
export interface ListSpec {
  readonly kind: "list";
  readonly from: readonly string[];
  readonly item: NodeSpec;
}
/** A raw object at `from` discriminated by its `state`: the variant's own fields are admitted. */
export interface VariantSpec {
  readonly kind: "variant";
  readonly from: readonly string[];
  readonly variants: Readonly<Record<string, Readonly<Record<string, NodeSpec>>>>;
}
export type NodeSpec = LeafSpec | ObjectSpec | ListSpec | VariantSpec;

/** One admission node per DTO field — exhaustive and exact (the DTO drift guard). */
export type DtoSpec<T> = { readonly [K in keyof T]-?: NodeSpec };

const leafOf =
  (cls: LeafClass, check: Check, values: readonly string[] | null = null) =>
  (...from: string[]): LeafSpec => ({ kind: "leaf", from, cls, check, values });
const member = (values: readonly string[]): Check => is((v) => typeof v === "string" && values.includes(v));

/** The node constructors of every C9 DTO spec. */
export const operand = {
  ref: leafOf("REF", ref),
  nullableRef: leafOf("NULLABLE_REF", nullable(ref)),
  text: leafOf("TEXT", text),
  instant: leafOf("INSTANT", instant),
  nullableInstant: leafOf("NULLABLE_INSTANT", nullable(instant)),
  fingerprint: leafOf("FINGERPRINT", fingerprint),
  sourceRef: leafOf("SOURCE_REF", sourceRef),
  vocab: (values: readonly string[], ...from: string[]): LeafSpec => leafOf("VOCAB", member(values), values)(...from),
  nullableVocab: (values: readonly string[], ...from: string[]): LeafSpec => leafOf("NULLABLE_VOCAB", nullable(member(values)), values)(...from),
  literal: (value: string, ...from: string[]): LeafSpec => leafOf("LITERAL", literal(value), [value])(...from),
  object: <T>(from: readonly string[], fields: DtoSpec<T>): ObjectSpec => ({ kind: "object", from, nullable: false, fields }),
  nullableObject: <T>(from: readonly string[], fields: DtoSpec<T>): ObjectSpec => ({ kind: "object", from, nullable: true, fields }),
  list: (from: readonly string[], item: NodeSpec): ListSpec => ({ kind: "list", from, item }),
  variant: <T extends { state: string }>(from: readonly string[], variants: { readonly [S in T["state"]]: DtoSpec<Extract<T, { state: S }>> }): VariantSpec => ({
    kind: "variant",
    from,
    variants: variants as unknown as VariantSpec["variants"],
  }),
};

const MISSING = Symbol("MISSING");
type Read = { ok: true; value: unknown } | { ok: false; path: string };

const segment = (path: string, seg: string | number) => (typeof seg === "number" ? `${path}[${seg}]` : path === "" ? seg : `${path}.${seg}`);

/** Own-property navigation over plain objects; anything else is MISSING (never a throw, never a default). */
function at(raw: unknown, from: readonly string[], base: string): { value: unknown; path: string } {
  let value = raw;
  let path = base;
  for (const k of from) {
    path = segment(path, k);
    value = isRecord(value) && Object.hasOwn(value, k) ? value[k] : MISSING;
  }
  return { value, path };
}

function readFields(fields: Readonly<Record<string, NodeSpec>>, raw: unknown, base: string): Read {
  const out: Record<string, unknown> = {};
  for (const [k, n] of Object.entries(fields)) {
    const r = readNode(n, raw, base);
    if (!r.ok) return r;
    out[k] = r.value;
  }
  return { ok: true, value: out };
}

function readNode(n: NodeSpec, raw: unknown, base: string): Read {
  const { value, path } = at(raw, n.from, base);
  switch (n.kind) {
    case "leaf": {
      if (value === MISSING) return { ok: false, path };
      const p = n.check(value);
      return p === null ? { ok: true, value } : { ok: false, path: p === "" ? path : join(path, p) };
    }
    case "object":
      if (n.nullable && value === null) return { ok: true, value: null };
      return isRecord(value) ? readFields(n.fields, value, path) : { ok: false, path };
    case "list": {
      if (!Array.isArray(value)) return { ok: false, path };
      const out: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const r = readNode(n.item, value[i], segment(path, i));
        if (!r.ok) return r;
        out.push(r.value);
      }
      return { ok: true, value: out };
    }
    case "variant": {
      if (!isRecord(value)) return { ok: false, path };
      const tag = Object.hasOwn(value, "state") ? value.state : MISSING;
      if (typeof tag !== "string" || !Object.hasOwn(n.variants, tag)) return { ok: false, path: segment(path, "state") };
      return readFields(n.variants[tag], value, path);
    }
  }
}

/**
 * THE mint of C9's validated primitives: copies exactly the operands `spec`
 * names from a raw predecessor output, untransformed, and admits each one.
 * Only on success is the copy a `T` (and its leaves C9 primitives); otherwise
 * the issue names `<where>:<raw path>`. Never throws, never defaults.
 */
export function admitDto<T>(where: string, spec: DtoSpec<T>, raw: unknown): { ok: true; value: T } | { ok: false; issue: CattlePlanIssue } {
  const r = readFields(spec as Readonly<Record<string, NodeSpec>>, raw, "");
  return r.ok ? { ok: true, value: r.value as T } : { ok: false, issue: admissionIssue(where, r.path) };
}

/** The admission layer's own relation checks re-derive identities from canonical strings: an opaque ref is admitted here. */
const admittedRef = (v: unknown): v is C9Ref => isOpaqueRef(v);

// ---------------------------------------------------------------------------
// Field tables — C9's own finished records (defence in depth)
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
    return admittedRef(kind) && i.actionKey === recommendationActionKey(kind) ? null : "actionKey";
  }
  const cites = i.cites === null ? undefined : parseJson(i.cites);
  if (i.family === "C2_OBLIGATION") {
    if (tuple(ref, nullable(ref))(cites) !== null) return "cites";
    const [obligationId] = cites as unknown[];
    return admittedRef(obligationId) && i.actionKey === obligationActionKey(obligationId) ? null : "actionKey";
  }
  if (tuple(ref, ref, nullable(ref))(cites) !== null) return "cites";
  const key = i.actionKey.startsWith("CATTLE_PROGRAMME:") ? parseJson(i.actionKey.slice("CATTLE_PROGRAMME:".length)) : undefined;
  if (tuple(ref, ref)(key) !== null) return "actionKey";
  const [programmeId, actionKind] = key as unknown[];
  return admittedRef(programmeId) && admittedRef(actionKind) && programmeId === (cites as unknown[])[0] && i.actionKey === programmeActionKey(programmeId, actionKind) ? null : "actionKey";
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
// Finished-record checks (defence in depth over records built from admitted DTOs)
// ---------------------------------------------------------------------------

export const viewpointCheck = record(VIEWPOINT_FIELDS);
export const workItemCheck = record(WORK_ITEM_FIELDS, workItemRelation);
export const noProposalCheck = record(NO_PROPOSAL_FIELDS);
export const groupScopeCheck = record(GROUP_SCOPE_FIELDS);
export const evidenceCheck = record(EVIDENCE_FIELDS);

export const admissionIssue = (where: string, path: string): CattlePlanIssue => ({ code: ADMISSION_FAILED, ref: path === "" ? where : `${where}:${path}` });

/** Checks a finished canonical C9 record, or returns the issue naming the first failing field. */
export function admit(where: string, check: Check, value: unknown): CattlePlanIssue | null {
  const p = check(value);
  return p === null ? null : admissionIssue(where, p);
}
