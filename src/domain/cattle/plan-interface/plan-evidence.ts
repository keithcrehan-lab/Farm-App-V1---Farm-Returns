/**
 * Cattle C9 — Plan `CanonicalEvidence` and `ScopeReality` from the delegated
 * cattle outputs (scope items 4 / 5; B2).
 *
 * Completion evidence is produced ONLY for the vocabulary rows whose
 * completion form is evidence-backed (`plan-vocabulary.ts`), under exactly the
 * keys `completionContractFor` gives their jobs — the same table drives both.
 * Plan never holds a copy of a cattle record: each entry cites the owning
 * canonical record. Unknown is `UNAVAILABLE` (or an unlisted member), never
 * zero, empty-as-done or complete:
 * - owner-occurrence work (C2 / C7, windowed): every owner occurrence that
 *   maps to the job's identity must be completed by its owner (C2
 *   SATISFIED / SATISFIED_LATE counted fulfilments, C7 COMPLETED counted
 *   completions) — then AVAILABLE with those records; any unresolved or
 *   not-applicable occurrence ⇒ UNAVAILABLE; otherwise AVAILABLE with none;
 * - RECORD_WEIGHT: C4's latest-known weight (via C8's sealed context) as one
 *   record at its `observedAt`; NONE ⇒ AVAILABLE with none; unresolved or not
 *   supplied ⇒ UNAVAILABLE;
 * - DECLARE_PRODUCTION_GOAL: C6 status ACTIVE ⇒ PRESENT, NONE ⇒ MISSING,
 *   unresolved or not supplied ⇒ the animal is not listed (UNKNOWN).
 *
 * Scope reality per requested group, from C4 alone, all-or-unknown: every
 * animal MEMBER / NOT_MEMBER ⇒ KNOWN with the members; any UNKNOWN /
 * EVIDENCE_CONFLICT / INVALID ⇒ the whole selector UNKNOWN with a
 * deterministic reason (Plan has no partial membership).
 *
 * ONE admission path (F004 architecture review 2, Outcome C): this module
 * reads the SAME admitted C9 DTOs the work items are built from — never a
 * raw predecessor result — and every completion reference is built by a
 * constructor over admitted C9 primitives (`plan-vocabulary.ts`).
 */

import type { CanonicalEvidence, CanonicalRecordRef, ScopeReality, ScopeRealityEntry } from "../../plan";
import { subjectRef, type SubjectRef } from "../../subject";
import { compareStrings } from "../integrity";
import { admit, evidenceCheck, groupScopeCheck, type C9Ref } from "./plan-admission";
import type { C2Dto, C4ScopeDto, C7Dto, C8Dto } from "./plan-adapters";
import type { CattlePlanGroupScope, CattlePlanIssue } from "./plan-contracts";
import { cattleGroupScope, cattleWorkIdentity } from "./plan-merge";
import {
  C2_STATE_PLAN,
  C7_STATE_PLAN,
  GOAL_EVIDENCE,
  GOAL_IN_FORCE_REQUIREMENT,
  MEMBERSHIP_PLAN,
  WEIGHT_EVIDENCE,
  goalSnapshotRecordId,
  healthRecordRecordId,
  lookup,
  obligationActionKey,
  obligationFulfilmentRecordId,
  occurrenceCompletionKind,
  programmeActionKey,
  programmeDeclarationRecordId,
  weightObservationKind,
  weightSeriesRecordId,
  type CompletionMeaning,
  type StatePlan,
} from "./plan-vocabulary";

/** Every Plan subject C9 builds is a `CATTLE_ANIMAL` with an admitted id (B2). */
const animalSubject = (animalId: C9Ref): SubjectRef => subjectRef("CATTLE_ANIMAL", animalId);

const issue = (code: string, ref: string | null = null): CattlePlanIssue => ({ code, ref });

interface OccurrenceEvidence {
  states: string[];
  meanings: CompletionMeaning[];
  records: CanonicalRecordRef[];
}

type Records = CanonicalEvidence["records"][string];

function occurrenceEntry(e: OccurrenceEvidence): Records {
  if (e.meanings.some((m) => m === "NOT_EVIDENCED")) {
    return { status: "UNAVAILABLE", reason: `CATTLE_PLAN_COMPLETION_NOT_EVIDENCED:${JSON.stringify([...new Set(e.states)].sort(compareStrings))}` };
  }
  const done = e.meanings.every((m) => m === "DONE");
  const records = done ? [...new Map(e.records.map((r) => [r.recordId, r])).values()].sort((a, b) => compareStrings(a.recordId, b.recordId)) : [];
  return { status: "AVAILABLE", records };
}

