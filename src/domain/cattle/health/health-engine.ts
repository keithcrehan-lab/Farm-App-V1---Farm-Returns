/**
 * Cattle C3 — health and medicines engine: one animal's health timeline,
 * medicine ledger view and withdrawal hard-gate projection at an explicit
 * (`effectiveAt`, `knowledgeCutoff`). No clock is read; both times are strict
 * UTC and compared by instant (C1 `compareInstants`).
 *
 * Admission order (TEMPORAL_EVIDENCE.md):
 * 1. The whole request is checked with `toCanonicalPlainData`; non-canonical
 *    input is rejected (`CATTLE_HEALTH_NON_CANONICAL_INPUT`) before anything
 *    else, and only the detached deep-frozen copy is used.
 * 2. The query and the C1 ledger are validated (C1 `rematerialiseAnimalLedger`
 *    / `projectAnimalSnapshot`); the animal id is C1's, never re-derived.
 * 3. Health records whose readable `provenance.receivedAt` is after the cutoff
 *    and product records whose readable `retrievedAt`/`checkedAt` is after it
 *    are set aside unvalidated; an unreadable knowledge time fails closed.
 * 4. Identity among admitted records before validity: same id + different
 *    content (an invalid copy included) fails closed; identical duplicates
 *    (instants by instant) are idempotent.
 * 5. Content validation (malformed ⇒ `ok: false`, never repaired), including
 *    provenance and fingerprint shape (CAT-INV-024).
 * 6. Supersession at the cutoff (C2 `resolveBitemporalRecords`): a link to an
 *    unknown target, across kinds or in a cycle fails closed; competing live
 *    corrections are reported with no winner (CAT-INV-026).
 * 7. Valid-time view: records that occurred by `effectiveAt`, or whose time is
 *    unknown, are in view; later ones are listed as not yet occurred.
 * 8. Output rebuilt, sorted, deep-frozen and fingerprinted.
 *
 * Status precedence and REQUIRED inputs:
 * - Product binding (per administration; `authorised-product.ts`): requires a
 *   product id and exactly one live, ACTIVE, BOVINE-authorised product version
 *   known by the cutoff. UNKNOWN > INVALID > EVIDENCE_CONFLICT >
 *   REVIEW_REQUIRED > UNSUPPORTED > authorisation mismatch > BOUND.
 * - Withdrawal end (per administration and food product; `withdrawal.ts`):
 *   requires BOUND, a known administration instant, exactly one applicable
 *   period, a computable period and, for a multi-dose course, a supplied basis.
 *   Otherwise UNKNOWN (EVIDENCE_CONFLICT for a conflicting binding).
 * - Withdrawal gate (per food product): EVIDENCE_CONFLICT > UNKNOWN >
 *   IN_WITHDRAWAL > CLEAR. CLEAR (the only resolved-looking state) requires
 *   every considered administration's end to be KNOWN and not after
 *   `effectiveAt`, and no competing administration correction.
 */

import { canonicalizeValue, type AssessmentFingerprint, type FingerprintVerificationResult } from "../../assessment-integrity";
import { compareInstants, animalInstantKey, deepFreezeAnimalValue, isOpaqueRef, isValidAnimalInstant, rematerialiseAnimalLedger, type AnimalLedger, type AnimalLedgerIssue, type FarmReturnAnimalId } from "../animal-ledger";
import { computeAnimalSnapshotFingerprint, projectAnimalSnapshot } from "../animal-snapshot";
import type { CattleInformationClass } from "../information";
import { compareStrings, sortedUnique, type CattleHash } from "../integrity";
import { compareSourceVersionRefs, type SourceVersionRef } from "../source";
import { canonicalField, toCanonicalPlainData } from "../regulatory/canonical-input";
import { collectBitemporalRecords, resolveBitemporalRecords, type BitemporalRecord } from "../regulatory/bitemporal-records";
import { canonicalObligationInstant } from "../regulatory/obligation-time";
import {
  admitProductRecords,
  bindAdministrationProduct,
  compareProductVersionRefs,
  resolveProductRecords,
  type ProductBinding,
  type ProductRecordIssueCode,
  type ProductVersionRef,
} from "./authorised-product";
import { CATTLE_HEALTH_PAYLOAD_VERSION, computeHealthFingerprint, verifyHealthFingerprint } from "./health-integrity";
import {
  HEALTH_RECORD_KINDS,
  healthLinkAllowed,
  healthRecordClaimKey,
  healthRecordContentKey,
  healthRecordInformationClass,
  materialiseHealthRecord,
  semanticHealthRecord,
  type HealthRecord,
  type HealthRecordIssueCode,
  type HealthRecordKind,
  type MedicineAdministrationRecord,
} from "./health-records";
import { healthRecordIdOf, isRecord, oneOf, rawIdentityKey } from "./health-input";
import { computeAdministrationWithdrawal, foldWithdrawalGate, type AdministrationWithdrawal, type WithdrawalGateEntry, type WithdrawalGateState } from "./withdrawal";

