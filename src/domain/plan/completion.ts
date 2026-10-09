/**
 * Plan kernel — completion contracts and progress.
 *
 * Four completion forms, as a discriminated union:
 * 1. DATA_COMPLETION — canonical data exists for every scope member;
 * 2. OPERATIONAL_RECORD — a canonical activity record proves the work;
 * 3. DECISION — a saved canonical decision proves the work;
 * 4. MANUAL — no reliable digital evidence; only the farmer completes it.
 *
 * Progress and completion of the first three are derived only from the
 * `CanonicalEvidence` passed in — Plan never stores weights, applications,
 * decisions or any other domain fact, so data recorded anywhere in Farm
 * Return completes the job on the next evaluation without a second
 * checkbox. Evidence that was not supplied, or a member whose state is not
 * known, is UNKNOWN and never counted as zero or as missing. Numeric
 * progress exists only where the domain counts something real (scope
 * members); other forms report `NOT_MEASURABLE`.
 */

import type { SubjectRef } from "../subject";
import { normaliseSubjects, subjectKey } from "./scope";

export type CompletionContract =
  | {
      kind: "DATA_COMPLETION";
      /** Canonical data requirement, e.g. a domain-owned "current weight" key. */
      requirementKey: string;
    }
  | {
      kind: "OPERATIONAL_RECORD";
      recordKind: string;
      coverage: "EACH_MEMBER" | "ANY_MEMBER";
      /** Records before this instant do not count; `null` = any. */
      notBeforeIso: string | null;
    }
  | { kind: "DECISION"; decisionKind: string; notBeforeIso: string | null }
  | { kind: "MANUAL" };

export type CompletionContractKind = CompletionContract["kind"];

export function isEvidenceLinked(contract: CompletionContract): boolean {
  return contract.kind !== "MANUAL";
}

// ---------------------------------------------------------------------------
// Canonical evidence (input only; owned by canonical domains)
// ---------------------------------------------------------------------------

export type Unavailable = { status: "UNAVAILABLE"; reason: string };

export type CanonicalDataPresence =
  | {
      status: "AVAILABLE";
      members: readonly { subject: SubjectRef; state: "PRESENT" | "MISSING"; sourceRecordId?: string }[];
    }
  | Unavailable;

export interface CanonicalRecordRef {
  recordId: string;
  recordKind: string;
  subjects: readonly SubjectRef[];
  occurredAt: string;
}

export interface CanonicalDecisionRef {
  decisionId: string;
  decisionKind: string;
  subjects: readonly SubjectRef[];
  decidedAt: string;
}

export interface CanonicalEvidence {
  dataPresence: Readonly<Record<string, CanonicalDataPresence>>;
  records: Readonly<Record<string, { status: "AVAILABLE"; records: readonly CanonicalRecordRef[] } | Unavailable>>;
  decisions: Readonly<
    Record<string, { status: "AVAILABLE"; decisions: readonly CanonicalDecisionRef[] } | Unavailable>
  >;
}

export const NO_CANONICAL_EVIDENCE: CanonicalEvidence = { dataPresence: {}, records: {}, decisions: {} };

const NOT_SUPPLIED: Unavailable = { status: "UNAVAILABLE", reason: "EVIDENCE_NOT_SUPPLIED" };

// ---------------------------------------------------------------------------
// Progress and evaluation
// ---------------------------------------------------------------------------

export type PlanProgress =
  | { kind: "MEMBER_COUNT"; complete: number; missing: number; unknown: number; total: number }
  | { kind: "NOT_MEASURABLE" }
  | { kind: "UNKNOWN"; reason: string };

export type CompletionState =
  | "COMPLETE"
  | "PARTIAL"
  | "NOT_STARTED"
  | "UNKNOWN"
  /** Scope resolved to no members; nothing to evidence. */
  | "NO_TARGETS"
  /** MANUAL contract: only a farmer action completes it. */
  | "NOT_EVIDENCE_LINKED";

export interface CompletionEvaluation {
  contractKind: CompletionContractKind;
  state: CompletionState;
  progress: PlanProgress;
  /** Canonical record/decision ids that support the state. */
  evidenceRefs: readonly string[];
  /** Members with canonical data/records confirmed absent. */
  missingMembers: readonly SubjectRef[];
  /** Members whose canonical state is not known. */
  unknownMembers: readonly SubjectRef[];
}

export interface ScopeForCompletion {
  status: "KNOWN" | "UNKNOWN";
  members: readonly SubjectRef[];
}

function notBefore(iso: string, bound: string | null): boolean {
  return bound === null || Date.parse(iso) >= Date.parse(bound);
}

function memberCountState(complete: number, missing: number, unknown: number): CompletionState {
  if (missing === 0 && unknown === 0) return "COMPLETE";
  if (complete > 0) return "PARTIAL";
  return unknown > 0 ? "UNKNOWN" : "NOT_STARTED";
}

