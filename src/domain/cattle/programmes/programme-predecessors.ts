/**
 * Cattle C7 — THE predecessor-consumption boundary (CAT-INV-014/021/023/028).
 *
 * predecessor plain data
 *   → frozen predecessor validator where one exists (C1
 *     `rematerialiseAnimalLedger`, C3 `verifyAnimalHealthProjection`, C2
 *     `projectObligationHardGates`)
 *   → consumed-field schema (`programme-consumed.ts`): version, type,
 *     vocabulary, format, structure of every field C7 reads
 *   → consistency predicates: every relationship the frozen contract states
 *     between consumed fields holds (C3 status ⇔ superseders, competition
 *     flags ⇔ competitions, known set = views, withdrawal-gate entry fields;
 *     C2 record ⇔ its C0 evaluation, state ⇔ counted evidence, evaluation
 *     date) — a self-contradictory output is invalid
 *   → context membership: every consumed record individually belongs to
 *     this evaluation (animal, snapshot, times, identity, cross-view
 *     consistency) — an envelope never vouches for its records
 *   → C7's internal evidence representation (`AnimalContext`)
 *   → evaluation.
 *
 * No other C7 module reads a C1 / C2 / C3 / C4 output: membership, matching,
 * state, fingerprints and hard gates see only the internal representation
 * built here. Malformed, unsupported or foreign predecessor output never
 * reaches authoritative reasoning — the whole request fails closed. C7 never
 * recreates a predecessor calculation (C3 withdrawal and product binding, C2
 * obligation state and C4 membership are consumed as computed).
 *
 * TRUST BOUND (CAT-INV-028, human decision): this boundary detects
 * malformed and self-contradictory predecessor outputs. A fully consistent
 * output cannot be authenticated here (fingerprints are change detection,
 * not signatures); authenticity is the adapter's / C8 sealed context's
 * responsibility (BLOCKERS.md).
 */

import { canonicalizeValue, type AssessmentFingerprint } from "../../assessment-integrity";
import { animalInstantKey, compareInstants, rematerialiseAnimalLedger, type AnimalLedger } from "../animal-ledger";
import { computeAnimalSnapshotFingerprint, projectAnimalSnapshot } from "../animal-snapshot";
import type { CattleEvaluationState } from "../evaluation";
import { projectWithdrawalHardGates, verifyAnimalHealthProjection, type AnimalHealthProjection, type ProductBindingState } from "../health";
import { isRecord } from "../health/health-input";
import { compareStrings, sameFingerprint, type CattleHash } from "../integrity";
import { canonicalObligationInstant, utcCalendarDateOf } from "../regulatory/obligation-time";
import { projectObligationHardGates, type AnimalObligationEvaluation } from "../regulatory";
import { resolveGroupScope } from "../weights";
import {
  C1_SNAPSHOT,
  C2_EVALUATION,
  C3_PROJECTION,
  C4_SCOPE,
  GATE_PROJECTION,
  consume,
  type ConsumedHealthEntry,
  type ConsumedHealthProjection,
  type ConsumedMedicineEntry,
  type ConsumedObligationEvaluation,
  type ConsumedScope,
  type ConsumedSnapshot,
} from "./programme-consumed";
import { canonicalInstant } from "./programme-definition";
import { conformsToPolicy } from "./programme-fields";
import type { ProgrammeAnimalInputs, ProgrammeIssue } from "./programme-types";

// ---------------------------------------------------------------------------
// C7 internal evidence representation (all values validated)
// ---------------------------------------------------------------------------

/** One C3 health record as C7 uses it (validated; valid time in canonical spelling). */
export interface EvidenceRecord {
  recordId: string;
  kind: string;
  /** Canonical spelling, or `null` = unknown. */
  occurredAt: string | null;
  status: "LIVE" | "SUPERSEDED";
  inCompetition: boolean;
  sourceCategory: string;
  actorRole: string;
  /** MEDICINE_ADMINISTRATION only (`null` = not identified, or another kind). */
  productId: string | null;
  /** VETERINARY_EVENT only. */
  eventType: string | null;
}