export interface HealthTimelineFilter {
  /** `null` = every kind. */
  kinds: HealthRecordKind[] | null;
  /** Inclusive start of the occurred-at period; `null` = unbounded. */
  occurredFrom: string | null;
  /** Exclusive end of the occurred-at period; `null` = unbounded. */
  occurredTo: string | null;
}

export interface AnimalHealthQuery {
  effectiveAt: string;
  knowledgeCutoff: string;
  /** Opaque food-product codes to gate (non-empty, unique), matched exactly against product data. */
  foodProducts: string[];
  timelineFilter?: HealthTimelineFilter | null;
}

/** Every part must be canonical plain data (CAMPAIGN.md, "Canonical input contract"). */
export interface AnimalHealthRequest {
  ledger: AnimalLedger;
  healthRecords: readonly unknown[];
  productRecords: readonly unknown[];
  query: AnimalHealthQuery;
}

export type HealthRecordStatus = "LIVE" | "SUPERSEDED";

export interface HealthTimelineEntry {
  recordId: string;
  kind: HealthRecordKind;
  informationClass: CattleInformationClass | null;
  /** As supplied (`null` = unknown). */
  occurredAt: string | null;
  status: HealthRecordStatus;
  /** Known records superseding this one (sorted). */
  supersededBy: string[];
  /** A competing-correction branch involves this record. */
  inCompetition: boolean;
  record: HealthRecord;
}

export interface HealthCompetition {
  targetId: string;
  terminalIds: string[];
}

export interface HealthTimeline {
  filter: HealthTimelineFilter;
  /** Ordered by occurred-at instant (unknown time last), then record id. */
  entries: HealthTimelineEntry[];
  competitions: HealthCompetition[];
  /** Known records that occur after `effectiveAt` (not in this view). */
  notYetOccurredRecordIds: string[];
  /** Unknown-time records excluded by a period filter (never silently dropped). */
  unknownTimeRecordIdsOutsideFilter: string[];
  fingerprint: AssessmentFingerprint;
}

export interface MedicineLedgerEntry {
  recordId: string;
  occurredAt: string | null;
  status: HealthRecordStatus;
  supersededBy: string[];
  inCompetition: boolean;
  record: MedicineAdministrationRecord;
  /** Live administrations known in the same TREATMENT course (1 when none). */
  courseSize: number;
  /** A live TREATMENT record with `record.treatmentRecordId` is known. */
  treatmentRecordKnown: boolean;
  binding: ProductBinding;
  /** One per queried food product, in query order (sorted). */
  withdrawals: AdministrationWithdrawal[];
}

export interface MedicineLedgerView {
  /** Chronological (administration instant, unknown last), then record id; superseded history included. */
  entries: MedicineLedgerEntry[];
  productVersionsUsed: ProductVersionRef[];
  fingerprint: AssessmentFingerprint;
}

export interface WithdrawalGateProjection {
  /** One per queried food product (sorted). */
  entries: WithdrawalGateEntry[];
  medicineLedgerFingerprint: AssessmentFingerprint;
  fingerprint: AssessmentFingerprint;
}

export interface AnimalHealthProjection {
  healthPayloadVersion: typeof CATTLE_HEALTH_PAYLOAD_VERSION;
  animalId: FarmReturnAnimalId;
  /** Canonical spellings. */
  effectiveAt: string;
  knowledgeCutoff: string;
  snapshotFingerprint: AssessmentFingerprint;
  foodProducts: string[];
  /** Every health record id known by the cutoff (sorted). */
  knownRecordIds: string[];
  timeline: HealthTimeline;
  medicineLedger: MedicineLedgerView;
  withdrawalGate: WithdrawalGateProjection;
  /** Source versions of the product records bound (sorted) — C0 pack `additionalSourceRefs`. */
  sourceRefs: SourceVersionRef[];
}

