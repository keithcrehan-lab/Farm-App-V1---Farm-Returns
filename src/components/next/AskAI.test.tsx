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
  it("shows the real evidence-state label as its own distinct tag element, not merely present as text somewhere on screen (Codex audit round 1, LOW)", () => {
    render(
      <AskAIButton
        context={{
          screen: "Expanded Prompt — spreading_window",
          facts: { Evidence: { value: "Field 7's calculation", evidenceState: "IRISH_MODEL" } },
        }}
      />,
    );
    fireEvent.click(screen.getByText("Ask AI"));
    expect(screen.getByText("Field 7's calculation")).toBeTruthy();
    expect(screen.getByTestId("ask-ai-fact-tier").textContent).toBe("Official model");
  });

  it("shows a Farmer confirmed tag, as its own distinct tag element, for a farmerActual fact", () => {
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
    expect(screen.getByTestId("ask-ai-fact-tier").textContent).toBe("Farmer confirmed");
  });

  it("shows no provenance tag element at all for a plain string fact — never implies a tier that wasn't actually supplied", () => {
    render(<AskAIButton context={{ screen: "Today", facts: { Fields: "4" } }} />);
    fireEvent.click(screen.getByText("Ask AI"));
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByTestId("ask-ai-fact-tier")).toBeNull();
  });

  it("still renders a fact object with only a plain value (no tier) exactly like a string fact — no tag element", () => {
    render(<AskAIButton context={{ screen: "Today", facts: { Fields: { value: "4" } } }} />);
    fireEvent.click(screen.getByText("Ask AI"));
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByTestId("ask-ai-fact-tier")).toBeNull();
  });

  it("does not allow a fact to carry both evidenceState and farmerActual — a compile-time guarantee, not just a runtime preference", () => {
    // @ts-expect-error — AskAIFact's own discriminated union (Codex audit
    // round 1, MEDIUM) makes this a real type error, not merely
    // undesirable at runtime.
    const invalid: import("./AskAI").AskAIFact = { value: "x", evidenceState: "MEASURED", farmerActual: true };
    expect(invalid).toBeTruthy();
  });
});
