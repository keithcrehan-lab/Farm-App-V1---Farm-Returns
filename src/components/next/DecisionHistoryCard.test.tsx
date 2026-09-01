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
