import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RecordsPageClient } from "./RecordsPageClient";
import type { JobWithDecision } from "@/lib/farm-data/jobs";
import type { DecisionRecord } from "@/lib/farm-data/mappers";

afterEach(() => {
  cleanup();
});

const realJob: JobWithDecision = {
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
};

const realDecision: DecisionRecord = {
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
};

describe("RecordsPageClient", () => {
  it("shows one real, honest empty activity state when there is no history yet", () => {
    render(<RecordsPageClient jobs={[]} decisions={[]} />);
    expect(screen.getByText(/no activity yet/i)).toBeTruthy();
  });

  it("merges real jobs and real decisions into one chronologically-sorted timeline, newest first", () => {
    render(<RecordsPageClient jobs={[realJob]} decisions={[realDecision]} />);
    const items = screen.getAllByRole("listitem");
    // realDecision (decidedAt 2026-09-01) is newer than realJob's decision
    // (decidedAt 2026-08-29), so it must render first.
    expect(items[0].textContent).toContain("Spreading window");
    expect(items[1].textContent).toContain("Weight recorded");
  });

  it("provides a real Ask AI affordance scoped to Records", () => {
    render(<RecordsPageClient jobs={[]} decisions={[]} />);
    expect(screen.getByText("Ask AI")).toBeTruthy();
  });

  it("blanks the timeline when jobs are unavailable (dedup for decisions can't be trusted either)", () => {
    render(<RecordsPageClient jobs={[]} jobsUnavailable decisions={[]} />);
    expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy();
  });

  it("keeps showing real job entries with a soft caveat when only decisions are unavailable", () => {
    render(<RecordsPageClient jobs={[realJob]} decisions={[]} decisionsUnavailable />);
    expect(screen.getByText("Weight recorded")).toBeTruthy();
    expect(screen.getByText(/part of your history is temporarily unavailable/i)).toBeTruthy();
  });
});
