import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DecisionHistoryCard } from "./DecisionHistoryCard";
import type { DecisionRecord } from "@/lib/farm-data/mappers";

afterEach(() => {
  cleanup();
});

function decision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: "decision-1",
    farmId: "farm-1",
    promptId: "prompt-1",
    calculationKind: "spreading_window",
    estimateSnapshot: { status: "OK", value: null, evidenceState: "IRISH_MODEL" },
    outcome: "accepted",
    decidedBy: "farmer",
    decidedAt: "2026-09-01T09:00:00Z",
    fieldId: "field-7",
    createdAt: "2026-09-01T09:00:01Z",
    ...overrides,
  };
}

describe("DecisionHistoryCard", () => {
  it("shows a real, honest empty state when there is no decision history yet", () => {
    render(<DecisionHistoryCard decisions={[]} />);
    expect(screen.getByText(/no decisions recorded yet/i)).toBeTruthy();
  });

  it("shows a distinct unavailable state rather than presenting a real fetch failure as an empty farm", () => {
    render(<DecisionHistoryCard decisions={[]} unavailable />);
    expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/no decisions recorded yet/i)).toBeNull();
  });

  it("renders a real decision's humanised kind, outcome and field", () => {
    render(<DecisionHistoryCard decisions={[decision()]} />);
    expect(screen.getByText("Spreading window")).toBeTruthy();
    expect(screen.getByText("Accepted")).toBeTruthy();
    expect(screen.getByText("Field field-7")).toBeTruthy();
  });

  it("falls back to an honest, un-invented label for an unrecognised calculation kind", () => {
    render(<DecisionHistoryCard decisions={[decision({ calculationKind: "future_kind" })]} />);
    expect(screen.getByText("future kind")).toBeTruthy();
  });

  it("discloses truncation rather than presenting a capped list as complete", () => {
    render(<DecisionHistoryCard decisions={[decision()]} truncated />);
    expect(screen.getByText(/older history exists/i)).toBeTruthy();
  });
});

describe("DecisionHistoryCard — Phase D, Evidence Ledger/provenance UX (2026-09-03)", () => {
  it("shows the real evidence tier for an OK decision, using the same vocabulary ExpandedPromptSheet already shows at decide time", () => {
    render(<DecisionHistoryCard decisions={[decision({ estimateSnapshot: { status: "OK", value: null, evidenceState: "IRISH_MODEL" } })]} />);
    expect(screen.getByText("Official model")).toBeTruthy();
  });

  it("shows the real calculation version when present", () => {
    render(<DecisionHistoryCard decisions={[decision({ calculationVersion: "spreading-window-v1" })]} />);
    expect(screen.getByText(/Calculation version: spreading-window-v1/)).toBeTruthy();
  });

  it("shows no evidence tier for a dismissed/non-OK decision — never fabricates a tier that doesn't exist", () => {
    render(
      <DecisionHistoryCard
        decisions={[
          decision({
            outcome: "dismissed",
            estimateSnapshot: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "NO_SOIL_TEST", missingInputs: ["soilTest"] },
          }),
        ]}
      />,
    );
    expect(screen.queryByText(/measured|calculated|official model|estimated|low evidence|more information/i)).toBeNull();
  });

  it("shows no calculation-version line when absent", () => {
    render(<DecisionHistoryCard decisions={[decision({ calculationVersion: undefined })]} />);
    expect(screen.queryByText(/Calculation version:/)).toBeNull();
  });

  it("fails closed against a persisted-but-malformed dismissed decision — the real database CHECK only validates estimate_snapshot's shape for outcome <> 'dismissed', so a genuinely stored garbage evidenceState must render no tier, not an empty tag (Codex audit round 1, HIGH)", () => {
    render(
      <DecisionHistoryCard
        decisions={[
          decision({
            outcome: "dismissed",
            // Cast needed: this simulates real unvalidated JSONB data
            // `rowToDecision` (mappers.ts) has no runtime check against —
            // exactly the shape the real database CHECK constraint
            // permits for a dismissed row.
            estimateSnapshot: { status: "OK", value: null, evidenceState: "NOT_A_REAL_EVIDENCE_STATE" } as unknown as DecisionRecord["estimateSnapshot"],
          }),
        ]}
      />,
    );
    expect(screen.queryByText(/measured|calculated|official model|estimated|low evidence|more information/i)).toBeNull();
  });

  it("shows the real inputsSnapshot as a compact summary — the same inputs the farmer already saw at decide time (Codex audit round 1, MEDIUM)", () => {
    render(<DecisionHistoryCard decisions={[decision({ inputsSnapshot: { county: "Cork", sampleDate: "2025-08-29" } })]} />);
    expect(screen.getByText(/Inputs: county=Cork, sampleDate=2025-08-29/)).toBeTruthy();
  });

  it("shows no inputs line when inputsSnapshot is absent or empty", () => {
    render(<DecisionHistoryCard decisions={[decision({ inputsSnapshot: undefined })]} />);
    expect(screen.queryByText(/^Inputs:/)).toBeNull();
  });

  it("serialises a real structured inputsSnapshot value (e.g. local_buffer_override's own waterBufferContext object) meaningfully, never as the literal '[object Object]' (Codex audit round 2, MEDIUM)", () => {
    render(<DecisionHistoryCard decisions={[decision({ inputsSnapshot: { waterBufferContext: { status: "compliant", distanceM: 12 } } })]} />);
    expect(screen.queryByText(/\[object Object\]/)).toBeNull();
    expect(screen.getByText(/waterBufferContext=\{"status":"compliant","distanceM":12\}/)).toBeTruthy();
  });

  it("omits an undefined/null field from the inputs summary rather than showing the literal string 'undefined' (Codex audit round 2, MEDIUM)", () => {
    render(<DecisionHistoryCard decisions={[decision({ inputsSnapshot: { county: "Cork", rawPMgL: undefined, plannedUse: null } })]} />);
    expect(screen.getByText(/^Inputs: county=Cork$/)).toBeTruthy();
    expect(screen.queryByText(/undefined/)).toBeNull();
    expect(screen.queryByText(/rawPMgL/)).toBeNull();
    expect(screen.queryByText(/plannedUse/)).toBeNull();
  });

  it("shows no inputs line when every field is undefined/null, even though the snapshot object itself is present", () => {
    render(<DecisionHistoryCard decisions={[decision({ inputsSnapshot: { rawPMgL: undefined, plannedUse: null } })]} />);
    expect(screen.queryByText(/^Inputs:/)).toBeNull();
  });
});
