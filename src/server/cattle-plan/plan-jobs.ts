/**
 * Cattle — the retained Plan-job reconciliation shared by the demonstration
 * replay and the real (Pilot Integration) evaluation. Pure: composes the
 * FROZEN Plan kernel and C8/C9 outputs only; holds no state and reads no
 * clock or store. Moved unchanged from `cattle-demo/demo-replay.ts` (which
 * re-exports it) so real-mode code never imports the demonstration modules.
 */

import type { recommendCattle } from "@/domain/cattle/recommendations";
import type { CattlePlanResult } from "@/domain/cattle/plan-interface";
import { NO_DEPENDENCIES, createPlanJob, planJobIdentityKey, reevaluatePlanJob, setJobDependencies, setSystemPriority, type PlanAuditEvent, type PlanBlocker, type PlanJob, type PlanJobEvaluation } from "@/domain/plan";
import type { CattlePlanJobCurrent, CattlePlanJobOrigin } from "@/domain/cattle/presentation";

export interface CattleJobState {
  job: PlanJob;
  evaluation: PlanJobEvaluation | null;
  /** The viewpoint the job was created at. */
  createdAt: string;
  events: PlanAuditEvent[];
  /** What raised the job, captured at the creating run (F001: kept for the job's life). */
  origin: CattlePlanJobOrigin;
  /** What the latest planning run says about the job (F019: set by `reconcileJobs` on every run). */
  current: CattlePlanJobCurrent;
}

const blockerMap = (r: CattlePlanResult): Record<string, PlanBlocker> => Object.fromEntries(r.blockers.map((b) => [b.id, b]));

/**
 * The origin of a job created from run `r` (F001): the C9 group with the job's identity, and — when that group
 * cites C8 outputs — the C8 record whose pack id IS the cited output id (one output id is one record). A C8
 * failure, or no record with that id, is UNAVAILABLE: never a record of the same kind from somewhere else.
 */
export function jobOrigin(r: CattlePlanResult, job: PlanJob, at: string, c8Run: () => ReturnType<typeof recommendCattle>): CattlePlanJobOrigin {
  const group = r.groups.find((g) => g.identityKey === planJobIdentityKey(job)) ?? null;
  const cited = new Set((group?.items ?? []).flatMap((i) => [...(i.family === "C8_RECOMMENDATION" ? [i.outputId] : []), ...i.supporting.map((x) => x.outputId)]));
  if (cited.size === 0) return { at, group, recommendation: { state: "NOT_C8" } };
  const c8 = c8Run();
  const records = c8.ok ? c8.result.animals.flatMap((a) => (a.record && cited.has(a.record.packId) ? [a.record] : [])) : [];
  return { at, group, recommendation: records.length === 1 ? { state: "BOUND", record: records[0] } : { state: "UNAVAILABLE" } };
}

const TERMINAL: readonly PlanJob["status"][] = ["COMPLETED", "OBSOLETE", "CANCELLED"];
const isOpen = (j: CattleJobState) => !TERMINAL.includes(j.job.status);

/**
 * One planning run applied to the retained Plan jobs (F001 / F019) — the ONLY place replay state changes. A retained
 * job's state has four owners, and each run touches only the third:
 *
 * - IMMUTABLE ORIGIN (`origin`, `createdAt`, and the kernel's identity, scope, timing, completion contract — with
 *   its original completion cut-off — and creation source): captured when the job is created, never rewritten.
 * - LIFECYCLE (status, completion, overrides, deferral): the frozen Plan kernel's (`reevaluatePlanJob`), never reset
 *   because a later run proposes or stops proposing the work.
 * - CURRENT EVALUATION (`current`, the job's blocker dependencies and system priority, `evaluation`): replaced on
 *   every run. An open job is matched to the run's proposal with the same Plan identity (`planJobIdentityKey`:
 *   action, target scope and recommended window — the frozen deduplication identity; C9's job id is that key); the
 *   match refreshes its dependencies and priority through the kernel's own audited mutations BEFORE the kernel
 *   re-evaluates it, so readiness always reads the latest blockers. No match: the work is NOT_PROPOSED and no
 *   blocker of an earlier run is kept. A failed run: the current state is UNAVAILABLE — nothing is re-evaluated,
 *   and the last evaluation is never presented as fresh.
 * - PRESENTATION: derived from the three above (`work-view.ts`); never stored here.
 *
 * A closed job stays closed (history). A proposal whose identity no open job holds becomes a new job; when a closed
 * job already has that identity's id, the new occurrence takes the next free `#n` id (the kernel's ids are unique;
 * the identity key is unchanged). Pure: returns new states, never mutates `jobs`.
 */
export function reconcileJobs(
  jobs: readonly CattleJobState[],
  run: { ok: true; result: CattlePlanResult } | { ok: false },
  at: string,
  c8Run: () => ReturnType<typeof recommendCattle>,
): CattleJobState[] {
  if (!run.ok) return jobs.map((j) => (isOpen(j) ? { ...j, current: { state: "UNAVAILABLE", at } } : j));
  const r = run.result;
  const proposalByKey = new Map(r.proposals.map((p) => [planJobIdentityKey(p), p]));
  const blockers = blockerMap(r);
  const reconciled = jobs.map((j): CattleJobState => {
    if (!isOpen(j)) return j;
    const p = proposalByKey.get(planJobIdentityKey(j.job));
    const deps = setJobDependencies(j.job, p ? p.dependencies : NO_DEPENDENCIES, at);
    const prio = p ? setSystemPriority(deps.job, p.systemPriority, at) : { job: deps.job, events: [] };
    return { ...j, job: prio.job, events: [...j.events, ...deps.events, ...prio.events], current: { state: p ? "PROPOSED" : "NOT_PROPOSED", at } };
  });
  const jobStatuses = Object.fromEntries(reconciled.map((j) => [j.job.id, j.job.status]));
  const out = reconciled.map((j): CattleJobState => {
    const evaluation = reevaluatePlanJob(j.job, { nowIso: at, scopeReality: r.scopeReality, evidence: r.evidence, jobStatuses, blockers });
    return { ...j, job: evaluation.job, evaluation, events: [...j.events, ...evaluation.events] };
  });
  const held = new Set(out.filter(isOpen).map((j) => planJobIdentityKey(j.job)));
  const ids = new Set(out.map((j) => j.job.id));
  for (const p of r.proposals) {
    if (held.has(planJobIdentityKey(p))) continue;
    let id = p.id;
    for (let n = 2; ids.has(id); n++) id = `${p.id}#${n}`;
    const created = createPlanJob({ ...p, id }, at);
    const evaluation = reevaluatePlanJob(created.job, { nowIso: at, scopeReality: r.scopeReality, evidence: r.evidence, jobStatuses, blockers });
    out.push({ job: evaluation.job, evaluation, createdAt: at, events: [...created.events, ...evaluation.events], origin: jobOrigin(r, created.job, at, c8Run), current: { state: "PROPOSED", at } });
    ids.add(id);
    held.add(planJobIdentityKey(p));
  }
  return out;
}
