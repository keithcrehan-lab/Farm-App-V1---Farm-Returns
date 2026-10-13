/**
 * Cattle C7 — declared health-programme definitions, their veterinary review
 * records and their admission at a knowledge cutoff.
 *
 * A health programme is explicitly DECLARED data — by a veterinarian (C0
 * classification `VETERINARY_PROGRAMME`, information class RULE) or by a
 * farmer (`FARMER_INTENT`, information class INTENT) — never inferred and
 * never a universal schedule. The engine ships with no programme, no
 * schedule, no product and no default (CAT-INV-027); every action kind,
 * product ref, offset, interval and count is exactly as declared.
 *
 * - Identity: `programmeId` + `version` (opaque, exact strings). Same identity
 *   + identical content (instants by instant) is idempotent; same identity +
 *   different content — an invalid copy included — fails closed
 *   (CAT-INV-008). Every known version of one programme shares its
 *   classification (a farmer record can never revise a veterinary programme).
 * - Valid time: `[validFrom, validTo)` (inclusive / exclusive, `validTo: null`
 *   = open). Knowledge time: `provenance.receivedAt`.
 * - Supersession at an effective boundary: a version naming earlier versions
 *   in `supersedesVersions` takes over from its own `validFrom`. At a cutoff a
 *   version's EFFECTIVE period is `[validFrom, min(validTo, validFrom of each
 *   known direct superseder))`, so a revision received later never changes a
 *   historical cutoff, and history before the revision's start keeps the
 *   earlier version. Exactly one version effective at `effectiveAt` governs;
 *   more than one is a version conflict with no winner (CAT-INV-026); none is
 *   "not in force".
 * - Schedule: offsets / interval are C2 `ObligationOffset`s (whole `DAY` /
 *   `HOUR`), `dueAfter > opensAfter`, `1 <= count <=
 *   PROGRAMME_MAX_OCCURRENCES_PER_ACTION`, and successive repeat windows may
 *   not overlap (interval ≥ window length; > for an inclusive end), so
 *   declared-criteria matching is never ambiguous between occurrences.
 * - Completion criteria: an administration criterion needs a product ref, an
 *   event criterion a non-empty event-type list; otherwise only explicit
 *   links / declarations complete an action.
 * - Classification ⇔ declarer: `VETERINARY_PROGRAMME` only from a
 *   `VETERINARIAN`, `FARMER_INTENT` only from a `FARMER`; `LEGAL_*` and every
 *   other C0 classification are rejected. A `FARMER_INTENT` action can never
 *   be a hard gate (C0: intent is never a hard gate).
 * - Review: the required review dimensions are C0's
 *   `MINIMUM_REVIEW_DIMENSIONS[classification]` (veterinary programme ⇒
 *   VETERINARY; farmer intent ⇒ none). A review binds the exact programme id,
 *   version and `CATTLE_PROGRAMME_DEFINITION` fingerprint; approval of one
 *   version never approves another (CAT-INV-025). Reviews are append-only
 *   (`supersedes`); a dimension is APPROVED only when at least one live bound
 *   review exists and every live bound review approves, REJECTED when any
 *   live bound review rejects, otherwise PENDING — no latest-wins. A version
 *   is APPROVED when its `productionState` is C0 `PRODUCTION` and every
 *   required dimension is APPROVED; otherwise the programme is
 *   REVIEW_REQUIRED.
 *
 * Admission order (TEMPORAL_EVIDENCE.md), for definitions (`receivedAt`) and
 * reviews (`reviewedAt`): a readable knowledge time after the cutoff sets the
 * record aside before any other read (CAT-INV-003/004); an unreadable one is
 * kept and fails closed (CAT-INV-005); identity among admitted records before
 * validity (CAT-INV-008); content and provenance validation (CAT-INV-022/024);
 * supersession at the cutoff through C2 `collectBitemporalRecords` /
 * `resolveBitemporalRecords` (unknown target, out-of-scope link or cycle
 * fails closed). Readers trust already-canonical input; public entry points
 * run the canonical boundary first.
 */

import { canonicalizeValue, type AssessmentFingerprint } from "../../assessment-integrity";
import {
  ANIMAL_DATA_SOURCE_CATEGORIES,
  BIOLOGICAL_SEXES,
  compareInstants,
  deepFreezeAnimalValue,
  isOpaqueRef,
  isValidAnimalInstant,
  type AnimalDataSourceCategory,
  type BiologicalSex,
} from "../animal-ledger";
import { compareStrings, sameFingerprint, sortedUnique, type CattleHash } from "../integrity";
import {
  MINIMUM_REVIEW_DIMENSIONS,
  isValidCalendarDate,
  type CattleReviewDimension,
  type CattleRuleGateRole,
  type CattleRuleProductionState,
  type ReviewDimensionState,
} from "../rule";
import type { SourceVersionRef } from "../source";
import { canonicalField, toCanonicalPlainData } from "../regulatory/canonical-input";
import { collectBitemporalRecords, resolveBitemporalRecords, type BitemporalRecord } from "../regulatory/bitemporal-records";
import { canonicalObligationInstant, isValidObligationOffset, obligationOffsetSeconds, type ObligationOffset } from "../regulatory/obligation-time";
import { fingerprintOf, hasOnlyFields, isRecord, nullableRef, oneOf, rawIdentityKey, sourceVersionRefOf, type Raw } from "../health/health-input";
import { VETERINARY_EVENT_TYPES, type VeterinaryEventType } from "../health/health-records";
import { computeProgrammeFingerprint } from "./programme-integrity";

/**
 * The production programme catalogue ships EMPTY (CAT-INV-027): real
 * programme content arrives only through a separately authorised,
 * evidence-reviewed task. Evaluating it yields outcome `NO_PROGRAMME`.
 */
