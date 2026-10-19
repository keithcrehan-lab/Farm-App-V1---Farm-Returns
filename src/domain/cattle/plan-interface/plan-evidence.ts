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
 */

import type { CanonicalEvidence, CanonicalRecordRef, ScopeReality, ScopeRealityEntry } from "../../plan";
import { subjectRef } from "../../subject";
import { compareStrings } from "../integrity";
import type { ProgrammeStatusEvaluation } from "../programmes";
import type { CattleRecommendation } from "../recommendations";
import type { AnimalObligationEvaluation } from "../regulatory";
import type { ScopeResolution } from "../weights";
import type { CattlePlanGroupScope, CattlePlanIssue } from "./plan-contracts";
import { cattleGroupScope, cattleWorkIdentity } from "./plan-merge";
import {
  C2_STATE_PLAN,
  C7_STATE_PLAN,
  GOAL_EVIDENCE,
  GOAL_IN_FORCE_REQUIREMENT,
  MEMBERSHIP_PLAN,
  WEIGHT_EVIDENCE,
  lookup,
  obligationActionKey,
  occurrenceCompletionKind,
  programmeActionKey,
  weightObservationKind,
  type CompletionMeaning,
  type StatePlan,
} from "./plan-vocabulary";

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

export function buildCanonicalEvidence(
  obligations: readonly AnimalObligationEvaluation[] | null,
  programmes: ProgrammeStatusEvaluation | null,
  recommendations: readonly CattleRecommendation[],
): { ok: true; evidence: CanonicalEvidence } | { ok: false; issues: CattlePlanIssue[] } {
  const issues: CattlePlanIssue[] = [];
  const occurrences = new Map<string, OccurrenceEvidence>();
  const add = (kind: string, state: string, meaning: CompletionMeaning, records: CanonicalRecordRef[]) => {
    const e = occurrences.get(kind) ?? { states: [], meanings: [], records: [] };
    e.states.push(state);
    e.meanings.push(meaning);
    e.records.push(...records);
    occurrences.set(kind, e);
  };

  for (const a of obligations ?? []) {
    for (const r of a.results) {
      if (r.window === null) continue;
      const plan = lookup<StatePlan>(C2_STATE_PLAN, r.state);
      if (plan === undefined) {
        issues.push(issue("CATTLE_PLAN_STATE_UNMAPPED", `C2:${r.state}`));
        continue;
      }
      const kind = occurrenceCompletionKind(cattleWorkIdentity(obligationActionKey(r.obligationId), a.animalId, r.window));
      const records = plan.completion === "DONE" ? r.evidence.countedEvidence.map((f) => ({ recordId: `CATTLE_OBLIGATION_FULFILMENT:${f.evidenceId}`, recordKind: kind, subjects: [subjectRef("CATTLE_ANIMAL", a.animalId)], occurredAt: f.fulfilledAt as string })) : [];
      if (plan.completion === "DONE" && records.length === 0) issues.push(issue("CATTLE_PLAN_COMPLETION_RECORD_UNIDENTIFIED", kind));
      add(kind, r.state, plan.completion, records);
    }
  }

  for (const p of programmes?.programmes ?? []) {
    for (const s of p.animals) {
      for (const r of s.records) {
        if (r.occurrence === null || r.actionId === null || r.actionKind === null) continue;
        const plan = lookup<StatePlan>(C7_STATE_PLAN, r.state);
        if (plan === undefined) {
          issues.push(issue("CATTLE_PLAN_STATE_UNMAPPED", `C7:${r.state}`));
          continue;
        }
        const kind = occurrenceCompletionKind(cattleWorkIdentity(programmeActionKey(p.programmeId, r.actionKind), s.animalId, r.occurrence));
        const counted = plan.completion === "DONE" ? (r.completion?.counted ?? []) : [];
        const records: CanonicalRecordRef[] = [];
        for (const c of counted) {
          const recordId = c.declarationId !== null ? `CATTLE_PROGRAMME_COMPLETION_DECLARATION:${c.declarationId}` : c.healthRecordId !== null ? `CATTLE_HEALTH_RECORD:${c.healthRecordId}` : null;
          if (recordId === null) issues.push(issue("CATTLE_PLAN_COMPLETION_RECORD_UNIDENTIFIED", kind));
          else records.push({ recordId, recordKind: kind, subjects: [subjectRef("CATTLE_ANIMAL", s.animalId)], occurredAt: c.completedAt });
        }
        if (plan.completion === "DONE" && records.length === 0) issues.push(issue("CATTLE_PLAN_COMPLETION_RECORD_UNIDENTIFIED", kind));
        add(kind, r.state, plan.completion, records);
      }
    }
  }

  const records: Record<string, Records> = {};
  for (const kind of [...occurrences.keys()].sort(compareStrings)) records[kind] = occurrenceEntry(occurrences.get(kind)!);

  const goalMembers: { subject: ReturnType<typeof subjectRef>; state: "PRESENT" | "MISSING"; sourceRecordId?: string }[] = [];
  for (const rec of recommendations) {
    const subject = subjectRef("CATTLE_ANIMAL", rec.animalId);
    const kind = weightObservationKind(rec.animalId);
    const w = rec.context.weights;
    if (w.state !== "SUPPLIED") records[kind] = { status: "UNAVAILABLE", reason: "CATTLE_PLAN_EVIDENCE_NOT_SUPPLIED:WEIGHTS" };
    else {
      const meaning = lookup(WEIGHT_EVIDENCE, w.latest.state);
      if (meaning === undefined) issues.push(issue("CATTLE_PLAN_STATE_UNMAPPED", `C4:${w.latest.state}`));
      else if (meaning === "UNRESOLVED") records[kind] = { status: "UNAVAILABLE", reason: `CATTLE_PLAN_EVIDENCE_UNRESOLVED:WEIGHT_${w.latest.state}` };
      else if (meaning === "NO_OBSERVATION") records[kind] = { status: "AVAILABLE", records: [] };
      else if (w.latest.observedAt === null) issues.push(issue("CATTLE_PLAN_COMPLETION_RECORD_UNIDENTIFIED", kind));
      else records[kind] = { status: "AVAILABLE", records: [{ recordId: `CATTLE_WEIGHT_SERIES:${w.seriesFingerprint.digest}`, recordKind: kind, subjects: [subject], occurredAt: w.latest.observedAt }] };
    }
    const g = rec.context.goals;
    if (g.state === "SUPPLIED") {
      const meaning = lookup(GOAL_EVIDENCE, g.status);
      if (meaning === undefined) issues.push(issue("CATTLE_PLAN_STATE_UNMAPPED", `C6:${g.status}`));
      else if (meaning === "PRESENT") goalMembers.push({ subject, state: "PRESENT", sourceRecordId: `CATTLE_GOAL_SNAPSHOT:${g.snapshot.fingerprint.digest}` });
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

/** The canonical C9 view of one C4 group resolution, and its Plan `ScopeReality` entry (all-or-unknown). */
export function groupScopeOf(groupRef: string, scope: ScopeResolution): { ok: true; canonical: CattlePlanGroupScope; entry: ScopeRealityEntry } | { ok: false; issues: CattlePlanIssue[] } {
  const byState = { MEMBER: [] as string[], NOT_MEMBER: [] as string[], UNKNOWN: [] as string[], EVIDENCE_CONFLICT: [] as string[], INVALID: [] as string[] };
  let unresolved = false;
  for (const a of scope.animals) {
    const meaning = lookup(MEMBERSHIP_PLAN, a.state);
    if (meaning === undefined || !Object.hasOwn(byState, a.state)) return { ok: false, issues: [issue("CATTLE_PLAN_STATE_UNMAPPED", `C4:${String(a.state)}`)] };
    byState[a.state].push(a.animalId);
    if (meaning === "UNRESOLVED") unresolved = true;
  }
  const sort = (xs: string[]) => [...xs].sort(compareStrings);
  const canonical: CattlePlanGroupScope = {
    groupRef,
    scopeFingerprint: scope.fingerprint,
    members: sort(byState.MEMBER),
    notMembers: sort(byState.NOT_MEMBER),
    unknown: sort(byState.UNKNOWN),
    conflict: sort(byState.EVIDENCE_CONFLICT),
    invalid: sort(byState.INVALID),
  };
  const selector = (cattleGroupScope(groupRef) as Extract<ReturnType<typeof cattleGroupScope>, { kind: "DYNAMIC" }>).selector;
  const entry: ScopeRealityEntry = unresolved
    ? { selector, membership: { status: "UNKNOWN", reason: `CATTLE_GROUP_MEMBERSHIP_UNRESOLVED:${JSON.stringify({ unknown: canonical.unknown, conflict: canonical.conflict, invalid: canonical.invalid })}` } }
    : { selector, membership: { status: "KNOWN", members: canonical.members.map((id) => subjectRef("CATTLE_ANIMAL", id)) } };
  return { ok: true, canonical, entry };
}

export function buildScopeReality(scopes: readonly { groupRef: string; scope: ScopeResolution }[]): { ok: true; canonical: CattlePlanGroupScope[]; reality: ScopeReality } | { ok: false; issues: CattlePlanIssue[] } {
  const canonical: CattlePlanGroupScope[] = [];
  const reality: ScopeRealityEntry[] = [];
  for (const { groupRef, scope } of scopes) {
    const g = groupScopeOf(groupRef, scope);
    if (!g.ok) return g;
    canonical.push(g.canonical);
    reality.push(g.entry);
  }
  return { ok: true, canonical, reality };
}