/** A C3 product binding (validated: a frozen state; a complete bound product exactly when BOUND). */
export interface EvidenceBinding {
  state: ProductBindingState;
  product: { productId: string; version: string } | null;
}

export interface HealthEvidence {
  records: readonly EvidenceRecord[];
  /** C3 medicine-ledger binding per administration record id. */
  bindings: ReadonlyMap<string, EvidenceBinding>;
  notYetOccurred: ReadonlySet<string>;
}

export interface GateSupply {
  state: CattleEvaluationState;
  source: "C2_OBLIGATION" | "C3_WITHDRAWAL";
}

/** Everything C7 knows about one evaluated animal — validated and context-bound. */
export interface AnimalContext {
  animalId: string;
  /** C1 facts C7 reads (validated `AnimalResolution`s). */
  facts: ConsumedSnapshot;
  health: HealthEvidence | null;
  /** Requested gate rule id → supplied gate states. */
  gates: Map<string, GateSupply[]>;
  inputs: ProgrammeAnimalInputs;
}

/** The C1-rematerialised ledger of each context — private to this boundary (used only by `groupScopeAt`). */
const LEDGERS = new WeakMap<AnimalContext, AnimalLedger>();

export interface ReadRequest {
  effectiveAt: string;
  knowledgeCutoff: string;
  definitions: unknown[];
  reviews: unknown[];
  completions: unknown[];
  ledgers: unknown[];
  health: unknown[];
  obligations: unknown[];
}

/** The request envelope under the field policy; query instants canonical. */
export function readRequest(req: unknown): { ok: true; read: ReadRequest } | { ok: false; issues: ProgrammeIssue[] } {
  if (!conformsToPolicy(req, "request") || !conformsToPolicy(req.query, "query")) return { ok: false, issues: [{ code: "CATTLE_PROGRAMME_INVALID_REQUEST", ref: null }] };
  const effectiveAt = canonicalInstant(req.query.effectiveAt);
  const knowledgeCutoff = canonicalInstant(req.query.knowledgeCutoff);
  const issues: ProgrammeIssue[] = [];
  if (effectiveAt === null) issues.push({ code: "CATTLE_PROGRAMME_INVALID_EFFECTIVE_AT", ref: null });
  if (knowledgeCutoff === null) issues.push({ code: "CATTLE_PROGRAMME_INVALID_KNOWLEDGE_CUTOFF", ref: null });
  if (effectiveAt === null || knowledgeCutoff === null) return { ok: false, issues };
  const list = (k: keyof Omit<ReadRequest, "effectiveAt" | "knowledgeCutoff">) => req[k] as unknown[];
  return {
    ok: true,
    read: {
      effectiveAt,
      knowledgeCutoff,
      definitions: list("definitions"),
      reviews: list("reviews"),
      completions: list("completions"),
      ledgers: list("ledgers"),
      health: list("health"),
      obligations: list("obligations"),
    },
  };
}

/** Runs a frozen predecessor function; anything it cannot read fails closed (`null`). */
function failClosed<T>(run: () => T): T | null {
  try {
    return run();
  } catch {
    return null;
  }
}

const key = (t: string) => animalInstantKey(t);
const sameInstant = (a: string, b: string) => key(a) === key(b);
const sameNullableInstant = (a: string | null, b: string | null) => (a === null ? b === null : b !== null && sameInstant(a, b));
const notAfter = (t: string, bound: string) => compareInstants(t, bound) <= 0;
const distinct = (keys: readonly string[]) => new Set(keys).size === keys.length;

// ---------------------------------------------------------------------------
// C2 — schema, then per-record membership
// ---------------------------------------------------------------------------