export const PRODUCTION_HEALTH_PROGRAMME_DEFINITIONS: readonly unknown[] = Object.freeze([]);

/** The only C0 classifications a declared health programme may carry. */
export const PROGRAMME_CLASSIFICATIONS = ["FARMER_INTENT", "VETERINARY_PROGRAMME"] as const;
export type ProgrammeClassification = (typeof PROGRAMME_CLASSIFICATIONS)[number];

export const PROGRAMME_DECLARER_ROLES = ["FARMER", "VETERINARIAN"] as const;
export type ProgrammeDeclarerRole = (typeof PROGRAMME_DECLARER_ROLES)[number];

/** Who must declare each classification (and vice versa). */
export const PROGRAMME_CLASSIFICATION_DECLARER: Readonly<Record<ProgrammeClassification, ProgrammeDeclarerRole>> = Object.freeze({
  FARMER_INTENT: "FARMER",
  VETERINARY_PROGRAMME: "VETERINARIAN",
});

export const PROGRAMME_ANCHOR_KINDS = ["DATE_OF_BIRTH", "FIXED_INSTANT"] as const;
export type ProgrammeAnchorKind = (typeof PROGRAMME_ANCHOR_KINDS)[number];

/** Window boundary conventions (C2 vocabulary). */
export const PROGRAMME_WINDOW_BOUNDARIES = ["INCLUSIVE_START_EXCLUSIVE_END", "INCLUSIVE_START_INCLUSIVE_END"] as const;
export type ProgrammeWindowBoundary = (typeof PROGRAMME_WINDOW_BOUNDARIES)[number];

/** C3 record kinds that may evidence completion of a programme action. */
export const PROGRAMME_COMPLETION_RECORD_KINDS = ["MEDICINE_ADMINISTRATION", "VETERINARY_EVENT"] as const;
export type ProgrammeCompletionRecordKind = (typeof PROGRAMME_COMPLETION_RECORD_KINDS)[number];

/** Review dimensions a programme review may carry (C0 dimension vocabulary). */
export const PROGRAMME_REVIEW_DIMENSIONS = ["VETERINARY"] as const;

/**
 * Engine resource bound on declared occurrences per action (derivation is
 * eager). It is an implementation limit, not a veterinary value; a larger
 * declared count is rejected, never truncated.
 */
export const PROGRAMME_MAX_OCCURRENCES_PER_ACTION = 1000;

const PRODUCTION_STATES: readonly CattleRuleProductionState[] = ["RESEARCH", "DRAFT", "VALIDATED", "APPROVED", "PRODUCTION", "SUPERSEDED", "BLOCKED"];
const GATE_ROLES: readonly CattleRuleGateRole[] = ["HARD_GATE", "ADVISORY"];

export interface ProgrammeDeclarer {
  role: ProgrammeDeclarerRole;
  actor: string;
}

export interface ProgrammeProvenance {
  sourceCategory: AnimalDataSourceCategory;
  sourceSystem: string | null;
  sourceRecordRef: string | null;
  /** KNOWLEDGE time (canonical spelling once materialised). */
  receivedAt: string;
  /** Optional C0 binding of the programme document (fingerprint shape validated). */
  sourceDocument: SourceVersionRef | null;
}

/** Applicability: an explicit animal set, a C4 group scope, or declared criteria over KNOWN C1 facts. */
export type ProgrammeApplicability =
  | { kind: "EXPLICIT_SET"; animalIds: string[] }
  | { kind: "GROUP"; groupRef: string }
  | {
      kind: "CRITERIA";
      /** C1 `SEX` must be KNOWN and equal (`null` = no criterion). */
      sex: BiologicalSex | null;
      /** C1 `DATE_OF_BIRTH` must be KNOWN and `>=` this calendar date (`null` = no criterion). */
      bornOnOrAfter: string | null;
      /** C1 `DATE_OF_BIRTH` must be KNOWN and `<` this calendar date (`null` = no criterion). */
      bornBefore: string | null;
    };

export type ProgrammeAnchor = { kind: "FIXED_INSTANT"; at: string } | { kind: "DATE_OF_BIRTH" };

export interface ProgrammeSchedule {
  anchor: ProgrammeAnchor;
  /** Occurrence n's base is `anchor + n × repeat.interval`; its window `[base + opensAfter, base + dueAfter)` per `boundary`. */
  window: { opensAfter: ObligationOffset; dueAfter: ObligationOffset; boundary: ProgrammeWindowBoundary };
  /** `null` = a single occurrence. */
  repeat: { interval: ObligationOffset; count: number } | null;
}

export interface ProgrammeProductRef {
  /** Opaque C3 `AuthorisedProductRecord.productId`, matched exactly. */
  productId: string;
  /** When set, the C3 binding must be BOUND to exactly this product version. */
  productVersion: string | null;
}

export interface ProgrammeCompletionCriteria {
  /** The C3 record kind that may evidence completion; `null` = only direct completion declarations. */
  recordKind: ProgrammeCompletionRecordKind | null;
  /** VETERINARY_EVENT only: the accepted C3 event types (sorted). */
  eventTypes: VeterinaryEventType[] | null;
  /** `true` = C3 records of `recordKind` matching the product ref / event types inside the window complete it without an explicit link. */
  matchCriteria: boolean;
}

export interface ProgrammeAction {
  actionId: string;
  /** Opaque, as declared (no built-in meaning). */
  actionKind: string;
  productRef: ProgrammeProductRef | null;
  schedule: ProgrammeSchedule;
  completion: ProgrammeCompletionCriteria;
  /** Requested hard-gate rule ids (C2 / C3 projections) that must PASS (or be NOT_APPLICABLE) before an open occurrence can be acted on. Sorted. */
  gates: string[];
  gateRole: CattleRuleGateRole;
}

