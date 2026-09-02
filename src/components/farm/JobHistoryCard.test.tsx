import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { JobHistoryCard } from "./JobHistoryCard";
import type { JobWithDecision } from "@/lib/farm-data/jobs";

afterEach(() => {
  cleanup();
});

function job(
  overrides: Partial<JobWithDecision> = {},
  decisionOverrides: Partial<JobWithDecision["decision"]> = {},
): JobWithDecision {
  return {
    id: "job-1",
    farmId: "farm-1",
    decisionId: "decision-1",
    jobType: "record_weight_observation",
    status: "confirmed",
    createdAt: "2026-08-29T09:00:01Z",
    updatedAt: "2026-08-29T09:00:01Z",
    weightObservation: {
      id: "observation-1",
      animalId: "animal-1",
      weightKg: 320,
      observedDate: "2026-08-29",
      source: "GPS job mode",
    },
    decision: {
      id: "decision-1",
      farmId: "farm-1",
      promptId: "prompt-1",
      calculationKind: "weight_observation_due",
      estimateSnapshot: { status: "OK", value: null, evidenceState: "MEASURED" },
      outcome: "accepted",
      edits: { animalId: "animal-1", weightKg: 320, observedDate: "2026-08-29" },
      decidedBy: "farmer",
      decidedAt: "2026-08-29T09:00:00Z",
      createdAt: "2026-08-29T09:00:01Z",
      ...decisionOverrides,
    },
    ...overrides,
  };
}

describe("JobHistoryCard", () => {
  it("shows a real, honest empty state when there is no job history yet", () => {
    render(<JobHistoryCard jobs={[]} />);
    expect(screen.getByText(/no job history yet/i)).toBeTruthy();
  });

  it("renders a confirmed record_weight_observation job with the real recorded Actual", () => {
    render(<JobHistoryCard jobs={[job()]} />);

    expect(screen.getByText("Weight recorded")).toBeTruthy();
    expect(screen.getByText("Accepted")).toBeTruthy();
    expect(screen.getByText(/320 kg/)).toBeTruthy();
  });

  it("includes the animal id and source in the Actual summary, not just weight and date", () => {
    // Codex audit HIGH (audit-logs/20260901T095654Z.md): weight+date alone
    // can't distinguish two different animals weighed the same on the
    // same day, and carries no inspectable provenance for the figure.
    render(<JobHistoryCard jobs={[job()]} />);

    expect(screen.getByText(/animal animal-1/)).toBeTruthy();
    expect(screen.getByText(/GPS job mode/)).toBeTruthy();
  });

  it("shows the real weightObservation, not decision.edits, when the two ever diverge", () => {
    // Codex audit HIGH (audit-logs/20260901T094442Z.md): decision.edits is
    // the decided-time input snapshot, not the live source of truth --
    // this proves the card reads the embedded Actual, not the decision.
    render(
      <JobHistoryCard
        jobs={[
          job(
            { weightObservation: { id: "observation-1", animalId: "animal-1", weightKg: 340, observedDate: "2026-08-30", source: "revision" } },
            { edits: { animalId: "animal-1", weightKg: 320, observedDate: "2026-08-29" } },
          ),
        ]}
      />,
    );

    expect(screen.getByText(/340 kg/)).toBeTruthy();
    expect(screen.queryByText(/320 kg/)).toBeNull();
  });

  it("renders a dismissed decision without claiming an accepted outcome", () => {
    render(<JobHistoryCard jobs={[job({ weightObservation: undefined }, { outcome: "dismissed", edits: undefined })]} />);

    expect(screen.getByText("Dismissed")).toBeTruthy();
    expect(screen.queryByText("Accepted")).toBeNull();
    // A dismissed decision has no real Actual to summarise -- must not
    // show a weight line it never had evidence for.
    expect(screen.queryByText(/kg/)).toBeNull();
  });

  it("falls back to an honest, generic label for an unknown future job type, not invented copy", () => {
    render(<JobHistoryCard jobs={[job({ jobType: "spreading_run", weightObservation: undefined })]} />);

    expect(screen.getByText("spreading run")).toBeTruthy();
  });

  it("shows no weight summary for a record_weight_observation job whose Actual embed is unexpectedly missing", () => {
    // A defensive case, not a normal one: jobs.weight_observation_id is
    // present but the embedded row didn't come back (should not happen
    // given the FK, but this card must not crash or fabricate a summary
    // from decision.edits as a fallback).
    render(<JobHistoryCard jobs={[job({ weightObservation: undefined })]} />);

    expect(screen.getByText("Weight recorded")).toBeTruthy();
    expect(screen.queryByText(/kg/)).toBeNull();
  });

  it("renders multiple jobs in the order supplied (caller/query controls ordering)", () => {
    render(
      <JobHistoryCard
        jobs={[
          job({ id: "job-1", weightObservation: { id: "o1", animalId: "a", weightKg: 100, observedDate: "2026-08-01", source: "s" } }),
          job({ id: "job-2", weightObservation: { id: "o2", animalId: "b", weightKg: 200, observedDate: "2026-08-15", source: "s" } }),
        ]}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("100 kg");
    expect(items[1].textContent).toContain("200 kg");
  });

  it("shows a real 'temporarily unavailable' state distinct from the honest empty state, when the fetch itself failed", () => {
    // Codex audit MEDIUM (audit-logs/20260901T094442Z.md): a real fetch
    // failure must never render as if the farm genuinely has no history.
    render(<JobHistoryCard jobs={[]} unavailable />);

    expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/no job history yet/i)).toBeNull();
  });

  it("prefers the unavailable state over the job list if both are somehow supplied (fail towards disclosure, not a stale list)", () => {
    render(<JobHistoryCard jobs={[job()]} unavailable />);

    expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy();
    expect(screen.queryByText("Weight recorded")).toBeNull();
  });

  it("discloses when the list is truncated at the real server-side cap, rather than presenting it as complete", () => {
    // Codex audit MEDIUM (audit-logs/20260901T095654Z.md): a silently
    // capped list can be mistaken for the farm's complete history.
    render(<JobHistoryCard jobs={[job()]} truncated />);

    expect(screen.getByText(/showing the most recent/i)).toBeTruthy();
  });

  it("does not show a truncation notice when the real list isn't truncated", () => {
    render(<JobHistoryCard jobs={[job()]} truncated={false} />);

    expect(screen.queryByText(/showing the most recent/i)).toBeNull();
  });
});

