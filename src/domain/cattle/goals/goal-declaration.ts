/**
 * Cattle C6 — the canonical production-goal declaration record and its
 * admission at a knowledge cutoff.
 *
 * A production goal is INTENT (C0 information class), never FACT. Goals are
 * declared, never inferred: the engine ships with no goal, no default goal and
 * no inference from animal facts (sex, age, category) (CAT-INV-027).
 *
 * - Identity: `goalId` + `version` (opaque, exact strings). Same identity +
 *   identical content (instants by instant) is idempotent; same identity +
 *   different content — an invalid copy included — fails closed
 *   (CAT-INV-008). A `goalId` may not begin with `GOAL_TYPE_REF_PREFIX`, so a
 *   goal-id ref and a goal-type ref can never be confused.
 * - Append-only: a correction, an ending (`action: "END"`) or a withdrawal
 *   (`action: "WITHDRAW"`) is a NEW version whose `supersedesVersions` names
 *   earlier versions of the same goal; nothing is deleted or rewritten. Every
 *   known version of one goal must share its subject and its standing (a
 *   SYSTEM suggestion can never supersede, end or become a declared goal).
 * - Subject: an animal (C1 `FarmReturnAnimalId`) or an explicit opaque scope
 *   ref. Scope membership is not resolved here (C4 owns group scopes).
 * - Valid time: the declaration period `[validFrom, validTo)` (inclusive
 *   start, exclusive end; `validTo: null` = open). Knowledge time:
 *   `provenance.receivedAt`.
 * - Declarer: `declaredBy {actor, role}` is required. Role `SYSTEM` makes the
 *   record a SUGGESTION only — it is never an active declared goal.
 * - Optional target outcome, kept exactly as supplied (CAT-INV-011): a target
 *   weight `{value, unit}` (unit from C4's closed `WEIGHT_UNITS`; canonical
 *   kilograms only through C4's exact `WEIGHT_UNIT_CONVERSIONS`, otherwise the
 *   canonical value is UNSUPPORTED — no conversion factor is invented), a
 *   target calendar date (C0 `isValidCalendarDate`) and an opaque,
 *   source-coded production outcome `{scheme, code}`. `null` = not declared.
 *
 * Admission order (TEMPORAL_EVIDENCE.md):
 * 1. a record whose readable `provenance.receivedAt` is after the cutoff is
 *    set aside before any other read (CAT-INV-003/004); an unreadable one is
 *    kept and fails closed at validation (CAT-INV-005);
 * 2. identity among admitted records before validity (CAT-INV-008);
 * 3. content, declarer and provenance validation (CAT-INV-022/024);
 * 4. supersession at the cutoff through C2 `collectBitemporalRecords` /
 *    `resolveBitemporalRecords`: an unknown target, an out-of-scope link or a
 *    cycle fails closed; more than one live version of a goal, or competing
 *    corrections, are a version conflict with no winner (CAT-INV-026).
 *
 * Materialised records carry every instant in the canonical nine-digit
 * spelling (the semantic form used by C6 outputs and fingerprints); the
 * supplied record remains the caller's stored representation. Readers here
 * trust already-canonical input; public entry points run the canonical
 * boundary first.
 */

import { canonicalizeValue } from "../../assessment-integrity";
import {
  ANIMAL_DATA_SOURCE_CATEGORIES,
  compareInstants,
  isOpaqueRef,
  isValidAnimalInstant,
  type AnimalDataSourceCategory,
  type FarmReturnAnimalId,
} from "../animal-ledger";
import { compareStrings, sortedUnique } from "../integrity";
import { isValidCalendarDate } from "../rule";
import { canonicalField } from "../regulatory/canonical-input";
import { canonicalObligationInstant } from "../regulatory/obligation-time";
import { collectBitemporalRecords, resolveBitemporalRecords, type BitemporalRecord } from "../regulatory/bitemporal-records";
import { hasOnlyFields, isRecord, nullableRef, oneOf, rawIdentityKey, type Raw } from "../health/health-input";
import { WEIGHT_UNITS, WEIGHT_UNIT_CONVERSIONS, type WeightUnit } from "../weights";

