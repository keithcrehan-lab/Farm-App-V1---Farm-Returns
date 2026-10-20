/**
 * Cattle C9 — proposal groups (merge algebra) and their Plan projections.
 *
 * Identity is the Plan kernel's own `planJobIdentityKey` (action key + target
 * scope + recommended window), computed through the real Plan function. A
 * group is the SET of work items sharing it; merging is set union, so it is
 * associative, commutative, idempotent and input-order independent, with no
 * source precedence. Every merged field is derived from that set by ONE
 * summary (`summariseGroup`):
 * - supporting reasons, blocker ids, window bases: union (sorted);
 * - one blocker id ⇒ one content (one request, one viewpoint; a mismatch fails closed);
 * - hard deadline: the earliest `dueIso` by instant (every deadline must be
 *   met); the projected authority is the canonical minimum among those due
 *   then; every authority is kept; a hard deadline beats none;
 * - priority: the highest tier; bases unioned;
 * - scope, completion contract, title, route: equal by construction (one
 *   vocabulary table) and checked;
 * - creation source: one distinct origin ⇒ that reason, more ⇒ `COMPOSITE`
 *   (a projection only — the group keeps every origin).
 */

import { canonicalizeValue } from "../../assessment-integrity";
import {
  planJobIdentityKey,
  recommendedWindow,
  hardDeadline,
  systemPriorityRank,
  type PlanBlocker,
  type PlanCreationSource,
  type PlanJobInput,
  type PlanTiming,
  type TargetScope,
} from "../../plan";
import { subjectRef } from "../../subject";
import { compareInstants } from "../animal-ledger";
import { compareStrings, sortedUnique } from "../integrity";
import { compareSourceVersionRefs } from "../source";
import type { CattlePlanBlocker, CattlePlanIssue, CattlePlanOrigin, CattlePlanProposalGroup, CattlePlanWindow, CattlePlanWorkItem } from "./plan-contracts";
import { completionContractFor, vocabularyTitle } from "./plan-vocabulary";

const issue = (code: string, ref: string | null = null): CattlePlanIssue => ({ code, ref });

/** Individual-animal work (B2): a STATIC scope of one `CATTLE_ANIMAL`. */
export const cattleAnimalScope = (animalId: string): TargetScope => ({ kind: "STATIC", members: [subjectRef("CATTLE_ANIMAL", animalId)] });

/** Group work (B2): the current members of a C1 management group, newcomers absorbed. */
export const cattleGroupScope = (groupRef: string): TargetScope => ({
  kind: "DYNAMIC",
  selector: { kind: "MEMBERS_OF", parent: subjectRef("CATTLE_GROUP", groupRef), memberType: "CATTLE_ANIMAL" },
  additions: "ABSORB_INTO_JOB",
});

/** The Plan identity of cattle work, through the real Plan kernel function. */
export function cattleWorkIdentity(actionKey: string, animalId: string, window: CattlePlanWindow | null): string {
  const w = window === null ? null : { kind: "RECOMMENDED_WINDOW" as const, startIso: window.opensAt, endIso: window.dueAt, basis: "" };
  return planJobIdentityKey({ actionKey, scope: cattleAnimalScope(animalId), timing: { recommendedWindow: w, hardDeadline: null } });
}

export const itemIdentity = (i: CattlePlanWorkItem) => cattleWorkIdentity(i.actionKey, i.animalId, i.timing.window);

/** `CATTLE_PLAN_REASON:` + JSON `[family, output id, output digest, consumed state]` — cites the cattle output. */
const reason = (family: string, outputId: string, digest: string, state: string) => `CATTLE_PLAN_REASON:${JSON.stringify([family, outputId, digest, state])}`;

export function itemReasons(i: CattlePlanWorkItem): string[] {
  return [reason(i.family, i.outputId, i.outputFingerprint.digest, i.consumedState), ...i.supporting.map((s) => reason(s.family, s.outputId, s.outputFingerprint.digest, s.consumedState))];
}

/** Every Farm Return origin a work item carries: its own and each folded restatement's (D2 never discards one). */
export const itemOrigins = (i: CattlePlanWorkItem): CattlePlanOrigin[] => [i.origin, ...i.supporting.map((s) => s.origin)];

const same = (a: unknown, b: unknown) => canonicalizeValue(a) === canonicalizeValue(b);

/** What a cattle window projects to in Plan (`recommendedWindow` endpoints); Plan has no boundary semantics. */
const planWindowOf = (i: CattlePlanWorkItem) => (i.timing.window === null ? null : { opensAt: i.timing.window.opensAt, dueAt: i.timing.window.dueAt });