describe("JobHistoryCard — Phase D, Evidence Ledger/provenance UX (2026-09-03)", () => {
  it("shows the real evidence tier from the job's own authorising decision", () => {
    render(<JobHistoryCard jobs={[job({}, { estimateSnapshot: { status: "OK", value: null, evidenceState: "MEASURED" } })]} />);
    expect(screen.getByText("Measured")).toBeTruthy();
  });

  it("shows the real calculation version from the job's own authorising decision", () => {
    render(<JobHistoryCard jobs={[job({}, { calculationVersion: "weight-due-v1" })]} />);
    expect(screen.getByText(/Calculation version: weight-due-v1/)).toBeTruthy();
  });

  it("shows no evidence tier when the authorising decision is non-OK — never fabricates one", () => {
    render(
      <JobHistoryCard
        jobs={[job({}, { estimateSnapshot: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "NO_DATA", missingInputs: ["weight"] } })]}
      />,
    );
    expect(screen.queryByText(/measured|calculated|official model|estimated|low evidence|more information/i)).toBeNull();
  });

  it("fails closed against a persisted-but-malformed dismissed decision (Codex audit round 1, HIGH — see DecisionHistoryCard.test.tsx's identical case for the full reasoning)", () => {
    render(
      <JobHistoryCard
        jobs={[
          job(
            {},
            {
              outcome: "dismissed",
              estimateSnapshot: { status: "OK", value: null, evidenceState: "NOT_A_REAL_EVIDENCE_STATE" } as unknown as JobWithDecision["decision"]["estimateSnapshot"],
            },
          ),
        ]}
      />,
    );
    expect(screen.queryByText(/measured|calculated|official model|estimated|low evidence|more information/i)).toBeNull();
  });

  it("shows the real inputsSnapshot from the job's own authorising decision (Codex audit round 1, MEDIUM)", () => {
    render(<JobHistoryCard jobs={[job({}, { inputsSnapshot: { animalId: "animal-1", targetWeightKg: 320 } })]} />);
    expect(screen.getByText(/Inputs: animalId=animal-1, targetWeightKg=320/)).toBeTruthy();
  });

  it("shows no inputs line when the decision's own inputsSnapshot is absent", () => {
    render(<JobHistoryCard jobs={[job({}, { inputsSnapshot: undefined })]} />);
    expect(screen.queryByText(/^Inputs:/)).toBeNull();
  });
});
