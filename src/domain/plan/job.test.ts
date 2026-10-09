import { describe, expect, it } from "vitest";
import { actionRouteHref } from "./action-route";
import { PLAN_JOB_STATUS_TRANSITIONS } from "./status";
import { addSupportingReason, createPlanJob, planJobIdentityKey, setJobDependencies, transitionJobStatus } from "./job";
import { makeJob, NOW } from "./test-fixtures";
import { PLAN_KERNEL_VERSION } from "./version";

describe("PlanJob", () => {
  it("records its creation source as an audit event", () => {
    const { events } = createPlanJob(
      {
        id: "m1",
        actionKey: "MANUAL",
        title: "Fix gate",
        creationSource: { kind: "FARMER_MANUAL" },
        scope: { kind: "STATIC", members: [] },
        completionContract: { kind: "MANUAL" },
        timing: { recommendedWindow: null, hardDeadline: null },
        dependencies: { jobIds: [], blockerIds: [] },
        systemPriority: { tier: "AVOID_MATERIAL_LOSS", basis: "t" },
        route: { kind: "NONE", reason: "MANUAL_TASK" },
      },
      NOW,
    );
    expect(events).toEqual([{ jobId: "m1", at: NOW, kernelVersion: PLAN_KERNEL_VERSION, type: "JOB_CREATED", source: { kind: "FARMER_MANUAL" } }]);
  });

  it("enforces the lifecycle table and audits transitions; status change leaves priority alone", () => {
    const job = makeJob();
    const r = transitionJobStatus(job, "CANCELLED", "FARMER", NOW);
    if (!r.ok) throw new Error();
    expect(r.job.systemPriority).toEqual(job.systemPriority);
    expect(r.events).toMatchObject([{ type: "STATUS_CHANGED", from: "PLANNED", to: "CANCELLED", cause: "FARMER" }]);
    expect(transitionJobStatus(r.job, "PLANNED", "FARMER", NOW)).toEqual({ ok: false, error: "ILLEGAL_TRANSITION_CANCELLED_TO_PLANNED" });
    expect(PLAN_JOB_STATUS_TRANSITIONS.COMPLETED).toEqual([]);
  });

  it("audits dependency changes only when they change", () => {
    const job = makeJob();
    const r = setJobDependencies(job, { jobIds: ["b", "a", "a"], blockerIds: [] }, NOW);
    expect(r.job.dependencies).toEqual({ jobIds: ["a", "b"], blockerIds: [] });
    expect(r.events).toMatchObject([{ type: "DEPENDENCY_CHANGED", to: { jobIds: ["a", "b"] } }]);
    expect(setJobDependencies(r.job, { jobIds: ["a", "b"], blockerIds: [] }, NOW).events).toEqual([]);
  });

  it("deduplicates by action + scope + window with multiple supporting reasons", () => {
    const a = makeJob({ id: "x", supportingReasons: ["data gap"] });
    const b = makeJob({ id: "y", supportingReasons: ["programme"] });
    expect(planJobIdentityKey(a)).toBe(planJobIdentityKey(b));
    expect(planJobIdentityKey(makeJob({ actionKey: "OTHER" }))).not.toBe(planJobIdentityKey(a));
    expect(addSupportingReason(a, "programme").supportingReasons).toEqual(["data gap", "programme"]);
  });
});

describe("action routes", () => {
  it("map to existing canonical workflows with the target pre-selected", () => {
    expect(actionRouteHref({ kind: "LIVESTOCK_GROUP", groupId: "g 1" })).toBe("/livestock/g%201");
    expect(actionRouteHref({ kind: "FIELD_SOIL_SAMPLE", fieldId: "f1" })).toBe("/soil-sample/f1");
    expect(actionRouteHref({ kind: "FIELD_NUTRIENT_PLAN", fieldId: "f1" })).toBe("/nutrients?field=f1");
    expect(actionRouteHref({ kind: "NONE", reason: "MANUAL_TASK" })).toBeNull();
  });
});