export interface HealthProgrammeDefinition {
  programmeId: string;
  version: string;
  /** Earlier versions of the same programme this version takes over from (sorted). */
  supersedesVersions: string[];
  classification: ProgrammeClassification;
  declaredBy: ProgrammeDeclarer;
  /** VALID time: inclusive start, exclusive end (`null` = open). */
  validFrom: string;
  validTo: string | null;
  applicability: ProgrammeApplicability;
  /** Sorted by `actionId`. */
  actions: ProgrammeAction[];
  /** C0 lifecycle; only PRODUCTION can be APPROVED. */
  productionState: CattleRuleProductionState;
  provenance: ProgrammeProvenance;
}

export interface ProgrammeVersionRef {
  programmeId: string;
  version: string;
}

export interface ProgrammeReviewRecord {
  reviewId: string;
  programmeId: string;
  programmeVersion: string;
  /** `CATTLE_PROGRAMME_DEFINITION` fingerprint of the exact content reviewed. */
  definitionFingerprint: AssessmentFingerprint;
  dimension: CattleReviewDimension;
  decision: "APPROVED" | "REJECTED";
  reviewer: { role: "VETERINARIAN"; actor: string };
  /** KNOWLEDGE time (canonical spelling once materialised). */
  reviewedAt: string;
  /** Earlier review ids (same programme version and dimension) this review replaces (sorted). */
  supersedes: string[];
}

export interface ProgrammeReviewState {
  productionState: CattleRuleProductionState;
  dimensions: { dimension: CattleReviewDimension; state: ReviewDimensionState; reviewIds: string[] }[];
  approved: boolean;
}

export type ProgrammeRecordIssueCode =
  | "CATTLE_PROGRAMME_DEFINITION_NOT_OBJECT"
  | "CATTLE_PROGRAMME_DEFINITION_INVALID_IDENTITY"
  | "CATTLE_PROGRAMME_DEFINITION_INVALID_KNOWLEDGE_TIME"
  | "CATTLE_PROGRAMME_DEFINITION_INVALID_PROVENANCE"
  | "CATTLE_PROGRAMME_DEFINITION_INVALID_DECLARER"
  | "CATTLE_PROGRAMME_DEFINITION_INVALID_CLASSIFICATION"
  | "CATTLE_PROGRAMME_DEFINITION_INVALID_PERIOD"
  | "CATTLE_PROGRAMME_DEFINITION_INVALID_APPLICABILITY"
  | "CATTLE_PROGRAMME_DEFINITION_INVALID_ACTIONS"
  | "CATTLE_PROGRAMME_DEFINITION_INVALID_CONTENT"
  | "CATTLE_PROGRAMME_DEFINITION_SELF_SUPERSESSION"
  | "CATTLE_PROGRAMME_DEFINITION_DUPLICATE_VERSION_DIFFERENT_CONTENT"
  | "CATTLE_PROGRAMME_DEFINITION_IDENTITY_SCOPE_MISMATCH"
  | "CATTLE_PROGRAMME_DEFINITION_SUPERSESSION_TARGET_NOT_KNOWN"
  | "CATTLE_PROGRAMME_DEFINITION_SUPERSESSION_OUT_OF_SCOPE"
  | "CATTLE_PROGRAMME_DEFINITION_SUPERSESSION_CYCLE"
  | "CATTLE_PROGRAMME_REVIEW_NOT_OBJECT"
  | "CATTLE_PROGRAMME_REVIEW_INVALID_IDENTITY"
  | "CATTLE_PROGRAMME_REVIEW_INVALID_KNOWLEDGE_TIME"
  | "CATTLE_PROGRAMME_REVIEW_INVALID_CONTENT"
  | "CATTLE_PROGRAMME_REVIEW_SELF_SUPERSESSION"
  | "CATTLE_PROGRAMME_REVIEW_DUPLICATE_ID_DIFFERENT_CONTENT"
  | "CATTLE_PROGRAMME_REVIEW_SUPERSESSION_TARGET_NOT_KNOWN"
  | "CATTLE_PROGRAMME_REVIEW_SUPERSESSION_OUT_OF_SCOPE"
  | "CATTLE_PROGRAMME_REVIEW_SUPERSESSION_CYCLE";

export interface ProgrammeRecordIssue {
  code: ProgrammeRecordIssueCode;
  /** `programmeId@version` / review id / record id when readable. */
  ref: string | null;
}

export function programmeVersionRef(d: HealthProgrammeDefinition): ProgrammeVersionRef {
  return { programmeId: d.programmeId, version: d.version };
}

export function compareProgrammeVersionRefs(a: ProgrammeVersionRef, b: ProgrammeVersionRef): number {
  return compareStrings(a.programmeId, b.programmeId) || compareStrings(a.version, b.version);
}

/** C0 information class of a programme: a veterinary programme is a RULE, a farmer programme is INTENT. */
export function programmeInformationClass(classification: ProgrammeClassification): "RULE" | "INTENT" {
  return classification === "VETERINARY_PROGRAMME" ? "RULE" : "INTENT";
}

export function uniqueProgrammeIssues<I extends { code: string; ref: string | null }>(issues: readonly I[]): I[] {
  const unique = new Map(issues.map((i) => [`${i.ref ?? ""}\u0000${i.code}`, i]));
  return [...unique.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, i]) => i);
}

// ---------------------------------------------------------------------------
// Readers (canonical plain data; shape only, never repaired)
// ---------------------------------------------------------------------------

export const canonicalInstant = (value: unknown): string | null => (isValidAnimalInstant(value) ? canonicalObligationInstant(value) : null);

/** A sorted, duplicate-free list of opaque refs (`undefined` = empty); anything else ⇒ `null`. */
export function refListOf(raw: unknown, allowEmpty = true): string[] | null {
  const list = raw ?? [];
  if (!Array.isArray(list) || !list.every(isOpaqueRef) || new Set(list).size !== list.length || (!allowEmpty && list.length === 0)) return null;
  return [...(list as string[])].sort(compareStrings);
}