/** Closed goal-type enumeration (exact strings). */
export const PRODUCTION_GOAL_TYPES = ["BREEDING", "FINISHING", "REPLACEMENT", "RETAIN", "SALE"] as const;
export type ProductionGoalType = (typeof PRODUCTION_GOAL_TYPES)[number];

/** Who declared the record. `SYSTEM` records are suggestions only. */
export const GOAL_DECLARER_ROLES = ["ADVISER", "FARMER", "SYSTEM", "VETERINARIAN"] as const;
export type GoalDeclarerRole = (typeof GOAL_DECLARER_ROLES)[number];

/** `DECLARE` (incl. a correction), `END` (a new version closing the period), `WITHDRAW` (retracted: never in force). */
export const GOAL_RECORD_ACTIONS = ["DECLARE", "END", "WITHDRAW"] as const;
export type GoalRecordAction = (typeof GOAL_RECORD_ACTIONS)[number];

/** `DECLARED` = farmer / adviser / veterinarian intent; `SUGGESTED` = a SYSTEM record (never active). */
export type GoalStanding = "DECLARED" | "SUGGESTED";

/** Prefix of a goal-TYPE ref (`goalTypeRef`); reserved — no `goalId` may start with it. */
export const GOAL_TYPE_REF_PREFIX = "CATTLE_GOAL_TYPE:";

/** The explicit ref naming a goal type (e.g. in a C5 target's `applicability.goalRef`). */
export function goalTypeRef(goalType: ProductionGoalType): string {
  return `${GOAL_TYPE_REF_PREFIX}${goalType}`;
}

export type GoalSubject = { kind: "ANIMAL"; animalId: FarmReturnAnimalId } | { kind: "SCOPE"; scopeRef: string };

export type GoalCanonicalWeight = { state: "KNOWN"; kg: number } | { state: "UNSUPPORTED" };

export interface GoalTargetWeight {
  /** As recorded. */
  value: number;
  unit: WeightUnit;
  /** Derived only through C4's exact conversion table; UNSUPPORTED when none exists. */
  canonical: GoalCanonicalWeight;
}

/** An opaque, source-coded production outcome (no built-in meaning). */
export interface GoalTargetOutcome {
  scheme: string;
  code: string;
}

export interface GoalDeclarer {
  actor: string;
  role: GoalDeclarerRole;
}

export interface GoalProvenance {
  sourceCategory: AnimalDataSourceCategory;
  sourceSystem: string | null;
  sourceRecordRef: string | null;
  /** KNOWLEDGE time (strict UTC; canonical spelling once materialised). */
  receivedAt: string;
}

export interface ProductionGoalDeclaration {
  goalId: string;
  version: string;
  /** Earlier versions of the same goal this record corrects / ends / withdraws (sorted). */
  supersedesVersions: string[];
  action: GoalRecordAction;
  subject: GoalSubject;
  goalType: ProductionGoalType;
  targetWeight: GoalTargetWeight | null;
  /** Calendar date `YYYY-MM-DD` (no time zone). */
  targetDate: string | null;
  targetOutcome: GoalTargetOutcome | null;
  /** VALID time: inclusive start, exclusive end (`null` = open). */
  validFrom: string;
  validTo: string | null;
  declaredBy: GoalDeclarer;
  provenance: GoalProvenance;
}

export interface GoalVersionRef {
  goalId: string;
  version: string;
}

export type GoalRecordIssueCode =
  | "NOT_OBJECT"
  | "INVALID_IDENTITY"
  | "INVALID_KNOWLEDGE_TIME"
  | "INVALID_PROVENANCE"
  | "INVALID_DECLARER"
  | "INVALID_SUBJECT"
  | "INVALID_GOAL_TYPE"
  | "INVALID_ACTION"
  | "INVALID_PERIOD"
  | "INVALID_TARGET_OUTCOME"
  | "INVALID_CONTENT"
  | "SELF_SUPERSESSION"
  | "DUPLICATE_VERSION_DIFFERENT_CONTENT"
  | "IDENTITY_SCOPE_MISMATCH"
  | "SUPERSESSION_TARGET_NOT_KNOWN"
  | "SUPERSESSION_OUT_OF_SCOPE"
  | "SUPERSESSION_CYCLE";