export type HealthRequestIssueCode =
  | "CATTLE_HEALTH_INVALID_REQUEST"
  | "CATTLE_HEALTH_NON_CANONICAL_INPUT"
  | "CATTLE_HEALTH_INVALID_EFFECTIVE_AT"
  | "CATTLE_HEALTH_INVALID_KNOWLEDGE_CUTOFF"
  | "CATTLE_HEALTH_INVALID_FOOD_PRODUCTS"
  | "CATTLE_HEALTH_INVALID_TIMELINE_FILTER"
  | "CATTLE_HEALTH_INVALID_LEDGER"
  | "CATTLE_HEALTH_RECORD_DUPLICATE_ID_DIFFERENT_CONTENT"
  | "CATTLE_HEALTH_SUPERSESSION_TARGET_NOT_KNOWN"
  | "CATTLE_HEALTH_SUPERSESSION_OUT_OF_SCOPE"
  | "CATTLE_HEALTH_SUPERSESSION_CYCLE"
  | HealthRecordIssueCode
  | ProductRecordIssueCode;

export interface HealthIssue {
  code: HealthRequestIssueCode;
  /** Record id / `productId@version` when readable. */
  ref: string | null;
}

export type AnimalHealthResult =
  | { ok: true; projection: AnimalHealthProjection }
  | { ok: false; issues: HealthIssue[]; ledgerIssues: AnimalLedgerIssue[] };

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

interface ValidQuery {
  effectiveAt: string;
  knowledgeCutoff: string;
  foodProducts: string[];
  filter: HealthTimelineFilter;
}

const QUERY_FIELDS = ["effectiveAt", "knowledgeCutoff", "foodProducts", "timelineFilter"];

function readFilter(raw: unknown): HealthTimelineFilter | null {
  if (raw === undefined || raw === null) return { kinds: null, occurredFrom: null, occurredTo: null };
  if (!isRecord(raw) || !Object.keys(raw).every((k) => ["kinds", "occurredFrom", "occurredTo"].includes(k))) return null;
  const kinds = raw.kinds ?? null;
  if (kinds !== null && (!Array.isArray(kinds) || kinds.length === 0 || !kinds.every((k) => oneOf(HEALTH_RECORD_KINDS, k)) || new Set(kinds).size !== kinds.length)) return null;
  const from = raw.occurredFrom ?? null;
  const to = raw.occurredTo ?? null;
  const occurredFrom = from === null ? null : canonicalObligationInstant(from);
  const occurredTo = to === null ? null : canonicalObligationInstant(to);
  if ((from !== null && occurredFrom === null) || (to !== null && occurredTo === null)) return null;
  if (occurredFrom !== null && occurredTo !== null && compareInstants(occurredFrom, occurredTo) >= 0) return null;
  return { kinds: kinds === null ? null : [...(kinds as HealthRecordKind[])].sort(compareStrings), occurredFrom, occurredTo };
}

function readQuery(raw: unknown): { ok: true; query: ValidQuery } | { ok: false; issues: HealthRequestIssueCode[] } {
  if (!isRecord(raw) || !Object.keys(raw).every((k) => QUERY_FIELDS.includes(k))) return { ok: false, issues: ["CATTLE_HEALTH_INVALID_REQUEST"] };
  const issues: HealthRequestIssueCode[] = [];
  const effectiveAt = canonicalObligationInstant(raw.effectiveAt);
  const knowledgeCutoff = canonicalObligationInstant(raw.knowledgeCutoff);
  if (effectiveAt === null) issues.push("CATTLE_HEALTH_INVALID_EFFECTIVE_AT");
  if (knowledgeCutoff === null) issues.push("CATTLE_HEALTH_INVALID_KNOWLEDGE_CUTOFF");
  const fp = raw.foodProducts;
  const foodOk = Array.isArray(fp) && fp.length > 0 && fp.every(isOpaqueRef) && new Set(fp).size === fp.length;
  if (!foodOk) issues.push("CATTLE_HEALTH_INVALID_FOOD_PRODUCTS");
  const filter = readFilter(raw.timelineFilter);
  if (filter === null) issues.push("CATTLE_HEALTH_INVALID_TIMELINE_FILTER");
  if (issues.length > 0 || effectiveAt === null || knowledgeCutoff === null || filter === null) return { ok: false, issues };
  return { ok: true, query: { effectiveAt, knowledgeCutoff, foodProducts: [...(fp as string[])].sort(compareStrings), filter } };
}

