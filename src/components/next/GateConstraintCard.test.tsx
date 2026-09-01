import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { GateConstraintCard } from "./GateConstraintCard";

afterEach(() => {
  cleanup();
});

describe("GateConstraintCard", () => {
  it("renders the real eligibility checklist a caller supplies, met and not-met both", () => {
    render(
      <GateConstraintCard
        title="P build-up not permitted"
        explanation="This field does not currently meet the eligibility conditions."
        criteria={[
          { label: "Soil P index", met: false },
          { label: "Field slope", met: true },
        ]}
        askAIContext={{ screen: "Gate — p_build_up_eligibility", facts: { Field: "Back Meadow" } }}
      />,
    );
    expect(screen.getByText("P build-up not permitted")).toBeTruthy();
    expect(screen.getByText("Soil P index")).toBeTruthy();
    expect(screen.getByText("Not met")).toBeTruthy();
    expect(screen.getByText("Met")).toBeTruthy();
  });

  it("never offers Accept/Dismiss — only View details / I understand / Ask AI, per spec §5's Gate-is-not-a-Prompt rule", () => {
    render(
      <GateConstraintCard
        title="P build-up not permitted"
        explanation="Explanation."
        criteria={[]}
        askAIContext={{ screen: "Gate", facts: {} }}
      />,
    );
    expect(screen.queryByText(/^accept$/i)).toBeNull();
    expect(screen.queryByText(/^dismiss$/i)).toBeNull();
    expect(screen.getByText("I understand")).toBeTruthy();
    expect(screen.getByText("Ask AI")).toBeTruthy();
  });

  it("calls onViewDetails when supplied and pressed", () => {
    const onViewDetails = vi.fn();
    render(
      <GateConstraintCard
        title="P build-up not permitted"
        explanation="Explanation."
        criteria={[]}
        onViewDetails={onViewDetails}
        askAIContext={{ screen: "Gate", facts: {} }}
      />,
    );
    fireEvent.click(screen.getByText("View details"));
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });
});
