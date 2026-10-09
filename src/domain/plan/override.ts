/**
 * Plan kernel — farmer defer/snooze and completion overrides.
 *
 * SNOOZE hides a job from the active queue until a time; DEFER is the
 * farmer choosing to do it later. Neither changes status, readiness or
 * priority, and Farm Return keeps re-evaluating deferred work.
 *
 * A farmer may complete a MANUAL job directly. Completing an
 * evidence-linked job by hand is an explicit override: it must be
 * acknowledged, and the canonical completion state, missing members and
 * unknown members at that moment are preserved on the job and in the
 * audit trail. Re-evaluation keeps reporting the canonical evaluation
 * separately, so the override never erases the fact that required
 * canonical data is still missing.
 */

import { isValidIsoUtcDateTime } from "../iso-datetime";
import type { SubjectRef } from "../subject";
import { planAuditEvent } from "./audit";
import type { CompletionEvaluation, CompletionState } from "./completion";
import { isEvidenceLinked } from "./completion";
import type { PlanJob, PlanMutationResult } from "./job";
import { canTransitionStatus } from "./status";

export interface PlanDeferral {
  mode: "SNOOZE" | "DEFER";
  untilIso: string;
  reason: string | null;
  setAt: string;
}

export interface FarmerCompletionOverride {
  at: string;
  note: string | null;
  canonicalCompletionState: CompletionState;
  canonicalDataMissing: readonly SubjectRef[];
  canonicalDataUnknown: readonly SubjectRef[];
}

export function isDeferralActive(deferral: PlanDeferral | null, nowIso: string): boolean {
  return deferral !== null && Date.parse(nowIso) < Date.parse(deferral.untilIso);
}

export function deferJob(
  job: PlanJob,
  mode: PlanDeferral["mode"],
  untilIso: string,
  reason: string | null,
  nowIso: string,
): PlanMutationResult {
  if (!isValidIsoUtcDateTime(untilIso)) return { ok: false, error: "INVALID_DEFER_UNTIL" };
  if (Date.parse(untilIso) <= Date.parse(nowIso)) return { ok: false, error: "DEFER_UNTIL_NOT_IN_FUTURE" };
  const deferral: PlanDeferral = { mode, untilIso, reason, setAt: nowIso };
  return {
    ok: true,
    job: { ...job, deferral },
    events: [planAuditEvent(job.id, nowIso, { type: "DEFERRAL_SET", deferral })],
  };
}

export function clearDeferral(job: PlanJob, nowIso: string): PlanMutationResult {
  if (job.deferral === null) return { ok: true, job, events: [] };
  return {
    ok: true,
    job: { ...job, deferral: null },
    events: [planAuditEvent(job.id, nowIso, { type: "DEFERRAL_CLEARED", previous: job.deferral })],
  };
}

export interface FarmerCompletionOptions {
  note?: string | null;
  /** Required for an evidence-linked job whose canonical evaluation is not COMPLETE. */
  acknowledgeCanonicalEvidenceIncomplete?: boolean;
}

/**
 * Farmer completes a job. `canonical` is the current canonical evaluation
 * (`evaluateCompletion`), passed in so the override records exactly what
 * was outstanding.
 */
export function farmerCompleteJob(
  job: PlanJob,
  canonical: CompletionEvaluation,
  nowIso: string,
  options: FarmerCompletionOptions = {},
): PlanMutationResult {
  if (!canTransitionStatus(job.status, "COMPLETED")) {
    return { ok: false, error: `ILLEGAL_TRANSITION_${job.status}_TO_COMPLETED` };
  }
  if (canonical.contractKind !== job.completionContract.kind) {
    return { ok: false, error: "CANONICAL_EVALUATION_CONTRACT_MISMATCH" };
  }
  const note = options.note ?? null;

  if (!isEvidenceLinked(job.completionContract)) {
    return {
      ok: true,
      job: { ...job, status: "COMPLETED", completion: { basis: "FARMER", at: nowIso, evidenceRefs: [] } },
      events: [
        planAuditEvent(job.id, nowIso, { type: "STATUS_CHANGED", from: job.status, to: "COMPLETED", cause: "FARMER" }),
        planAuditEvent(job.id, nowIso, { type: "COMPLETED", basis: "FARMER", evidenceRefs: [] }),
      ],
    };
  }

  if (canonical.state === "COMPLETE") {
    return {
      ok: true,
      job: {
        ...job,
        status: "COMPLETED",
        completion: { basis: "CANONICAL_EVIDENCE", at: nowIso, evidenceRefs: canonical.evidenceRefs },
      },
      events: [
        planAuditEvent(job.id, nowIso, {
          type: "STATUS_CHANGED",
          from: job.status,
          to: "COMPLETED",
          cause: "CANONICAL_EVIDENCE",
        }),
        planAuditEvent(job.id, nowIso, {
          type: "COMPLETED",
          basis: "CANONICAL_EVIDENCE",
          evidenceRefs: canonical.evidenceRefs,
        }),
      ],
    };
  }

  if (options.acknowledgeCanonicalEvidenceIncomplete !== true) {
    return { ok: false, error: "OVERRIDE_REQUIRES_ACKNOWLEDGEMENT_OF_INCOMPLETE_CANONICAL_EVIDENCE" };
  }
  const farmerOverride: FarmerCompletionOverride = {
    at: nowIso,
    note,
    canonicalCompletionState: canonical.state,
    canonicalDataMissing: canonical.missingMembers,
    canonicalDataUnknown: canonical.unknownMembers,
  };
  return {
    ok: true,
    job: {
      ...job,
      status: "COMPLETED",
      completion: { basis: "FARMER_OVERRIDE", at: nowIso, evidenceRefs: canonical.evidenceRefs },
      farmerOverride,
    },
    events: [
      planAuditEvent(job.id, nowIso, {
        type: "FARMER_OVERRIDE",
        override: "MANUAL_COMPLETION_OF_EVIDENCE_LINKED_JOB",
        canonicalCompletionState: canonical.state,
        canonicalDataMissing: canonical.missingMembers,
        canonicalDataUnknown: canonical.unknownMembers,
      }),
      planAuditEvent(job.id, nowIso, {
        type: "STATUS_CHANGED",
        from: job.status,
        to: "COMPLETED",
        cause: "FARMER_OVERRIDE",
      }),
      planAuditEvent(job.id, nowIso, {
        type: "COMPLETED",
        basis: "FARMER_OVERRIDE",
        evidenceRefs: canonical.evidenceRefs,
      }),
    ],
  };
}
