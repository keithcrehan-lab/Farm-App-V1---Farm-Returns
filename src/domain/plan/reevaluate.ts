/**
 * Plan kernel — deterministic re-evaluation.
 *
 * Canonical update -> re-evaluate -> affected Plan jobs update. Given a job
 * and the current canonical reality (scope membership, completion
 * evidence, dependency statuses, shared blockers) this pure function
 * returns the updated job, its derived readiness and canonical completion,
 * the audit events for every change, and any follow-on work the new
 * reality requires. Identical inputs always give identical outputs; there
 * is no clock, randomness or model call.
 *
 * Order of evaluation for an open job:
 * 1. resolve scope (audited SCOPE_CHANGED; FOLLOW_ON_PROPOSED for members
 *    handed to new work);
 * 2. an evidence-linked job whose known scope is now empty becomes
 *    OBSOLETE (it leaves the active queue, history is kept);
 * 3. evaluate the completion contract against canonical evidence; COMPLETE
 *    completes the job with no farmer checkbox; PARTIAL moves PLANNED work
 *    to IN_PROGRESS;
 * 4. derive readiness; audit readiness and progress changes.
 *
 * A closed job keeps its scope, but its canonical completion is still
 * evaluated and returned, so a farmer override never hides missing data.
 */

import type { SubjectRef } from "../subject";
import { planAuditEvent, type PlanAuditEvent } from "./audit";
import { evaluateCompletion, isEvidenceLinked, progressEquals, type CanonicalEvidence, type CompletionEvaluation } from "./completion";
import type { PlanBlocker } from "./dependencies";
import type { PlanJob } from "./job";
import { deriveReadiness, type Readiness } from "./readiness";
import { resolveScope, scopeChanged, type ScopeReality, type ScopeResolution } from "./scope";
import { isTerminalStatus, type PlanJobStatus, type StatusTransitionCause } from "./status";

export interface PlanEvaluationContext {
  nowIso: string;
  scopeReality: ScopeReality;
  evidence: CanonicalEvidence;
  jobStatuses: Readonly<Record<string, PlanJobStatus>>;
  blockers: Readonly<Record<string, PlanBlocker>>;
}

/** Work the new reality requires that the source job does not absorb. The
 * caller decides whether to create it (and with which id). */
export interface PlanFollowOnProposal {
  sourceJobId: string;
  actionKey: string;
  reason: "SCOPE_MEMBERS_ADDED";
  members: readonly SubjectRef[];
}

export interface PlanJobEvaluation {
  job: PlanJob;
  scope: ScopeResolution;
  completion: CompletionEvaluation;
  readiness: Readiness;
  events: readonly PlanAuditEvent[];
  followOn: PlanFollowOnProposal | null;
}

export function reevaluatePlanJob(job: PlanJob, context: PlanEvaluationContext): PlanJobEvaluation {
  const at = context.nowIso;
  const events: PlanAuditEvent[] = [];
  let next: PlanJob = job;
  let followOn: PlanFollowOnProposal | null = null;

  const setStatus = (to: PlanJobStatus, cause: StatusTransitionCause) => {
    events.push(planAuditEvent(job.id, at, { type: "STATUS_CHANGED", from: next.status, to, cause }));
    next = { ...next, status: to };
  };

  let scope: ScopeResolution;
  if (isTerminalStatus(job.status)) {
    scope = {
      status: "KNOWN",
      members: job.scopeMembers,
      added: [],
      removed: [],
      handedOff: [],
      handedOffRetained: job.scopeHandedOff,
      unknownReason: null,
    };
  } else {
    scope = resolveScope(job.scope, job.scopeMembers, job.scopeHandedOff, context.scopeReality);
    if (scopeChanged(scope)) {
      events.push(
        planAuditEvent(job.id, at, {
          type: "SCOPE_CHANGED",
          reason: job.scope.kind === "STATIC" ? "STATIC_SCOPE_DEFINITION" : "CANONICAL_MEMBERSHIP_CHANGED",
          added: scope.added,
          removed: scope.removed,
          handedOffToFollowOn: scope.handedOff,
        }),
      );
    }
    if (scope.status === "KNOWN") {
      next = { ...next, scopeMembers: scope.members, scopeHandedOff: scope.handedOffRetained };
    }
    if (scope.handedOff.length > 0) {
      followOn = { sourceJobId: job.id, actionKey: job.actionKey, reason: "SCOPE_MEMBERS_ADDED", members: scope.handedOff };
      events.push(planAuditEvent(job.id, at, { type: "FOLLOW_ON_PROPOSED", members: scope.handedOff }));
    }
  }

  const completion = evaluateCompletion(next.completionContract, scope, context.evidence);

  if (!isTerminalStatus(next.status) && isEvidenceLinked(next.completionContract)) {
    if (completion.state === "NO_TARGETS") {
      setStatus("OBSOLETE", "SCOPE_EMPTY");
    } else if (completion.state === "COMPLETE") {
      setStatus("COMPLETED", "CANONICAL_EVIDENCE");
      next = { ...next, completion: { basis: "CANONICAL_EVIDENCE", at, evidenceRefs: completion.evidenceRefs } };
      events.push(
        planAuditEvent(job.id, at, { type: "COMPLETED", basis: "CANONICAL_EVIDENCE", evidenceRefs: completion.evidenceRefs }),
      );
    } else if (completion.state === "PARTIAL" && (next.status === "PLANNED" || next.status === "PROPOSED")) {
      setStatus("IN_PROGRESS", "CANONICAL_EVIDENCE");
    }
  }

  const readiness = deriveReadiness(
    { status: next.status, dependencies: next.dependencies, timing: next.timing, scopeStatus: scope.status },
    context,
  );

  const previous = job.lastEvaluation;
  if ((previous?.readiness.state ?? null) !== readiness.state) {
    events.push(
      planAuditEvent(job.id, at, { type: "READINESS_CHANGED", from: previous?.readiness.state ?? null, to: readiness.state }),
    );
  }
  if (!progressEquals(previous?.progress ?? null, completion.progress)) {
    events.push(
      planAuditEvent(job.id, at, { type: "PROGRESS_CHANGED", from: previous?.progress ?? null, to: completion.progress }),
    );
  }
  next = { ...next, lastEvaluation: { readiness, progress: completion.progress } };

  return { job: next, scope, completion, readiness, events, followOn };
}