/** Every C2 record carries this animal, this C1 snapshot and the query's times; (obligation, occurrence) identities are distinct. */
function obligationRecordsBelong(e: ConsumedObligationEvaluation, ctx: AnimalContext, read: ReadRequest): boolean {
  return (
    e.results.every((r) => r.animalId === ctx.animalId && sameFingerprint(r.snapshotFingerprint, ctx.inputs.snapshotFingerprint) && sameInstant(r.effectiveAt, read.effectiveAt) && sameInstant(r.knowledgeCutoff, read.knowledgeCutoff)) &&
    distinct(e.results.map((r) => JSON.stringify([r.obligationId, r.occurrence?.occurrenceId ?? null])))
  );
}

// ---------------------------------------------------------------------------
// Consistency predicates — relationships the frozen contracts state between
// consumed fields (never a recomputation of predecessor logic)
// ---------------------------------------------------------------------------

/** The consistency rules, by surface (documentation and tests). */
export const PREDECESSOR_CONSISTENCY_RULES = Object.freeze([
  { surface: "C3", rule: "STATUS_MATCHES_SUPERSEDERS", contract: "status SUPERSEDED exactly when the record has known superseders" },
  { surface: "C3", rule: "SUPERSEDERS_MATCH_SUPERSEDES", contract: "superseders are known records; every visible record superseding a visible record is listed as its superseder" },
  { surface: "C3", rule: "COMPETITION_FLAG_MATCHES_COMPETITIONS", contract: "inCompetition exactly when the record is a target or terminal of a listed competition (of known records)" },
  { surface: "C3", rule: "KNOWN_SET_MATCHES_VIEWS", contract: "unfiltered: known records = timeline records ∪ not-yet-occurred records" },
  { surface: "C3", rule: "LEDGER_COVERS_TIMELINE_ADMINISTRATIONS", contract: "the medicine ledger holds every administration in view (each timeline MEDICINE_ADMINISTRATION has its ledger entry)" },
  { surface: "C3", rule: "ONE_GATE_ENTRY_PER_FOOD_PRODUCT", contract: "one withdrawal-gate entry per queried food product" },
  { surface: "C3", rule: "WITHDRAWAL_UNTIL_ONLY_WHEN_IN_WITHDRAWAL", contract: "inWithdrawalUntil is set exactly when the state is IN_WITHDRAWAL" },
  { surface: "C3", rule: "GATE_ADMINISTRATIONS_ARE_LIVE_IN_VIEW", contract: "administrationIds are distinct live ledger administrations occurred by effectiveAt or of unknown time" },
  { surface: "C3", rule: "GATE_PRODUCT_VERSIONS_ARE_BOUND", contract: "productVersions are the BOUND product versions of the listed administrations" },
  { surface: "C2", rule: "RECORD_MATCHES_ITS_EVALUATION", contract: "rule, classification and gate role are verbatim those of the record's C0 evaluation" },
  { surface: "C2", rule: "REQUESTED_RULE_IS_THE_RULE", contract: "a resolved rule's id is the evaluation's requested rule id" },
  { surface: "C2", rule: "SATISFIED_EXACTLY_WITH_COUNTED_EVIDENCE", contract: "counted evidence exists exactly for SATISFIED / SATISFIED_LATE" },
  { surface: "C2", rule: "EVALUATION_DATE_IS_EFFECTIVE_DATE", contract: "evaluationDate is the UTC calendar date of effectiveAt" },
] as const);

