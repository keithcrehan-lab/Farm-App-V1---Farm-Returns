/**
 * Plan kernel — job lifecycle status.
 *
 * Status is lifecycle only. Whether work can be acted on now is readiness
 * (`readiness.ts`); importance is system priority (`priority.ts`); sequence
 * is farmer order (`farmer-order.ts`). A job can be PLANNED and waiting at
 * the same time.
 *
 * OBSOLETE means canonical reality removed the need (e.g. its scope is now
 * empty); the job leaves the active queue but stays in audit history.
 */

export type PlanJobStatus = "PROPOSED" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "OBSOLETE" | "CANCELLED";

export const TERMINAL_PLAN_JOB_STATUSES: readonly PlanJobStatus[] = ["COMPLETED", "OBSOLETE", "CANCELLED"];

export const PLAN_JOB_STATUS_TRANSITIONS: Readonly<Record<PlanJobStatus, readonly PlanJobStatus[]>> = {
  PROPOSED: ["PLANNED", "IN_PROGRESS", "COMPLETED", "OBSOLETE", "CANCELLED"],
  PLANNED: ["IN_PROGRESS", "COMPLETED", "OBSOLETE", "CANCELLED"],
  IN_PROGRESS: ["PLANNED", "COMPLETED", "OBSOLETE", "CANCELLED"],
  COMPLETED: [],
  OBSOLETE: [],
  CANCELLED: [],
};

export function isTerminalStatus(status: PlanJobStatus): boolean {
  return TERMINAL_PLAN_JOB_STATUSES.includes(status);
}

export function canTransitionStatus(from: PlanJobStatus, to: PlanJobStatus): boolean {
  return PLAN_JOB_STATUS_TRANSITIONS[from].includes(to);
}

/** Who or what caused a status transition (audited). */
export type StatusTransitionCause =
  | "FARMER"
  | "CANONICAL_EVIDENCE"
  | "SCOPE_EMPTY"
  | "FARMER_OVERRIDE";