export interface GoalRecordIssue {
  code: `CATTLE_GOAL_RECORD_${GoalRecordIssueCode}`;
  /** `goalId@version` when readable. */
  ref: string | null;
}

export function goalStanding(record: ProductionGoalDeclaration): GoalStanding {
  return record.declaredBy.role === "SYSTEM" ? "SUGGESTED" : "DECLARED";
}

export function goalVersionRef(record: ProductionGoalDeclaration): GoalVersionRef {
  return { goalId: record.goalId, version: record.version };
}

export function compareGoalVersionRefs(a: GoalVersionRef, b: GoalVersionRef): number {
  return compareStrings(a.goalId, b.goalId) || compareStrings(a.version, b.version);
}

/** Every field, instants already canonical (so semantic equality = canonical equality). */
export function goalDeclarationContentKey(record: ProductionGoalDeclaration): string {
  return canonicalizeValue(record);
}

/** The declared outcome fields compared for structural same-type disagreement. */
export function goalOutcomeKey(record: ProductionGoalDeclaration): string {
  return canonicalizeValue({ targetWeight: record.targetWeight, targetDate: record.targetDate, targetOutcome: record.targetOutcome });
}

export function goalSubjectKey(subject: GoalSubject): string {
  return canonicalizeValue(subject);
}

// ---------------------------------------------------------------------------
// Readers (canonical plain data; shape only, never repaired)
// ---------------------------------------------------------------------------

const RECORD_FIELDS = [
  "goalId",
  "version",
  "supersedesVersions",
  "action",
  "subject",
  "goalType",
  "targetWeight",
  "targetDate",
  "targetOutcome",
  "validFrom",
  "validTo",
  "declaredBy",
  "provenance",
];

export function isGoalId(value: unknown): value is string {
  return isOpaqueRef(value) && !value.startsWith(GOAL_TYPE_REF_PREFIX);
}

/** `goalId@version` when both are readable, else `null` (diagnostics only). */
export function goalDisplayRef(raw: unknown): string | null {
  return isRecord(raw) && isGoalId(raw.goalId) && isOpaqueRef(raw.version) ? `${raw.goalId}@${raw.version}` : null;
}

/** Reads a subject (records and queries share the shape). */
export function goalSubjectOf(raw: unknown): GoalSubject | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "ANIMAL" && hasOnlyFields(raw, ["kind", "animalId"]) && isOpaqueRef(raw.animalId)) return { kind: "ANIMAL", animalId: raw.animalId as FarmReturnAnimalId };
  if (raw.kind === "SCOPE" && hasOnlyFields(raw, ["kind", "scopeRef"]) && isOpaqueRef(raw.scopeRef)) return { kind: "SCOPE", scopeRef: raw.scopeRef };
  return null;
}

function provenanceOf(raw: unknown): GoalProvenance | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["sourceCategory", "sourceSystem", "sourceRecordRef", "receivedAt"])) return null;
  const system = nullableRef(raw.sourceSystem);
  const recordRef = nullableRef(raw.sourceRecordRef);
  if (!oneOf(ANIMAL_DATA_SOURCE_CATEGORIES, raw.sourceCategory) || !system.ok || !recordRef.ok || !isValidAnimalInstant(raw.receivedAt)) return null;
  return { sourceCategory: raw.sourceCategory, sourceSystem: system.value, sourceRecordRef: recordRef.value, receivedAt: canonicalObligationInstant(raw.receivedAt) as string };
}

function declarerOf(raw: unknown): GoalDeclarer | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["actor", "role"]) || !isOpaqueRef(raw.actor) || !oneOf(GOAL_DECLARER_ROLES, raw.role)) return null;
  return { actor: raw.actor, role: raw.role };
}

function versionsOf(raw: unknown): string[] | null {
  const list = raw ?? [];
  if (!Array.isArray(list) || !list.every(isOpaqueRef) || new Set(list).size !== list.length) return null;
  return [...(list as string[])].sort(compareStrings);
}

