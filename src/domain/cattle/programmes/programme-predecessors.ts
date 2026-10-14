/**
 * Cattle C7 — THE predecessor composition boundary (CAT-INV-014/021/023/028;
 * C7 architecture review 2026-10-14, `.agent/campaigns/cattle-engine-v1/C7_ARCHITECTURE_REVIEW.md`).
 *
 * canonical upstream evidence (C1 ledgers; C3 health + product records and
 * food products; C2 catalogue, obligation ids and fulfilment evidence) and
 * the trusted C2 implementation registry
 *   → the frozen authoritative predecessor engines, invoked here and only
 *     here: C1 `rematerialiseAnimalLedger` / `projectAnimalSnapshot` /
 *     `computeAnimalSnapshotFingerprint`; C4 `resolveGroupScope`; C3
 *     `projectAnimalHealth` (+ `projectWithdrawalHardGates`); C2
 *     `evaluateHerdObligations` (+ `projectObligationHardGates`)
 *   → authoritative predecessor results — produced in-process, never
 *     supplied by the caller
 *   → the consumed-field schema (`programme-consumed.ts`, CAT-INV-028): a
 *     fresh, typed copy of exactly the fields C7 reads
 *   → C7's internal evidence representation (`AnimalContext`).
 *
 * Invoking a frozen predecessor engine over that predecessor's canonical
 * inputs is delegation to the authoritative interpreter, not
 * reinterpretation (CAT-INV-023). C7 never reimplements predecessor
 * derivation: no C2/C3 rule is restated here, and no caller-supplied derived
 * predecessor output is accepted, so there is nothing to authenticate by
 * reconstruction. Completeness of the canonical evidence supplied remains
 * the adapter's responsibility (the C2 / C3 precedent). The engines'
 * fingerprints remain the result binding of the evidence C7 used.
 */

import type { AssessmentFingerprint } from "../../assessment-integrity";
import { animalInstantKey, rematerialiseAnimalLedger, type AnimalLedger } from "../animal-ledger";
import { computeAnimalSnapshotFingerprint, projectAnimalSnapshot } from "../animal-snapshot";
import type { CattleEvaluationState } from "../evaluation";
import { projectAnimalHealth, projectWithdrawalHardGates, type ProductBindingState } from "../health";
import { isRecord } from "../health/health-input";
import { compareStrings, sameFingerprint, type CattleHash } from "../integrity";
import { evaluateHerdObligations, projectObligationHardGates, type ObligationImplementationRegistry } from "../regulatory";
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
  type ConsumedScope,
  type ConsumedSnapshot,
} from "./programme-consumed";
import { canonicalInstant } from "./programme-definition";
import { computeProgrammeFingerprint } from "./programme-integrity";
import { conformsToPolicy } from "./programme-fields";
import type { ProgrammeAnimalInputs, ProgrammeIssue } from "./programme-types";

// ---------------------------------------------------------------------------
// C7 internal evidence representation (authoritative, validated)
// ---------------------------------------------------------------------------

/** One C3 health record as C7 uses it (valid time in canonical spelling). */
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

/** A C3 product binding (a frozen state; the bound product exactly when BOUND). */
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

/** Everything C7 knows about one evaluated animal — all of it produced by the frozen predecessor engines. */
export interface AnimalContext {
  animalId: string;
  /** C1 facts C7 reads. */
  facts: ConsumedSnapshot;
  /** `null` = no C3 evidence supplied for this animal. */
  health: HealthEvidence | null;
  /** Requested gate rule id → gate states from the C2 / C3 hard-gate projections. */
  gates: Map<string, GateSupply[]>;
  inputs: ProgrammeAnimalInputs;
}

/** The C1-rematerialised ledger of each context — private to this boundary. */
const LEDGERS = new WeakMap<AnimalContext, AnimalLedger>();

/** Trusted, non-canonical parameters (C2 precedent: the implementation registry is trusted code, never request data). */
export interface ProgrammeTrustedInputs {
  /** C2 implementation registry (`createObligationImplementationRegistry`); required when obligation evidence is supplied. */
  obligationImplementations?: ObligationImplementationRegistry;
}

export interface ReadRequest {
  effectiveAt: string;
  knowledgeCutoff: string;
  definitions: unknown[];
  reviews: unknown[];
  completions: unknown[];
  ledgers: unknown[];
  health: { foodProducts: unknown[]; productRecords: unknown[]; animals: { animalId: string; healthRecords: unknown[] }[] } | null;
  obligations: { catalogue: unknown; obligationIds: unknown[]; evidence: unknown[] } | null;
}

