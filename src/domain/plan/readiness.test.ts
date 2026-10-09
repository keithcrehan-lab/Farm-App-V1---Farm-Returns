import { describe, expect, it } from "vitest";
import { jobsAffectedByBlocker, NO_DEPENDENCIES, type PlanBlocker } from "./dependencies";
import { deriveReadiness, type ReadinessInput } from "./readiness";
import { NOW } from "./test-fixtures";
import { NO_TIMING, recommendedWindow } from "./timing";

const base: ReadinessInput = { status: "PLANNED", dependencies: NO_DEPENDENCIES, timing: NO_TIMING, scopeStatus: "KNOWN" };
const ctx = { nowIso: NOW, jobStatuses: {}, blockers: {} };
const weather: PlanBlocker = { id: "b-weather", kind: "WEATHER", status: "ACTIVE", description: "Ground too wet" };

describe("deriveReadiness", () => {
  it("is READY with nothing outstanding", () => {
    expect(deriveReadiness(base, ctx)).toEqual({ state: "READY", reasons: [] });
  });

  it("never yields READY with an unmet, unknown or cancelled dependency", () => {
    const deps = { jobIds: ["j-planned", "j-missing", "j-cancelled", "j-done"], blockerIds: [] };
    const r = deriveReadiness(
      { ...base, dependencies: deps },
      { ...ctx, jobStatuses: { "j-planned": "PLANNED", "j-cancelled": "CANCELLED", "j-done": "COMPLETED" } },
    );
    expect(r.state).toBe("WAITING_FOR_DEPENDENCY");
    expect(r.reasons.map((x) => (x.kind === "DEPENDENCY_UNMET" ? x.jobId : null))).toEqual(["j-cancelled", "j-missing", "j-planned"]);
    expect(deriveReadiness({ ...base, dependencies: { jobIds: ["j-done"], blockerIds: [] } }, { ...ctx, jobStatuses: { "j-done": "COMPLETED" } }).state).toBe("READY");
  });

  it("never yields READY with an active or unknown blocker", () => {
    const blockers = { [weather.id]: weather, "b-input": { id: "b-input", kind: "INPUT", status: "UNKNOWN", description: "" } as PlanBlocker };
    expect(deriveReadiness({ ...base, dependencies: { jobIds: [], blockerIds: ["b-weather"] } }, { ...ctx, blockers }).state).toBe("WAITING_FOR_WEATHER");
    expect(deriveReadiness({ ...base, dependencies: { jobIds: [], blockerIds: ["b-input"] } }, { ...ctx, blockers }).state).toBe("WAITING_FOR_INPUT");
    expect(deriveReadiness({ ...base, dependencies: { jobIds: [], blockerIds: ["b-nope"] } }, ctx).state).toBe("WAITING_FOR_BLOCKER");
    const cleared = { [weather.id]: { ...weather, status: "CLEARED" as const } };
    expect(deriveReadiness({ ...base, dependencies: { jobIds: [], blockerIds: ["b-weather"] } }, { ...ctx, blockers: cleared }).state).toBe("READY");
  });

  it("one shared blocker affects multiple jobs", () => {
    const jobs = [
      { id: "j1", dependencies: { jobIds: [], blockerIds: ["b-weather"] } },
      { id: "j2", dependencies: NO_DEPENDENCIES },
      { id: "j3", dependencies: { jobIds: [], blockerIds: ["b-weather"] } },
    ];
    expect(jobsAffectedByBlocker(jobs, "b-weather")).toEqual(["j1", "j3"]);
    const blockers = { [weather.id]: weather };
    for (const j of jobs) {
      const state = deriveReadiness({ ...base, dependencies: j.dependencies }, { ...ctx, blockers }).state;
      expect(state).toBe(j.id === "j2" ? "READY" : "WAITING_FOR_WEATHER");
    }
  });

  it("dependency takes precedence and every reason is kept", () => {
    const window = recommendedWindow("2026-11-01T00:00:00Z", null, "test");
    if (!window.ok) throw new Error();
    const r = deriveReadiness(
      { ...base, dependencies: { jobIds: ["j-x"], blockerIds: ["b-weather"] }, timing: { recommendedWindow: window.value, hardDeadline: null } },
      { ...ctx, blockers: { [weather.id]: weather } },
    );
    expect(r.state).toBe("WAITING_FOR_DEPENDENCY");
    expect(r.reasons.map((x) => x.kind)).toEqual(["DEPENDENCY_UNMET", "BLOCKER_ACTIVE", "BEFORE_WINDOW"]);
  });

  it("timing and scope certainty", () => {
    const before = recommendedWindow("2026-11-01T00:00:00Z", null, "test");
    const after = recommendedWindow(null, "2026-10-01T00:00:00Z", "test");
    if (!before.ok || !after.ok) throw new Error();
    expect(deriveReadiness({ ...base, timing: { recommendedWindow: before.value, hardDeadline: null } }, ctx).state).toBe("UPCOMING");
    expect(deriveReadiness({ ...base, timing: { recommendedWindow: after.value, hardDeadline: null } }, ctx).state).toBe("NEEDS_ATTENTION");
    expect(deriveReadiness({ ...base, scopeStatus: "UNKNOWN" }, ctx).state).toBe("NEEDS_ATTENTION");
  });

  it("closed jobs are CLOSED regardless of dependencies", () => {
    expect(deriveReadiness({ ...base, status: "COMPLETED", dependencies: { jobIds: ["x"], blockerIds: [] } }, ctx).state).toBe("CLOSED");
  });
});