/** C3: every stated relationship holds (unfiltered projection). */
function c3Consistent(p: ConsumedHealthProjection, read: ReadRequest): boolean {
  const known = new Set(p.knownRecordIds);
  const entries = [...p.timeline.entries, ...p.medicineLedger.entries];
  const byId = new Map(entries.map((e) => [e.recordId, e]));
  const competing = new Set(p.timeline.competitions.flatMap((c) => [c.targetId, ...c.terminalIds]));
  const viewIds = [...p.timeline.entries.map((e) => e.recordId), ...p.timeline.notYetOccurredRecordIds];
  const live = new Map(p.medicineLedger.entries.filter((e) => e.status === "LIVE" && (e.occurredAt === null || notAfter(e.occurredAt, read.effectiveAt))).map((e) => [e.recordId, e]));
  const supersedersOk = entries.every(
    (e) =>
      (e.status === "SUPERSEDED") === (e.supersededBy.length > 0) &&
      e.supersededBy.every((id) => known.has(id)) &&
      e.record.supersedes.every((target) => known.has(target) && (!byId.has(target) || byId.get(target)!.supersededBy.includes(e.recordId))) &&
      e.inCompetition === competing.has(e.recordId),
  );
  const competitionsOk = p.timeline.competitions.every((c) => c.terminalIds.length > 0) && [...competing].every((id) => known.has(id));
  const knownOk = known.size === p.knownRecordIds.length && distinct(viewIds) && viewIds.length === known.size && viewIds.every((id) => known.has(id));
  const foods = p.withdrawalGate.entries.map((g) => g.foodProduct);
  const gateOk =
    distinct(p.foodProducts) &&
    distinct(foods) &&
    canonicalizeValue([...foods].sort(compareStrings)) === canonicalizeValue([...p.foodProducts].sort(compareStrings)) &&
    p.withdrawalGate.entries.every(
      (g) =>
        (g.state === "IN_WITHDRAWAL") === (g.inWithdrawalUntil !== null) &&
        distinct(g.administrationIds) &&
        g.administrationIds.every((id) => live.has(id)) &&
        g.productVersions.every((v) => g.administrationIds.some((id) => { const b = live.get(id)!.binding; return b.state === "BOUND" && b.product !== null && b.product.productId === v.productId && b.product.version === v.version; })),
    );
  const ledgerIds = new Set(p.medicineLedger.entries.map((e) => e.recordId));
  const ledgerOk = p.timeline.entries.every((e) => e.record.kind !== "MEDICINE_ADMINISTRATION" || ledgerIds.has(e.recordId));
  return supersedersOk && competitionsOk && knownOk && ledgerOk && gateOk;
}

/** C2: every stated relationship holds. */
function c2Consistent(e: ConsumedObligationEvaluation): boolean {
  return (
    e.evaluationDate === utcCalendarDateOf(e.effectiveAt) &&
    e.results.every(
      (r) =>
        canonicalizeValue(r.rule) === canonicalizeValue(r.ruleEvaluation.rule) &&
        r.classification === r.ruleEvaluation.classification &&
        r.gateRole === r.ruleEvaluation.gateRole &&
        (r.rule === null || r.ruleEvaluation.requestedRuleId === r.rule.ruleId) &&
        (r.state === "SATISFIED" || r.state === "SATISFIED_LATE") === r.evidence.countedEvidence.length > 0,
    )
  );
}

// ---------------------------------------------------------------------------
// C3 — schema, then per-record membership and cross-view consistency
// ---------------------------------------------------------------------------

/**
 * Every timeline / medicine-ledger entry carries this animal, wraps the
 * record it names (id, kind, valid time), is a known record, is known by the
 * cutoff and (timeline) occurred by `effectiveAt`; ids are distinct per view;
 * each ledger entry is the same record, status and correction state as its
 * timeline entry, or a not-yet-occurred record; a BOUND binding carries a
 * bound product of the administered product id and only BOUND carries one.
 */
