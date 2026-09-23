import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WhatMattersPilotCard, ContractorCostRateInput } from "./WhatMattersPilotCard";
import { CONFIRM_FIELD_TRAFFICABLE } from "@/domain/slurry-actionability-policy";
import type { WhatMattersPilotResult } from "@/domain/what-matters-presentation";
import type { RecommendationCandidateEvaluation } from "@/domain/recommendation-selection";
import type { SlurryRealisationCostResolution, FarmerContractorCostDeclaration } from "@/domain/slurry-realisation-cost";

const REAL_DECLARATION: FarmerContractorCostDeclaration = {
  id: "contractor-cost-1",
  opportunityRecordId: "record-1",
  boundAssessmentId: "assessment-1",
  evaluatedActionId: "action-1",
  fieldId: "field-1",
  ratePerHa: "120",
  currency: "EUR",
  declaredAt: "2026-09-20T00:00:00.000Z",
  declaredByActorId: null,
  provenance: "FARMER_DECLARATION",
};

function costAssumption(overrides: Partial<SlurryRealisationCostResolution> = {}): SlurryRealisationCostResolution {
  return {
    fieldId: "field-1",
    input: { status: "quantified", amount: { amount: "600", currency: "EUR" } },
    declaration: REAL_DECLARATION,
    fieldAreaHa: "5",
    calculationExpression: "5 ha × €120/ha = €600",
    reasonCode: null,
    ...overrides,
  };
}

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
    const result: WhatMattersPilotResult = { kind: "actionable", candidate: candidate(), rainfallScore: "86.4", costAssumption: null };
    render(<WhatMattersPilotCard result={result} fieldName="Meadow Field" />);
    expect(screen.getByText("Spread slurry on Meadow Field")).toBeTruthy();
    expect(screen.getByText(/610/)).toBeTruthy();
    expect(screen.getByText(/Rainfall Window 86\/100/)).toBeTruthy();
  });

  it("renders the cost-assumption disclosure (derived from the full structured resolution, not a pre-baked string) when present, never when absent", () => {
    const withAssumption: WhatMattersPilotResult = { kind: "actionable", candidate: candidate(), rainfallScore: "86.4", costAssumption: costAssumption() };
    const { unmount } = render(<WhatMattersPilotCard result={withAssumption} fieldName="Meadow Field" />);
    expect(screen.getByText(/€120\/ha/)).toBeTruthy();
    expect(screen.getByText(/not a live quote/i)).toBeTruthy();
    unmount();

    const withoutAssumption: WhatMattersPilotResult = { kind: "actionable", candidate: candidate(), rainfallScore: "86.4", costAssumption: null };
    render(<WhatMattersPilotCard result={withoutAssumption} fieldName="Meadow Field" />);
    expect(screen.queryByText(/€120\/ha/)).toBeNull();
  });

  it("never renders a cost-assumption line when the resolution itself is unresolved (unknown area)", () => {
    const unresolvedAssumption: WhatMattersPilotResult = { kind: "actionable", candidate: candidate(), rainfallScore: "86.4", costAssumption: costAssumption({ input: { status: "unknown" }, fieldAreaHa: null, calculationExpression: null, reasonCode: "SLURRY_REALISATION_COST_FIELD_AREA_UNAVAILABLE" }) };
    render(<WhatMattersPilotCard result={unresolvedAssumption} fieldName="Meadow Field" />);
    expect(screen.queryByText(/€120\/ha/)).toBeNull();
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

  it("disables Yes/No while a confirm round-trip is in flight (Codex audit MEDIUM — prevents a second click firing a concurrent request against a stale priorDeclarations snapshot)", () => {
    const onConfirm = vi.fn();
    const result: WhatMattersPilotResult = { kind: "needs_confirmation", candidate: candidate({ economicRank: 1 }), requiredConfirmations: [CONFIRM_FIELD_TRAFFICABLE] };
    render(<WhatMattersPilotCard result={result} onConfirm={onConfirm} disabled />);
    const yes = screen.getByText("Yes") as HTMLButtonElement;
    const no = screen.getByText("No") as HTMLButtonElement;
    expect(yes.disabled).toBe(true);
    expect(no.disabled).toBe(true);
    fireEvent.click(yes);
    expect(onConfirm).not.toHaveBeenCalled();
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

describe("ContractorCostRateInput", () => {
  it("calls onSave with the entered rate only when it is a positive number, never with an empty/zero/negative value", () => {
    const onSave = vi.fn();
    render(<ContractorCostRateInput onSave={onSave} />);
    const input = screen.getByLabelText("Slurry spreading cost") as HTMLInputElement;
    const save = screen.getByText("Save") as HTMLButtonElement;

    // Empty input -- Save must stay disabled, never call onSave.
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();

    // Zero/negative -- still disabled.
    fireEvent.change(input, { target: { value: "0" } });
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "-5" } });
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);

    // A real positive value enables Save and calls onSave with exactly
    // that string -- this component performs no economics itself.
    fireEvent.change(input, { target: { value: "120" } });
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith("120");
  });

  it("disables the input and Save button while a save round-trip is in flight", () => {
    const onSave = vi.fn();
    render(<ContractorCostRateInput onSave={onSave} disabled />);
    const input = screen.getByLabelText("Slurry spreading cost") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a real save-failure error alongside the still-visible input, and shows nothing when there is none", () => {
    const { rerender } = render(<ContractorCostRateInput onSave={vi.fn()} />);
    expect(screen.queryByText("Enter a valid rate greater than zero.")).toBeNull();

    rerender(<ContractorCostRateInput onSave={vi.fn()} error="Enter a valid rate greater than zero." />);
    expect(screen.getByText("Enter a valid rate greater than zero.")).toBeTruthy();
    expect(screen.getByLabelText("Slurry spreading cost")).toBeTruthy();
  });
});
