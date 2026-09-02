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
    // realDecision (decidedAt 2026-09-01) is newer than realJob's
    // updatedAt (2026-08-29), so it must render first.
    expect(items[0].textContent).toContain("Spreading window");
    expect(items[1].textContent).toContain("Weight recorded");
  });

  it("sorts a job entry by job.updatedAt, not by its decision's decidedAt (Codex audit MEDIUM, round 2)", () => {
    // Deliberately the opposite of realJob/realDecision's real-world
    // dates above: this job's *decision* was made before realDecision's,
    // but the job itself was only confirmed (updatedAt) well after it —
    // proving the sort genuinely reads updatedAt, not decidedAt (a sort
    // that used decidedAt would put this job second, not first).
    const lateConfirmedJob: JobWithDecision = {
      ...realJob,
      id: "job-2",
      updatedAt: "2026-09-02T00:00:00Z",
      decision: { ...realJob.decision, id: "decision-3", decidedAt: "2026-08-01T00:00:00Z" },
    };
    render(<RecordsPageClient jobs={[lateConfirmedJob]} decisions={[realDecision]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("Weight recorded");
    expect(items[1].textContent).toContain("Spreading window");
  });

  it("provides a real Ask AI affordance scoped to Records, on both the mobile header and the desktop PageHeader", () => {
    render(<RecordsPageClient jobs={[]} decisions={[]} />);
    // One in the mobile-only header, one in PageHeader's desktop `actions`
    // slot (Codex audit MEDIUM, round 3) — both real, both present in
    // jsdom regardless of the `lg:hidden`/`hidden lg:flex` classes that
    // only a real browser's layout engine would actually apply.
    expect(screen.getAllByText("Ask AI")).toHaveLength(2);
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