function healthRecordsBelong(p: ConsumedHealthProjection, ctx: AnimalContext, read: ReadRequest): boolean {
  const known = new Set(p.knownRecordIds);
  const notYet = p.timeline.notYetOccurredRecordIds;
  const wraps = (e: ConsumedHealthEntry | ConsumedMedicineEntry) =>
    e.record.recordId === e.recordId &&
    known.has(e.recordId) &&
    e.record.animalId === ctx.animalId &&
    sameNullableInstant(e.occurredAt, e.record.occurredAt) &&
    notAfter(e.record.provenance.receivedAt, read.knowledgeCutoff);
  const timeline = p.timeline.entries;
  const ledger = p.medicineLedger.entries;
  const timelineIds = timeline.map((e) => e.recordId);
  const byId = new Map(timeline.map((e) => [e.recordId, e]));
  const bindingCoherent = (e: ConsumedMedicineEntry) =>
    e.binding.state === "BOUND" ? e.binding.product !== null && e.record.kind === "MEDICINE_ADMINISTRATION" && productIdOf(e.record) === e.binding.product.productId : e.binding.product === null;
  const sameAsTimeline = (e: ConsumedMedicineEntry) => {
    const t = byId.get(e.recordId);
    if (t === undefined) return notYet.includes(e.recordId);
    // Equality of the (projected) wrapped records.
    return t.status === e.status && t.inCompetition === e.inCompetition && canonicalizeValue(t.supersededBy) === canonicalizeValue(e.supersededBy) && canonicalizeValue(t.record) === canonicalizeValue(e.record);
  };
  return (
    timeline.every((e) => wraps(e) && e.kind === e.record.kind && (e.occurredAt === null || notAfter(e.occurredAt, read.effectiveAt))) &&
    ledger.every((e) => wraps(e) && e.record.kind === "MEDICINE_ADMINISTRATION" && bindingCoherent(e) && sameAsTimeline(e)) &&
    distinct(timelineIds) &&
    distinct(ledger.map((e) => e.recordId)) &&
    notYet.every((id) => known.has(id) && !timelineIds.includes(id))
  );
}

/**
 * Cross-view identity of the FULL wrapped records (not only consumed fields):
 * a medicine-ledger entry wraps exactly the record its timeline entry wraps.
 * Called on the raw projection after schema validation; compares canonical
 * content only, interpreting no field.
 */
function rawViewsAgree(raw: unknown): boolean {
  const views = raw as { timeline: { entries: { recordId: string; record: unknown }[] }; medicineLedger: { entries: { recordId: string; record: unknown }[] } };
  const timeline = new Map(views.timeline.entries.map((e) => [e.recordId, canonicalizeValue(e.record)]));
  return views.medicineLedger.entries.every((e) => !timeline.has(e.recordId) || timeline.get(e.recordId) === canonicalizeValue(e.record));
}

/** The validated product id of a validated record (MEDICINE_ADMINISTRATION variant only). */
function productIdOf(record: ConsumedHealthEntry["record"]): string | null {
  return record.kind === "MEDICINE_ADMINISTRATION" ? (record as { productId: string | null }).productId : null;
}

function eventTypeOf(record: ConsumedHealthEntry["record"]): string | null {
  return record.kind === "VETERINARY_EVENT" ? (record as { eventType: string }).eventType : null;
}

/** C7's internal representation of a validated, context-bound C3 projection. */
function healthEvidenceOf(p: ConsumedHealthProjection): HealthEvidence {
  const records = p.timeline.entries.map(
    (e): EvidenceRecord => ({
      recordId: e.recordId,
      kind: e.record.kind,
      occurredAt: e.occurredAt === null ? null : (canonicalObligationInstant(e.occurredAt) as string),
      status: e.status,
      inCompetition: e.inCompetition,
      sourceCategory: e.record.provenance.sourceCategory,
      actorRole: e.record.provenance.actorRole,
      productId: productIdOf(e.record),
      eventType: eventTypeOf(e.record),
    }),
  );
  const bindings = new Map(
    p.medicineLedger.entries.map((e): [string, EvidenceBinding] => [e.recordId, { state: e.binding.state, product: e.binding.product === null ? null : { productId: e.binding.product.productId, version: e.binding.product.version } }]),
  );
  return { records, bindings, notYetOccurred: new Set(p.timeline.notYetOccurredRecordIds) };
}