export function receivedAfter(raw: unknown, path: readonly string[], knowledgeCutoff: string): boolean {
  const t = canonicalField(raw, ...path);
  return isValidAnimalInstant(t) && compareInstants(t, knowledgeCutoff) > 0;
}

function provenanceOf(raw: unknown): ProgrammeProvenance | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["sourceCategory", "sourceSystem", "sourceRecordRef", "receivedAt", "sourceDocument"])) return null;
  const system = nullableRef(raw.sourceSystem);
  const recordRef = nullableRef(raw.sourceRecordRef);
  const receivedAt = canonicalInstant(raw.receivedAt);
  const doc = raw.sourceDocument ?? null;
  const sourceDocument = doc === null ? null : sourceVersionRefOf(doc);
  if (!oneOf(ANIMAL_DATA_SOURCE_CATEGORIES, raw.sourceCategory) || !system.ok || !recordRef.ok || receivedAt === null || (doc !== null && sourceDocument === null)) return null;
  return { sourceCategory: raw.sourceCategory, sourceSystem: system.value, sourceRecordRef: recordRef.value, receivedAt, sourceDocument };
}

function declarerOf(raw: unknown): ProgrammeDeclarer | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["role", "actor"]) || !oneOf(PROGRAMME_DECLARER_ROLES, raw.role) || !isOpaqueRef(raw.actor)) return null;
  return { role: raw.role, actor: raw.actor };
}

function nullableDate(raw: unknown): { ok: boolean; value: string | null } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  return typeof raw === "string" && isValidCalendarDate(raw) ? { ok: true, value: raw } : { ok: false, value: null };
}

function applicabilityOf(raw: unknown): ProgrammeApplicability | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "EXPLICIT_SET" && hasOnlyFields(raw, ["kind", "animalIds"])) {
    const animalIds = refListOf(raw.animalIds, false);
    return animalIds === null ? null : { kind: "EXPLICIT_SET", animalIds };
  }
  if (raw.kind === "GROUP" && hasOnlyFields(raw, ["kind", "groupRef"]) && isOpaqueRef(raw.groupRef)) return { kind: "GROUP", groupRef: raw.groupRef };
  if (raw.kind === "CRITERIA" && hasOnlyFields(raw, ["kind", "sex", "bornOnOrAfter", "bornBefore"])) {
    const sex = raw.sex ?? null;
    const from = nullableDate(raw.bornOnOrAfter);
    const before = nullableDate(raw.bornBefore);
    if ((sex !== null && !oneOf(BIOLOGICAL_SEXES, sex)) || !from.ok || !before.ok) return null;
    if (sex === null && from.value === null && before.value === null) return null; // no criterion declared
    if (from.value !== null && before.value !== null && compareStrings(from.value, before.value) >= 0) return null;
    return { kind: "CRITERIA", sex: sex as BiologicalSex | null, bornOnOrAfter: from.value, bornBefore: before.value };
  }
  return null;
}

function offsetOf(raw: unknown): ObligationOffset | null {
  return isRecord(raw) && hasOnlyFields(raw, ["amount", "unit"]) && isValidObligationOffset(raw) ? { amount: raw.amount as number, unit: raw.unit as ObligationOffset["unit"] } : null;
}

function scheduleOf(raw: unknown): ProgrammeSchedule | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["anchor", "window", "repeat"]) || !isRecord(raw.anchor) || !isRecord(raw.window)) return null;
  let anchor: ProgrammeAnchor;
  if (raw.anchor.kind === "DATE_OF_BIRTH" && hasOnlyFields(raw.anchor, ["kind"])) anchor = { kind: "DATE_OF_BIRTH" };
  else if (raw.anchor.kind === "FIXED_INSTANT" && hasOnlyFields(raw.anchor, ["kind", "at"]) && canonicalInstant(raw.anchor.at) !== null) anchor = { kind: "FIXED_INSTANT", at: canonicalInstant(raw.anchor.at) as string };
  else return null;
  const w = raw.window;
  if (!hasOnlyFields(w, ["opensAfter", "dueAfter", "boundary"])) return null;
  const opensAfter = offsetOf(w.opensAfter);
  const dueAfter = offsetOf(w.dueAfter);
  if (opensAfter === null || dueAfter === null || !oneOf(PROGRAMME_WINDOW_BOUNDARIES, w.boundary) || obligationOffsetSeconds(dueAfter) <= obligationOffsetSeconds(opensAfter)) return null;
  const r = raw.repeat ?? null;
  let repeat: ProgrammeSchedule["repeat"] = null;
  if (r !== null) {
    if (!isRecord(r) || !hasOnlyFields(r, ["interval", "count"])) return null;
    const interval = offsetOf(r.interval);
    const count = r.count;
    if (interval === null || interval.amount === 0 || !Number.isSafeInteger(count) || (count as number) < 1 || (count as number) > PROGRAMME_MAX_OCCURRENCES_PER_ACTION) return null;
    if (!Number.isSafeInteger(interval.amount * ((count as number) - 1))) return null;
    // Successive windows must not overlap, so a C3 record inside a window can match one occurrence only.
    const length = obligationOffsetSeconds(dueAfter) - obligationOffsetSeconds(opensAfter);
    const step = obligationOffsetSeconds(interval);
    if ((count as number) > 1 && (step < length || (step === length && w.boundary === "INCLUSIVE_START_INCLUSIVE_END"))) return null;
    repeat = { interval, count: count as number };
  }
  return { anchor, window: { opensAfter, dueAfter, boundary: w.boundary }, repeat };
}

