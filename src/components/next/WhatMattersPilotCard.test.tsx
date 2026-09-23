import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WhatMattersPilotCard } from "./WhatMattersPilotCard";
import { CONFIRM_FIELD_TRAFFICABLE } from "@/domain/slurry-actionability-policy";
import type { WhatMattersPilotResult } from "@/domain/what-matters-presentation";
import type { RecommendationCandidateEvaluation } from "@/domain/recommendation-selection";

afterEach(() => {
  cleanup();
});

function candidate(overrides: Partial<RecommendationCandidateEvaluation> = {}): RecommendationCandidateEvaluation {
  return {
    economicRank: 2,
    recordId: "record-1",
    assessmentId: "assessment-1",
    primaryIdentity: "action-1",
    sourcePhase: "phase_5_action",
    amount: { amount: "610", currency: "EUR" },
    currency: "EUR",
    lifecycleStatus: "active",
    actionability: "actionable",
    limitations: [],
    constituentActionRecordIds: null,
    outcome: { kind: "selected", code: "SELECTED_HIGHEST_RANKED_ACTIONABLE_OPPORTUNITY" },
    ...overrides,
  };
}

describe("WhatMattersPilotCard", () => {
  it("renders the actionable case with real economic amount, rainfall score, and preserved rank", () => {
    const result: WhatMattersPilotResult = { kind: "actionable", candidate: candidate(), rainfallScore: "86.4" };
    render(<WhatMattersPilotCard result={result} fieldName="Meadow Field" />);
    expect(screen.getByText("Spread slurry on Meadow Field")).toBeTruthy();
    expect(screen.getByText(/610/)).toBeTruthy();
    expect(screen.getByText(/Rainfall Window 86\/100/)).toBeTruthy();
  });

  it("renders exactly the unresolved confirmation and calls onConfirm with the real domain code, never toggling to actionable itself", () => {
    const onConfirm = vi.fn();
    const result: WhatMattersPilotResult = { kind: "needs_confirmation", candidate: candidate({ economicRank: 1 }), requiredConfirmations: [CONFIRM_FIELD_TRAFFICABLE] };
    render(<WhatMattersPilotCard result={result} onConfirm={onConfirm} />);
    expect(screen.getByText("Is this field currently trafficable for your slurry-spreading equipment?")).toBeTruthy();
    fireEvent.click(screen.getByText("Yes"));
    expect(onConfirm).toHaveBeenCalledWith(CONFIRM_FIELD_TRAFFICABLE, true);
    // No "Spread slurry" / economic-benefit text should appear — this
    // component must never imply actionable state on its own.
    expect(screen.queryByText(/expected economic benefit/)).toBeNull();
  });

  it("renders the blocked case with an honest reason, never implying legal prohibition text that isn't real", () => {
    const result: WhatMattersPilotResult = { kind: "blocked", candidate: candidate({ economicRank: 1 }), reasonCode: "NOT_ACTIONABLE_RAINFALL_WINDOW_BELOW_THRESHOLD" };
    render(<WhatMattersPilotCard result={result} fieldName="South Field" />);
    expect(screen.getByText(/not actionable rainfall window below threshold/i)).toBeTruthy();
  });

  it("renders the unknown case with honest uncertainty language, never 'unsafe'", () => {
    const result: WhatMattersPilotResult = { kind: "unknown", candidate: null, reasonCode: "UNKNOWN_PHYSICAL_CONDITION_CONFIRMATION_REQUIRED" };
    render(<WhatMattersPilotCard result={result} />);
    expect(screen.getByText(/more field information is needed/i)).toBeTruthy();
    expect(screen.queryByText(/unsafe/i)).toBeNull();
  });

  it("renders the none case without fabricating a recommendation", () => {
    const result: WhatMattersPilotResult = { kind: "none", reasonCode: "NO_RANKED_OPPORTUNITIES" };
    render(<WhatMattersPilotCard result={result} />);
    expect(screen.getByText(/nothing currently needs your attention/i)).toBeTruthy();
  });
});