/** The Plan `CanonicalEvidence` C9 builds from the admitted DTOs, checked whole (defence in depth) before Plan may read it. */
export function buildCanonicalEvidence(obligations: C2Dto | null, programmes: C7Dto | null, recommendations: C8Dto): { ok: true; evidence: CanonicalEvidence } | { ok: false; issues: CattlePlanIssue[] } {
  const built = evidenceCandidate(obligations, programmes, recommendations);
  if (!built.ok) return built;
  const rejected = admit("EVIDENCE", evidenceCheck, built.evidence);
  return rejected === null ? built : { ok: false, issues: [rejected] };
}

function evidenceCandidate(obligations: C2Dto | null, programmes: C7Dto | null, recommendations: C8Dto): { ok: true; evidence: CanonicalEvidence } | { ok: false; issues: CattlePlanIssue[] } {
  const issues: CattlePlanIssue[] = [];
  const occurrences = new Map<string, OccurrenceEvidence>();
  const add = (kind: string, state: string, meaning: CompletionMeaning, records: CanonicalRecordRef[]) => {
    const seen = occurrences.get(kind);
    const e = seen === undefined ? { states: [], meanings: [], records: [] } : seen;
    e.states.push(state);
    e.meanings.push(meaning);
    e.records.push(...records);
    occurrences.set(kind, e);
  };

  for (const a of obligations === null ? [] : obligations.animals) {
    for (const r of a.results) {
      if (r.window === null) continue;
      const plan = lookup<StatePlan>(C2_STATE_PLAN, r.state);
      if (plan === undefined) {
        issues.push(issue("CATTLE_PLAN_STATE_UNMAPPED", `C2:${r.state}`));
        continue;
      }
      const kind = occurrenceCompletionKind(cattleWorkIdentity(obligationActionKey(r.obligationId), a.animalId, r.window));
      const records = plan.completion === "DONE" ? r.countedEvidence.map((f) => ({ recordId: obligationFulfilmentRecordId(f.evidenceId), recordKind: kind, subjects: [animalSubject(a.animalId)], occurredAt: f.fulfilledAt })) : [];
      if (plan.completion === "DONE" && records.length === 0) issues.push(issue("CATTLE_PLAN_COMPLETION_RECORD_UNIDENTIFIED", kind));
      add(kind, r.state, plan.completion, records);
    }
  }

  for (const p of programmes === null ? [] : programmes.programmes) {
    for (const s of p.animals) {
      for (const r of s.records) {
        if (r.occurrence === null || r.actionId === null || r.actionKind === null) continue;
        const plan = lookup<StatePlan>(C7_STATE_PLAN, r.state);
        if (plan === undefined) {
          issues.push(issue("CATTLE_PLAN_STATE_UNMAPPED", `C7:${r.state}`));
          continue;
        }
        const kind = occurrenceCompletionKind(cattleWorkIdentity(programmeActionKey(p.programmeId, r.actionKind), s.animalId, r.occurrence));
        const counted = plan.completion === "DONE" && r.completion !== null ? r.completion.counted : [];
        const records: CanonicalRecordRef[] = [];
        for (const c of counted) {
          const recordId = c.declarationId !== null ? programmeDeclarationRecordId(c.declarationId) : c.healthRecordId !== null ? healthRecordRecordId(c.healthRecordId) : null;
          if (recordId === null) issues.push(issue("CATTLE_PLAN_COMPLETION_RECORD_UNIDENTIFIED", kind));
          else records.push({ recordId, recordKind: kind, subjects: [animalSubject(s.animalId)], occurredAt: c.completedAt });
        }
        if (plan.completion === "DONE" && records.length === 0) issues.push(issue("CATTLE_PLAN_COMPLETION_RECORD_UNIDENTIFIED", kind));
        add(kind, r.state, plan.completion, records);
      }
    }
  }

  const records: Record<string, Records> = {};
  for (const kind of [...occurrences.keys()].sort(compareStrings)) records[kind] = occurrenceEntry(occurrences.get(kind)!);

  const goalMembers: { subject: SubjectRef; state: "PRESENT" | "MISSING"; sourceRecordId?: string }[] = [];
  for (const rec of recommendations.animals) {
    const subject = animalSubject(rec.animalId);
    const kind = weightObservationKind(rec.animalId);
    const w = rec.weights;
    if (w.state !== "SUPPLIED") records[kind] = { status: "UNAVAILABLE", reason: "CATTLE_PLAN_EVIDENCE_NOT_SUPPLIED:WEIGHTS" };
    else {
      const meaning = lookup(WEIGHT_EVIDENCE, w.latest.state);
      if (meaning === undefined) issues.push(issue("CATTLE_PLAN_STATE_UNMAPPED", `C4:${w.latest.state}`));
      else if (meaning === "UNRESOLVED") records[kind] = { status: "UNAVAILABLE", reason: `CATTLE_PLAN_EVIDENCE_UNRESOLVED:WEIGHT_${w.latest.state}` };
      else if (meaning === "NO_OBSERVATION") records[kind] = { status: "AVAILABLE", records: [] };
      else if (w.latest.observedAt === null) issues.push(issue("CATTLE_PLAN_COMPLETION_RECORD_UNIDENTIFIED", kind));
      else records[kind] = { status: "AVAILABLE", records: [{ recordId: weightSeriesRecordId(w.seriesFingerprint), recordKind: kind, subjects: [subject], occurredAt: w.latest.observedAt }] };
    }
    const g = rec.goals;
    if (g.state === "SUPPLIED") {
      const meaning = lookup(GOAL_EVIDENCE, g.status);
      if (meaning === undefined) issues.push(issue("CATTLE_PLAN_STATE_UNMAPPED", `C6:${g.status}`));
      else if (meaning === "PRESENT") goalMembers.push({ subject, state: "PRESENT", sourceRecordId: goalSnapshotRecordId(g.snapshotFingerprint) });
      else if (meaning === "MISSING") goalMembers.push({ subject, state: "MISSING" });
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  const sortedRecords: Record<string, Records> = {};
  for (const k of Object.keys(records).sort(compareStrings)) sortedRecords[k] = records[k];
  return {
    ok: true,
    evidence: {
      dataPresence: { [GOAL_IN_FORCE_REQUIREMENT]: { status: "AVAILABLE", members: goalMembers.sort((a, b) => compareStrings(a.subject.id, b.subject.id)) } },
      records: sortedRecords,
      decisions: {},
    },
  };
}

function groupScopeCandidate(scope: C4ScopeDto): { ok: true; canonical: CattlePlanGroupScope; unresolved: boolean } | { ok: false; issues: CattlePlanIssue[] } {
  const byState = { MEMBER: [] as string[], NOT_MEMBER: [] as string[], UNKNOWN: [] as string[], EVIDENCE_CONFLICT: [] as string[], INVALID: [] as string[] };
  let unresolved = false;
  for (const a of scope.animals) {
    const meaning = lookup(MEMBERSHIP_PLAN, a.state);
    if (meaning === undefined || !Object.hasOwn(byState, a.state)) return { ok: false, issues: [issue("CATTLE_PLAN_STATE_UNMAPPED", `C4:${String(a.state)}`)] };
    const state: keyof typeof byState = a.state;
    byState[state].push(a.animalId);
    if (meaning === "UNRESOLVED") unresolved = true;
  }
  const sort = (xs: string[]) => [...xs].sort(compareStrings);
  return {
    ok: true,
    unresolved,
    canonical: {
      groupRef: scope.groupRef,
      scopeFingerprint: scope.scopeFingerprint,
      members: sort(byState.MEMBER),
      notMembers: sort(byState.NOT_MEMBER),
      unknown: sort(byState.UNKNOWN),
      conflict: sort(byState.EVIDENCE_CONFLICT),
      invalid: sort(byState.INVALID),
    },
  };
}

/**
 * The canonical C9 view of one admitted C4 group resolution — checked (defence in depth) before any Plan
 * subject is built from it — and its Plan `ScopeReality` entry (all-or-unknown).
 */
export function groupScopeOf(scope: C4ScopeDto): { ok: true; canonical: CattlePlanGroupScope; entry: ScopeRealityEntry } | { ok: false; issues: CattlePlanIssue[] } {
  const where = `C4:${scope.groupRef}`;
  const built = groupScopeCandidate(scope);
  if (!built.ok) return built;
  const { canonical, unresolved } = built;
  const rejected = admit(where, groupScopeCheck, canonical);
  if (rejected !== null) return { ok: false, issues: [rejected] };
  const selector = (cattleGroupScope(scope.groupRef) as Extract<ReturnType<typeof cattleGroupScope>, { kind: "DYNAMIC" }>).selector;
  const entry: ScopeRealityEntry = unresolved
    ? { selector, membership: { status: "UNKNOWN", reason: `CATTLE_GROUP_MEMBERSHIP_UNRESOLVED:${JSON.stringify({ unknown: canonical.unknown, conflict: canonical.conflict, invalid: canonical.invalid })}` } }
    : { selector, membership: { status: "KNOWN", members: canonical.members.map((id) => subjectRef("CATTLE_ANIMAL", id)) } };
  return { ok: true, canonical, entry };
}

export function buildScopeReality(scopes: readonly C4ScopeDto[]): { ok: true; canonical: CattlePlanGroupScope[]; reality: ScopeReality } | { ok: false; issues: CattlePlanIssue[] } {
  const canonical: CattlePlanGroupScope[] = [];
  const reality: ScopeRealityEntry[] = [];
  for (const scope of scopes) {
    const g = groupScopeOf(scope);
    if (!g.ok) return g;
    canonical.push(g.canonical);
    reality.push(g.entry);
  }
  return { ok: true, canonical, reality };
}