function productRefOf(raw: unknown): { ok: boolean; value: ProgrammeProductRef | null } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (!isRecord(raw) || !hasOnlyFields(raw, ["productId", "productVersion"]) || !isOpaqueRef(raw.productId)) return { ok: false, value: null };
  const version = nullableRef(raw.productVersion);
  return version.ok ? { ok: true, value: { productId: raw.productId, productVersion: version.value } } : { ok: false, value: null };
}

function completionOf(raw: unknown, productRef: ProgrammeProductRef | null): ProgrammeCompletionCriteria | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["recordKind", "eventTypes", "matchCriteria"]) || typeof raw.matchCriteria !== "boolean") return null;
  const recordKind = raw.recordKind ?? null;
  if (recordKind !== null && !oneOf(PROGRAMME_COMPLETION_RECORD_KINDS, recordKind)) return null;
  const rawTypes = raw.eventTypes ?? null;
  let eventTypes: VeterinaryEventType[] | null = null;
  if (recordKind === "VETERINARY_EVENT") {
    if (!Array.isArray(rawTypes) || rawTypes.length === 0 || !rawTypes.every((t) => oneOf(VETERINARY_EVENT_TYPES, t)) || new Set(rawTypes).size !== rawTypes.length) return null;
    eventTypes = [...(rawTypes as VeterinaryEventType[])].sort(compareStrings);
  } else if (rawTypes !== null) {
    return null;
  }
  // Declared criteria are product ref + window (administrations) or event types + window (events); none ⇒ explicit links only.
  if (raw.matchCriteria && (recordKind === null || (recordKind === "MEDICINE_ADMINISTRATION" && productRef === null))) return null;
  return { recordKind: recordKind as ProgrammeCompletionRecordKind | null, eventTypes, matchCriteria: raw.matchCriteria };
}

const ACTION_FIELDS = ["actionId", "actionKind", "productRef", "schedule", "completion", "gates", "gateRole"];

function actionsOf(raw: unknown, classification: unknown): ProgrammeAction[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ProgrammeAction[] = [];
  for (const a of raw) {
    if (!isRecord(a) || !hasOnlyFields(a, ACTION_FIELDS) || !isOpaqueRef(a.actionId) || !isOpaqueRef(a.actionKind) || !oneOf(GATE_ROLES, a.gateRole)) return null;
    if (classification === "FARMER_INTENT" && a.gateRole === "HARD_GATE") return null;
    const productRef = productRefOf(a.productRef);
    const schedule = scheduleOf(a.schedule);
    const completion = productRef.ok ? completionOf(a.completion, productRef.value) : null;
    const gates = refListOf(a.gates);
    if (!productRef.ok || schedule === null || completion === null || gates === null) return null;
    out.push({ actionId: a.actionId, actionKind: a.actionKind, productRef: productRef.value, schedule, completion, gates, gateRole: a.gateRole });
  }
  if (new Set(out.map((a) => a.actionId)).size !== out.length) return null;
  return out.sort((x, y) => compareStrings(x.actionId, y.actionId));
}

const DEFINITION_FIELDS = [
  "programmeId",
  "version",
  "supersedesVersions",
  "classification",
  "declaredBy",
  "validFrom",
  "validTo",
  "applicability",
  "actions",
  "productionState",
  "provenance",
];

/** `programmeId@version` when both are readable (diagnostics only). */
export function programmeDisplayRef(raw: unknown): string | null {
  return isRecord(raw) && isOpaqueRef(raw.programmeId) && isOpaqueRef(raw.version) ? `${raw.programmeId}@${raw.version}` : null;
}

type DefinitionMaterialised = { ok: true; definition: HealthProgrammeDefinition } | { ok: false; ref: string | null; codes: ProgrammeRecordIssueCode[] };

/** Validates one already-canonical definition (module-internal). */
export function materialiseProgrammeDefinition(raw: unknown): DefinitionMaterialised {
  if (!isRecord(raw)) return { ok: false, ref: null, codes: ["CATTLE_PROGRAMME_DEFINITION_NOT_OBJECT"] };
  const ref = programmeDisplayRef(raw);
  const codes: ProgrammeRecordIssueCode[] = [];
  if (!hasOnlyFields(raw, DEFINITION_FIELDS) || !oneOf(PRODUCTION_STATES, raw.productionState)) codes.push("CATTLE_PROGRAMME_DEFINITION_INVALID_CONTENT");
  if (ref === null) codes.push("CATTLE_PROGRAMME_DEFINITION_INVALID_IDENTITY");
  if (!isValidAnimalInstant(canonicalField(raw, "provenance", "receivedAt"))) codes.push("CATTLE_PROGRAMME_DEFINITION_INVALID_KNOWLEDGE_TIME");
  const provenance = provenanceOf(raw.provenance);
  if (provenance === null) codes.push("CATTLE_PROGRAMME_DEFINITION_INVALID_PROVENANCE");
  const declaredBy = declarerOf(raw.declaredBy);
  if (declaredBy === null) codes.push("CATTLE_PROGRAMME_DEFINITION_INVALID_DECLARER");
  const classification = oneOf(PROGRAMME_CLASSIFICATIONS, raw.classification) ? raw.classification : null;
  if (classification === null || (declaredBy !== null && PROGRAMME_CLASSIFICATION_DECLARER[classification] !== declaredBy.role)) codes.push("CATTLE_PROGRAMME_DEFINITION_INVALID_CLASSIFICATION");
  const supersedes = refListOf(raw.supersedesVersions);
  if (supersedes === null) codes.push("CATTLE_PROGRAMME_DEFINITION_INVALID_CONTENT");
  else if (supersedes.includes(raw.version as string)) codes.push("CATTLE_PROGRAMME_DEFINITION_SELF_SUPERSESSION");
  const validFrom = canonicalInstant(raw.validFrom);
  const rawTo = raw.validTo ?? null;
  const validTo = rawTo === null ? null : (canonicalInstant(rawTo) ?? undefined);
  if (validFrom === null || validTo === undefined || (validTo !== null && compareInstants(validFrom, validTo) >= 0)) codes.push("CATTLE_PROGRAMME_DEFINITION_INVALID_PERIOD");
  const applicability = applicabilityOf(raw.applicability);
  if (applicability === null) codes.push("CATTLE_PROGRAMME_DEFINITION_INVALID_APPLICABILITY");
  const actions = actionsOf(raw.actions, raw.classification);
  if (actions === null) codes.push("CATTLE_PROGRAMME_DEFINITION_INVALID_ACTIONS");
  if (
    codes.length > 0 ||
    ref === null ||
    provenance === null ||
    declaredBy === null ||
    classification === null ||
    supersedes === null ||
    validFrom === null ||
    validTo === undefined ||
    applicability === null ||
    actions === null
  ) {
    return { ok: false, ref, codes: sortedUnique(codes) as ProgrammeRecordIssueCode[] };
  }
  return {
    ok: true,
    definition: {
      programmeId: raw.programmeId as string,
      version: raw.version as string,
      supersedesVersions: supersedes,
      classification,
      declaredBy,
      validFrom,
      validTo,
      applicability,
      actions,
      productionState: raw.productionState as CattleRuleProductionState,
      provenance,
    },
  };
}

