/**
 * Cattle C2 — append-only, bitemporal obligation fulfilment evidence.
 *
 * A record claims that a specific obligation occurrence was fulfilled
 * (`FULFILMENT`, with the valid-time instant `fulfilledAt`), or retracts an
 * earlier record (`RETRACTION`, which must supersede at least one record and
 * asserts no fulfilment). Each record names the obligation id and the exact
 * C0 rule id + version it claims to satisfy, the occurrence anchor it refers
 * to (`null` for single-occurrence anchors such as date of birth; the anchor
 * instant otherwise) and C1-compatible operational provenance
 * (`AnimalDataProvenance`: `receivedAt` is KNOWLEDGE time).
 *
 * Corrections are new records that `supersedes` earlier ids of the same
 * animal and obligation; nothing is deleted. Same id + identical content is
 * idempotent; same id + different content fails the whole log closed.
 * Competing corrections and other supersession defects are resolved at a
 * knowledge cutoff by the generic `bitemporal-records.ts` machinery and are
 * never decided by recency or source.
 *
 * Input is cloned once per record, validated, rebuilt from known fields and
 * deep-frozen. C1's provenance materialiser is module-private (and C1 is
 * frozen), so the same `AnimalDataProvenance` contract is validated here.
 */

import { canonicalizeValue } from "../../assessment-integrity";
import {
  ANIMAL_DATA_SOURCE_CATEGORIES,
  animalInstantKey,
  deepFreezeAnimalValue,
  isOpaqueRef,
  isValidAnimalInstant,
  toFarmReturnAnimalId,
  type AnimalDataProvenance,
  type AnimalDataSourceCategory,
  type FarmReturnAnimalId,
} from "../animal-ledger";
import { compareStrings } from "../integrity";
import type { RuleVersionRef } from "../rule";
import { collectBitemporalRecords, resolveBitemporalRecords, type BitemporalRecord, type BitemporalResolution } from "./bitemporal-records";

export const OBLIGATION_EVIDENCE_KINDS = ["FULFILMENT", "RETRACTION"] as const;
export type ObligationEvidenceKind = (typeof OBLIGATION_EVIDENCE_KINDS)[number];

export interface ObligationFulfilmentEvidence {
  evidenceId: string;
  animalId: FarmReturnAnimalId;
  obligationId: string;
  /** The exact rule version this record claims to satisfy. */
  rule: RuleVersionRef;
  /** The occurrence anchor instant claimed; `null` for single-occurrence anchors. */
  occurrenceAnchor: string | null;
  kind: ObligationEvidenceKind;
  /** VALID time the fulfilment happened; `null` for a RETRACTION. */
  fulfilledAt: string | null;
  provenance: AnimalDataProvenance;
  /** Earlier evidence ids (same animal, same obligation) this record corrects. Sorted. */
  supersedes: string[];
}

export interface ObligationEvidenceLog {
  animalId: FarmReturnAnimalId;
  /** Deep-frozen, sorted by `evidenceId`. */
  records: readonly ObligationFulfilmentEvidence[];
}

export type ObligationEvidenceIssueCode =
  | "CATTLE_OBLIGATION_EVIDENCE_INVALID_ANIMAL_ID"
  | "CATTLE_OBLIGATION_EVIDENCE_NOT_CLONEABLE"
  | "CATTLE_OBLIGATION_EVIDENCE_NOT_OBJECT"
  | "CATTLE_OBLIGATION_EVIDENCE_INVALID_ID"
  | "CATTLE_OBLIGATION_EVIDENCE_FOR_OTHER_ANIMAL"
  | "CATTLE_OBLIGATION_EVIDENCE_INVALID_OBLIGATION_ID"
  | "CATTLE_OBLIGATION_EVIDENCE_INVALID_RULE_REF"
  | "CATTLE_OBLIGATION_EVIDENCE_INVALID_OCCURRENCE_ANCHOR"
  | "CATTLE_OBLIGATION_EVIDENCE_INVALID_KIND"
  | "CATTLE_OBLIGATION_EVIDENCE_INVALID_FULFILLED_AT"
  | "CATTLE_OBLIGATION_EVIDENCE_RETRACTION_WITHOUT_TARGET"
  | "CATTLE_OBLIGATION_EVIDENCE_INVALID_PROVENANCE"
  | "CATTLE_OBLIGATION_EVIDENCE_INVALID_SUPERSEDES"
  | "CATTLE_OBLIGATION_EVIDENCE_SELF_SUPERSESSION"
  | "CATTLE_OBLIGATION_EVIDENCE_DUPLICATE_ID_DIFFERENT_CONTENT";

export interface ObligationEvidenceIssue {
  code: ObligationEvidenceIssueCode;
  evidenceId: string | null;
}

