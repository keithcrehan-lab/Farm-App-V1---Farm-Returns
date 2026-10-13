/**
 * Cattle C7 — explicit programme completion declarations.
 *
 * A completion declaration is an append-only, bitemporal record by a
 * veterinarian or farmer stating that one programme occurrence (named by its
 * deterministic occurrence id) was completed — either directly
 * (`evidence: {kind: "DECLARED", completedAt}`) or by an explicit link to one
 * C3 health record (`evidence: {kind: "HEALTH_RECORD", healthRecordId}`; the
 * completion time is then the C3 record's own valid time). A `RETRACTION`
 * withdraws the declarations it supersedes. Declarations are version-bound:
 * they name the exact programme version they complete (CAT-INV-025).
 * Nothing is matched fuzzily: an occurrence is named exactly.
 *
 * Valid time: `completedAt` (DECLARED) or the linked C3 record's
 * `occurredAt`. Knowledge time: `provenance.receivedAt`. Admission order
 * (TEMPORAL_EVIDENCE.md): readable knowledge time after the cutoff ⇒ set
 * aside before any other read; unreadable ⇒ fails closed; identity before
 * validity; content and provenance validation; supersession through C2
 * `collectBitemporalRecords` / `resolveBitemporalRecords` (a link must stay
 * within one animal, programme, action and occurrence; unknown target, out of
 * scope or cycle fails closed). Competing live corrections are reported with
 * no winner (CAT-INV-026).
 */

import { canonicalizeValue } from "../../assessment-integrity";
import { ANIMAL_DATA_SOURCE_CATEGORIES, isOpaqueRef, type AnimalDataSourceCategory } from "../animal-ledger";
import { compareStrings, sortedUnique } from "../integrity";
import { collectBitemporalRecords, resolveBitemporalRecords, type BitemporalRecord } from "../regulatory/bitemporal-records";
import { hasOnlyFields, isRecord, nullableRef, oneOf, rawIdentityKey } from "../health/health-input";
import {
  PROGRAMME_DECLARER_ROLES,
  canonicalInstant,
  receivedAfter,
  refListOf,
  uniqueProgrammeIssues,
  type ProgrammeDeclarer,
} from "./programme-definition";

export type ProgrammeCompletionEvidence = { kind: "DECLARED"; completedAt: string } | { kind: "HEALTH_RECORD"; healthRecordId: string };

export interface ProgrammeCompletionProvenance {
  sourceCategory: AnimalDataSourceCategory;
  sourceSystem: string | null;
  sourceRecordRef: string | null;
  /** KNOWLEDGE time (canonical spelling once materialised). */
  receivedAt: string;
}

export interface ProgrammeCompletionRecord {
  recordId: string;
  animalId: string;
  programmeId: string;
  /** The exact programme version this declaration completes. */
  programmeVersion: string;
  actionId: string;
  /** The deterministic occurrence id (`programme-schedule.ts`), named exactly. */
  occurrenceId: string;
  kind: "COMPLETION" | "RETRACTION";
  /** `null` for a RETRACTION. */
  evidence: ProgrammeCompletionEvidence | null;
  declaredBy: ProgrammeDeclarer;
  provenance: ProgrammeCompletionProvenance;
  /** Earlier declaration ids (same animal, programme, action and occurrence) this record corrects or retracts (sorted). */
  supersedes: string[];
}

export type CompletionIssueCode =
  | "CATTLE_PROGRAMME_COMPLETION_NOT_OBJECT"
  | "CATTLE_PROGRAMME_COMPLETION_INVALID_IDENTITY"
  | "CATTLE_PROGRAMME_COMPLETION_INVALID_KNOWLEDGE_TIME"
  | "CATTLE_PROGRAMME_COMPLETION_INVALID_PROVENANCE"
  | "CATTLE_PROGRAMME_COMPLETION_INVALID_CONTENT"
  | "CATTLE_PROGRAMME_COMPLETION_RETRACTION_WITHOUT_TARGET"
  | "CATTLE_PROGRAMME_COMPLETION_SELF_SUPERSESSION"
  | "CATTLE_PROGRAMME_COMPLETION_DUPLICATE_ID_DIFFERENT_CONTENT"
  | "CATTLE_PROGRAMME_COMPLETION_SUPERSESSION_TARGET_NOT_KNOWN"
  | "CATTLE_PROGRAMME_COMPLETION_SUPERSESSION_OUT_OF_SCOPE"
  | "CATTLE_PROGRAMME_COMPLETION_SUPERSESSION_CYCLE";

export interface CompletionIssue {
  code: CompletionIssueCode;
  ref: string | null;
}

