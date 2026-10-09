/**
 * Plan kernel — readiness.
 *
 * Readiness answers "can this be acted on now?", derived deterministically
 * from lifecycle status, dependencies, shared blockers, timing and scope
 * certainty. It is never stored as truth and never collapsed into status or
 * priority. Every applicable reason is reported; the headline state follows
 * a fixed precedence, so unmet dependencies or any active/unknown blocker
 * can never yield READY. A dependency is met only by a COMPLETED job; an
 * unknown job or blocker id fails closed (waiting).
 *
 * Defer/snooze is farmer state (`override.ts`) and does not change
 * readiness: Farm Return keeps monitoring snoozed work.
 */

import type { JobDependencies, PlanBlocker, PlanBlockerKind } from "./dependencies";
import { isTerminalStatus, type PlanJobStatus } from "./status";
import { isHardDeadlinePassed, windowPosition, type PlanTiming } from "./timing";

export type ReadinessState =
  | "CLOSED"
  | "WAITING_FOR_DEPENDENCY"
  | "WAITING_FOR_LEGAL_WINDOW"
  | "WAITING_FOR_WEATHER"
  | "WAITING_FOR_INPUT"
  | "WAITING_FOR_BLOCKER"
  | "UPCOMING"
  | "NEEDS_ATTENTION"
  | "READY";

export type ReadinessReason =
  | { kind: "JOB_CLOSED"; status: PlanJobStatus }
  | { kind: "DEPENDENCY_UNMET"; jobId: string; dependencyStatus: PlanJobStatus | "UNKNOWN_JOB" }
  | {
      kind: "BLOCKER_ACTIVE";
      blockerId: string;
      blockerKind: PlanBlockerKind | "UNKNOWN_BLOCKER";
      blockerStatus: "ACTIVE" | "UNKNOWN";
    }
  | { kind: "BEFORE_WINDOW"; startIso: string }
  | { kind: "WINDOW_PASSED"; endIso: string }
  | { kind: "HARD_DEADLINE_PASSED"; dueIso: string }
  | { kind: "SCOPE_UNKNOWN" };

export interface Readiness {
  state: ReadinessState;
  reasons: readonly ReadinessReason[];
}

export interface ReadinessContext {
  nowIso: string;
  /** Current lifecycle status of every job this job may depend on. */
  jobStatuses: Readonly<Record<string, PlanJobStatus>>;
  /** Shared blockers by id. */
  blockers: Readonly<Record<string, PlanBlocker>>;
}

export interface ReadinessInput {
  status: PlanJobStatus;
  dependencies: JobDependencies;
  timing: PlanTiming;
  scopeStatus: "KNOWN" | "UNKNOWN";
}

const BLOCKER_STATE: Record<PlanBlockerKind | "UNKNOWN_BLOCKER", ReadinessState> = {
  LEGAL_WINDOW: "WAITING_FOR_LEGAL_WINDOW",
  WEATHER: "WAITING_FOR_WEATHER",
  INPUT: "WAITING_FOR_INPUT",
  OTHER: "WAITING_FOR_BLOCKER",
  UNKNOWN_BLOCKER: "WAITING_FOR_BLOCKER",
};

const PRECEDENCE: readonly ReadinessState[] = [
  "CLOSED",
  "WAITING_FOR_DEPENDENCY",
  "WAITING_FOR_LEGAL_WINDOW",
  "WAITING_FOR_WEATHER",
  "WAITING_FOR_INPUT",
  "WAITING_FOR_BLOCKER",
  "UPCOMING",
  "NEEDS_ATTENTION",
  "READY",
];

function stateForReason(reason: ReadinessReason): ReadinessState {
  switch (reason.kind) {
    case "JOB_CLOSED":
      return "CLOSED";
    case "DEPENDENCY_UNMET":
      return "WAITING_FOR_DEPENDENCY";
    case "BLOCKER_ACTIVE":
      return BLOCKER_STATE[reason.blockerKind];
    case "BEFORE_WINDOW":
      return "UPCOMING";
    case "WINDOW_PASSED":
    case "HARD_DEADLINE_PASSED":
    case "SCOPE_UNKNOWN":
      return "NEEDS_ATTENTION";
  }
}

export function deriveReadiness(input: ReadinessInput, context: ReadinessContext): Readiness {
  if (isTerminalStatus(input.status)) {
    return { state: "CLOSED", reasons: [{ kind: "JOB_CLOSED", status: input.status }] };
  }
  const reasons: ReadinessReason[] = [];

  for (const jobId of [...new Set(input.dependencies.jobIds)].sort()) {
    const status = context.jobStatuses[jobId];
    if (status === undefined) reasons.push({ kind: "DEPENDENCY_UNMET", jobId, dependencyStatus: "UNKNOWN_JOB" });
    else if (status !== "COMPLETED") reasons.push({ kind: "DEPENDENCY_UNMET", jobId, dependencyStatus: status });
  }

  for (const blockerId of [...new Set(input.dependencies.blockerIds)].sort()) {
    const blocker = context.blockers[blockerId];
    if (blocker === undefined) {
      reasons.push({ kind: "BLOCKER_ACTIVE", blockerId, blockerKind: "UNKNOWN_BLOCKER", blockerStatus: "UNKNOWN" });
    } else if (blocker.status !== "CLEARED") {
      reasons.push({ kind: "BLOCKER_ACTIVE", blockerId, blockerKind: blocker.kind, blockerStatus: blocker.status });
    }
  }

  const window = input.timing.recommendedWindow;
  const position = windowPosition(window, context.nowIso);
  if (position === "BEFORE_WINDOW" && window?.startIso) reasons.push({ kind: "BEFORE_WINDOW", startIso: window.startIso });
  if (position === "AFTER_WINDOW" && window?.endIso) reasons.push({ kind: "WINDOW_PASSED", endIso: window.endIso });
  if (input.timing.hardDeadline && isHardDeadlinePassed(input.timing.hardDeadline, context.nowIso)) {
    reasons.push({ kind: "HARD_DEADLINE_PASSED", dueIso: input.timing.hardDeadline.dueIso });
  }
  if (input.scopeStatus === "UNKNOWN") reasons.push({ kind: "SCOPE_UNKNOWN" });

  const state = reasons
    .map(stateForReason)
    .reduce<ReadinessState>(
      (best, s) => (PRECEDENCE.indexOf(s) < PRECEDENCE.indexOf(best) ? s : best),
      "READY",
    );
  return { state, reasons };
}

export function readinessEquals(a: Readiness | null, b: Readiness | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