// ---------------------------------------------------------------------------
// Health record admission
// ---------------------------------------------------------------------------

type HealthEnvelope = HealthRecord & BitemporalRecord;

function envelope(r: HealthRecord): HealthEnvelope {
  return { ...r, receivedAt: r.provenance.receivedAt } as HealthEnvelope;
}

function strip(e: HealthEnvelope): HealthRecord {
  const { receivedAt, ...record } = e as HealthRecord & { receivedAt: string };
  void receivedAt;
  return record as HealthRecord;
}

function receivedAfter(raw: unknown, knowledgeCutoff: string): boolean {
  const t = canonicalField(raw, "provenance", "receivedAt");
  return isValidAnimalInstant(t) && compareInstants(t, knowledgeCutoff) > 0;
}

function admitHealthRecords(animalId: FarmReturnAnimalId, raws: readonly unknown[], knowledgeCutoff: string): { ok: true; records: HealthEnvelope[] } | { ok: false; issues: HealthIssue[] } {
  const admitted = raws.filter((raw) => !receivedAfter(raw, knowledgeCutoff));
  const issues: HealthIssue[] = [];
  const materialised = admitted.map((raw) => ({ raw, result: materialiseHealthRecord(animalId, raw) }));
  // Identity before validity (CAT-INV-008): an invalid copy still collides.
  const byId = new Map<string, Set<string>>();
  for (const { raw, result } of materialised) {
    const id = healthRecordIdOf(raw);
    if (id === null) continue;
    const key = result.ok ? `valid:${healthRecordContentKey(result.record)}` : `raw:${rawIdentityKey(raw)}`;
    byId.set(id, (byId.get(id) ?? new Set()).add(key));
  }
  for (const [id, keys] of byId) if (keys.size > 1) issues.push({ code: "CATTLE_HEALTH_RECORD_DUPLICATE_ID_DIFFERENT_CONTENT", ref: id });
  const valid: HealthEnvelope[] = [];
  for (const { result } of materialised) {
    if (result.ok) valid.push(envelope(result.record));
    else issues.push(...result.issues.map((code) => ({ code, ref: result.recordId })));
  }
  const collected = collectBitemporalRecords(valid, (e) => healthRecordContentKey(strip(e)));
  if (!collected.ok) {
    for (const i of collected.issues) {
      issues.push({ code: i.code === "CATTLE_RECORD_SELF_SUPERSESSION" ? "CATTLE_HEALTH_RECORD_SELF_SUPERSESSION" : "CATTLE_HEALTH_RECORD_DUPLICATE_ID_DIFFERENT_CONTENT", ref: i.recordId });
    }
  }
  if (issues.length > 0 || !collected.ok) return { ok: false, issues };
  return { ok: true, records: collected.records };
}

function uniqueIssues(issues: HealthIssue[]): HealthIssue[] {
  const unique = new Map(issues.map((i) => [`${i.ref ?? ""}\u0000${i.code}`, i]));
  return [...unique.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, i]) => i);
}

const LINK_ISSUE: Record<string, HealthRequestIssueCode> = {
  CATTLE_RECORD_SUPERSESSION_TARGET_NOT_KNOWN: "CATTLE_HEALTH_SUPERSESSION_TARGET_NOT_KNOWN",
  CATTLE_RECORD_SUPERSESSION_OUT_OF_SCOPE: "CATTLE_HEALTH_SUPERSESSION_OUT_OF_SCOPE",
  CATTLE_RECORD_SUPERSESSION_CYCLE: "CATTLE_HEALTH_SUPERSESSION_CYCLE",
};

// ---------------------------------------------------------------------------
// Fingerprint payloads (semantic: canonical instants, sorted sets)
// ---------------------------------------------------------------------------

const timeKey = (t: string | null) => (t === null ? null : animalInstantKey(t));

interface ProjectionContext {
  animalId: string;
  effectiveAt: string;
  knowledgeCutoff: string;
  snapshotFingerprint: AssessmentFingerprint;
}

function contextPayload(p: ProjectionContext) {
  return { animalId: p.animalId, effectiveAt: p.effectiveAt, knowledgeCutoff: p.knowledgeCutoff, snapshotFingerprint: p.snapshotFingerprint };
}

