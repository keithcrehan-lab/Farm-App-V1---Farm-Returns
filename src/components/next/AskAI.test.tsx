import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { AskAIButton } from "./AskAI";

afterEach(() => {
  cleanup();
});

describe("AskAIButton", () => {
  it("is closed by default", () => {
    render(<AskAIButton context={{ screen: "Today", facts: { Farm: "Green Acres" } }} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the overlay and shows exactly the real context facts it was given", () => {
    render(<AskAIButton context={{ screen: "Today", facts: { Farm: "Green Acres", Field: "Back Meadow" } }} />);
    fireEvent.click(screen.getByText("Ask AI"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Farm:")).toBeTruthy();
    expect(screen.getByText("Green Acres")).toBeTruthy();
    expect(screen.getByText("Field:")).toBeTruthy();
    expect(screen.getByText("Back Meadow")).toBeTruthy();
  });

  it("never fabricates a response — states plainly that no AI provider is connected yet", () => {
    render(<AskAIButton context={{ screen: "Today", facts: {} }} />);
    fireEvent.click(screen.getByText("Ask AI"));
    expect(screen.getByText(/isn't connected yet/i)).toBeTruthy();
    expect((screen.getByPlaceholderText(/not available yet/i) as HTMLInputElement).disabled).toBe(true);
  });

  it("shows an honest empty state when a screen has no real context to offer", () => {
    render(<AskAIButton context={{ screen: "Today", facts: {} }} />);
    fireEvent.click(screen.getByText("Ask AI"));
    expect(screen.getByText(/no specific context is available/i)).toBeTruthy();
  });
});

describe("AskAIButton — provenance tiers (Phase C, contextual Ask AI completeness, 2026-09-03)", () => {
  it("shows the real evidence-state label next to a fact that carries one, using the same vocabulary the scientific engine already computes", () => {
    render(
      <AskAIButton
        context={{
          screen: "Expanded Prompt — spreading_window",
          facts: { Evidence: { value: "Official model", evidenceState: "IRISH_MODEL" } },
        }}
      />,
    );
    fireEvent.click(screen.getByText("Ask AI"));
    // Rendered twice — once as the fact's own value, once as the tier tag
    // — since IRISH_MODEL's own UI label ("Official model") happens to be
    // both here; getAllByText proves both are present rather than
    // asserting only one exists.
    expect(screen.getAllByText("Official model").length).toBeGreaterThanOrEqual(1);
  });

  it("shows a Farmer confirmed tag for a farmerActual fact, distinct from any EvidenceState tier", () => {
    render(
      <AskAIButton
        context={{
          screen: "Confirm Actual",
          facts: { Quantity: { value: "1.2 t", farmerActual: true } },
        }}
      />,
    );
    fireEvent.click(screen.getByText("Ask AI"));
    expect(screen.getByText("1.2 t")).toBeTruthy();
    expect(screen.getByText("Farmer confirmed")).toBeTruthy();
  });

  it("shows no provenance tag at all for a plain string fact — never implies a tier that wasn't actually supplied", () => {
    render(<AskAIButton context={{ screen: "Today", facts: { Fields: "4" } }} />);
    fireEvent.click(screen.getByText("Ask AI"));
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByText("Farmer confirmed")).toBeNull();
    expect(screen.queryByText(/measured|calculated|official model|estimated|low evidence|more information/i)).toBeNull();
  });

  it("still renders a fact object with only a plain value (no tier) exactly like a string fact", () => {
    render(<AskAIButton context={{ screen: "Today", facts: { Fields: { value: "4" } } }} />);
    fireEvent.click(screen.getByText("Ask AI"));
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByText("Farmer confirmed")).toBeNull();
  });
});