/**
 * The reviewed content of a version (`CATTLE_PROGRAMME_DEFINITION`, semantic):
 * everything except the lifecycle state, the supersession links and the
 * knowledge-time provenance (C0 precedent: the rule fingerprint excludes the
 * production state). The programme document binding is reviewed content.
 */
export function definitionReviewPayload(d: HealthProgrammeDefinition): unknown {
  return {
    programmeId: d.programmeId,
    version: d.version,
    classification: d.classification,
    declaredBy: d.declaredBy,
    validFrom: d.validFrom,
    validTo: d.validTo,
    applicability: d.applicability,
    actions: d.actions,
    sourceDocument: d.provenance.sourceDocument,
  };
}

export function definitionFingerprint(d: HealthProgrammeDefinition, hash: CattleHash): AssessmentFingerprint {
  return computeProgrammeFingerprint("CATTLE_PROGRAMME_DEFINITION", definitionReviewPayload(d), hash);
}

/**
 * The `CATTLE_PROGRAMME_DEFINITION` fingerprint a reviewer binds to. The
 * definition must be canonical plain data and valid; otherwise `null`.
 */
export function computeProgrammeDefinitionFingerprint(definition: unknown, hash: CattleHash): AssessmentFingerprint | null {
  const canonical = toCanonicalPlainData(definition);
  if (!canonical.ok) return null;
  const m = materialiseProgrammeDefinition(canonical.value);
  return m.ok ? deepFreezeAnimalValue(definitionFingerprint(m.definition, hash)) : null;
}

const REVIEW_FIELDS = ["reviewId", "programmeId", "programmeVersion", "definitionFingerprint", "dimension", "decision", "reviewer", "reviewedAt", "supersedes"];

type ReviewMaterialised = { ok: true; review: ProgrammeReviewRecord } | { ok: false; ref: string | null; codes: ProgrammeRecordIssueCode[] };

function materialiseReview(raw: unknown): ReviewMaterialised {
  if (!isRecord(raw)) return { ok: false, ref: null, codes: ["CATTLE_PROGRAMME_REVIEW_NOT_OBJECT"] };
  const ref = isOpaqueRef(raw.reviewId) ? raw.reviewId : null;
  const codes: ProgrammeRecordIssueCode[] = [];
  if (ref === null) codes.push("CATTLE_PROGRAMME_REVIEW_INVALID_IDENTITY");
  const reviewedAt = canonicalInstant(raw.reviewedAt);
  if (reviewedAt === null) codes.push("CATTLE_PROGRAMME_REVIEW_INVALID_KNOWLEDGE_TIME");
  const fp = fingerprintOf(raw.definitionFingerprint);
  const reviewer = raw.reviewer;
  const reviewerOk = isRecord(reviewer) && hasOnlyFields(reviewer, ["role", "actor"]) && reviewer.role === "VETERINARIAN" && isOpaqueRef(reviewer.actor);
  const supersedes = refListOf(raw.supersedes);
  if (
    !hasOnlyFields(raw, REVIEW_FIELDS) ||
    !isOpaqueRef(raw.programmeId) ||
    !isOpaqueRef(raw.programmeVersion) ||
    fp === null ||
    !oneOf(PROGRAMME_REVIEW_DIMENSIONS, raw.dimension) ||
    !oneOf(["APPROVED", "REJECTED"] as const, raw.decision) ||
    !reviewerOk ||
    supersedes === null
  ) {
    codes.push("CATTLE_PROGRAMME_REVIEW_INVALID_CONTENT");
  } else if (ref !== null && supersedes.includes(ref)) {
    codes.push("CATTLE_PROGRAMME_REVIEW_SELF_SUPERSESSION");
  }
  if (codes.length > 0 || ref === null || reviewedAt === null || fp === null || supersedes === null || !isRecord(reviewer)) return { ok: false, ref, codes };
  return {
    ok: true,
    review: {
      reviewId: ref,
      programmeId: raw.programmeId as string,
      programmeVersion: raw.programmeVersion as string,
      definitionFingerprint: fp,
      dimension: raw.dimension as CattleReviewDimension,
      decision: raw.decision as "APPROVED" | "REJECTED",
      reviewer: { role: "VETERINARIAN", actor: reviewer.actor as string },
      reviewedAt,
      supersedes,
    },
  };
}

// ---------------------------------------------------------------------------
// Admission and resolution at a knowledge cutoff
// ---------------------------------------------------------------------------