function timelinePayload(p: ProjectionContext & { knownRecordIds: string[] }, t: Omit<HealthTimeline, "fingerprint">): unknown {
  return {
    ...contextPayload(p),
    knownRecordIds: p.knownRecordIds,
    filter: t.filter,
    entries: t.entries.map((e) => ({ ...e, occurredAt: timeKey(e.occurredAt), record: semanticHealthRecord(e.record) })),
    competitions: t.competitions,
    notYetOccurredRecordIds: t.notYetOccurredRecordIds,
    unknownTimeRecordIdsOutsideFilter: t.unknownTimeRecordIdsOutsideFilter,
  };
}

function ledgerPayload(p: ProjectionContext & { foodProducts: string[] }, l: Omit<MedicineLedgerView, "fingerprint">): unknown {
  return {
    ...contextPayload(p),
    foodProducts: p.foodProducts,
    entries: l.entries.map((e) => ({ ...e, occurredAt: timeKey(e.occurredAt), record: semanticHealthRecord(e.record) })),
    productVersionsUsed: l.productVersionsUsed,
  };
}

function gatePayload(p: ProjectionContext & { foodProducts: string[] }, g: Omit<WithdrawalGateProjection, "fingerprint">): unknown {
  return { ...contextPayload(p), foodProducts: p.foodProducts, medicineLedgerFingerprint: g.medicineLedgerFingerprint, entries: g.entries };
}

/** The distinct source versions of the bound product versions (sorted). */
function boundSourceRefs(productVersionsUsed: readonly ProductVersionRef[]): SourceVersionRef[] {
  return productVersionsUsed
    .map((v) => v.source)
    .sort(compareSourceVersionRefs)
    .filter((s, i, arr) => i === 0 || compareSourceVersionRefs(arr[i - 1], s) !== 0);
}

const nullableInstant = (v: unknown) => v === null || isValidAnimalInstant(v);
const isStringArray = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === "string");
const GATE_STATES: readonly WithdrawalGateState[] = ["CLEAR", "IN_WITHDRAWAL", "UNKNOWN", "EVIDENCE_CONFLICT"];

function entryShapeOk(e: unknown): boolean {
  if (!isRecord(e) || !nullableInstant(e.occurredAt) || !isRecord(e.record)) return false;
  const r = e.record;
  return nullableInstant(r.occurredAt) && isRecord(r.provenance) && isValidAnimalInstant(r.provenance.receivedAt) && nullableInstant(r.provenance.observedAt);
}

function sourceRefShapeOk(s: unknown): boolean {
  return isRecord(s) && typeof s.sourceId === "string" && typeof s.version === "string" && isRecord(s.contentFingerprint) && typeof s.contentFingerprint.digest === "string";
}

/** Structure every verification/hard-gate step reads, checked before any destructuring or comparison (CAT-INV-022). */
function projectionShapeOk(p: Record<string, unknown>): boolean {
  const { timeline: t, medicineLedger: l, withdrawalGate: g } = p;
  return (
    isValidAnimalInstant(p.effectiveAt) &&
    isRecord(t) && isRecord(t.fingerprint) && Array.isArray(t.entries) && t.entries.every(entryShapeOk) &&
    isRecord(l) && isRecord(l.fingerprint) && Array.isArray(l.entries) && l.entries.every(entryShapeOk) &&
    Array.isArray(l.productVersionsUsed) && l.productVersionsUsed.every((v) => isRecord(v) && sourceRefShapeOk(v.source)) &&
    isRecord(g) && isRecord(g.fingerprint) && isRecord(g.medicineLedgerFingerprint) && Array.isArray(g.entries) &&
    g.entries.every((e) => isRecord(e) && typeof e.foodProduct === "string" && oneOf(GATE_STATES, e.state) && isStringArray(e.reasonCodes))
  );
}

/** True when a canonical fingerprint payload holds no absent (`undefined`) value at any depth (CAT-INV-022). */
function payloadComplete(v: unknown): boolean {
  if (v === undefined) return false;
  if (Array.isArray(v)) return v.every(payloadComplete);
  return v === null || typeof v !== "object" || Object.values(v).every(payloadComplete);
}

/**
 * Re-verifies a projection against its own content: the supported payload
 * version, the three fingerprints, and `sourceRefs` as exactly the source
 * versions of the fingerprinted `productVersionsUsed` (CAT-INV-021/024).
 */