const UNFILTERED = (p: ConsumedHealthProjection) => p.timeline.filter.kinds === null && p.timeline.filter.occurredFrom === null && p.timeline.filter.occurredTo === null;

// ---------------------------------------------------------------------------
// C4 — group scope at an instant (in-process, validated)
// ---------------------------------------------------------------------------

/** C4 `resolveGroupScope` at `at` over this animal's C1-validated ledger; its output is schema-validated before use. */
export function groupScopeAt(ctx: AnimalContext, groupRef: string, at: string, knowledgeCutoff: string, hash: CattleHash): { ok: true; scope: ConsumedScope } | { ok: false; codes: string[] } {
  const ledger = LEDGERS.get(ctx);
  if (ledger === undefined) return { ok: false, codes: ["CATTLE_PROGRAMME_GROUP_SCOPE_UNRESOLVABLE"] };
  const result = failClosed(() => resolveGroupScope({ scope: { kind: "GROUP", groupRef, ledgers: [ledger] }, query: { effectiveAt: at, knowledgeCutoff } }, hash));
  if (result === null) return { ok: false, codes: ["CATTLE_PROGRAMME_GROUP_SCOPE_UNRESOLVABLE"] };
  if (!result.ok) return { ok: false, codes: ["CATTLE_PROGRAMME_GROUP_SCOPE_UNRESOLVABLE", ...result.issues.map((i) => i.code)] };
  const scope = consume(C4_SCOPE, result.scope);
  return scope !== null ? { ok: true, scope } : { ok: false, codes: ["CATTLE_PROGRAMME_GROUP_SCOPE_OUTPUT_INVALID"] };
}

// ---------------------------------------------------------------------------
// Reading every animal
// ---------------------------------------------------------------------------