export interface ProgrammeVersionHistory {
  definition: HealthProgrammeDefinition;
  recordState: "LIVE" | "SUPERSEDED";
  /** Known versions taking over from this one (sorted). */
  supersededBy: string[];
  /** Effective period at the cutoff: `[validFrom, effectiveTo)`; `effectiveTo: null` = open. Empty when `effectiveTo <= validFrom`. */
  effectiveFrom: string;
  effectiveTo: string | null;
}

export type ProgrammeVersionResolution =
  | { state: "GOVERNING"; version: ProgrammeVersionHistory }
  | { state: "NOT_IN_FORCE" }
  | { state: "VERSION_CONFLICT"; versions: ProgrammeVersionHistory[] };

export interface ProgrammeAdmission {
  /** programmeId → every known version (sorted by version). */
  programmes: ReadonlyMap<string, ProgrammeVersionHistory[]>;
}

export type ProgrammeAdmissionResult = { ok: true; admission: ProgrammeAdmission } | { ok: false; issues: ProgrammeRecordIssue[] };

const versionKey = (programmeId: string, version: string): string => JSON.stringify([programmeId, version]);

const LINK_CODE = {
  CATTLE_RECORD_SUPERSESSION_TARGET_NOT_KNOWN: "SUPERSESSION_TARGET_NOT_KNOWN",
  CATTLE_RECORD_SUPERSESSION_OUT_OF_SCOPE: "SUPERSESSION_OUT_OF_SCOPE",
  CATTLE_RECORD_SUPERSESSION_CYCLE: "SUPERSESSION_CYCLE",
} as const;

/** Admits already-canonical definitions at `knowledgeCutoff` (module-internal). */
export function admitProgrammeDefinitions(raws: readonly unknown[], knowledgeCutoff: string): ProgrammeAdmissionResult {
  const admitted = raws.filter((raw) => !receivedAfter(raw, ["provenance", "receivedAt"], knowledgeCutoff));
  const materialised = admitted.map((raw) => ({ raw, result: materialiseProgrammeDefinition(raw) }));
  const issues: ProgrammeRecordIssue[] = [];
  // Identity before validity (CAT-INV-008): an invalid copy still collides.
  const byIdentity = new Map<string, { ref: string; keys: Set<string> }>();
  for (const { raw, result } of materialised) {
    const ref = programmeDisplayRef(raw);
    if (ref === null) continue;
    const identity = versionKey((raw as Raw).programmeId as string, (raw as Raw).version as string);
    const key = result.ok ? `valid:${canonicalizeValue(result.definition)}` : `raw:${rawIdentityKey(raw)}`;
    const entry = byIdentity.get(identity) ?? { ref, keys: new Set<string>() };
    byIdentity.set(identity, { ref, keys: entry.keys.add(key) });
  }
  for (const { ref, keys } of byIdentity.values()) if (keys.size > 1) issues.push({ code: "CATTLE_PROGRAMME_DEFINITION_DUPLICATE_VERSION_DIFFERENT_CONTENT", ref });

  type Envelope = { def: HealthProgrammeDefinition } & BitemporalRecord;
  const envelopes: Envelope[] = [];
  for (const { result } of materialised) {
    if (!result.ok) {
      issues.push(...result.codes.map((code) => ({ code, ref: result.ref })));
      continue;
    }
    const d = result.definition;
    envelopes.push({
      def: d,
      recordId: versionKey(d.programmeId, d.version),
      supersedes: d.supersedesVersions.map((v) => versionKey(d.programmeId, v)).sort(compareStrings),
      receivedAt: d.provenance.receivedAt,
    });
  }
  const display = (recordId: string) => {
    const [id, version] = JSON.parse(recordId) as [string, string];
    return `${id}@${version}`;
  };
  const collected = collectBitemporalRecords(envelopes, (e) => canonicalizeValue(e.def));
  if (!collected.ok) {
    for (const i of collected.issues) {
      issues.push({
        code: i.code === "CATTLE_RECORD_SELF_SUPERSESSION" ? "CATTLE_PROGRAMME_DEFINITION_SELF_SUPERSESSION" : "CATTLE_PROGRAMME_DEFINITION_DUPLICATE_VERSION_DIFFERENT_CONTENT",
        ref: display(i.recordId),
      });
    }
  }
  if (issues.length > 0 || !collected.ok) return { ok: false, issues: uniqueProgrammeIssues(issues) };

  // Every known version of one programme shares its classification.
  const classes = new Map<string, Set<string>>();
  for (const e of collected.records) classes.set(e.def.programmeId, (classes.get(e.def.programmeId) ?? new Set<string>()).add(e.def.classification));
  for (const [programmeId, s] of classes) if (s.size > 1) issues.push({ code: "CATTLE_PROGRAMME_DEFINITION_IDENTITY_SCOPE_MISMATCH", ref: programmeId });
  if (issues.length > 0) return { ok: false, issues: uniqueProgrammeIssues(issues) };

  const resolution = resolveBitemporalRecords(collected.records, knowledgeCutoff, {
    linkAllowed: (source, target) => source.def.programmeId === target.def.programmeId,
    competitionKey: (e) => canonicalizeValue(e.def),
  });
  if (resolution.linkIssues.length > 0) {
    return {
      ok: false,
      issues: uniqueProgrammeIssues(resolution.linkIssues.map((i) => ({ code: `CATTLE_PROGRAMME_DEFINITION_${LINK_CODE[i.code]}` as ProgrammeRecordIssueCode, ref: display(i.recordId) }))),
    };
  }
  const byKey = new Map(resolution.known.map((e) => [e.recordId, e.def]));
  const programmes = new Map<string, ProgrammeVersionHistory[]>();
  for (const e of resolution.known) {
    const by = [...(resolution.supersededBy.get(e.recordId) ?? [])].map((id) => byKey.get(id)!);
    // Effective-boundary supersession: a superseder takes over from its own validFrom.
    let effectiveTo = e.def.validTo;
    for (const s of by) if (effectiveTo === null || compareInstants(s.validFrom, effectiveTo) < 0) effectiveTo = s.validFrom;
    const entry: ProgrammeVersionHistory = {
      definition: e.def,
      recordState: by.length > 0 ? "SUPERSEDED" : "LIVE",
      supersededBy: by.map((s) => s.version).sort(compareStrings),
      effectiveFrom: e.def.validFrom,
      effectiveTo,
    };
    programmes.set(e.def.programmeId, [...(programmes.get(e.def.programmeId) ?? []), entry]);
  }
  for (const list of programmes.values()) list.sort((a, b) => compareStrings(a.definition.version, b.definition.version));
  return { ok: true, admission: { programmes } };
}