export function verifyAnimalHealthProjection(projection: AnimalHealthProjection, hash: CattleHash): FingerprintVerificationResult {
  const canonical = toCanonicalPlainData(projection);
  if (!canonical.ok) return { valid: false, reasonCode: "CATTLE_HEALTH_PROJECTION_NON_CANONICAL", detail: canonical.path };
  const p = canonical.value as AnimalHealthProjection;
  if (!isRecord(p) || p.healthPayloadVersion !== CATTLE_HEALTH_PAYLOAD_VERSION) {
    return { valid: false, reasonCode: "CATTLE_HEALTH_PROJECTION_UNSUPPORTED_PAYLOAD_VERSION", detail: "unsupported health payload version" };
  }
  if (!projectionShapeOk(p as unknown as Record<string, unknown>)) {
    return { valid: false, reasonCode: "CATTLE_HEALTH_PROJECTION_MALFORMED", detail: "projection structure is malformed" };
  }
  const { fingerprint: tf, ...timeline } = p.timeline;
  const { fingerprint: lf, ...ledger } = p.medicineLedger;
  const { fingerprint: gf, ...gate } = p.withdrawalGate;
  const payloads = { timeline: timelinePayload(p, timeline), ledger: ledgerPayload(p, ledger), gate: gatePayload(p, gate) };
  if (!payloadComplete(payloads) || !payloadComplete(p.sourceRefs)) {
    return { valid: false, reasonCode: "CATTLE_HEALTH_PROJECTION_MALFORMED", detail: "fingerprint payload is incomplete" };
  }
  const t = verifyHealthFingerprint("CATTLE_HEALTH_TIMELINE", payloads.timeline, tf, hash);
  if (!t.valid) return t;
  const l = verifyHealthFingerprint("CATTLE_MEDICINE_LEDGER", payloads.ledger, lf, hash);
  if (!l.valid) return l;
  if (gate.medicineLedgerFingerprint.digest !== lf.digest) return { valid: false, reasonCode: "CATTLE_HEALTH_GATE_LEDGER_MISMATCH", detail: "gate is bound to another medicine ledger" };
  if (!Array.isArray(p.sourceRefs) || canonicalizeValue(p.sourceRefs) !== canonicalizeValue(boundSourceRefs(ledger.productVersionsUsed))) {
    return { valid: false, reasonCode: "CATTLE_HEALTH_SOURCE_REFS_MISMATCH", detail: "sourceRefs differ from the bound product versions" };
  }
  return verifyHealthFingerprint("CATTLE_WITHDRAWAL_GATE", payloads.gate, gf, hash);
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

function byOccurrence(a: { occurredAt: string | null; recordId: string }, b: { occurredAt: string | null; recordId: string }): number {
  if (a.occurredAt !== null && b.occurredAt !== null) return compareInstants(a.occurredAt, b.occurredAt) || compareStrings(a.recordId, b.recordId);
  if (a.occurredAt !== b.occurredAt) return a.occurredAt === null ? 1 : -1;
  return compareStrings(a.recordId, b.recordId);
}

function project(
  ledger: AnimalLedger,
  healthRaw: readonly unknown[],
  productRaw: readonly unknown[],
  query: ValidQuery,
  hash: CattleHash,
): AnimalHealthResult {
  const projected = projectAnimalSnapshot(ledger, { effectiveAt: query.effectiveAt, knowledgeCutoff: query.knowledgeCutoff });
  if (!projected.ok) return { ok: false, issues: [{ code: "CATTLE_HEALTH_INVALID_LEDGER", ref: null }], ledgerIssues: projected.ledgerIssues };
  const animalId = ledger.animalId;
  const health = admitHealthRecords(animalId, healthRaw, query.knowledgeCutoff);
  const products = admitProductRecords(productRaw, query.knowledgeCutoff);
  const issues: HealthIssue[] = [];
  if (!health.ok) issues.push(...health.issues);
  if (!products.ok) issues.push(...products.issues.map((i) => ({ code: i.code, ref: i.ref })));
  if (!health.ok || !products.ok) return { ok: false, issues: uniqueIssues(issues), ledgerIssues: [] };

  const resolution = resolveBitemporalRecords(health.records, query.knowledgeCutoff, {
    linkAllowed: (source, target) => healthLinkAllowed(strip(source), strip(target)),
    competitionKey: (r) => healthRecordClaimKey(strip(r)),
  });
  if (resolution.linkIssues.length > 0) {
    return { ok: false, issues: uniqueIssues(resolution.linkIssues.map((i) => ({ code: LINK_ISSUE[i.code], ref: i.recordId }))), ledgerIssues: [] };
  }
  const known = resolution.known.map(strip);
  const supersededBy = (id: string) => [...(resolution.supersededBy.get(id) ?? [])];
  const competitions: HealthCompetition[] = resolution.competitions.map((c) => ({ targetId: c.targetId, terminalIds: c.terminals.map((t) => t.recordId) }));
  const competing = new Set(competitions.flatMap((c) => [c.targetId, ...c.terminalIds]));
  const status = (id: string): HealthRecordStatus => (resolution.supersededBy.has(id) ? "SUPERSEDED" : "LIVE");
  const inView = (r: HealthRecord) => r.occurredAt === null || compareInstants(r.occurredAt, query.effectiveAt) <= 0;
  const byIdKnown = new Map(known.map((r) => [r.recordId, r]));

  // Timeline (history included).
  const filter = query.filter;
  const inPeriod = (r: HealthRecord) =>
    r.occurredAt !== null &&
    (filter.occurredFrom === null || compareInstants(filter.occurredFrom, r.occurredAt) <= 0) &&
    (filter.occurredTo === null || compareInstants(r.occurredAt, filter.occurredTo) < 0);
  const periodFiltered = filter.occurredFrom !== null || filter.occurredTo !== null;
  const viewed = known.filter(inView);
  const kindSelected = viewed.filter((r) => filter.kinds === null || filter.kinds.includes(r.kind));
  const timelineEntries: HealthTimelineEntry[] = kindSelected
    .filter((r) => !periodFiltered || inPeriod(r))
    .map((r) => ({
      recordId: r.recordId,
      kind: r.kind,
      informationClass: healthRecordInformationClass(r.kind),
      occurredAt: r.occurredAt,
      status: status(r.recordId),
      supersededBy: supersededBy(r.recordId),
      inCompetition: competing.has(r.recordId),
      record: r,
    }))
    .sort(byOccurrence);
  const timelineContent: Omit<HealthTimeline, "fingerprint"> = {
    filter,
    entries: timelineEntries,
    competitions,
    notYetOccurredRecordIds: known.filter((r) => !inView(r)).map((r) => r.recordId).sort(compareStrings),
    unknownTimeRecordIdsOutsideFilter: periodFiltered ? kindSelected.filter((r) => r.occurredAt === null).map((r) => r.recordId).sort(compareStrings) : [],
  };

  // Medicine ledger (administrations in view, history included).
  const productResolution = resolveProductRecords(products.records, query.knowledgeCutoff);
  const administrations = viewed.filter((r): r is MedicineAdministrationRecord => r.kind === "MEDICINE_ADMINISTRATION");
  const liveCourseMembers = (treatmentId: string) =>
    known.filter((r) => r.kind === "MEDICINE_ADMINISTRATION" && r.treatmentRecordId === treatmentId && status(r.recordId) === "LIVE").length;
  const ledgerEntries: MedicineLedgerEntry[] = administrations
    .map((r) => {
      const { binding, record } = bindAdministrationProduct(r, productResolution);
      const courseSize = r.treatmentRecordId === null ? 1 : Math.max(1, liveCourseMembers(r.treatmentRecordId));
      const treatment = r.treatmentRecordId === null ? undefined : byIdKnown.get(r.treatmentRecordId);
      return {
        recordId: r.recordId,
        occurredAt: r.occurredAt,
        status: status(r.recordId),
        supersededBy: supersededBy(r.recordId),
        inCompetition: competing.has(r.recordId),
        record: r,
        courseSize,
        treatmentRecordKnown: treatment !== undefined && treatment.kind === "TREATMENT" && status(treatment.recordId) === "LIVE",
        binding,
        withdrawals: query.foodProducts.map((fp) => computeAdministrationWithdrawal(r, binding, record, fp, courseSize)),
      };
    })
    .sort(byOccurrence);
  const productVersionsUsed = ledgerEntries
    .flatMap((e) => (e.binding.product ? [e.binding.product] : []))
    .sort(compareProductVersionRefs)
    .filter((v, i, arr) => i === 0 || compareProductVersionRefs(arr[i - 1], v) !== 0);

  // Withdrawal gate (live administrations in view).
  const conflictingAdministrationIds = sortedUnique(
    competitions.filter((c) => byIdKnown.get(c.targetId)?.kind === "MEDICINE_ADMINISTRATION").flatMap((c) => [c.targetId, ...c.terminalIds]),
  );
  const live = ledgerEntries.filter((e) => e.status === "LIVE");
  const gateEntries = query.foodProducts.map((fp, i) =>
    foldWithdrawalGate(
      fp,
      query.effectiveAt,
      live.map((e) => ({ recordId: e.recordId, binding: e.binding, withdrawal: e.withdrawals[i] })),
      conflictingAdministrationIds,
    ),
  );

  const context = {
    animalId,
    effectiveAt: query.effectiveAt,
    knowledgeCutoff: query.knowledgeCutoff,
    snapshotFingerprint: computeAnimalSnapshotFingerprint(projected.snapshot, hash),
    foodProducts: query.foodProducts,
    knownRecordIds: known.map((r) => r.recordId).sort(compareStrings),
  };
  const timeline: HealthTimeline = { ...timelineContent, fingerprint: computeHealthFingerprint("CATTLE_HEALTH_TIMELINE", timelinePayload(context, timelineContent), hash) };
  const ledgerContent = { entries: ledgerEntries, productVersionsUsed };
  const medicineLedger: MedicineLedgerView = { ...ledgerContent, fingerprint: computeHealthFingerprint("CATTLE_MEDICINE_LEDGER", ledgerPayload(context, ledgerContent), hash) };
  const gateContent = { entries: gateEntries, medicineLedgerFingerprint: medicineLedger.fingerprint };
  const withdrawalGate: WithdrawalGateProjection = { ...gateContent, fingerprint: computeHealthFingerprint("CATTLE_WITHDRAWAL_GATE", gatePayload(context, gateContent), hash) };
  const sourceRefs = boundSourceRefs(productVersionsUsed);
  const projection: AnimalHealthProjection = {
    healthPayloadVersion: CATTLE_HEALTH_PAYLOAD_VERSION,
    animalId,
    effectiveAt: context.effectiveAt,
    knowledgeCutoff: context.knowledgeCutoff,
    snapshotFingerprint: context.snapshotFingerprint,
    foodProducts: context.foodProducts,
    knownRecordIds: context.knownRecordIds,
    timeline,
    medicineLedger,
    withdrawalGate,
    sourceRefs,
  };
  return { ok: true, projection: deepFreezeAnimalValue(structuredClone(projection)) };
}

const REQUEST_FIELDS = ["ledger", "healthRecords", "productRecords", "query"];

/**
 * Projects one animal's health timeline, medicine ledger and withdrawal gate.
 * The complete request must be canonical plain data; it is checked as a
 * whole (collections and elements) before evaluation and only the detached
 * copy is used. Any malformed admitted record, identity collision or
 * supersession defect fails closed (`ok: false`); the result is detached and
 * deep-frozen.
 */
export function projectAnimalHealth(request: AnimalHealthRequest, hash: CattleHash): AnimalHealthResult {
  return deepFreezeAnimalValue(projectCanonical(request, hash));
}

function projectCanonical(request: AnimalHealthRequest, hash: CattleHash): AnimalHealthResult {
  const canonical = toCanonicalPlainData(request);
  if (!canonical.ok) return { ok: false, issues: [{ code: "CATTLE_HEALTH_NON_CANONICAL_INPUT", ref: canonical.path }], ledgerIssues: [] };
  const req: unknown = canonical.value;
  if (!isRecord(req) || !Object.keys(req).every((k) => REQUEST_FIELDS.includes(k)) || !Array.isArray(req.healthRecords) || !Array.isArray(req.productRecords)) {
    return { ok: false, issues: [{ code: "CATTLE_HEALTH_INVALID_REQUEST", ref: null }], ledgerIssues: [] };
  }
  const q = readQuery(req.query);
  const rebuilt = rematerialiseAnimalLedger(req.ledger);
  const issues: HealthIssue[] = q.ok ? [] : q.issues.map((code) => ({ code, ref: null }));
  if (!rebuilt.ok) issues.push({ code: "CATTLE_HEALTH_INVALID_LEDGER", ref: null });
  if (!q.ok || !rebuilt.ok) return { ok: false, issues, ledgerIssues: rebuilt.ok ? [] : rebuilt.issues };
  return project(rebuilt.ledger, req.healthRecords as unknown[], req.productRecords as unknown[], q.query, hash);
}