export type ObligationEvidenceLogResult =
  | { ok: true; log: ObligationEvidenceLog; idempotentDuplicateIds: string[] }
  | { ok: false; issues: ObligationEvidenceIssue[] };

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalRef(value: unknown): { ok: boolean; value: string | null } {
  if (value === undefined || value === null) return { ok: true, value: null };
  return isOpaqueRef(value) ? { ok: true, value } : { ok: false, value: null };
}

function provenanceOf(raw: unknown): AnimalDataProvenance | null {
  if (!isRecord(raw)) return null;
  const category = raw.sourceCategory;
  if (typeof category !== "string" || !(ANIMAL_DATA_SOURCE_CATEGORIES as readonly string[]).includes(category)) return null;
  if (!isValidAnimalInstant(raw.receivedAt)) return null;
  const observedAt = raw.observedAt ?? null;
  if (observedAt !== null && !isValidAnimalInstant(observedAt)) return null;
  const system = optionalRef(raw.sourceSystem);
  const record = optionalRef(raw.sourceRecordRef);
  const actor = optionalRef(raw.actor);
  if (!system.ok || !record.ok || !actor.ok) return null;
  return {
    sourceCategory: category as AnimalDataSourceCategory,
    sourceSystem: system.value,
    sourceRecordRef: record.value,
    observedAt: observedAt as string | null,
    receivedAt: raw.receivedAt,
    actor: actor.value,
  };
}

function materialise(animalId: FarmReturnAnimalId, input: unknown): { record: ObligationFulfilmentEvidence } | { issues: ObligationEvidenceIssue[] } {
  let raw: unknown;
  try {
    raw = structuredClone(input);
  } catch {
    return { issues: [{ code: "CATTLE_OBLIGATION_EVIDENCE_NOT_CLONEABLE", evidenceId: null }] };
  }
  if (!isRecord(raw)) return { issues: [{ code: "CATTLE_OBLIGATION_EVIDENCE_NOT_OBJECT", evidenceId: null }] };
  const evidenceId = isOpaqueRef(raw.evidenceId) ? raw.evidenceId : null;
  const issues: ObligationEvidenceIssue[] = [];
  const add = (code: ObligationEvidenceIssueCode) => issues.push({ code, evidenceId });
  if (evidenceId === null) add("CATTLE_OBLIGATION_EVIDENCE_INVALID_ID");
  if (raw.animalId !== animalId) add("CATTLE_OBLIGATION_EVIDENCE_FOR_OTHER_ANIMAL");
  if (!isOpaqueRef(raw.obligationId)) add("CATTLE_OBLIGATION_EVIDENCE_INVALID_OBLIGATION_ID");
  const rule = raw.rule;
  const ruleOk = isRecord(rule) && isOpaqueRef(rule.ruleId) && Number.isSafeInteger(rule.version) && (rule.version as number) >= 1;
  if (!ruleOk) add("CATTLE_OBLIGATION_EVIDENCE_INVALID_RULE_REF");
  const occurrenceAnchor = raw.occurrenceAnchor ?? null;
  if (occurrenceAnchor !== null && !isValidAnimalInstant(occurrenceAnchor)) add("CATTLE_OBLIGATION_EVIDENCE_INVALID_OCCURRENCE_ANCHOR");
  const kind = raw.kind;
  if (typeof kind !== "string" || !(OBLIGATION_EVIDENCE_KINDS as readonly string[]).includes(kind)) add("CATTLE_OBLIGATION_EVIDENCE_INVALID_KIND");
  const fulfilledAt = raw.fulfilledAt ?? null;
  if (kind === "FULFILMENT" && !isValidAnimalInstant(fulfilledAt)) add("CATTLE_OBLIGATION_EVIDENCE_INVALID_FULFILLED_AT");
  if (kind === "RETRACTION" && fulfilledAt !== null) add("CATTLE_OBLIGATION_EVIDENCE_INVALID_FULFILLED_AT");
  const provenance = provenanceOf(raw.provenance);
  if (!provenance) add("CATTLE_OBLIGATION_EVIDENCE_INVALID_PROVENANCE");
  const rawSupersedes = raw.supersedes ?? [];
  let supersedes: string[] = [];
  if (!Array.isArray(rawSupersedes) || !rawSupersedes.every(isOpaqueRef) || new Set(rawSupersedes).size !== rawSupersedes.length) {
    add("CATTLE_OBLIGATION_EVIDENCE_INVALID_SUPERSEDES");
  } else {
    supersedes = [...(rawSupersedes as string[])].sort(compareStrings);
    if (evidenceId !== null && supersedes.includes(evidenceId)) add("CATTLE_OBLIGATION_EVIDENCE_SELF_SUPERSESSION");
    if (kind === "RETRACTION" && supersedes.length === 0) add("CATTLE_OBLIGATION_EVIDENCE_RETRACTION_WITHOUT_TARGET");
  }
  if (issues.length > 0 || evidenceId === null || !provenance) return { issues };
  return {
    record: {
      evidenceId,
      animalId,
      obligationId: raw.obligationId as string,
      rule: { ruleId: (rule as Raw).ruleId as string, version: (rule as Raw).version as number },
      occurrenceAnchor: occurrenceAnchor as string | null,
      kind: kind as ObligationEvidenceKind,
      fulfilledAt: fulfilledAt as string | null,
      provenance,
      supersedes,
    },
  };
}

