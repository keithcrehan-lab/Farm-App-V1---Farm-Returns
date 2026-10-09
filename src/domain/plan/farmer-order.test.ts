import { describe, expect, it } from "vitest";
import { EMPTY_FARMER_ORDER, moveInFarmerOrder, reconcileFarmerOrder, sortByFarmerOrder } from "./farmer-order";
import { setSystemPriority } from "./job";
import { compareSystemPriority, SYSTEM_PRIORITY_TIERS } from "./priority";
import { deriveReadiness } from "./readiness";
import { makeJob, NOW } from "./test-fixtures";

const low = { tier: "INFORMATION_VALUE" as const, basis: "t" };
const high = { tier: "HARD_OBLIGATION" as const, basis: "t" };

describe("system priority", () => {
  it("orders the four tiers with hard obligations first", () => {
    expect(SYSTEM_PRIORITY_TIERS).toEqual(["HARD_OBLIGATION", "AVOID_MATERIAL_LOSS", "EXPECTED_NET_RETURN", "INFORMATION_VALUE"]);
    expect(compareSystemPriority(high, low)).toBeLessThan(0);
  });
});

describe("farmer working order", () => {
  it("appends newcomers by priority, then id, without reordering existing positions", () => {
    const jobs = [
      { id: "c", systemPriority: low },
      { id: "a", systemPriority: low },
      { id: "b", systemPriority: high },
    ];
    const order = reconcileFarmerOrder(EMPTY_FARMER_ORDER, jobs);
    expect(order.jobIds).toEqual(["b", "a", "c"]);
    const moved = moveInFarmerOrder(order, "c", 0, NOW);
    if (!moved.ok) throw new Error();
    expect(moved.order.jobIds).toEqual(["c", "b", "a"]);
    expect(moved.events).toMatchObject([{ type: "FARMER_ORDER_CHANGED", jobId: "c", fromIndex: 2, toIndex: 0 }]);
  });

  it("survives system-priority changes", () => {
    const order = { jobIds: ["c", "b", "a"] };
    const reprioritised = [
      { id: "a", systemPriority: high },
      { id: "b", systemPriority: low },
      { id: "c", systemPriority: low },
      { id: "d", systemPriority: high },
    ];
    const next = reconcileFarmerOrder(order, reprioritised);
    expect(next.jobIds).toEqual(["c", "b", "a", "d"]);
    expect(sortByFarmerOrder(reprioritised, next).map((j) => j.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("drops jobs that left the active set and rejects unknown moves", () => {
    expect(reconcileFarmerOrder({ jobIds: ["a", "gone", "b"] }, [{ id: "b", systemPriority: low }, { id: "a", systemPriority: low }]).jobIds).toEqual(["a", "b"]);
    expect(moveInFarmerOrder({ jobIds: ["a"] }, "z", 0, NOW)).toEqual({ ok: false, error: "JOB_NOT_IN_ORDER" });
  });

  it("changing system priority does not change status, readiness or order", () => {
    const job = makeJob();
    const { job: changed, events } = setSystemPriority(job, high, NOW);
    expect(changed.status).toBe(job.status);
    const ctx = { nowIso: NOW, jobStatuses: {}, blockers: {} };
    const r = (j: typeof job) => deriveReadiness({ status: j.status, dependencies: j.dependencies, timing: j.timing, scopeStatus: "KNOWN" }, ctx);
    expect(r(changed)).toEqual(r(job));
    expect(events).toMatchObject([{ type: "SYSTEM_PRIORITY_CHANGED", from: { tier: "INFORMATION_VALUE" }, to: { tier: "HARD_OBLIGATION" } }]);
    const order = { jobIds: ["other", job.id] };
    expect(reconcileFarmerOrder(order, [{ id: "other", systemPriority: low }, changed]).jobIds).toEqual(["other", job.id]);
  });
});