const FIELDS = ["recordId", "animalId", "programmeId", "programmeVersion", "actionId", "occurrenceId", "kind", "evidence", "declaredBy", "provenance", "supersedes"];

function provenanceOf(raw: unknown): ProgrammeCompletionProvenance | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["sourceCategory", "sourceSystem", "sourceRecordRef", "receivedAt"])) return null;
  const system = nullableRef(raw.sourceSystem);
  const recordRef = nullableRef(raw.sourceRecordRef);
  const receivedAt = canonicalInstant(raw.receivedAt);
  if (!oneOf(ANIMAL_DATA_SOURCE_CATEGORIES, raw.sourceCategory) || !system.ok || !recordRef.ok || receivedAt === null) return null;
  return { sourceCategory: raw.sourceCategory, sourceSystem: system.value, sourceRecordRef: recordRef.value, receivedAt };
}

function evidenceOf(raw: unknown): ProgrammeCompletionEvidence | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "DECLARED" && hasOnlyFields(raw, ["kind", "completedAt"])) {
    const completedAt = canonicalInstant(raw.completedAt);
    return completedAt === null ? null : { kind: "DECLARED", completedAt };
  }
  if (raw.kind === "HEALTH_RECORD" && hasOnlyFields(raw, ["kind", "healthRecordId"]) && isOpaqueRef(raw.healthRecordId)) return { kind: "HEALTH_RECORD", healthRecordId: raw.healthRecordId };
  return null;
}

type Materialised = { ok: true; record: ProgrammeCompletionRecord } | { ok: false; ref: string | null; codes: CompletionIssueCode[] };

function materialiseCompletion(raw: unknown): Materialised {
  if (!isRecord(raw)) return { ok: false, ref: null, codes: ["CATTLE_PROGRAMME_COMPLETION_NOT_OBJECT"] };
  const ref = isOpaqueRef(raw.recordId) ? raw.recordId : null;
  const codes: CompletionIssueCode[] = [];
  if (ref === null) codes.push("CATTLE_PROGRAMME_COMPLETION_INVALID_IDENTITY");
  if (canonicalInstant(isRecord(raw.provenance) ? raw.provenance.receivedAt : undefined) === null) codes.push("CATTLE_PROGRAMME_COMPLETION_INVALID_KNOWLEDGE_TIME");
  const provenance = provenanceOf(raw.provenance);
  if (provenance === null) codes.push("CATTLE_PROGRAMME_COMPLETION_INVALID_PROVENANCE");
  const declarer = raw.declaredBy;
  const declaredBy: ProgrammeDeclarer | null =
    isRecord(declarer) && hasOnlyFields(declarer, ["role", "actor"]) && oneOf(PROGRAMME_DECLARER_ROLES, declarer.role) && isOpaqueRef(declarer.actor)
      ? { role: declarer.role, actor: declarer.actor }
      : null;
  const supersedes = refListOf(raw.supersedes);
  const kind = raw.kind === "COMPLETION" || raw.kind === "RETRACTION" ? raw.kind : null;
  const rawEvidence = raw.evidence ?? null;
  const evidence = rawEvidence === null ? null : evidenceOf(rawEvidence);
  const idsOk = [raw.animalId, raw.programmeId, raw.programmeVersion, raw.actionId, raw.occurrenceId].every(isOpaqueRef);
  if (!hasOnlyFields(raw, FIELDS) || !idsOk || declaredBy === null || supersedes === null || kind === null || (rawEvidence !== null && evidence === null)) {
    codes.push("CATTLE_PROGRAMME_COMPLETION_INVALID_CONTENT");
  } else if ((kind === "COMPLETION") !== (evidence !== null)) {
    codes.push("CATTLE_PROGRAMME_COMPLETION_INVALID_CONTENT");
  } else if (kind === "RETRACTION" && supersedes.length === 0) {
    codes.push("CATTLE_PROGRAMME_COMPLETION_RETRACTION_WITHOUT_TARGET");
  }
  if (ref !== null && supersedes !== null && supersedes.includes(ref)) codes.push("CATTLE_PROGRAMME_COMPLETION_SELF_SUPERSESSION");
  if (codes.length > 0 || ref === null || provenance === null || declaredBy === null || supersedes === null || kind === null) return { ok: false, ref, codes: sortedUnique(codes) as CompletionIssueCode[] };
  return {
    ok: true,
    record: {
      recordId: ref,
      animalId: raw.animalId as string,
      programmeId: raw.programmeId as string,
      programmeVersion: raw.programmeVersion as string,
      actionId: raw.actionId as string,
      occurrenceId: raw.occurrenceId as string,
      kind,
      evidence,
      declaredBy,
      provenance,
      supersedes,
    },
  };
}

