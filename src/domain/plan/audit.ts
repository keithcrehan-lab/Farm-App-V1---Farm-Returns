/**
 * Plan kernel — audit events.
 *
 * Lightweight, composable records of every important Plan state change.
 * Each event carries the job it concerns, the evaluation instant (always
 * passed in, never read from a clock) and the kernel version, so a change
 * can be reproduced and explained. Events describe Plan's own state; they
 * reference canonical evidence by id and never copy domain facts.
 */

import type { SubjectRef } from "../subject";
import type { CompletionState, PlanProgress } from "./completion";
import type { JobDependencies } from "./dependencies";
import type { PlanCreationSource } from "./job";
import type { PlanDeferral } from "./override";
import type { SystemPriority } from "./priority";
import type { ReadinessState } from "./readiness";
import type { PlanJobStatus, StatusTransitionCause } from "./status";
import { PLAN_KERNEL_VERSION, type PlanKernelVersion } from "./version";

interface PlanAuditBase {
  jobId: string;
  at: string;
  kernelVersion: PlanKernelVersion;
}

export type PlanCompletionBasis = "CANONICAL_EVIDENCE" | "FARMER" | "FARMER_OVERRIDE";

export type PlanAuditPayload =
  | { type: "JOB_CREATED"; source: PlanCreationSource }
  | { type: "STATUS_CHANGED"; from: PlanJobStatus; to: PlanJobStatus; cause: StatusTransitionCause }
  | { type: "READINESS_CHANGED"; from: ReadinessState | null; to: ReadinessState }
  | {
      type: "SCOPE_CHANGED";
      reason: "CANONICAL_MEMBERSHIP_CHANGED" | "STATIC_SCOPE_DEFINITION";
      added: readonly SubjectRef[];
      removed: readonly SubjectRef[];
      handedOffToFollowOn: readonly SubjectRef[];
    }
  | { type: "DEPENDENCY_CHANGED"; from: JobDependencies; to: JobDependencies }
  | { type: "PROGRESS_CHANGED"; from: PlanProgress | null; to: PlanProgress }
  | { type: "COMPLETED"; basis: PlanCompletionBasis; evidenceRefs: readonly string[] }
  | {
      type: "FARMER_OVERRIDE";
      override: "MANUAL_COMPLETION_OF_EVIDENCE_LINKED_JOB";
      canonicalCompletionState: CompletionState;
      canonicalDataMissing: readonly SubjectRef[];
      canonicalDataUnknown: readonly SubjectRef[];
    }
  | { type: "DEFERRAL_SET"; deferral: PlanDeferral }
  | { type: "DEFERRAL_CLEARED"; previous: PlanDeferral }
  | { type: "FARMER_ORDER_CHANGED"; fromIndex: number | null; toIndex: number }
  | { type: "SYSTEM_PRIORITY_CHANGED"; from: SystemPriority; to: SystemPriority }
  | { type: "FOLLOW_ON_PROPOSED"; members: readonly SubjectRef[] };

export type PlanAuditEvent = PlanAuditBase & PlanAuditPayload;

export type PlanAuditEventType = PlanAuditEvent["type"];

export function planAuditEvent(jobId: string, at: string, payload: PlanAuditPayload): PlanAuditEvent {
  return { jobId, at, kernelVersion: PLAN_KERNEL_VERSION, ...payload };
}
