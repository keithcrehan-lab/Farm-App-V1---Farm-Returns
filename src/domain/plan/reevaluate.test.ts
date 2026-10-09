import { describe, expect, it } from "vitest";
import { NO_CANONICAL_EVIDENCE } from "./completion";
import { reevaluatePlanJob } from "./reevaluate";
import { A1, A2, A3, A4, context, GROUP_SELECTOR, LATER, makeJob, NOW, presence } from "./test-fixtures";

const membership = (members: (typeof A1)[]) => [{ selector: GROUP_SELECTOR, membership: { status: "KNOWN" as const, members } }];

describe("reevaluatePlanJob", () => {
  it("derives partial progress from canonical evidence and moves PLANNED to IN_PROGRESS", () => {
    const r = reevaluatePlanJob(makeJob(), context({ evidence: presence([A1], [A2, A3]) }));
    expect(r.job.status).toBe("IN_PROGRESS");
    expect(r.completion.progress).toEqual({ kind: "MEMBER_COUNT", complete: 1, missing: 2, unknown: 0, total: 3 });
    expect(r.events.map((e) => e.type)).toEqual(["STATUS_CHANGED", "READINESS_CHANGED", "PROGRESS_CHANGED"]);
  });

  it("completes automatically from canonical data recorded elsewhere — no farmer checkbox", () => {
    const first = reevaluatePlanJob(makeJob(), context({ evidence: presence([A1], [A2, A3]) }));
    const second = reevaluatePlanJob(first.job, context({ nowIso: LATER, evidence: presence([A1, A2, A3]) }));
    expect(second.job.status).toBe("COMPLETED");
    expect(second.job.completion).toEqual({ basis: "CANONICAL_EVIDENCE", at: LATER, evidenceRefs: ["rec-a1", "rec-a2", "rec-a3"] });
    expect(second.job.farmerOverride).toBeNull();
    expect(second.readiness.state).toBe("CLOSED");
    expect(second.events).toContainEqual(expect.objectContaining({ type: "COMPLETED", basis: "CANONICAL_EVIDENCE" }));
  });

  it("does not treat unknown evidence as zero or complete", () => {
    const r = reevaluatePlanJob(makeJob(), context({ evidence: NO_CANONICAL_EVIDENCE }));
    expect(r.job.status).toBe("PLANNED");
    expect(r.completion.progress).toEqual({ kind: "UNKNOWN", reason: "EVIDENCE_NOT_SUPPLIED" });
  });

  it("a scope change completes the job and separately yields follow-on work", () => {
    // a1, a2 recorded; a3 leaves the group; a4 joins it.
    const r = reevaluatePlanJob(
      makeJob(),
      context({ scopeReality: membership([A1, A2, A4]), evidence: presence([A1, A2], [A4]) }),
    );
    expect(r.job.scopeMembers).toEqual([A1, A2]);
    expect(r.job.status).toBe("COMPLETED");
    expect(r.followOn).toEqual({ sourceJobId: "job-1", actionKey: "TEST_ACTION", reason: "SCOPE_MEMBERS_ADDED", members: [A4] });
    const scopeEvent = r.events.find((e) => e.type === "SCOPE_CHANGED");
    expect(scopeEvent).toMatchObject({ reason: "CANONICAL_MEMBERSHIP_CHANGED", removed: [A3], added: [], handedOffToFollowOn: [A4] });
    expect(r.events.map((e) => e.type)).toEqual([
      "SCOPE_CHANGED",
      "FOLLOW_ON_PROPOSED",
      "STATUS_CHANGED",
      "COMPLETED",
      "READINESS_CHANGED",
      "PROGRESS_CHANGED",
    ]);
  });

  it("absorbs additions when the scope policy says so, keeping the job open", () => {
    const job = makeJob({ scope: { kind: "DYNAMIC", selector: GROUP_SELECTOR, additions: "ABSORB_INTO_JOB" } });
    const r = reevaluatePlanJob(job, context({ scopeReality: membership([A1, A2, A3, A4]), evidence: presence([A1, A2, A3], [A4]) }));
    expect(r.job.scopeMembers).toEqual([A1, A2, A3, A4]);
    expect(r.job.status).toBe("IN_PROGRESS");
    expect(r.followOn).toBeNull();
  });

  it("an emptied scope makes the job OBSOLETE but auditable", () => {
    const r = reevaluatePlanJob(makeJob(), context({ scopeReality: membership([]), evidence: presence([]) }));
    expect(r.job.status).toBe("OBSOLETE");
    expect(r.events).toContainEqual(expect.objectContaining({ type: "STATUS_CHANGED", to: "OBSOLETE", cause: "SCOPE_EMPTY" }));
  });

  it("unknown membership keeps members, waits for attention and never completes", () => {
    const r = reevaluatePlanJob(
      makeJob(),
      context({ scopeReality: [{ selector: GROUP_SELECTOR, membership: { status: "UNKNOWN", reason: "OFFLINE" } }], evidence: presence([A1, A2, A3]) }),
    );
    expect(r.job.status).toBe("PLANNED");
    expect(r.job.scopeMembers).toEqual([A1, A2, A3]);
    expect(r.readiness.state).toBe("NEEDS_ATTENTION");
  });

  it("is pure: identical inputs give identical outputs, and stable re-evaluation emits nothing", () => {
    const job = makeJob();
    const ctx = context({ scopeReality: membership([A1, A2, A4]), evidence: presence([A1], [A2, A4]) });
    const snapshot = JSON.stringify({ job, ctx });
    const a = reevaluatePlanJob(job, ctx);
    const b = reevaluatePlanJob(job, ctx);
    expect(a).toEqual(b);
    expect(JSON.stringify({ job, ctx })).toBe(snapshot);
    const again = reevaluatePlanJob(a.job, ctx);
    expect(again.events).toEqual([]);
    expect(again.followOn).toBeNull();
    expect(again.job).toEqual(a.job);
  });

  it("a dependency change re-derives readiness without touching status", () => {
    const r = reevaluatePlanJob(
      makeJob({ dependencies: { jobIds: ["prereq"], blockerIds: [] } }),
      context({ jobStatuses: { prereq: "IN_PROGRESS" } }),
    );
    expect(r.readiness.state).toBe("WAITING_FOR_DEPENDENCY");
    expect(r.job.status).toBe("PLANNED");
    const unblocked = reevaluatePlanJob(r.job, context({ nowIso: NOW, jobStatuses: { prereq: "COMPLETED" } }));
    expect(unblocked.readiness.state).toBe("READY");
    expect(unblocked.events).toEqual([expect.objectContaining({ type: "READINESS_CHANGED", from: "WAITING_FOR_DEPENDENCY", to: "READY" })]);
  });
});