function unknownEvaluation(
  contractKind: CompletionContractKind,
  reason: string,
  members: readonly SubjectRef[],
): CompletionEvaluation {
  return {
    contractKind,
    state: "UNKNOWN",
    progress: { kind: "UNKNOWN", reason },
    evidenceRefs: [],
    missingMembers: [],
    unknownMembers: normaliseSubjects(members),
  };
}

export function evaluateCompletion(
  contract: CompletionContract,
  scope: ScopeForCompletion,
  evidence: CanonicalEvidence,
): CompletionEvaluation {
  const members = normaliseSubjects(scope.members);
  const kind = contract.kind;

  if (kind === "MANUAL") {
    return {
      contractKind: kind,
      state: "NOT_EVIDENCE_LINKED",
      progress: { kind: "NOT_MEASURABLE" },
      evidenceRefs: [],
      missingMembers: [],
      unknownMembers: [],
    };
  }
  if (scope.status === "UNKNOWN") return unknownEvaluation(kind, "SCOPE_UNKNOWN", members);
  if (members.length === 0) {
    return {
      contractKind: kind,
      state: "NO_TARGETS",
      progress: { kind: "NOT_MEASURABLE" },
      evidenceRefs: [],
      missingMembers: [],
      unknownMembers: [],
    };
  }

  if (contract.kind === "DATA_COMPLETION") {
    const presence = evidence.dataPresence[contract.requirementKey] ?? NOT_SUPPLIED;
    if (presence.status === "UNAVAILABLE") return unknownEvaluation(kind, presence.reason, members);
    const stateByKey = new Map(presence.members.map((m) => [subjectKey(m.subject), m]));
    const missing: SubjectRef[] = [];
    const unknown: SubjectRef[] = [];
    const refs: string[] = [];
    let complete = 0;
    for (const member of members) {
      const entry = stateByKey.get(subjectKey(member));
      if (entry === undefined) unknown.push(member);
      else if (entry.state === "MISSING") missing.push(member);
      else {
        complete += 1;
        if (entry.sourceRecordId !== undefined) refs.push(entry.sourceRecordId);
      }
    }
    return {
      contractKind: kind,
      state: memberCountState(complete, missing.length, unknown.length),
      progress: { kind: "MEMBER_COUNT", complete, missing: missing.length, unknown: unknown.length, total: members.length },
      evidenceRefs: [...refs].sort(),
      missingMembers: missing,
      unknownMembers: unknown,
    };
  }

  if (contract.kind === "OPERATIONAL_RECORD") {
    const supplied = evidence.records[contract.recordKind] ?? NOT_SUPPLIED;
    if (supplied.status === "UNAVAILABLE") return unknownEvaluation(kind, supplied.reason, members);
    const relevant = supplied.records.filter(
      (r) => r.recordKind === contract.recordKind && notBefore(r.occurredAt, contract.notBeforeIso),
    );
    const coveredBy = new Map<string, string[]>();
    for (const record of relevant) {
      for (const s of record.subjects) {
        const key = subjectKey(s);
        coveredBy.set(key, [...(coveredBy.get(key) ?? []), record.recordId]);
      }
    }
    const covered = members.filter((m) => coveredBy.has(subjectKey(m)));
    const missing = members.filter((m) => !coveredBy.has(subjectKey(m)));
    const refs = [...new Set(covered.flatMap((m) => coveredBy.get(subjectKey(m)) ?? []))].sort();
    if (contract.coverage === "ANY_MEMBER") {
      const done = covered.length > 0;
      return {
        contractKind: kind,
        state: done ? "COMPLETE" : "NOT_STARTED",
        progress: { kind: "NOT_MEASURABLE" },
        evidenceRefs: refs,
        missingMembers: done ? [] : missing,
        unknownMembers: [],
      };
    }
    return {
      contractKind: kind,
      state: memberCountState(covered.length, missing.length, 0),
      progress: { kind: "MEMBER_COUNT", complete: covered.length, missing: missing.length, unknown: 0, total: members.length },
      evidenceRefs: refs,
      missingMembers: missing,
      unknownMembers: [],
    };
  }

  const supplied = evidence.decisions[contract.decisionKind] ?? NOT_SUPPLIED;
  if (supplied.status === "UNAVAILABLE") return unknownEvaluation(kind, supplied.reason, members);
  const memberKeys = new Set(members.map(subjectKey));
  const matching = supplied.decisions.filter(
    (d) =>
      d.decisionKind === contract.decisionKind &&
      notBefore(d.decidedAt, contract.notBeforeIso) &&
      d.subjects.some((s) => memberKeys.has(subjectKey(s))),
  );
  const done = matching.length > 0;
  return {
    contractKind: kind,
    state: done ? "COMPLETE" : "NOT_STARTED",
    progress: { kind: "NOT_MEASURABLE" },
    evidenceRefs: matching.map((d) => d.decisionId).sort(),
    missingMembers: [],
    unknownMembers: [],
  };
}

export function progressEquals(a: PlanProgress | null, b: PlanProgress | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