function targetWeightOf(raw: unknown): { ok: boolean; value: GoalTargetWeight | null } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (!isRecord(raw) || !hasOnlyFields(raw, ["value", "unit"]) || typeof raw.value !== "number" || !Number.isFinite(raw.value) || raw.value <= 0 || !oneOf(WEIGHT_UNITS, raw.unit)) {
    return { ok: false, value: null };
  }
  const canonical: GoalCanonicalWeight = WEIGHT_UNIT_CONVERSIONS[raw.unit] === "IDENTITY" ? { state: "KNOWN", kg: raw.value } : { state: "UNSUPPORTED" };
  return { ok: true, value: { value: raw.value, unit: raw.unit, canonical } };
}

function targetOutcomeOf(raw: unknown): { ok: boolean; value: GoalTargetOutcome | null } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (!isRecord(raw) || !hasOnlyFields(raw, ["scheme", "code"]) || !isOpaqueRef(raw.scheme) || !isOpaqueRef(raw.code)) return { ok: false, value: null };
  return { ok: true, value: { scheme: raw.scheme, code: raw.code } };
}

function targetDateOf(raw: unknown): { ok: boolean; value: string | null } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  return typeof raw === "string" && isValidCalendarDate(raw) ? { ok: true, value: raw } : { ok: false, value: null };
}

type Materialised = { ok: true; record: ProductionGoalDeclaration } | { ok: false; ref: string | null; codes: GoalRecordIssueCode[] };

/** Validates one already-canonical declaration record (module-internal). */
export function materialiseGoalDeclaration(raw: unknown): Materialised {
  if (!isRecord(raw)) return { ok: false, ref: null, codes: ["NOT_OBJECT"] };
  const ref = goalDisplayRef(raw);
  const codes: GoalRecordIssueCode[] = [];
  if (!hasOnlyFields(raw, RECORD_FIELDS)) codes.push("INVALID_CONTENT");
  if (ref === null) codes.push("INVALID_IDENTITY");
  if (!isValidAnimalInstant(canonicalField(raw, "provenance", "receivedAt"))) codes.push("INVALID_KNOWLEDGE_TIME");
  const provenance = provenanceOf(raw.provenance);
  if (provenance === null) codes.push("INVALID_PROVENANCE");
  const declaredBy = declarerOf(raw.declaredBy);
  if (declaredBy === null) codes.push("INVALID_DECLARER");
  const subject = goalSubjectOf(raw.subject);
  if (subject === null) codes.push("INVALID_SUBJECT");
  if (!oneOf(PRODUCTION_GOAL_TYPES, raw.goalType)) codes.push("INVALID_GOAL_TYPE");
  const supersedes = versionsOf(raw.supersedesVersions);
  if (supersedes === null) codes.push("INVALID_CONTENT");
  else if (supersedes.includes(raw.version as string)) codes.push("SELF_SUPERSESSION");
  const action = oneOf(GOAL_RECORD_ACTIONS, raw.action) ? raw.action : null;
  if (action === null) codes.push("INVALID_ACTION");
  const validFrom = isValidAnimalInstant(raw.validFrom) ? (canonicalObligationInstant(raw.validFrom) as string) : null;
  const rawTo = raw.validTo ?? null;
  const validTo = rawTo === null ? null : isValidAnimalInstant(rawTo) ? (canonicalObligationInstant(rawTo) as string) : undefined;
  if (validFrom === null || validTo === undefined || (validTo !== null && compareInstants(validFrom, validTo) >= 0)) codes.push("INVALID_PERIOD");
  // An ending or withdrawal is a new version of an existing goal; an ending closes the period.
  if (action !== null && action !== "DECLARE" && supersedes !== null && supersedes.length === 0) codes.push("INVALID_ACTION");
  if (action === "END" && validTo === null) codes.push("INVALID_ACTION");
  const targetWeight = targetWeightOf(raw.targetWeight);
  const targetDate = targetDateOf(raw.targetDate);
  const targetOutcome = targetOutcomeOf(raw.targetOutcome);
  if (!targetWeight.ok || !targetDate.ok || !targetOutcome.ok) codes.push("INVALID_TARGET_OUTCOME");
  if (codes.length > 0 || ref === null || provenance === null || declaredBy === null || subject === null || supersedes === null || action === null || validFrom === null || validTo === undefined) {
    return { ok: false, ref, codes: sortedUnique(codes) as GoalRecordIssueCode[] };
  }
  return {
    ok: true,
    record: {
      goalId: raw.goalId as string,
      version: raw.version as string,
      supersedesVersions: supersedes,
      action,
      subject,
      goalType: raw.goalType as ProductionGoalType,
      targetWeight: targetWeight.value,
      targetDate: targetDate.value,
      targetOutcome: targetOutcome.value,
      validFrom,
      validTo,
      declaredBy,
      provenance,
    },
  };
}

