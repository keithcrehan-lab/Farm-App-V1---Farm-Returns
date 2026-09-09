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
// timestamp)" regardless of whether GPS was ever involved. Codex audit
// HIGH (round 48, correcting round 47's own fix as still
// insufficient): gating on `session.hasGpsTrace` only proves *some*
// telemetry row exists for the session, never that these specific
// date/start-end values came from it — `activeIntervals`/`updatedAt`
// are always lifecycle/database clock reads, never bound to a real GPS
// observation, whatever telemetry a session happens to have. This app
// has no real, persisted per-timestamp GPS provenance anywhere yet, so
// "Phone GPS" is never claimed for these two fields at all, regardless
// of `hasGpsTrace` — a real telemetry trace still gets its own,
// honestly-scoped "Device evidence" disclosure (a different claim: "raw
// telemetry exists for this session", not "these specific timestamps
// are GPS-observed").
describe("JobSessionRecordRow — never claims Phone GPS provenance for lifecycle timestamps this app has no real per-timestamp GPS evidence for", () => {
  it("never claims Phone GPS provenance for a manual session with no real telemetry, even though it has active intervals", () => {
    render(<JobSessionRecordRow session={session({ origin: "manual", hasGpsTrace: false })} />);

    expect(screen.queryByText(/Phone GPS/)).toBeNull();
  });

  it("still never claims Phone GPS provenance even when a real telemetry trace exists for the session — that's a different, honestly-scoped claim", () => {
    render(<JobSessionRecordRow session={session({ origin: "detected", hasGpsTrace: true })} />);

    expect(screen.queryByText(/Phone GPS/)).toBeNull();
    expect(screen.getByText(/Device evidence/)).toBeTruthy();
  });
});

// Codex audit HIGH (round 49): the displayed record date must be the
// real, farmer-asserted `actual.confirmedAt` — not `session.updatedAt`
// (a database write timestamp that can genuinely differ from when the
// application was actually confirmed).
describe("JobSessionRecordRow — displays the real confirmed activity date, not the database's own last-updated timestamp", () => {
  it("shows actual.confirmedAt, not session.updatedAt, when the two genuinely differ", () => {
    render(
      <JobSessionRecordRow
        session={session({
          updatedAt: "2026-07-20T14:00:00Z",
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
        })}
      />,
    );

    expect(screen.getByText(/15 Jun 2026/)).toBeTruthy();
    expect(screen.queryByText(/20 Jul 2026/)).toBeNull();
  });
});
