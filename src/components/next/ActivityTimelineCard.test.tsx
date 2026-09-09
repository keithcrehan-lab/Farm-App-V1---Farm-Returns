import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ActivityTimelineCard, entryTimestamp, type TimelineEntry } from "./ActivityTimelineCard";
import type { JobWithDecision } from "@/lib/farm-data/jobs";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import type { JobSessionWithActual } from "@/lib/farm-data/job-sessions";

afterEach(() => {
  cleanup();
});

function job(overrides: Partial<JobWithDecision> = {}): JobWithDecision {
  return {
    id: "job-1",
    farmId: "farm-1",
    decisionId: "decision-1",
    jobType: "record_weight_observation",
    status: "confirmed",
    createdAt: "2026-08-29T09:00:01Z",
    updatedAt: "2026-08-29T09:00:01Z",
    decision: {
      id: "decision-1",
      farmId: "farm-1",
      promptId: "prompt-1",
      calculationKind: "weight_observation_due",
      estimateSnapshot: { status: "OK", value: null, evidenceState: "MEASURED" },
      outcome: "accepted",
      decidedBy: "farmer",
      decidedAt: "2026-08-29T09:00:00Z",
      createdAt: "2026-08-29T09:00:01Z",
    },
    ...overrides,
  };
}

function decision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: "decision-2",
    farmId: "farm-1",
    promptId: "prompt-2",
    calculationKind: "spreading_window",
    estimateSnapshot: { status: "OK", value: null, evidenceState: "IRISH_MODEL" },
    outcome: "dismissed",
    decidedBy: "farmer",
    decidedAt: "2026-09-01T09:00:00Z",
    fieldId: "field-1",
    createdAt: "2026-09-01T09:00:01Z",
    ...overrides,
  };
}

function jobSession(overrides: Partial<JobSessionWithActual> = {}): JobSessionWithActual {
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
    updatedAt: "2026-07-20T14:00:00Z",
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

// Codex audit HIGH (round 49): a "job_session" entry's real sort/group
// timestamp must be `actual.confirmedAt` (the farmer-asserted activity
// date) — not `session.updatedAt` (a database write timestamp that can
// genuinely differ, e.g. a later revision or a delayed status-move
// retry after the fact). Sorting/grouping by `updatedAt` could misplace
// a confirmed fertiliser application into the wrong day entirely.
describe("entryTimestamp — a job_session entry sorts/groups by the real confirmed activity date, not the database's last-updated timestamp", () => {
  it("returns actual.confirmedAt, not session.updatedAt, when the two genuinely differ", () => {
    const entry: TimelineEntry = { type: "job_session", session: jobSession() };

    expect(entryTimestamp(entry)).toBe("2026-06-15T10:00:00Z");
  });

  it("falls back to session.updatedAt only if actual is ever somehow absent — defensive, never expected given the real invariant", () => {
    const entry: TimelineEntry = { type: "job_session", session: jobSession({ actual: undefined }) };

    expect(entryTimestamp(entry)).toBe("2026-07-20T14:00:00Z");
  });
});

describe("ActivityTimelineCard", () => {
  it("shows a real, honest empty state when there is no activity yet", () => {
    render(<ActivityTimelineCard entries={[]} />);
    expect(screen.getByText(/no activity yet/i)).toBeTruthy();
  });

  it("blanks the whole card when unavailable, rather than showing entries that may be incomplete", () => {
    render(<ActivityTimelineCard entries={[]} unavailable />);
    expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy();
  });

  it("renders both a job entry and a decision entry in one real list", () => {
    const entries: TimelineEntry[] = [{ type: "job", job: job() }, { type: "decision", decision: decision() }];
    render(<ActivityTimelineCard entries={entries} />);
    expect(screen.getByText("Weight recorded")).toBeTruthy();
    expect(screen.getByText("Spreading window")).toBeTruthy();
  });

  it("shows a soft caveat, not a blanket unavailable state, when only partially unavailable", () => {
    const entries: TimelineEntry[] = [{ type: "job", job: job() }];
    render(<ActivityTimelineCard entries={entries} partiallyUnavailable />);
    expect(screen.getByText("Weight recorded")).toBeTruthy();
    expect(screen.getByText(/part of your history is temporarily unavailable/i)).toBeTruthy();
  });

  it("discloses truncation rather than presenting a capped list as complete", () => {
    const entries: TimelineEntry[] = [{ type: "job", job: job() }];
    render(<ActivityTimelineCard entries={entries} truncated />);
    expect(screen.getByText(/older history exists/i)).toBeTruthy();
  });
});
