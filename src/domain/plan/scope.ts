/**
 * Plan kernel — target scope.
 *
 * A job's scope is either a fixed list of canonical entities or a dynamic
 * selector ("the current members of this group") resolved against current
 * farm reality on every re-evaluation. Membership facts are owned by the
 * canonical domain and supplied as input (`ScopeReality`); Plan keeps only
 * the resolved `SubjectRef` list it last acted on, so a change can be
 * diffed and audited.
 *
 * Unknown membership is never treated as an empty group: an UNKNOWN entry
 * keeps the last resolved members and reports `status: "UNKNOWN"`.
 *
 * Additions follow the scope's declared policy. `ABSORB_INTO_JOB` widens
 * the job; `FOLLOW_ON_WORK` keeps the job on its existing members and
 * hands the new members to separate follow-on work, so a job can complete
 * on its own members while the new reality creates new work. Removed
 * members always leave the job (no stale denominator).
 */

import type { SubjectRef, SubjectType } from "../subject";

export interface ScopeSelector {
  kind: "MEMBERS_OF";
  parent: SubjectRef;
  memberType: SubjectType;
}

export type ScopeAdditionPolicy = "ABSORB_INTO_JOB" | "FOLLOW_ON_WORK";

export type TargetScope =
  | { kind: "STATIC"; members: readonly SubjectRef[] }
  | { kind: "DYNAMIC"; selector: ScopeSelector; additions: ScopeAdditionPolicy };

export type ScopeMembership =
  | { status: "KNOWN"; members: readonly SubjectRef[] }
  | { status: "UNKNOWN"; reason: string };

/** Canonical membership supplied by the owning domain, one entry per selector. */
export interface ScopeRealityEntry {
  selector: ScopeSelector;
  membership: ScopeMembership;
}

export type ScopeReality = readonly ScopeRealityEntry[];

export interface ScopeResolution {
  status: "KNOWN" | "UNKNOWN";
  /** Members the job now covers. */
  members: readonly SubjectRef[];
  added: readonly SubjectRef[];
  removed: readonly SubjectRef[];
  /** New members handed to follow-on work (FOLLOW_ON_WORK policy only). */
  handedOff: readonly SubjectRef[];
  /** Previously handed-off members still present in reality. */
  handedOffRetained: readonly SubjectRef[];
  unknownReason: string | null;
}

export function subjectKey(subject: SubjectRef): string {
  return `${subject.type}:${subject.id}`;
}

export function selectorKey(selector: ScopeSelector): string {
  return `${subjectKey(selector.parent)}>${selector.memberType}`;
}

/** Deduplicated, deterministically ordered copy. */
export function normaliseSubjects(subjects: readonly SubjectRef[]): SubjectRef[] {
  const byKey = new Map<string, SubjectRef>();
  for (const s of subjects) byKey.set(subjectKey(s), { type: s.type, id: s.id });
  return [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, s]) => s);
}

function minus(a: readonly SubjectRef[], b: readonly SubjectRef[]): SubjectRef[] {
  const keys = new Set(b.map(subjectKey));
  return normaliseSubjects(a.filter((s) => !keys.has(subjectKey(s))));
}

function intersect(a: readonly SubjectRef[], b: readonly SubjectRef[]): SubjectRef[] {
  const keys = new Set(b.map(subjectKey));
  return normaliseSubjects(a.filter((s) => keys.has(subjectKey(s))));
}

export function findScopeMembership(reality: ScopeReality, selector: ScopeSelector): ScopeMembership {
  const key = selectorKey(selector);
  const entry = reality.find((e) => selectorKey(e.selector) === key);
  return entry ? entry.membership : { status: "UNKNOWN", reason: "MEMBERSHIP_NOT_SUPPLIED" };
}

/**
 * Resolve `scope` against canonical reality, given the members the job
 * currently covers and the members it has already handed to follow-on work.
 */
export function resolveScope(
  scope: TargetScope,
  currentMembers: readonly SubjectRef[],
  previouslyHandedOff: readonly SubjectRef[],
  reality: ScopeReality,
): ScopeResolution {
  const current = normaliseSubjects(currentMembers);
  const handedBefore = normaliseSubjects(previouslyHandedOff);

  if (scope.kind === "STATIC") {
    const members = normaliseSubjects(scope.members);
    return {
      status: "KNOWN",
      members,
      added: minus(members, current),
      removed: minus(current, members),
      handedOff: [],
      handedOffRetained: [],
      unknownReason: null,
    };
  }

  const membership = findScopeMembership(reality, scope.selector);
  if (membership.status === "UNKNOWN") {
    return {
      status: "UNKNOWN",
      members: current,
      added: [],
      removed: [],
      handedOff: [],
      handedOffRetained: handedBefore,
      unknownReason: membership.reason,
    };
  }

  const real = normaliseSubjects(membership.members.filter((m) => m.type === scope.selector.memberType));
  const removed = minus(current, real);
  const handedOffRetained = intersect(handedBefore, real);
  const newcomers = minus(minus(real, current), handedBefore);

  if (scope.additions === "ABSORB_INTO_JOB") {
    const members = minus(real, handedOffRetained);
    return { status: "KNOWN", members, added: newcomers, removed, handedOff: [], handedOffRetained, unknownReason: null };
  }

  return {
    status: "KNOWN",
    members: intersect(current, real),
    added: [],
    removed,
    handedOff: newcomers,
    handedOffRetained: normaliseSubjects([...handedOffRetained, ...newcomers]),
    unknownReason: null,
  };
}

export function scopeChanged(resolution: ScopeResolution): boolean {
  return resolution.added.length > 0 || resolution.removed.length > 0 || resolution.handedOff.length > 0;
}

export function scopeIdentityKey(scope: TargetScope): string {
  return scope.kind === "STATIC"
    ? `STATIC[${normaliseSubjects(scope.members).map(subjectKey).join(",")}]`
    : `DYNAMIC[${selectorKey(scope.selector)}]`;
}