/** The request envelope under the field policy; query instants canonical. */
export function readRequest(req: unknown): { ok: true; read: ReadRequest } | { ok: false; issues: ProgrammeIssue[] } {
  const invalid = { ok: false as const, issues: [{ code: "CATTLE_PROGRAMME_INVALID_REQUEST" as const, ref: null }] };
  if (!conformsToPolicy(req, "request") || !conformsToPolicy(req.query, "query")) return invalid;
  const health = req.health;
  if (health !== null && (!conformsToPolicy(health, "healthEvidence") || !(health.animals as unknown[]).every((a) => conformsToPolicy(a, "healthAnimal")))) return invalid;
  if (req.obligations !== null && !conformsToPolicy(req.obligations, "obligationEvidence")) return invalid;
  const effectiveAt = canonicalInstant(req.query.effectiveAt);
  const knowledgeCutoff = canonicalInstant(req.query.knowledgeCutoff);
  const issues: ProgrammeIssue[] = [];
  if (effectiveAt === null) issues.push({ code: "CATTLE_PROGRAMME_INVALID_EFFECTIVE_AT", ref: null });
  if (knowledgeCutoff === null) issues.push({ code: "CATTLE_PROGRAMME_INVALID_KNOWLEDGE_CUTOFF", ref: null });
  if (effectiveAt === null || knowledgeCutoff === null) return { ok: false, issues };
  const list = (k: "definitions" | "reviews" | "completions" | "ledgers") => req[k] as unknown[];
  return {
    ok: true,
    read: {
      effectiveAt,
      knowledgeCutoff,
      definitions: list("definitions"),
      reviews: list("reviews"),
      completions: list("completions"),
      ledgers: list("ledgers"),
      health: health as ReadRequest["health"],
      obligations: req.obligations as ReadRequest["obligations"],
    },
  };
}

/** Runs a frozen predecessor engine; anything it cannot read fails closed (`null`). */
function failClosed<T>(run: () => T): T | null {
  try {
    return run();
  } catch {
    return null;
  }
}

const sameInstant = (a: string, b: string) => animalInstantKey(a) === animalInstantKey(b);

/** The validated product id / event type of a validated record (variant fields only). */
function productIdOf(record: ConsumedHealthEntry["record"]): string | null {
  return record.kind === "MEDICINE_ADMINISTRATION" ? (record as { productId: string | null }).productId : null;
}
function eventTypeOf(record: ConsumedHealthEntry["record"]): string | null {
  return record.kind === "VETERINARY_EVENT" ? (record as { eventType: string }).eventType : null;
}