/** The one summary of a set of work items sharing an identity; fails closed on any inconsistency. */
export function summariseGroup(itemsIn: readonly CattlePlanWorkItem[]): { ok: true; group: CattlePlanProposalGroup } | { ok: false; issues: CattlePlanIssue[] } {
  const byKey = new Map<string, CattlePlanWorkItem>();
  for (const i of itemsIn) {
    const seen = byKey.get(i.key);
    if (seen !== undefined && !same(seen, i)) return { ok: false, issues: [issue("CATTLE_PLAN_WORK_ITEM_IDENTITY_CONFLICT", i.key)] };
    byKey.set(i.key, i);
  }
  const items = [...byKey.values()].sort((a, b) => compareStrings(a.key, b.key));
  if (items.length === 0) return { ok: false, issues: [issue("CATTLE_PLAN_GROUP_INCONSISTENT", "EMPTY")] };
  const identityKey = itemIdentity(items[0]);
  const first = items[0];
  for (const i of items) {
    // The projected Plan window (endpoints) must agree; each owner's boundary stays in its item and window basis.
    if (itemIdentity(i) !== identityKey || i.vocabularyRow !== first.vocabularyRow || i.actionKey !== first.actionKey || i.animalId !== first.animalId || !same(planWindowOf(i), planWindowOf(first))) {
      return { ok: false, issues: [issue("CATTLE_PLAN_GROUP_INCONSISTENT", identityKey)] };
    }
  }
  const blockers = new Map<string, CattlePlanBlocker>();
  for (const b of items.flatMap((i) => i.blockers)) {
    const seen = blockers.get(b.id);
    if (seen !== undefined && !same(seen, b)) return { ok: false, issues: [issue("CATTLE_PLAN_BLOCKER_IDENTITY_CONFLICT", b.id)] };
    blockers.set(b.id, b);
  }
  const tier = [...items].sort((a, b) => systemPriorityRank(a.priority.tier) - systemPriorityRank(b.priority.tier))[0].priority.tier;
  const deadlines = items
    .flatMap((i) => (i.timing.hardDeadline === null ? [] : [i.timing.hardDeadline]))
    .sort((a, b) => compareInstants(a.dueIso, b.dueIso) || compareSourceVersionRefs(a.authority, b.authority) || compareStrings(a.dueIso, b.dueIso))
    .filter((d, i, a) => i === 0 || !same(a[i - 1], d));
  return {
    ok: true,
    group: {
      identityKey,
      items,
      origins: sortedUnique(items.flatMap(itemOrigins)) as CattlePlanOrigin[],
      priority: { tier, bases: sortedUnique(items.map((i) => i.priority.basis)) },
      windowBases: sortedUnique(items.flatMap((i) => (i.timing.windowBasis === null ? [] : [i.timing.windowBasis]))),
      hardDeadline: deadlines.length === 0 ? null : { dueIso: deadlines[0].dueIso, authority: deadlines[0].authority, authorities: deadlines },
      blockerIds: [...blockers.keys()].sort(compareStrings),
      supportingReasons: sortedUnique(items.flatMap(itemReasons)),
    },
  };
}

/** Merges groups (and/or work items as singleton groups) by identity: set union, then the one summary. */
export function mergeProposalGroups(groups: readonly CattlePlanProposalGroup[]): { ok: true; groups: CattlePlanProposalGroup[] } | { ok: false; issues: CattlePlanIssue[] } {
  return groupWorkItems(groups.flatMap((g) => g.items));
}

export function groupWorkItems(items: readonly CattlePlanWorkItem[]): { ok: true; groups: CattlePlanProposalGroup[] } | { ok: false; issues: CattlePlanIssue[] } {
  const byIdentity = new Map<string, CattlePlanWorkItem[]>();
  for (const i of items) {
    const id = itemIdentity(i);
    byIdentity.set(id, [...(byIdentity.get(id) ?? []), i]);
  }
  const groups: CattlePlanProposalGroup[] = [];
  const issues: CattlePlanIssue[] = [];
  for (const id of [...byIdentity.keys()].sort(compareStrings)) {
    const s = summariseGroup(byIdentity.get(id)!);
    if (s.ok) groups.push(s.group);
    else issues.push(...s.issues);
  }
  // One blocker id, one content — across every group, too.
  const blockers = new Map<string, CattlePlanBlocker>();
  for (const b of groups.flatMap((g) => g.items.flatMap((i) => i.blockers))) {
    const seen = blockers.get(b.id);
    if (seen !== undefined && !same(seen, b)) issues.push(issue("CATTLE_PLAN_BLOCKER_IDENTITY_CONFLICT", b.id));
    blockers.set(b.id, b);
  }
  return issues.length > 0 ? { ok: false, issues: dedupe(issues) } : { ok: true, groups };
}