const instantKey = (v: string | null) => (v === null ? null : animalInstantKey(v));

/** Every field; instant-typed fields compared by instant, not spelling. */
export function obligationEvidenceContentKey(r: ObligationFulfilmentEvidence): string {
  return canonicalizeValue({
    ...r,
    occurrenceAnchor: instantKey(r.occurrenceAnchor),
    fulfilledAt: instantKey(r.fulfilledAt),
    provenance: { ...r.provenance, receivedAt: instantKey(r.provenance.receivedAt), observedAt: instantKey(r.provenance.observedAt) },
  });
}

/** What competing corrections must agree on (provenance excluded, as in C1). */
export function obligationEvidenceClaimKey(r: ObligationFulfilmentEvidence): string {
  return canonicalizeValue({
    kind: r.kind,
    obligationId: r.obligationId,
    rule: r.rule,
    occurrenceAnchor: instantKey(r.occurrenceAnchor),
    fulfilledAt: instantKey(r.fulfilledAt),
  });
}

type Envelope = ObligationFulfilmentEvidence & BitemporalRecord;

function envelope(r: ObligationFulfilmentEvidence): Envelope {
  return { ...r, recordId: r.evidenceId, receivedAt: r.provenance.receivedAt };
}

function strip(e: Envelope): ObligationFulfilmentEvidence {
  const { recordId, receivedAt, ...record } = e;
  void recordId;
  void receivedAt;
  return record;
}

/**
 * Builds a validated, deep-frozen evidence log for one animal. Input order
 * never matters; any invalid record or reused id with different content
 * fails the whole log closed.
 */
export function createObligationEvidenceLog(animalId: string, inputs: readonly unknown[]): ObligationEvidenceLogResult {
  const id = toFarmReturnAnimalId(animalId);
  if (!id) return { ok: false, issues: [{ code: "CATTLE_OBLIGATION_EVIDENCE_INVALID_ANIMAL_ID", evidenceId: null }] };
  const issues: ObligationEvidenceIssue[] = [];
  const records: Envelope[] = [];
  for (const input of Array.from(inputs)) {
    const result = materialise(id, input);
    if ("issues" in result) issues.push(...result.issues);
    else records.push(envelope(result.record));
  }
  const collected = collectBitemporalRecords(records, (e) => obligationEvidenceContentKey(strip(e)));
  if (!collected.ok) {
    for (const i of collected.issues) {
      issues.push({
        code: i.code === "CATTLE_RECORD_SELF_SUPERSESSION" ? "CATTLE_OBLIGATION_EVIDENCE_SELF_SUPERSESSION" : "CATTLE_OBLIGATION_EVIDENCE_DUPLICATE_ID_DIFFERENT_CONTENT",
        evidenceId: i.recordId,
      });
    }
  }
  if (issues.length > 0 || !collected.ok) {
    const unique = new Map(issues.map((i) => [canonicalizeValue(i), i]));
    return { ok: false, issues: [...unique.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, i]) => i) };
  }
  const log: ObligationEvidenceLog = { animalId: id, records: collected.records.map(strip) };
  return { ok: true, log: deepFreezeAnimalValue(log), idempotentDuplicateIds: collected.idempotentDuplicateIds };
}

/** Appends records, returning a NEW log (the supplied one is re-validated, never modified). */
export function appendObligationEvidence(log: ObligationEvidenceLog, inputs: readonly unknown[]): ObligationEvidenceLogResult {
  let existing: unknown;
  try {
    existing = structuredClone(log);
  } catch {
    return { ok: false, issues: [{ code: "CATTLE_OBLIGATION_EVIDENCE_NOT_CLONEABLE", evidenceId: null }] };
  }
  if (!isRecord(existing) || !Array.isArray(existing.records) || typeof existing.animalId !== "string") {
    return { ok: false, issues: [{ code: "CATTLE_OBLIGATION_EVIDENCE_NOT_OBJECT", evidenceId: null }] };
  }
  return createObligationEvidenceLog(existing.animalId, [...existing.records, ...Array.from(inputs)]);
}

/** Resolves the log as known at `knowledgeCutoff`; corrections may only link within one obligation. */
export function resolveObligationEvidence(log: ObligationEvidenceLog, knowledgeCutoff: string): BitemporalResolution<ObligationFulfilmentEvidence & BitemporalRecord> {
  return resolveBitemporalRecords(log.records.map(envelope), knowledgeCutoff, {
    linkAllowed: (source, target) => source.obligationId === target.obligationId,
    competitionKey: obligationEvidenceClaimKey,
  });
}
