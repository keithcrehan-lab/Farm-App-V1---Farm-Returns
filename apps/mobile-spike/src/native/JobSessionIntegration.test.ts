/**
 * Proves this phase's own required spike claim #2/#3 ("it can use the
 * existing domain contracts", "it can start a real Job Session") with
 * real code, not an assertion in a doc: these tests import
 * `src/domain/job-session-lifecycle.ts` and `src/domain/job-actual.ts`
 * DIRECTLY from the main repo (relative import, no copy, no
 * reimplementation) and exercise their real, already-tested behaviour
 * from this isolated mobile-spike workspace — the same modules a native
 * shell would call, unchanged.
 *
 * No native runtime is needed for this file at all: `job-session-
 * lifecycle.ts`/`job-actual.ts` are pure, dependency-free TypeScript
 * (this file's own real proof of `NATIVE_GPS_ARCHITECTURE_DECISION.md`
 * §1's claim: "the domain layer... is genuinely framework-agnostic").
 */
import { describe, expect, it } from "vitest";
import {
  finishJobSession,
  recordInterruptionGap,
  startJobSession,
  type InterruptionGap,
  type JobSessionLifecycleState,
} from "../../../../src/domain/job-session-lifecycle";
import { validateJobActualInput } from "../../../../src/domain/job-actual";

function emptyState(): JobSessionLifecycleState {
  return { status: "ready", activeIntervals: [], interruptionGaps: [] };
}

describe("mobile spike <-> real domain contract reuse", () => {
  it("starts a real Job Session using the unchanged domain state machine", () => {
    const result = startJobSession(emptyState(), "2026-09-04T09:00:00.000Z");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.status).toBe("active");
    expect(result.state.activeIntervals).toEqual([{ startedAt: "2026-09-04T09:00:00.000Z" }]);
  });

  it("maps a native background-tracking interruption to a real, disclosed InterruptionGap — never fabricating an unbroken route", () => {
    const started = startJobSession(emptyState(), "2026-09-04T09:00:00.000Z");
    if (!started.ok) throw new Error("setup failed");

    // A real native background-service interruption (e.g. iOS suspended
    // the app, or Android's battery optimisation killed the foreground
    // service) — this is exactly the kind of reason
    // `NativeLocationTrackingProvider`'s own `onInterruption` callback
    // would report, mapped to this domain module's own real
    // `InterruptionGap` reason vocabulary (not a new, native-only one —
    // "app_backgrounded" already covers the native case honestly, since
    // from the Job Session's own evidence perspective, what happened is
    // the same real fact: tracking stopped for a reason the app did not
    // choose).
    const gap: InterruptionGap = {
      lastConfirmedAt: "2026-09-04T09:05:00.000Z",
      interruptedAt: "2026-09-04T09:05:03.000Z",
      reason: "app_backgrounded",
    };
    const result = recordInterruptionGap(started.state, gap);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.interruptionGaps).toEqual([gap]);
    // The gap is disclosed, not silently absorbed into a continuous
    // activeIntervals entry — the session's own real interval list is
    // untouched by recording an interruption.
    expect(result.state.activeIntervals).toEqual(started.state.activeIntervals);
  });

  it("Finish Job (even after a real native interruption) still only ever produces completed_estimated, never confirmed_actual", () => {
    const started = startJobSession(emptyState(), "2026-09-04T09:00:00.000Z");
    if (!started.ok) throw new Error("setup failed");
    const interrupted = recordInterruptionGap(started.state, {
      lastConfirmedAt: "2026-09-04T09:05:00.000Z",
      interruptedAt: "2026-09-04T09:05:03.000Z",
      reason: "app_backgrounded",
    });
    if (!interrupted.ok) throw new Error("setup failed");
    const finished = finishJobSession(interrupted.state, "2026-09-04T09:30:00.000Z");
    expect(finished.ok).toBe(true);
    if (!finished.ok) return;
    expect(finished.state.status).toBe("completed_estimated");
  });

  it("real native GPS observations alone can never satisfy Confirm Actual's own validator — a farmer's explicit input is still required", () => {
    // The whole point of the Observed/Actual boundary
    // (GPS_JOB_SESSION_ACTUAL_CONTRACT.md §1): a background-tracked
    // route proves only that the phone was there. Calling the real
    // Confirm Actual validator with no farmer-supplied activity data
    // (quantity, product, etc.) — as if GPS alone were being asked to
    // stand in for it — fails validation, exactly as it must.
    const result = validateJobActualInput("fertiliser_spreading", { completionType: "whole", fieldIds: ["field-1"] }, []);
    expect(result.ok).toBe(false);
  });
});