// ---------------------------------------------------------------------------
// Admission and resolution at a knowledge cutoff
// ---------------------------------------------------------------------------

/**
 * One goal's state at the cutoff: exactly one live version and no competing
 * correction ⇒ RESOLVED; otherwise VERSION_CONFLICT with every live version
 * and competing terminal involved (sorted by version), no winner.
 */
export type GoalVersionResolution =
  | { state: "RESOLVED"; record: ProductionGoalDeclaration }
  | { state: "VERSION_CONFLICT"; records: ProductionGoalDeclaration[] };

export interface GoalLedgerAdmission {
  /** Every admitted (known, valid) record, sorted by goal id then version. */
  known: ProductionGoalDeclaration[];
  /** Known record (`[goalId, version]` key) → the known versions superseding it (sorted). */
  supersededBy: ReadonlyMap<string, readonly GoalVersionRef[]>;
  byGoalId: ReadonlyMap<string, GoalVersionResolution>;
}

export type GoalAdmissionResult = { ok: true; admission: GoalLedgerAdmission } | { ok: false; issues: GoalRecordIssue[] };

export const goalRecordKey = (goalId: string, version: string): string => JSON.stringify([goalId, version]);

function receivedAfter(raw: unknown, knowledgeCutoff: string): boolean {
  const t = canonicalField(raw, "provenance", "receivedAt");
  return isValidAnimalInstant(t) && compareInstants(t, knowledgeCutoff) > 0;
}

function issue(code: GoalRecordIssueCode, ref: string | null): GoalRecordIssue {
  return { code: `CATTLE_GOAL_RECORD_${code}`, ref };
}

export function uniqueGoalRecordIssues(issues: readonly GoalRecordIssue[]): GoalRecordIssue[] {
  const unique = new Map(issues.map((i) => [`${i.ref ?? ""}\u0000${i.code}`, i]));
  return [...unique.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, i]) => i);
}