export interface CompletionResolution {
  /** Every declaration known by the cutoff (sorted by id). */
  known: ProgrammeCompletionRecord[];
  /** Known declarations no known declaration supersedes (sorted by id). */
  live: ProgrammeCompletionRecord[];
  /** Known declaration id → the known declarations superseding it (sorted). */
  supersededBy: ReadonlyMap<string, readonly string[]>;
  /** Live terminal ids of every competing correction (sorted); no winner chosen. */
  competingIds: ReadonlySet<string>;
}

export type CompletionAdmissionResult = { ok: true; resolution: CompletionResolution } | { ok: false; issues: CompletionIssue[] };

const LINK_CODE = {
  CATTLE_RECORD_SUPERSESSION_TARGET_NOT_KNOWN: "CATTLE_PROGRAMME_COMPLETION_SUPERSESSION_TARGET_NOT_KNOWN",
  CATTLE_RECORD_SUPERSESSION_OUT_OF_SCOPE: "CATTLE_PROGRAMME_COMPLETION_SUPERSESSION_OUT_OF_SCOPE",
  CATTLE_RECORD_SUPERSESSION_CYCLE: "CATTLE_PROGRAMME_COMPLETION_SUPERSESSION_CYCLE",
} as const;

const occurrenceScope = (r: ProgrammeCompletionRecord) => JSON.stringify([r.animalId, r.programmeId, r.actionId, r.occurrenceId]);

/** Admits already-canonical completion declarations at `knowledgeCutoff` (module-internal). */
export function admitProgrammeCompletions(raws: readonly unknown[], knowledgeCutoff: string): CompletionAdmissionResult {
  const admitted = raws.filter((raw) => !receivedAfter(raw, ["provenance", "receivedAt"], knowledgeCutoff));
  const materialised = admitted.map((raw) => ({ raw, result: materialiseCompletion(raw) }));
  const issues: CompletionIssue[] = [];
  const byId = new Map<string, Set<string>>();
  for (const { raw, result } of materialised) {
    if (!isRecord(raw) || !isOpaqueRef(raw.recordId)) continue;
    const key = result.ok ? `valid:${canonicalizeValue(result.record)}` : `raw:${rawIdentityKey(raw)}`;
    byId.set(raw.recordId, (byId.get(raw.recordId) ?? new Set<string>()).add(key));
  }
  for (const [ref, keys] of byId) if (keys.size > 1) issues.push({ code: "CATTLE_PROGRAMME_COMPLETION_DUPLICATE_ID_DIFFERENT_CONTENT", ref });
  const valid: (ProgrammeCompletionRecord & BitemporalRecord)[] = [];
  for (const { result } of materialised) {
    if (!result.ok) issues.push(...result.codes.map((code) => ({ code, ref: result.ref })));
    else valid.push({ ...result.record, receivedAt: result.record.provenance.receivedAt });
  }
  const collected = collectBitemporalRecords(valid, (r) => canonicalizeValue(r));
  if (!collected.ok) {
    for (const i of collected.issues) {
      issues.push({ code: i.code === "CATTLE_RECORD_SELF_SUPERSESSION" ? "CATTLE_PROGRAMME_COMPLETION_SELF_SUPERSESSION" : "CATTLE_PROGRAMME_COMPLETION_DUPLICATE_ID_DIFFERENT_CONTENT", ref: i.recordId });
    }
  }
  if (issues.length > 0 || !collected.ok) return { ok: false, issues: uniqueProgrammeIssues(issues) };
  const resolution = resolveBitemporalRecords(collected.records, knowledgeCutoff, {
    linkAllowed: (s, t) => occurrenceScope(s) === occurrenceScope(t),
    competitionKey: (r) => canonicalizeValue({ kind: r.kind, programmeVersion: r.programmeVersion, evidence: r.evidence }),
  });
  if (resolution.linkIssues.length > 0) {
    return { ok: false, issues: uniqueProgrammeIssues<CompletionIssue>(resolution.linkIssues.map((i) => ({ code: LINK_CODE[i.code], ref: i.recordId }))) };
  }
  const strip = (r: ProgrammeCompletionRecord & BitemporalRecord): ProgrammeCompletionRecord => {
    const { receivedAt, ...record } = r;
    void receivedAt;
    return record;
  };
  return {
    ok: true,
    resolution: {
      known: resolution.known.map(strip),
      live: resolution.live.map(strip),
      supersededBy: resolution.supersededBy,
      competingIds: new Set(resolution.competitions.flatMap((c) => c.terminals.map((t) => t.recordId)).sort(compareStrings)),
    },
  };
}
