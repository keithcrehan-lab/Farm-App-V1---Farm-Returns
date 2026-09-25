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
    expect(screen.getByText("Rainfall Window Score")).toBeTruthy();
    expect(screen.getByText(/86\/100/)).toBeTruthy();
    expect(screen.getByText("Expected net benefit")).toBeTruthy();
  });

  it("presents the actionable hierarchy in order: action + field, net benefit, Rainfall Window Score, then details", () => {
    const result: WhatMattersPilotResult = { kind: "actionable", candidate: candidate(), rainfallScore: "86.4", costAssumption: costAssumption() };
    const { container } = render(<WhatMattersPilotCard result={result} fieldName="Meadow Field" />);
    const text = container.textContent ?? "";
    const order = ["Spread slurry on Meadow Field", "610", "Expected net benefit", "Rainfall Window Score", "not a live quote", "View field"].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("omits the Rainfall Window Score entirely when the score is unknown — never renders it as 0", () => {
    const result: WhatMattersPilotResult = { kind: "actionable", candidate: candidate(), rainfallScore: null, costAssumption: null };
    render(<WhatMattersPilotCard result={result} fieldName="Meadow Field" />);
    expect(screen.queryByText("Rainfall Window Score")).toBeNull();
    expect(screen.queryByText(/0\/100/)).toBeNull();
    expect(screen.getByText("Expected net benefit")).toBeTruthy();
  });

  it("calls onViewDetails when the actionable card is tapped", () => {
    const onViewDetails = vi.fn();
    const result: WhatMattersPilotResult = { kind: "actionable", candidate: candidate(), rainfallScore: "86.4", costAssumption: null };
    render(<WhatMattersPilotCard result={result} fieldName="Meadow Field" onViewDetails={onViewDetails} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onViewDetails).toHaveBeenCalledTimes(1);
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
    expect(screen.queryByText(/expected net benefit/i)).toBeNull();
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

  it.each([
    ["NO_CANDIDATE_DATA", /application method and date/i],
    ["NO_POSITIVE_ECONOMIC_OPPORTUNITY", /none of it currently shows a net saving/i],
    ["EXCLUDED_BY_ELIGIBILITY_RULE", /none of it is currently eligible/i],
    ["OTHER_AUDITED_EXCLUSION", /none of it passed/i],
    ["MISSING_ECONOMIC_EVIDENCE", /price or spreading-cost information/i],
  ])("explains a none result with reason %s instead of saying nothing needs attention, without exposing the code", (reasonCode, copy) => {
    const { container } = render(<WhatMattersPilotCard result={{ kind: "none", reasonCode }} />);
    expect(screen.getByText(copy)).toBeTruthy();
    expect(screen.queryByText(/nothing currently needs your attention/i)).toBeNull();
    expect(container.textContent).not.toContain(reasonCode);
    expect(container.textContent).not.toMatch(/[A-Z]+_[A-Z]+/);
  });

  it("explains missing economic evidence distinctly from missing field information", () => {
    render(<WhatMattersPilotCard result={{ kind: "unknown", candidate: null, reasonCode: "ECONOMIC_EVIDENCE_UNAVAILABLE" }} />);
    expect(screen.getByText(/price or spreading-cost information/i)).toBeTruthy();
    expect(screen.queryByText(/more field information is needed/i)).toBeNull();
  });

  it.each([
    ["UNSUPPORTED_SCIENTIFIC_EVIDENCE", /nutrient value of your planned slurry spreading for the application method or timing/i],
    ["INSUFFICIENT_EVIDENCE", /enough evidence to value/i],
  ])("never describes %s as missing price or spreading-cost information, and never exposes the code", (reasonCode, copy) => {
    const { container } = render(<WhatMattersPilotCard result={{ kind: "unknown", candidate: null, reasonCode }} />);
    expect(screen.getByText(copy)).toBeTruthy();
    expect(container.textContent).not.toMatch(/price or spreading-cost/i);
    expect(container.textContent).not.toMatch(/[A-Z]+_[A-Z]+/);
  });

  describe("missing slurry spreading details", () => {
    const none: WhatMattersPilotResult = { kind: "none", reasonCode: "NO_CANDIDATE_DATA" };

    it.each([
      [["method", "date"] as const, /planned spreading method and date before/i, "/fields?field=f1&complete=slurry&missing=method,date"],
      [["method"] as const, /planned spreading method before/i, "/fields?field=f1&complete=slurry&missing=method"],
      [["date"] as const, /planned spreading date before/i, "/fields?field=f1&complete=slurry&missing=date"],
    ])("missing %j asks only for that and links to the field editor for it", (missing, copy, href) => {
      const { container } = render(<WhatMattersPilotCard result={none} missingSlurryDetails={[{ fieldId: "f1", missing: [...missing] }]} />);
      expect(screen.getByText("Slurry opportunities found")).toBeTruthy();
      expect(screen.getByText(copy)).toBeTruthy();
      expect(screen.getByRole("link", { name: /add spreading details/i }).getAttribute("href")).toBe(href);
      // Never an internal code or field name, never a fabricated count,
      // never a promise that a recommendation will follow.
      expect(container.textContent).not.toMatch(/NO_CANDIDATE_DATA|applicationMethod|applicationDate|candidate|Phase 8/);
      expect(container.textContent).not.toMatch(/\d/);
      expect(container.textContent).not.toMatch(/will (show|give|get) you a recommendation/i);
    });

    it("links to the first incomplete field even when several are incomplete, without counting them", () => {
      const { container } = render(
        <WhatMattersPilotCard result={none} missingSlurryDetails={[{ fieldId: "f1", missing: ["date"] }, { fieldId: "f2", missing: ["method"] }]} />,
      );
      expect(screen.getByText(/planned spreading method and date before/i)).toBeTruthy();
      expect(screen.getByRole("link", { name: /add spreading details/i }).getAttribute("href")).toBe("/fields?field=f1&complete=slurry&missing=date");
      expect(container.textContent).not.toMatch(/\d/);
    });

    it("keeps the existing no-candidate copy, with no CTA, when nothing the farmer can add is missing", () => {
      render(<WhatMattersPilotCard result={none} missingSlurryDetails={[]} />);
      expect(screen.getByText(/application method and date/i)).toBeTruthy();
      expect(screen.queryByRole("link", { name: /add spreading details/i })).toBeNull();
    });

    it("multi-source slurry fields get an honest explanation and never an 'Add spreading details' link (audit MEDIUM)", () => {
      const { container } = render(<WhatMattersPilotCard result={none} missingSlurryDetails={[]} multiSourceSlurryFieldIds={["f1"]} />);
      expect(screen.getByText(/more than one slurry store/i)).toBeTruthy();
      expect(screen.getByText(/adding dates won't produce a recommendation/i)).toBeTruthy();
      expect(screen.queryByRole("link", { name: /add spreading details/i })).toBeNull();
      expect(screen.queryByText("Slurry opportunities found")).toBeNull();
      expect(container.textContent).not.toMatch(/[A-Z]+_[A-Z]+|multiple|housingId/);
    });

    it("single-source fields keep their completion link alongside the multi-source explanation", () => {
      render(<WhatMattersPilotCard result={none} missingSlurryDetails={[{ fieldId: "f2", missing: ["date"] }]} multiSourceSlurryFieldIds={["f1"]} />);
      expect(screen.getByRole("link", { name: /add spreading details/i }).getAttribute("href")).toBe("/fields?field=f2&complete=slurry&missing=date");
      expect(screen.getByText(/more than one slurry store/i)).toBeTruthy();
    });

    it.each([
      [{ kind: "none", reasonCode: "NO_POSITIVE_ECONOMIC_OPPORTUNITY" } as WhatMattersPilotResult, /none of it currently shows a net saving/i],
      [{ kind: "unknown", candidate: null, reasonCode: "ECONOMIC_EVIDENCE_UNAVAILABLE" } as WhatMattersPilotResult, /price or spreading-cost information/i],
    ])("leaves other What Matters states unchanged even if stale missing details were passed", (result, copy) => {
      render(<WhatMattersPilotCard result={result} missingSlurryDetails={[{ fieldId: "f1", missing: ["method"] }]} />);
      expect(screen.getByText(copy)).toBeTruthy();
      expect(screen.queryByRole("link", { name: /add spreading details/i })).toBeNull();
    });
  });

  describe("slurry planning entry (zero allocations)", () => {
    const none: WhatMattersPilotResult = { kind: "none", reasonCode: "NO_CANDIDATE_DATA" };

    it("slurry available + fields open + zero allocations -> 'Plan slurry spreading' into the plan flow, with the real volume and count", () => {
      const { container } = render(<WhatMattersPilotCard result={none} slurryPlanningEntry={{ openFieldCount: 10, availableVolumeM3: 116 }} />);
      expect(screen.getByText("Slurry spreading is open")).toBeTruthy();
      expect(screen.getByText("You have 116 m³ available and 10 fields are currently open for spreading.")).toBeTruthy();
      expect(screen.getByRole("link", { name: /plan slurry spreading/i }).getAttribute("href")).toBe("/spreading/plan");
      // Nothing has been valued yet: never an "opportunity" claim, never an internal code.
      expect(container.textContent).not.toMatch(/opportunit/i);
      expect(container.textContent).not.toMatch(/[A-Z]+_[A-Z]+/);
      expect(screen.queryByRole("link", { name: /add spreading details/i })).toBeNull();
    });

    it("states only the count when no reliable volume is available", () => {
      const { container } = render(<WhatMattersPilotCard result={none} slurryPlanningEntry={{ openFieldCount: 1 }} />);
      expect(screen.getByText("1 field is currently open for spreading.")).toBeTruthy();
      expect(container.textContent).not.toMatch(/m³/);
    });

    it("the existing 'Add spreading details' state still wins when an incomplete allocation exists", () => {
      render(<WhatMattersPilotCard result={none} missingSlurryDetails={[{ fieldId: "f1", missing: ["date"] }]} slurryPlanningEntry={{ openFieldCount: 3, availableVolumeM3: 50 }} />);
      expect(screen.getByRole("link", { name: /add spreading details/i })).toBeTruthy();
      expect(screen.queryByRole("link", { name: /plan slurry spreading/i })).toBeNull();
    });

    it.each([
      [{ kind: "none", reasonCode: "NO_POSITIVE_ECONOMIC_OPPORTUNITY" } as WhatMattersPilotResult, /none of it currently shows a net saving/i],
      [{ kind: "unknown", candidate: null, reasonCode: "UNSUPPORTED_SCIENTIFIC_EVIDENCE" } as WhatMattersPilotResult, /can't yet work out the nutrient value/i],
    ])("never replaces an audited pipeline state", (result, copy) => {
      render(<WhatMattersPilotCard result={result} slurryPlanningEntry={{ openFieldCount: 3, availableVolumeM3: 50 }} />);
      expect(screen.getByText(copy)).toBeTruthy();
      expect(screen.queryByRole("link", { name: /plan slurry spreading/i })).toBeNull();
    });
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
