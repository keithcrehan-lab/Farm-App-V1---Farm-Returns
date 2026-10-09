/**
 * Plan kernel — the job/work item and its farmer/system mutations.
 *
 * A `PlanJob` holds intent and orchestration state only: what work, which
 * canonical targets (`SubjectRef`s), how completion is proven, when it is
 * recommended, what it waits on, its system priority and its lifecycle.
 * It holds no canonical domain fact. `scopeMembers` is the derived
 * reference list the job last resolved (re-derived on every evaluation)
 * and `lastEvaluation` caches derived state only to detect and audit
 * changes.
 *
 * Every mutation is pure, takes the instant explicitly and returns the new
 * job plus the audit events it produced.
 */

import type { SubjectRef } from "../subject";
import type { PlanActionRoute } from "./action-route";
import { planAuditEvent, type PlanAuditEvent, type PlanCompletionBasis } from "./audit";
import type { CompletionContract, PlanProgress } from "./completion";
import { dependenciesEqual, normaliseDependencies, type JobDependencies } from "./dependencies";
import type { FarmerCompletionOverride, PlanDeferral } from "./override";
import type { SystemPriority } from "./priority";
import type { Readiness } from "./readiness";
import { normaliseSubjects, scopeIdentityKey, type TargetScope } from "./scope";
import { canTransitionStatus, type PlanJobStatus, type StatusTransitionCause } from "./status";
import type { PlanTiming } from "./timing";

export type PlanCreationSource =
  | { kind: "FARM_RETURN"; reason: "ROUTINE" | "SEASONAL" | "DATA_GAP" | "PROGRAMME" }
  | { kind: "ADVISER_APPROVED"; recommendationRef: string }
  | { kind: "FARMER_MANUAL" }
  | { kind: "FOLLOW_ON"; sourceJobId: string };

export interface PlanJob {
  id: string;
  /** Stable action vocabulary key, e.g. "WEIGH_GROUP" (deduplication identity). */
  actionKey: string;
  title: string;
  goalId: string | null;
  programmeId: string | null;
  creationSource: PlanCreationSource;
  /** Several reasons may support one real piece of work (no duplicate jobs). */
  supportingReasons: readonly string[];
  scope: TargetScope;
  scopeMembers: readonly SubjectRef[];
  /** Members handed to follow-on work under a FOLLOW_ON_WORK scope. */
  scopeHandedOff: readonly SubjectRef[];
  completionContract: CompletionContract;
  timing: PlanTiming;
  dependencies: JobDependencies;
  systemPriority: SystemPriority;
  status: PlanJobStatus;
  completion: { basis: PlanCompletionBasis; at: string; evidenceRefs: readonly string[] } | null;
  farmerOverride: FarmerCompletionOverride | null;
  deferral: PlanDeferral | null;
  route: PlanActionRoute;
  createdAt: string;
  lastEvaluation: { readiness: Readiness; progress: PlanProgress } | null;
}

export interface PlanJobInput {
  id: string;
  actionKey: string;
  title: string;
  goalId?: string | null;
  programmeId?: string | null;
  creationSource: PlanCreationSource;
  supportingReasons?: readonly string[];
  scope: TargetScope;
  /** Members resolved from canonical reality at creation (dynamic scopes). */
  initialMembers?: readonly SubjectRef[];
  completionContract: CompletionContract;
  timing: PlanTiming;
  dependencies: JobDependencies;
  systemPriority: SystemPriority;
  status?: "PROPOSED" | "PLANNED";
  route: PlanActionRoute;
}

export interface PlanMutation {
  job: PlanJob;
  events: readonly PlanAuditEvent[];
}

export type PlanMutationResult = ({ ok: true } & PlanMutation) | { ok: false; error: string };

export function createPlanJob(input: PlanJobInput, nowIso: string): PlanMutation {
  const scopeMembers = normaliseSubjects(
    input.scope.kind === "STATIC" ? input.scope.members : (input.initialMembers ?? []),
  );
  const job: PlanJob = {
    id: input.id,
    actionKey: input.actionKey,
    title: input.title,
    goalId: input.goalId ?? null,
    programmeId: input.programmeId ?? null,
    creationSource: input.creationSource,
    supportingReasons: [...new Set(input.supportingReasons ?? [])].sort(),
    scope: input.scope,
    scopeMembers,
    scopeHandedOff: [],
    completionContract: input.completionContract,
    timing: input.timing,
    dependencies: normaliseDependencies(input.dependencies),
    systemPriority: input.systemPriority,
    status: input.status ?? "PROPOSED",
    completion: null,
    farmerOverride: null,
    deferral: null,
    route: input.route,
    createdAt: nowIso,
    lastEvaluation: null,
  };
  return { job, events: [planAuditEvent(job.id, nowIso, { type: "JOB_CREATED", source: input.creationSource })] };
}

/**
 * Deduplication identity: action + target scope + recommended window.
 * Jobs sharing a key describe the same real work and should be one job
 * with several `supportingReasons`.
 */
export function planJobIdentityKey(job: Pick<PlanJob, "actionKey" | "scope" | "timing">): string {
  const w = job.timing.recommendedWindow;
  return `${job.actionKey}|${scopeIdentityKey(job.scope)}|${w ? `${w.startIso ?? "-"}..${w.endIso ?? "-"}` : "NO_WINDOW"}`;
}

export function addSupportingReason(job: PlanJob, reason: string): PlanJob {
  return { ...job, supportingReasons: [...new Set([...job.supportingReasons, reason])].sort() };
}

export function transitionJobStatus(
  job: PlanJob,
  to: PlanJobStatus,
  cause: StatusTransitionCause,
  nowIso: string,
): PlanMutationResult {
  if (job.status === to) return { ok: true, job, events: [] };
  // Completion needs provenance: canonical evidence (`reevaluatePlanJob`)
  // or the guarded farmer path (`farmerCompleteJob`), never a bare status set.
  if (to === "COMPLETED") return { ok: false, error: "COMPLETION_REQUIRES_EVIDENCE_OR_FARMER_COMPLETION" };
  if (!canTransitionStatus(job.status, to)) return { ok: false, error: `ILLEGAL_TRANSITION_${job.status}_TO_${to}` };
  return {
    ok: true,
    job: { ...job, status: to },
    events: [planAuditEvent(job.id, nowIso, { type: "STATUS_CHANGED", from: job.status, to, cause })],
  };
}

export function setJobDependencies(job: PlanJob, dependencies: JobDependencies, nowIso: string): PlanMutation {
  const to = normaliseDependencies(dependencies);
  if (dependenciesEqual(job.dependencies, to)) return { job, events: [] };
  return {
    job: { ...job, dependencies: to },
    events: [planAuditEvent(job.id, nowIso, { type: "DEPENDENCY_CHANGED", from: job.dependencies, to })],
  };
}

/** Changes importance only; status, readiness and farmer order are untouched. */
export function setSystemPriority(job: PlanJob, priority: SystemPriority, nowIso: string): PlanMutation {
  if (job.systemPriority.tier === priority.tier && job.systemPriority.basis === priority.basis) {
    return { job, events: [] };
  }
  return {
    job: { ...job, systemPriority: priority },
    events: [planAuditEvent(job.id, nowIso, { type: "SYSTEM_PRIORITY_CHANGED", from: job.systemPriority, to: priority })],
  };
}
