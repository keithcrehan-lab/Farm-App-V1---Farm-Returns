/**
 * Cattle C7 — predecessor adapters and verifiers.
 *
 * C7 consumes frozen predecessor OUTPUTS only (CAT-INV-014/023) and never
 * recreates a predecessor calculation:
 * - C1: the ledger is re-materialised (`rematerialiseAnimalLedger`) and
 *   projected (`projectAnimalSnapshot`) at the query's own times; its
 *   snapshot fingerprint binds every other predecessor output.
 * - C3: an `AnimalHealthProjection`, re-verified (`verifyAnimalHealthProjection`),
 *   unfiltered, at the same animal / times / snapshot; gates only through
 *   `projectWithdrawalHardGates`.
 * - C2: an `AnimalObligationEvaluation` through `projectObligationHardGates`.
 *
 * An envelope never vouches for the records it carries: every consumed
 * record must individually prove it belongs to this evaluation, using every
 * binding the frozen contract exports (CAT-INV-014/021/023). A mismatch is
 * never repaired or skipped — the whole request fails closed.
 */

import type { AssessmentFingerprint } from "../../assessment-integrity";
import { animalInstantKey, compareInstants, isOpaqueRef, isValidAnimalInstant, rematerialiseAnimalLedger, type AnimalLedger } from "../animal-ledger";
import { computeAnimalSnapshotFingerprint, projectAnimalSnapshot, type AnimalSnapshot } from "../animal-snapshot";
import type { CattleEvaluationState, RuleEvaluationRecord } from "../evaluation";
import { projectWithdrawalHardGates, verifyAnimalHealthProjection, type AnimalHealthProjection, type HealthTimelineEntry, type MedicineLedgerEntry } from "../health";
import { isRecord } from "../health/health-input";
import { compareStrings, sameFingerprint, type CattleHash } from "../integrity";
import { CATTLE_OBLIGATION_PAYLOAD_VERSION, projectObligationHardGates, type AnimalObligationEvaluation } from "../regulatory";
import { canonicalizeValue } from "../../assessment-integrity";
import { semanticHealthRecord } from "../health";
import { canonicalInstant } from "./programme-definition";
import { conformsToPolicy } from "./programme-fields";
import type { ProgrammeAnimalInputs, ProgrammeIssue } from "./programme-types";

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

export interface GateSupply {
  state: CattleEvaluationState;
  source: "C2_OBLIGATION" | "C3_WITHDRAWAL";
}