/** C7's internal representation of an authoritative C3 projection. */
function healthEvidenceOf(p: ConsumedHealthProjection): HealthEvidence {
  const records = p.timeline.entries.map(
    (e): EvidenceRecord => ({
      recordId: e.recordId,
      kind: e.record.kind,
      occurredAt: e.occurredAt === null ? null : (canonicalInstant(e.occurredAt) as string),
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

// ---------------------------------------------------------------------------
// C4 — group scope at an instant (composed, validated)
// ---------------------------------------------------------------------------

/** C4 `resolveGroupScope` at `at` over this animal's C1-validated ledger. */
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
// Composition of every animal's predecessor results
// ---------------------------------------------------------------------------

/** C1, then C3 (per animal), then C2 (the herd) — each through its frozen engine. */
export function readAnimals(read: ReadRequest, trusted: ProgrammeTrustedInputs, hash: CattleHash): { ok: true; animals: Map<string, AnimalContext> } | { ok: false; issues: ProgrammeIssue[] } {
  const issues: ProgrammeIssue[] = [];
  const animals = new Map<string, AnimalContext>();
  const ledgers: AnimalLedger[] = [];

  // C1: rematerialise and project each ledger.
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
      inputs: { snapshotFingerprint: computeAnimalSnapshotFingerprint(projected.snapshot, hash), health: null, obligationRecords: null, obligationInputs: null },
    };
    LEDGERS.set(ctx, ledger.ledger);
    ledgers.push(ledger.ledger);
    animals.set(animalId, ctx);
  }
  const addGates = (ctx: AnimalContext, raw: unknown, source: GateSupply["source"]): boolean => {
    const records = consume(GATE_PROJECTION, raw);
    if (records === null) return false;
    for (const r of records) ctx.gates.set(r.requestedRuleId, [...(ctx.gates.get(r.requestedRuleId) ?? []), { state: r.state, source }]);
    return true;
  };

  // C3: one `projectAnimalHealth` per listed animal over its canonical health records.
  const health = read.health;
  if (health !== null) {
    const seen = new Set<string>();
    for (const entry of health.animals) {
      const ctx = animals.get(entry.animalId);
      if (!ctx) {
        issues.push({ code: "CATTLE_PROGRAMME_HEALTH_EVIDENCE_UNKNOWN_ANIMAL", ref: entry.animalId });
        continue;
      }
      if (seen.has(entry.animalId)) {
        issues.push({ code: "CATTLE_PROGRAMME_HEALTH_EVIDENCE_DUPLICATE_ANIMAL", ref: entry.animalId });
        continue;
      }
      seen.add(entry.animalId);
      const ledger = LEDGERS.get(ctx) as AnimalLedger;
      const query = { effectiveAt: read.effectiveAt, knowledgeCutoff: read.knowledgeCutoff, foodProducts: health.foodProducts as string[] };
      const result = failClosed(() => projectAnimalHealth({ ledger, healthRecords: entry.healthRecords, productRecords: health.productRecords, query }, hash));
      const projection = result !== null && result.ok ? result.projection : null;
      const p = projection === null ? null : consume(C3_PROJECTION, projection);
      const gates = projection === null ? null : failClosed(() => projectWithdrawalHardGates(projection, hash));
      // The engine composed the projection from this ledger at the query's times; anything else is an engine failure.
      if (p === null || gates === null || !gates.ok || !sameFingerprint(p.snapshotFingerprint, ctx.inputs.snapshotFingerprint) || !addGates(ctx, gates.gates.ruleEvaluations, "C3_WITHDRAWAL")) {
        issues.push({ code: "CATTLE_PROGRAMME_HEALTH_EVIDENCE_INVALID", ref: entry.animalId });
        continue;
      }
      ctx.health = healthEvidenceOf(p);
      ctx.inputs.health = { timeline: p.timeline.fingerprint, medicineLedger: p.medicineLedger.fingerprint, withdrawalGate: p.withdrawalGate.fingerprint };
    }
  }

  // C2: one `evaluateHerdObligations` over every evaluated ledger (C2 partitions the evidence).
  const obligations = read.obligations;
  if (obligations !== null && issues.length === 0) {
    const implementations = trusted.obligationImplementations;
    if (implementations === undefined) {
      issues.push({ code: "CATTLE_PROGRAMME_OBLIGATION_IMPLEMENTATIONS_MISSING", ref: null });
    } else {
      const query = { effectiveAt: read.effectiveAt, knowledgeCutoff: read.knowledgeCutoff, obligationIds: obligations.obligationIds as string[] };
      const herd = failClosed(() => evaluateHerdObligations({ ledgers, evidence: obligations.evidence, catalogue: obligations.catalogue as never, implementations, query }, hash));
      // C2's own herd / catalogue issues (malformed or unattributable canonical C2 evidence) fail the request closed.
      if (herd === null || !herd.ok || herd.herd.issues.length > 0 || herd.herd.catalogueIssues.length > 0) {
        issues.push({ code: "CATTLE_PROGRAMME_OBLIGATION_EVIDENCE_INVALID", ref: null });
      } else {
        // The exact canonical C2 inputs composed (evidence fingerprint): binds what C2's own records may not cover.
        const obligationInputs = computeProgrammeFingerprint("CATTLE_PROGRAMME_OBLIGATION_INPUTS", { catalogue: obligations.catalogue, obligationIds: obligations.obligationIds }, hash);
        for (const raw of herd.herd.animals) {
          const e = consume(C2_EVALUATION, raw);
          const ctx = e === null ? undefined : animals.get(e.animalId);
          const gates = e === null ? null : failClosed(() => projectObligationHardGates(raw, hash));
          if (e === null || ctx === undefined || gates === null || !gates.ok || !sameFingerprint(e.snapshotFingerprint, ctx.inputs.snapshotFingerprint) || !sameInstant(e.effectiveAt, read.effectiveAt) || !addGates(ctx, gates.projection.ruleEvaluations, "C2_OBLIGATION")) {
            issues.push({ code: "CATTLE_PROGRAMME_OBLIGATION_EVIDENCE_INVALID", ref: isRecord(raw) && typeof raw.animalId === "string" ? raw.animalId : null });
            continue;
          }
          ctx.inputs.obligationRecords = e.results.map((r): AssessmentFingerprint => r.fingerprint).sort((a, b) => compareStrings(a.digest, b.digest));
          ctx.inputs.obligationInputs = obligationInputs;
        }
      }
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, animals };
}