/** Admits already-canonical declaration records at `knowledgeCutoff` (module-internal). */
export function admitGoalDeclarations(raws: readonly unknown[], knowledgeCutoff: string): GoalAdmissionResult {
  const admitted = raws.filter((raw) => !receivedAfter(raw, knowledgeCutoff));
  const materialised = admitted.map((raw) => ({ raw, result: materialiseGoalDeclaration(raw) }));
  const issues: GoalRecordIssue[] = [];
  // Identity before validity (CAT-INV-008): an invalid copy still collides.
  const byIdentity = new Map<string, { ref: string; keys: Set<string> }>();
  for (const { raw, result } of materialised) {
    const ref = goalDisplayRef(raw);
    if (ref === null) continue;
    const identity = goalRecordKey((raw as Raw).goalId as string, (raw as Raw).version as string);
    const key = result.ok ? `valid:${goalDeclarationContentKey(result.record)}` : `raw:${rawIdentityKey(raw)}`;
    const entry = byIdentity.get(identity) ?? { ref, keys: new Set<string>() };
    byIdentity.set(identity, { ref, keys: entry.keys.add(key) });
  }
  for (const { ref, keys } of byIdentity.values()) if (keys.size > 1) issues.push(issue("DUPLICATE_VERSION_DIFFERENT_CONTENT", ref));

  type Envelope = { def: ProductionGoalDeclaration } & BitemporalRecord;
  const envelopes: Envelope[] = [];
  for (const { result } of materialised) {
    if (!result.ok) {
      issues.push(...result.codes.map((code) => issue(code, result.ref)));
      continue;
    }
    const r = result.record;
    envelopes.push({
      def: r,
      recordId: goalRecordKey(r.goalId, r.version),
      supersedes: r.supersedesVersions.map((v) => goalRecordKey(r.goalId, v)).sort(compareStrings),
      receivedAt: r.provenance.receivedAt,
    });
  }
  const display = (recordId: string) => {
    const [id, version] = JSON.parse(recordId) as [string, string];
    return `${id}@${version}`;
  };
  const collected = collectBitemporalRecords(envelopes, (e) => goalDeclarationContentKey(e.def));
  if (!collected.ok) {
    for (const i of collected.issues) issues.push(issue(i.code === "CATTLE_RECORD_SELF_SUPERSESSION" ? "SELF_SUPERSESSION" : "DUPLICATE_VERSION_DIFFERENT_CONTENT", display(i.recordId)));
  }
  if (issues.length > 0 || !collected.ok) return { ok: false, issues: uniqueGoalRecordIssues(issues) };

  // Every known version of one goal shares its subject and standing.
  const scopeOf = (r: ProductionGoalDeclaration) => `${goalSubjectKey(r.subject)}\u0000${goalStanding(r)}`;
  const scopes = new Map<string, Set<string>>();
  for (const e of collected.records) scopes.set(e.def.goalId, (scopes.get(e.def.goalId) ?? new Set<string>()).add(scopeOf(e.def)));
  for (const [goalId, s] of scopes) if (s.size > 1) issues.push(issue("IDENTITY_SCOPE_MISMATCH", goalId));
  if (issues.length > 0) return { ok: false, issues: uniqueGoalRecordIssues(issues) };

  const resolution = resolveBitemporalRecords(collected.records, knowledgeCutoff, {
    linkAllowed: (source, target) => source.def.goalId === target.def.goalId && scopeOf(source.def) === scopeOf(target.def),
    competitionKey: (e) => goalDeclarationContentKey(e.def),
  });
  if (resolution.linkIssues.length > 0) {
    const code = (c: string): GoalRecordIssueCode =>
      c === "CATTLE_RECORD_SUPERSESSION_TARGET_NOT_KNOWN" ? "SUPERSESSION_TARGET_NOT_KNOWN" : c === "CATTLE_RECORD_SUPERSESSION_CYCLE" ? "SUPERSESSION_CYCLE" : "SUPERSESSION_OUT_OF_SCOPE";
    return { ok: false, issues: uniqueGoalRecordIssues(resolution.linkIssues.map((i) => issue(code(i.code), display(i.recordId)))) };
  }

  const byGoalId = new Map<string, GoalVersionResolution>();
  for (const goalId of sortedUnique(resolution.known.map((e) => e.def.goalId))) {
    const live = resolution.live.filter((e) => e.def.goalId === goalId);
    const terminals = resolution.competitions.filter((c) => c.terminals[0].def.goalId === goalId).flatMap((c) => c.terminals);
    if (live.length === 1 && terminals.length === 0) {
      byGoalId.set(goalId, { state: "RESOLVED", record: live[0].def });
    } else {
      const involved = new Map([...live, ...terminals].map((e) => [e.recordId, e.def]));
      byGoalId.set(goalId, { state: "VERSION_CONFLICT", records: [...involved.values()].sort((a, b) => compareStrings(a.version, b.version)) });
    }
  }
  const supersededBy = new Map<string, GoalVersionRef[]>();
  for (const [recordId, by] of resolution.supersededBy) {
    supersededBy.set(
      recordId,
      by.map((id) => {
        const [goalId, version] = JSON.parse(id) as [string, string];
        return { goalId, version };
      }),
    );
  }
  return {
    ok: true,
    admission: {
      known: resolution.known.map((e) => e.def).sort((a, b) => compareGoalVersionRefs(a, b)),
      supersededBy,
      byGoalId,
    },
  };
}