function dedupe(issues: CattlePlanIssue[]): CattlePlanIssue[] {
  const m = new Map(issues.map((i) => [JSON.stringify([i.code, i.ref]), i]));
  return [...m.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, i]) => i);
}

// ---------------------------------------------------------------------------
// Plan projections (existing Plan types only)
// ---------------------------------------------------------------------------

const basisOf = (bases: readonly string[]) => (bases.length === 1 ? bases[0] : JSON.stringify(bases));

const CREATION_REASON = { OBLIGATION: "OBLIGATION", PROGRAMME: "PROGRAMME", DATA_GAP: "DATA_GAP", RECOMMENDATION: "RECOMMENDATION" } as const satisfies Record<
  CattlePlanOrigin,
  Extract<PlanCreationSource, { kind: "FARM_RETURN" }>["reason"]
>;

/** B3: one distinct origin ⇒ its reason; more ⇒ COMPOSITE. Never ADVISER_APPROVED. */
export function creationSourceOf(group: Pick<CattlePlanProposalGroup, "origins">): PlanCreationSource {
  return group.origins.length === 1 ? { kind: "FARM_RETURN", reason: CREATION_REASON[group.origins[0]] } : { kind: "FARM_RETURN", reason: "COMPOSITE" };
}

/** The group's Plan timing through the real Plan constructors (`null` if Plan rejects it — fail closed at the caller). */
export function timingOf(group: CattlePlanProposalGroup): PlanTiming | null {
  const w = group.items[0].timing.window;
  let recommended: PlanTiming["recommendedWindow"] = null;
  if (w !== null) {
    const r = recommendedWindow(w.opensAt, w.dueAt, basisOf(group.windowBases));
    if (!r.ok) return null;
    recommended = r.value;
  }
  let deadline: PlanTiming["hardDeadline"] = null;
  if (group.hardDeadline !== null) {
    const a = group.hardDeadline.authority;
    const d = hardDeadline(group.hardDeadline.dueIso, { kind: "VERSIONED_SOURCE", sourceId: a.sourceId, version: a.version, contentFingerprint: a.contentFingerprint });
    if (!d.ok) return null;
    deadline = d.value;
  }
  return { recommendedWindow: recommended, hardDeadline: deadline };
}

export const cattlePlanJobId = (identityKey: string) => `CATTLE_PLAN_JOB:${identityKey}`;

/** The `PlanJobInput` of one group. `effectiveAt` is the request viewpoint. */
export function projectProposal(group: CattlePlanProposalGroup, effectiveAt: string): PlanJobInput | null {
  const first = group.items[0];
  const timing = timingOf(group);
  const completionContract = completionContractFor(first.vocabularyRow, { identityKey: group.identityKey, animalId: first.animalId, windowed: first.timing.window !== null }, effectiveAt);
  if (timing === null || completionContract === null) return null;
  return {
    id: cattlePlanJobId(group.identityKey),
    actionKey: first.actionKey,
    title: vocabularyTitle(first.vocabularyRow, first.actionKey),
    goalId: null,
    programmeId: null,
    creationSource: creationSourceOf(group),
    supportingReasons: group.supportingReasons,
    scope: cattleAnimalScope(first.animalId),
    completionContract,
    timing,
    dependencies: { jobIds: [], blockerIds: group.blockerIds },
    systemPriority: { tier: group.priority.tier, basis: basisOf(group.priority.bases) },
    status: "PROPOSED",
    // No cattle workflow route exists; never a V1 LIVESTOCK_GROUP route for a C1 group.
    route: { kind: "NONE", reason: "MANUAL_TASK" },
  };
}

/** Every distinct blocker of the groups as a shared Plan blocker (sorted by id). */
export function projectBlockers(groups: readonly CattlePlanProposalGroup[]): PlanBlocker[] {
  const m = new Map<string, PlanBlocker>();
  for (const b of groups.flatMap((g) => g.items.flatMap((i) => i.blockers))) m.set(b.id, { id: b.id, kind: b.kind, status: b.status, description: b.description });
  return [...m.values()].sort((a, b) => compareStrings(a.id, b.id));
}