/** Everything C7 knows about one evaluated animal, all of it verified and context-bound. */
export interface AnimalContext {
  animalId: string;
  ledger: AnimalLedger;
  snapshot: AnimalSnapshot;
  /** The verified C3 projection, or `null` when none was supplied. */
  health: AnimalHealthProjection | null;
  /** C3 medicine-ledger entries by record id (empty when no projection). */
  medicineEntries: ReadonlyMap<string, MedicineLedgerEntry>;
  /** Requested gate rule id → supplied gate states. */
  gates: Map<string, GateSupply[]>;
  inputs: ProgrammeAnimalInputs;
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

/** Runs a frozen predecessor verifier; a malformed canonical value it cannot read fails closed (`null`). */
function failClosed<T>(run: () => T): T | null {
  try {
    return run();
  } catch {
    return null;
  }
}

const sameInstant = (a: unknown, b: string) => isValidAnimalInstant(a) && animalInstantKey(a) === animalInstantKey(b);
const sameNullableInstant = (a: unknown, b: unknown) => (a === null ? b === null : isValidAnimalInstant(a) && isValidAnimalInstant(b) && animalInstantKey(a) === animalInstantKey(b));
const notAfter = (t: unknown, bound: string) => isValidAnimalInstant(t) && compareInstants(t, bound) <= 0;
const distinct = (keys: readonly string[]) => new Set(keys).size === keys.length;
const isFingerprint = (v: unknown): v is AssessmentFingerprint => isRecord(v) && typeof v.digest === "string";

/**
 * C2: the envelope and every state record carry the supported C2 payload
 * version; every record carries this animal, this C1 snapshot fingerprint
 * and the query's own times; record identities (obligation, occurrence) are
 * distinct.
 */
function obligationRecordsBelong(e: AnimalObligationEvaluation, ctx: AnimalContext, read: ReadRequest): boolean {
  if (e.obligationPayloadVersion !== CATTLE_OBLIGATION_PAYLOAD_VERSION) return false;
  const belongs = (r: unknown) =>
    isRecord(r) &&
    r.obligationPayloadVersion === CATTLE_OBLIGATION_PAYLOAD_VERSION &&
    r.animalId === ctx.animalId &&
    isFingerprint(r.snapshotFingerprint) &&
    sameFingerprint(r.snapshotFingerprint, ctx.inputs.snapshotFingerprint) &&
    sameInstant(r.effectiveAt, read.effectiveAt) &&
    sameInstant(r.knowledgeCutoff, read.knowledgeCutoff);
  return e.results.every(belongs) && distinct(e.results.map((r) => JSON.stringify([r.obligationId, r.occurrence?.occurrenceId ?? null])));
}

/**
 * C3: records carry no snapshot of their own, so the projection's animal /
 * times / snapshot (checked by the caller) bind the view; every timeline
 * and medicine-ledger entry must carry this animal, wrap the record it names
 * (same id, kind, valid time), be among the projection's known records, be
 * known by the cutoff and — timeline — have occurred by `effectiveAt` (C3
 * lists later records apart). Entry ids are distinct within each view, and
 * each ledger entry agrees with its timeline entry (record, status,
 * correction state) or is a not-yet-occurred record.
 */
function healthRecordsBelong(p: AnimalHealthProjection, ctx: AnimalContext, read: ReadRequest): boolean {
  if (!Array.isArray(p.knownRecordIds) || !Array.isArray(p.timeline.notYetOccurredRecordIds)) return false;
  const known = new Set<unknown>(p.knownRecordIds);
  const wraps = (entry: unknown): entry is (HealthTimelineEntry | MedicineLedgerEntry) & { record: Record<string, unknown> } => {
    if (!isRecord(entry) || !isRecord(entry.record) || !isRecord(entry.record.provenance)) return false;
    const r = entry.record;
    return (
      isOpaqueRef(entry.recordId) &&
      r.recordId === entry.recordId &&
      known.has(entry.recordId) &&
      r.animalId === ctx.animalId &&
      sameNullableInstant(entry.occurredAt, r.occurredAt) &&
      notAfter((r.provenance as Record<string, unknown>).receivedAt, read.knowledgeCutoff)
    );
  };
  const timeline: unknown[] = p.timeline.entries;
  const ledger: unknown[] = p.medicineLedger.entries;
  const timelineOk = timeline.every((e) => wraps(e) && (e as HealthTimelineEntry).kind === e.record.kind && (e.occurredAt === null || notAfter(e.occurredAt, read.effectiveAt)));
  const ledgerOk = ledger.every((e) => wraps(e) && e.record.kind === "MEDICINE_ADMINISTRATION");
  const timelineIds = timeline.map((e) => (e as HealthTimelineEntry).recordId);
  // Cross-view consistency: a medicine-ledger entry is the same record, status and correction state as its timeline entry,
  // or (when it occurs after effectiveAt) one of the projection's not-yet-occurred records.
  const byId = new Map(timeline.map((e) => [(e as HealthTimelineEntry).recordId, e as HealthTimelineEntry]));
  const crossViewOk = ledger.every((raw) => {
    const e = raw as MedicineLedgerEntry;
    const t = byId.get(e.recordId);
    if (t === undefined) return p.timeline.notYetOccurredRecordIds.includes(e.recordId);
    return (
      t.status === e.status &&
      t.inCompetition === e.inCompetition &&
      canonicalizeValue(t.supersededBy) === canonicalizeValue(e.supersededBy) &&
      canonicalizeValue(semanticHealthRecord(t.record)) === canonicalizeValue(semanticHealthRecord(e.record))
    );
  });
  return (
    timelineOk &&
    ledgerOk &&
    crossViewOk &&
    distinct(timelineIds) &&
    distinct(ledger.map((e) => (e as MedicineLedgerEntry).recordId)) &&
    p.timeline.notYetOccurredRecordIds.every((id) => known.has(id) && !timelineIds.includes(id))
  );
}

/** C3 filters that leave the timeline complete. */
const UNFILTERED = (f: unknown) => isRecord(f) && f.kinds === null && f.occurredFrom === null && f.occurredTo === null;

/** C1 ledgers, then C3 projections, then C2 evaluations — each verified and context-bound. */
export function readAnimals(read: ReadRequest, hash: CattleHash): { ok: true; animals: Map<string, AnimalContext> } | { ok: false; issues: ProgrammeIssue[] } {
  const issues: ProgrammeIssue[] = [];
  const animals = new Map<string, AnimalContext>();
  for (const raw of read.ledgers) {
    const ledger = rematerialiseAnimalLedger(raw);
    if (!ledger.ok) {
      issues.push({ code: "CATTLE_PROGRAMME_INVALID_LEDGER", ref: isRecord(raw) && typeof raw.animalId === "string" ? raw.animalId : null });
      continue;
    }
    const animalId = ledger.ledger.animalId as string;
    if (animals.has(animalId)) {
      issues.push({ code: "CATTLE_PROGRAMME_DUPLICATE_ANIMAL", ref: animalId });
      continue;
    }
    const projected = projectAnimalSnapshot(ledger.ledger, { effectiveAt: read.effectiveAt, knowledgeCutoff: read.knowledgeCutoff });
    if (!projected.ok) {
      issues.push({ code: "CATTLE_PROGRAMME_INVALID_LEDGER", ref: animalId });
      continue;
    }
    animals.set(animalId, {
      animalId,
      ledger: ledger.ledger,
      snapshot: projected.snapshot,
      health: null,
      medicineEntries: new Map(),
      gates: new Map(),
      inputs: { snapshotFingerprint: computeAnimalSnapshotFingerprint(projected.snapshot, hash), health: null, obligationRecords: null },
    });
  }
  const addGates = (ctx: AnimalContext, records: readonly RuleEvaluationRecord[], source: GateSupply["source"]) => {
    for (const r of records) ctx.gates.set(r.requestedRuleId, [...(ctx.gates.get(r.requestedRuleId) ?? []), { state: r.state, source }]);
  };

  const seenHealth = new Set<string>();
  for (const raw of read.health) {
    const p = raw as AnimalHealthProjection;
    const animalId = isRecord(raw) && typeof raw.animalId === "string" ? raw.animalId : null;
    if (!failClosed(() => verifyAnimalHealthProjection(p, hash).valid)) {
      issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_INVALID", ref: animalId });
      continue;
    }
    const ctx = animals.get(p.animalId);
    if (!ctx) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_UNKNOWN_ANIMAL", ref: p.animalId });
    else if (seenHealth.has(p.animalId)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_DUPLICATE", ref: p.animalId });
    else if (!sameInstant(p.effectiveAt, read.effectiveAt) || !sameInstant(p.knowledgeCutoff, read.knowledgeCutoff)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_TIME_MISMATCH", ref: p.animalId });
    else if (!UNFILTERED(p.timeline.filter)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_FILTERED", ref: p.animalId });
    else if (!sameFingerprint(p.snapshotFingerprint, ctx.inputs.snapshotFingerprint)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_LEDGER_MISMATCH", ref: p.animalId });
    else if (!healthRecordsBelong(p, ctx, read)) issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_FOREIGN_RECORD", ref: p.animalId });
    else {
      const gates = failClosed(() => projectWithdrawalHardGates(p, hash));
      if (!gates || !gates.ok) {
        issues.push({ code: "CATTLE_PROGRAMME_HEALTH_PROJECTION_INVALID", ref: p.animalId });
        continue;
      }
      seenHealth.add(p.animalId);
      ctx.health = p;
      ctx.medicineEntries = new Map(p.medicineLedger.entries.map((e) => [e.recordId, e]));
      ctx.inputs.health = { timeline: p.timeline.fingerprint, medicineLedger: p.medicineLedger.fingerprint, withdrawalGate: p.withdrawalGate.fingerprint };
      addGates(ctx, gates.gates.ruleEvaluations, "C3_WITHDRAWAL");
    }
  }

  const seenObligations = new Set<string>();
  for (const raw of read.obligations) {
    const e = raw as AnimalObligationEvaluation;
    const animalId = isRecord(raw) && typeof raw.animalId === "string" ? raw.animalId : null;
    const projected = isRecord(raw) && Array.isArray(raw.results) ? failClosed(() => projectObligationHardGates(e, hash)) : null;
    if (!projected || !projected.ok) {
      issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_INVALID", ref: animalId });
      continue;
    }
    const ctx = animals.get(e.animalId);
    if (!ctx) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_UNKNOWN_ANIMAL", ref: e.animalId });
    else if (seenObligations.has(e.animalId)) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_DUPLICATE", ref: e.animalId });
    else if (!sameInstant(e.effectiveAt, read.effectiveAt) || !sameInstant(e.knowledgeCutoff, read.knowledgeCutoff)) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_TIME_MISMATCH", ref: e.animalId });
    else if (!sameFingerprint(e.snapshotFingerprint, ctx.inputs.snapshotFingerprint)) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_LEDGER_MISMATCH", ref: e.animalId });
    else if (!obligationRecordsBelong(e, ctx, read)) issues.push({ code: "CATTLE_PROGRAMME_OBLIGATIONS_FOREIGN_RECORD", ref: e.animalId });
    else {
      seenObligations.add(e.animalId);
      ctx.inputs.obligationRecords = e.results.map((r) => r.fingerprint).sort((a, b) => compareStrings(a.digest, b.digest));
      addGates(ctx, projected.projection.ruleEvaluations, "C2_OBLIGATION");
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, animals };
}
