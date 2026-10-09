/**
 * Plan kernel — dependencies and shared blockers.
 *
 * A job may depend on other jobs (satisfied only when they are COMPLETED)
 * and on shared blockers. A blocker is represented once and referenced by
 * id from every job it affects, so one weather or input constraint can hold
 * many jobs. Blocker status comes from the canonical source that owns the
 * condition; Plan never decides that the weather or a legal window is open.
 */

export type PlanBlockerKind = "WEATHER" | "LEGAL_WINDOW" | "INPUT" | "OTHER";

/** UNKNOWN blocks: an unconfirmed constraint is never treated as cleared. */
export type PlanBlockerStatus = "ACTIVE" | "CLEARED" | "UNKNOWN";

export interface PlanBlocker {
  id: string;
  kind: PlanBlockerKind;
  status: PlanBlockerStatus;
  description: string;
}

export interface JobDependencies {
  jobIds: readonly string[];
  blockerIds: readonly string[];
}

export const NO_DEPENDENCIES: JobDependencies = { jobIds: [], blockerIds: [] };

export function normaliseDependencies(deps: JobDependencies): JobDependencies {
  return { jobIds: [...new Set(deps.jobIds)].sort(), blockerIds: [...new Set(deps.blockerIds)].sort() };
}

export function dependenciesEqual(a: JobDependencies, b: JobDependencies): boolean {
  return JSON.stringify(normaliseDependencies(a)) === JSON.stringify(normaliseDependencies(b));
}

/** Ids of the jobs a shared blocker affects, in input order. */
export function jobsAffectedByBlocker(
  jobs: readonly { id: string; dependencies: JobDependencies }[],
  blockerId: string,
): string[] {
  return jobs.filter((j) => j.dependencies.blockerIds.includes(blockerId)).map((j) => j.id);
}