export function versionEffectiveAt(v: Pick<ProgrammeVersionHistory, "effectiveFrom" | "effectiveTo">, at: string): boolean {
  return compareInstants(v.effectiveFrom, at) <= 0 && (v.effectiveTo === null || compareInstants(at, v.effectiveTo) < 0);
}

/** The version governing `effectiveAt` among a programme's known versions. */
export function resolveGoverningVersion(versions: readonly ProgrammeVersionHistory[], effectiveAt: string): ProgrammeVersionResolution {
  const covering = versions.filter((v) => versionEffectiveAt(v, effectiveAt));
  if (covering.length === 0) return { state: "NOT_IN_FORCE" };
  if (covering.length === 1) return { state: "GOVERNING", version: covering[0] };
  return { state: "VERSION_CONFLICT", versions: covering };
}

export type ReviewAdmissionResult = { ok: true; reviews: ProgrammeReviewRecord[] } | { ok: false; issues: ProgrammeRecordIssue[] };

/** Admits already-canonical review records at `knowledgeCutoff` and returns the LIVE ones (module-internal). */
export function admitProgrammeReviews(raws: readonly unknown[], knowledgeCutoff: string): ReviewAdmissionResult {
  const admitted = raws.filter((raw) => !receivedAfter(raw, ["reviewedAt"], knowledgeCutoff));
  const materialised = admitted.map((raw) => ({ raw, result: materialiseReview(raw) }));
  const issues: ProgrammeRecordIssue[] = [];
  const byId = new Map<string, Set<string>>();
  for (const { raw, result } of materialised) {
    if (!isRecord(raw) || !isOpaqueRef(raw.reviewId)) continue;
    const key = result.ok ? `valid:${canonicalizeValue(result.review)}` : `raw:${rawIdentityKey(raw)}`;
    byId.set(raw.reviewId, (byId.get(raw.reviewId) ?? new Set<string>()).add(key));
  }
  for (const [ref, keys] of byId) if (keys.size > 1) issues.push({ code: "CATTLE_PROGRAMME_REVIEW_DUPLICATE_ID_DIFFERENT_CONTENT", ref });
  const valid: (ProgrammeReviewRecord & BitemporalRecord)[] = [];
  for (const { result } of materialised) {
    if (!result.ok) issues.push(...result.codes.map((code) => ({ code, ref: result.ref })));
    else valid.push({ ...result.review, recordId: result.review.reviewId, receivedAt: result.review.reviewedAt });
  }
  const collected = collectBitemporalRecords(valid, (r) => canonicalizeValue(r));
  if (!collected.ok) {
    for (const i of collected.issues) {
      issues.push({ code: i.code === "CATTLE_RECORD_SELF_SUPERSESSION" ? "CATTLE_PROGRAMME_REVIEW_SELF_SUPERSESSION" : "CATTLE_PROGRAMME_REVIEW_DUPLICATE_ID_DIFFERENT_CONTENT", ref: i.recordId });
    }
  }
  if (issues.length > 0 || !collected.ok) return { ok: false, issues: uniqueProgrammeIssues(issues) };
  const resolution = resolveBitemporalRecords(collected.records, knowledgeCutoff, {
    linkAllowed: (s, t) => s.programmeId === t.programmeId && s.programmeVersion === t.programmeVersion && s.dimension === t.dimension,
    competitionKey: (r) => r.decision,
  });
  if (resolution.linkIssues.length > 0) {
    return { ok: false, issues: uniqueProgrammeIssues(resolution.linkIssues.map((i) => ({ code: `CATTLE_PROGRAMME_REVIEW_${LINK_CODE[i.code]}` as ProgrammeRecordIssueCode, ref: i.recordId }))) };
  }
  return {
    ok: true,
    reviews: resolution.live.map((r) => {
      const { recordId, receivedAt, ...review } = r;
      void recordId;
      void receivedAt;
      return review;
    }),
  };
}

/** Review state of one version from the live admitted reviews (precedence in the header). */
export function programmeReviewState(d: HealthProgrammeDefinition, fingerprint: AssessmentFingerprint, liveReviews: readonly ProgrammeReviewRecord[]): ProgrammeReviewState {
  const bound = liveReviews.filter((r) => r.programmeId === d.programmeId && r.programmeVersion === d.version && sameFingerprint(r.definitionFingerprint, fingerprint));
  const dimensions = [...MINIMUM_REVIEW_DIMENSIONS[d.classification]].sort(compareStrings).map((dimension) => {
    const records = bound.filter((r) => r.dimension === dimension);
    const state: ReviewDimensionState = records.length === 0 ? "PENDING" : records.some((r) => r.decision === "REJECTED") ? "REJECTED" : "APPROVED";
    return { dimension, state, reviewIds: records.map((r) => r.reviewId).sort(compareStrings) };
  });
  return { productionState: d.productionState, dimensions, approved: d.productionState === "PRODUCTION" && dimensions.every((x) => x.state === "APPROVED") };
}
