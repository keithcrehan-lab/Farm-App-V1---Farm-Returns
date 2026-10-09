import { describe, expect, it } from "vitest";
import { evaluateCompletion } from "./completion";
import { clearDeferral, deferJob, farmerCompleteJob, isDeferralActive } from "./override";
import { reevaluatePlanJob } from "./reevaluate";
import { A1, A2, A3, context, LATER, makeJob, NOW, presence } from "./test-fixtures";

describe("defer / snooze", () => {
  it("is audited and does not change status, readiness or priority", () => {
    const job = makeJob();
    const deferred = deferJob(job, "SNOOZE", LATER, "busy", NOW);
    if (!deferred.ok) throw new Error();
    expect(deferred.job.status).toBe(job.status);
    expect(deferred.job.systemPriority).toEqual(job.systemPriority);
    expect(isDeferralActive(deferred.job.deferral, NOW)).toBe(true);
    expect(isDeferralActive(deferred.job.deferral, LATER)).toBe(false);
    expect(deferred.events).toMatchObject([{ type: "DEFERRAL_SET", deferral: { mode: "SNOOZE", untilIso: LATER } }]);
    expect(reevaluatePlanJob(deferred.job, context()).readiness).toEqual(reevaluatePlanJob(job, context()).readiness);
    const cleared = clearDeferral(deferred.job, NOW);
    expect(cleared.ok && cleared.events[0]?.type).toBe("DEFERRAL_CLEARED");
  });

  it("rejects invalid or past defer times", () => {
    expect(deferJob(makeJob(), "DEFER", NOW, null, NOW)).toEqual({ ok: false, error: "DEFER_UNTIL_NOT_IN_FUTURE" });
    expect(deferJob(makeJob(), "DEFER", "tomorrow", null, NOW).ok).toBe(false);
  });
});

describe("farmer completion", () => {
  it("completes a MANUAL job directly", () => {
    const job = makeJob({ completionContract: { kind: "MANUAL" }, route: { kind: "NONE", reason: "MANUAL_TASK" } });
    const canonical = evaluateCompletion(job.completionContract, { status: "KNOWN", members: job.scopeMembers }, presence([]));
    const r = farmerCompleteJob(job, canonical, NOW);
    expect(r.ok && r.job.completion?.basis).toBe("FARMER");
    expect(r.ok && r.job.farmerOverride).toBeNull();
  });

  it("an override of a data-linked job requires acknowledgement and preserves missing canonical data", () => {
    const job = makeJob();
    const canonical = evaluateCompletion(job.completionContract, { status: "KNOWN", members: job.scopeMembers }, presence([A1], [A2]));
    expect(farmerCompleteJob(job, canonical, NOW)).toEqual({
      ok: false,
      error: "OVERRIDE_REQUIRES_ACKNOWLEDGEMENT_OF_INCOMPLETE_CANONICAL_EVIDENCE",
    });
    const r = farmerCompleteJob(job, canonical, NOW, { acknowledgeCanonicalEvidenceIncomplete: true, note: "done by hand" });
    if (!r.ok) throw new Error(r.error);
    expect(r.job.status).toBe("COMPLETED");
    expect(r.job.completion?.basis).toBe("FARMER_OVERRIDE");
    expect(r.job.farmerOverride).toMatchObject({ canonicalCompletionState: "PARTIAL", canonicalDataMissing: [A2], canonicalDataUnknown: [A3] });
    expect(r.events[0]).toMatchObject({ type: "FARMER_OVERRIDE", canonicalDataMissing: [A2], canonicalDataUnknown: [A3] });

    // Later re-evaluation still reports the canonical gap; the override does not erase it.
    const later = reevaluatePlanJob(r.job, context({ nowIso: LATER, evidence: presence([A1], [A2, A3]) }));
    expect(later.job.status).toBe("COMPLETED");
    expect(later.completion.state).toBe("PARTIAL");
    expect(later.completion.missingMembers).toEqual([A2, A3]);
    expect(later.job.farmerOverride?.canonicalDataMissing).toEqual([A2]);
  });

  it("a data-linked job whose canonical evidence is complete completes on evidence, not override", () => {
    const job = makeJob();
    const canonical = evaluateCompletion(job.completionContract, { status: "KNOWN", members: job.scopeMembers }, presence([A1, A2, A3]));
    const r = farmerCompleteJob(job, canonical, NOW);
    expect(r.ok && r.job.completion?.basis).toBe("CANONICAL_EVIDENCE");
    expect(r.ok && r.job.farmerOverride).toBeNull();
  });

  it("rejects a mismatched canonical evaluation and closed jobs", () => {
    const job = makeJob();
    const manualEval = evaluateCompletion({ kind: "MANUAL" }, { status: "KNOWN", members: [] }, presence([]));
    expect(farmerCompleteJob(job, manualEval, NOW, { acknowledgeCanonicalEvidenceIncomplete: true })).toEqual({
      ok: false,
      error: "CANONICAL_EVALUATION_CONTRACT_MISMATCH",
    });
    expect(farmerCompleteJob({ ...job, status: "CANCELLED" }, manualEval, NOW).ok).toBe(false);
  });
});
