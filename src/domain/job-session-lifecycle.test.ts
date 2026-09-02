import { describe, expect, it } from "vitest";
import {
  canTransitionJobSessionStatus,
  cancelJobSession,
  computeElapsedSeconds,
  finishJobSession,
  pauseJobSession,
  recordInterruptionGap,
  resumeJobSession,
  startJobSession,
  type JobSessionLifecycleState,
} from "./job-session-lifecycle";

function initial(status: JobSessionLifecycleState["status"] = "ready"): JobSessionLifecycleState {
  return { status, activeIntervals: [], interruptionGaps: [] };
}

describe("canTransitionJobSessionStatus", () => {
  it("allows the documented legal transitions", () => {
    expect(canTransitionJobSessionStatus("ready", "active")).toBe(true);
    expect(canTransitionJobSessionStatus("active", "paused")).toBe(true);
    expect(canTransitionJobSessionStatus("active", "completed_estimated")).toBe(true);
    expect(canTransitionJobSessionStatus("paused", "active")).toBe(true);
    expect(canTransitionJobSessionStatus("completed_estimated", "confirmed_actual")).toBe(true);
  });

  it("rejects illegal transitions, including skipping straight to confirmed_actual", () => {
    expect(canTransitionJobSessionStatus("ready", "confirmed_actual")).toBe(false);
    expect(canTransitionJobSessionStatus("active", "confirmed_actual")).toBe(false);
    expect(canTransitionJobSessionStatus("confirmed_actual", "active")).toBe(false);
    expect(canTransitionJobSessionStatus("cancelled", "active")).toBe(false);
  });
});

describe("startJobSession", () => {
  it("transitions ready -> active and opens the first interval", () => {
    const result = startJobSession(initial(), "2026-09-02T09:00:00Z");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.status).toBe("active");
    expect(result.state.activeIntervals).toEqual([{ startedAt: "2026-09-02T09:00:00Z" }]);
  });

  it("refuses to start an already-active session", () => {
    const active = initial("active");
    const result = startJobSession(active, "2026-09-02T09:00:00Z");
    expect(result.ok).toBe(false);
  });
});

describe("finishJobSession — the critical rule", () => {
  it("Finish Job produces completed_estimated, never confirmed_actual, from active", () => {
    const started = startJobSession(initial(), "2026-09-02T09:00:00Z");
    if (!started.ok) throw new Error("setup failed");
    const finished = finishJobSession(started.state, "2026-09-02T11:00:00Z");
    expect(finished.ok).toBe(true);
    if (!finished.ok) return;
    expect(finished.state.status).toBe("completed_estimated");
    expect(finished.state.status).not.toBe("confirmed_actual");
    expect(finished.state.activeIntervals).toEqual([{ startedAt: "2026-09-02T09:00:00Z", endedAt: "2026-09-02T11:00:00Z" }]);
  });

  it("Finish Job from paused also produces completed_estimated", () => {
    const started = startJobSession(initial(), "2026-09-02T09:00:00Z");
    if (!started.ok) throw new Error("setup failed");
    const paused = pauseJobSession(started.state, "2026-09-02T09:30:00Z");
    if (!paused.ok) throw new Error("setup failed");
    const finished = finishJobSession(paused.state, "2026-09-02T09:45:00Z");
    expect(finished.ok).toBe(true);
    if (!finished.ok) return;
    expect(finished.state.status).toBe("completed_estimated");
  });

  it("refuses to finish a session that is not active or paused", () => {
    expect(finishJobSession(initial("ready"), "2026-09-02T09:00:00Z").ok).toBe(false);
    expect(finishJobSession(initial("confirmed_actual"), "2026-09-02T09:00:00Z").ok).toBe(false);
  });
});

describe("pause / resume", () => {
  it("pause closes the current interval; resume opens a new one", () => {
    const started = startJobSession(initial(), "2026-09-02T09:00:00Z");
    if (!started.ok) throw new Error("setup failed");
    const paused = pauseJobSession(started.state, "2026-09-02T09:15:00Z");
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    expect(paused.state.activeIntervals).toEqual([{ startedAt: "2026-09-02T09:00:00Z", endedAt: "2026-09-02T09:15:00Z" }]);

    const resumed = resumeJobSession(paused.state, "2026-09-02T09:30:00Z");
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.state.status).toBe("active");
    expect(resumed.state.activeIntervals).toHaveLength(2);
    expect(resumed.state.activeIntervals[1]).toEqual({ startedAt: "2026-09-02T09:30:00Z" });
  });
});

describe("cancelJobSession", () => {
  it("cancels from ready, active, paused and completed_estimated", () => {
    expect(cancelJobSession(initial("ready"), "2026-09-02T09:00:00Z").ok).toBe(true);
    expect(cancelJobSession(initial("active"), "2026-09-02T09:00:00Z").ok).toBe(true);
    expect(cancelJobSession(initial("paused"), "2026-09-02T09:00:00Z").ok).toBe(true);
    expect(cancelJobSession(initial("completed_estimated"), "2026-09-02T09:00:00Z").ok).toBe(true);
  });

  it("records the reason and cannot be un-cancelled", () => {
    const cancelled = cancelJobSession(initial("active"), "2026-09-02T09:00:00Z", "wrong field selected");
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.state.cancelledReason).toBe("wrong field selected");
    expect(canTransitionJobSessionStatus("cancelled", "active")).toBe(false);
  });
});

describe("computeElapsedSeconds", () => {
  it("sums closed intervals only for a paused session, ignoring a later nowIso", () => {
    const state: JobSessionLifecycleState = {
      status: "paused",
      activeIntervals: [{ startedAt: "2026-09-02T09:00:00Z", endedAt: "2026-09-02T09:10:00Z" }],
      interruptionGaps: [],
    };
    expect(computeElapsedSeconds(state, "2026-09-02T12:00:00Z")).toBe(600);
  });

  it("adds live time for an active session's still-open interval", () => {
    const state: JobSessionLifecycleState = {
      status: "active",
      activeIntervals: [
        { startedAt: "2026-09-02T09:00:00Z", endedAt: "2026-09-02T09:10:00Z" },
        { startedAt: "2026-09-02T09:20:00Z" },
      ],
      interruptionGaps: [],
    };
    expect(computeElapsedSeconds(state, "2026-09-02T09:25:00Z")).toBe(600 + 300);
  });
});

describe("recordInterruptionGap", () => {
  it("appends a gap while active without changing status", () => {
    const started = startJobSession(initial(), "2026-09-02T09:00:00Z");
    if (!started.ok) throw new Error("setup failed");
    const gapped = recordInterruptionGap(started.state, {
      lastConfirmedAt: "2026-09-02T09:05:00Z",
      interruptedAt: "2026-09-02T09:05:00Z",
      reason: "app_backgrounded",
    });
    expect(gapped.ok).toBe(true);
    if (!gapped.ok) return;
    expect(gapped.state.status).toBe("active");
    expect(gapped.state.interruptionGaps).toHaveLength(1);
  });

  it("refuses to record a gap for a non-active session", () => {
    const result = recordInterruptionGap(initial("paused"), {
      lastConfirmedAt: "2026-09-02T09:05:00Z",
      interruptedAt: "2026-09-02T09:05:00Z",
    });
    expect(result.ok).toBe(false);
  });
});
