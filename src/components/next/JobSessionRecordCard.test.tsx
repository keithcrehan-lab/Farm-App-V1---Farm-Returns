import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JobSessionRecordRow } from "./JobSessionRecordCard";
import type { JobSessionWithActual } from "@/lib/farm-data/job-sessions";

afterEach(cleanup);

function session(overrides: Partial<JobSessionWithActual> = {}): JobSessionWithActual {
  return {
    id: "session-1",
    farmId: "farm-1",
    decisionId: "decision-1",
    activityType: "fertiliser_spreading",
    origin: "manual",
    status: "confirmed_actual",
    fieldSegments: [],
    activeIntervals: [{ startedAt: "2026-06-15T09:00:00Z", endedAt: "2026-06-15T10:00:00Z" }],
    interruptionGaps: [],
    createdAt: "2026-06-15T09:00:00Z",
    updatedAt: "2026-06-15T10:00:00Z",
    hasGpsTrace: false,
    actual: {
      id: "actual-1",
      farmId: "farm-1",
      jobSessionId: "session-1",
      revision: 1,
      activityType: "fertiliser_spreading",
      completionType: "whole",
      payload: { product: "CAN", quantity: 250, quantityUnit: "kg" },
      confirmedBy: "farmer",
      confirmedAt: "2026-06-15T10:00:00Z",
      createdAt: "2026-06-15T10:00:00Z",
    },
    ...overrides,
  };
}

// Codex audit MEDIUM (round 47, completing this file's own round-1
// finding, `docs/overnight/audits/gps-job-session-actual-contract-codex-audit-round1.md`
// #6, which was only ever half-applied): `hasDeviceTimestamps` was
// derived purely from `activeIntervals.length > 0` — true for every
// started session, including a manual fertiliser job with no GPS
// telemetry at all — so it was mislabelled "Phone GPS (device
// timestamp)" regardless of whether GPS was ever involved.
describe("JobSessionRecordRow — Phone GPS provenance requires a real telemetry trace, not just a lifecycle timer", () => {
  it("never claims Phone GPS provenance for a manual session with no real telemetry, even though it has active intervals", () => {
    render(<JobSessionRecordRow session={session({ origin: "manual", hasGpsTrace: false })} />);

    expect(screen.queryByText(/Phone GPS/)).toBeNull();
  });

  it("does claim Phone GPS provenance for a session with a real telemetry trace", () => {
    render(<JobSessionRecordRow session={session({ origin: "detected", hasGpsTrace: true })} />);

    expect(screen.getByText(/Phone GPS/)).toBeTruthy();
  });
});