/** C1 ledgers, then C3 projections, then C2 evaluations — each validated, context-bound and translated. */
export function readAnimals(read: ReadRequest, hash: CattleHash): { ok: true; animals: Map<string, AnimalContext> } | { ok: false; issues: ProgrammeIssue[] } {
  const issues: ProgrammeIssue[] = [];
  const animals = new Map<string, AnimalContext>();
  for (const raw of read.ledgers) {
    const ledger = failClosed(() => rematerialiseAnimalLedger(raw));
    if (ledger === null || !ledger.ok) {
      issues.push({ code: "CATTLE_PROGRAMME_INVALID_LEDGER", ref: isRecord(raw) && typeof raw.animalId === "string" ? raw.animalId : null });
      continue;
    }
    const animalId = ledger.ledger.animalId as string;
    if (animals.has(animalId)) {
      issues.push({ code: "CATTLE_PROGRAMME_DUPLICATE_ANIMAL", ref: animalId });
      continue;
    }
    const projected = failClosed(() => projectAnimalSnapshot(ledger.ledger, { effectiveAt: read.effectiveAt, knowledgeCutoff: read.knowledgeCutoff }));
    const facts = projected !== null && projected.ok ? consume(C1_SNAPSHOT, projected.snapshot) : null;
    if (projected === null || !projected.ok || facts === null) {
      issues.push({ code: "CATTLE_PROGRAMME_INVALID_LEDGER", ref: animalId });
      continue;
    }
    const ctx: AnimalContext = {
      animalId,
      facts,
      health: null,
      gates: new Map(),
      inputs: { snapshotFingerprint: computeAnimalSnapshotFingerprint(projected.snapshot, hash), health: null, obligationRecords: null },
    };
    LEDGERS.set(ctx, ledger.ledger);
    animals.set(animalId, ctx);
  }
  const addGates = (ctx: AnimalContext, raw: unknown, source: GateSupply["source"]): boolean => {
    const records = consume(GATE_PROJECTION, raw);
    if (records === null) return false;
    for (const r of records) ctx.gates.set(r.requestedRuleId, [...(ctx.gates.get(r.requestedRuleId) ?? []), { state: r.state, source }]);
    return true;
  };

  const seenHealth = new Set<string>();
  for (const raw of read.health) {
    const ref = isRecord(raw) && typeof raw.animalId === "string" ? raw.animalId : null;
    // Frozen C3 verifier first (fingerprints), then the consumed-field schema (validity).
    // Frozen C3 verifier (fingerprints), then the consumed-field schema (validity), then the stated consistency (no self-contradiction).
    const p = failClosed(() => verifyAnimalHealthProjection(raw as AnimalHealthProjection, hash).valid) ? consume(C3_PROJECTION, raw) : null;
    if (p === null || !c3Consistent(p, read)) {
      issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_INVALID", ref });
      continue;
    }
    const ctx = animals.get(p.animalId);
    if (!ctx) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_UNKNOWN_ANIMAL", ref: p.animalId });
    else if (seenHealth.has(p.animalId)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_DUPLICATE", ref: p.animalId });
    else if (!sameInstant(p.effectiveAt, read.effectiveAt) || !sameInstant(p.knowledgeCutoff, read.knowledgeCutoff)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_TIME_MISMATCH", ref: p.animalId });
    else if (!UNFILTERED(p)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_FILTERED", ref: p.animalId });
    else if (!sameFingerprint(p.snapshotFingerprint, ctx.inputs.snapshotFingerprint)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_LEDGER_MISMATCH", ref: p.animalId });
    else if (!healthRecordsBelong(p, ctx, read) || !rawViewsAgree(raw)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_FOREIGN_RECORD", ref: p.animalId });
    else {
      const gates = failClosed(() => projectWithdrawalHardGates(raw as AnimalHealthProjection, hash));
      if (gates === null || !gates.ok || !addGates(ctx, gates.gates.ruleEvaluations, "C3_WITHDRAWAL")) {
        issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_INVALID", ref: p.animalId });
        continue;
      }
      seenHealth.add(p.animalId);
      ctx.health = healthEvidenceOf(p);
      ctx.inputs.health = { timeline: p.timeline.fingerprint, medicineLedger: p.medicineLedger.fingerprint, withdrawalGate: p.withdrawalGate.fingerprint };
    }
  }

  const seenObligations = new Set<string>();
  for (const raw of read.obligations) {
    const ref = isRecord(raw) && typeof raw.animalId === "string" ? raw.animalId : null;
    // Consumed-field schema (every field the C2 projector reads, payload version included), stated consistency, then the frozen C2 projector (record fingerprints).
    const e = consume(C2_EVALUATION, raw);
    if (e === null || !c2Consistent(e)) {
      issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_INVALID", ref });
      continue;
    }
    const projected = failClosed(() => projectObligationHardGates(raw as unknown as AnimalObligationEvaluation, hash));
    if (projected === null || !projected.ok) {
      issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_INVALID", ref });
      continue;
    }
    const ctx = animals.get(e.animalId);
    if (!ctx) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_UNKNOWN_ANIMAL", ref: e.animalId });
    else if (seenObligations.has(e.animalId)) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_DUPLICATE", ref: e.animalId });
    else if (!sameInstant(e.effectiveAt, read.effectiveAt) || !sameInstant(e.knowledgeCutoff, read.knowledgeCutoff)) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_TIME_MISMATCH", ref: e.animalId });
    else if (!sameFingerprint(e.snapshotFingerprint, ctx.inputs.snapshotFingerprint)) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_LEDGER_MISMATCH", ref: e.animalId });
    else if (!obligationRecordsBelong(e, ctx, read)) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_FOREIGN_RECORD", ref: e.animalId });
    else if (!addGates(ctx, projected.projection.ruleEvaluations, "C2_OBLIGATION")) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_INVALID", ref: e.animalId });
    else {
      seenObligations.add(e.animalId);
      ctx.inputs.obligationRecords = e.results.map((r): AssessmentFingerprint => r.fingerprint).sort((a, b) => compareStrings(a.digest, b.digest));
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, animals };
}
