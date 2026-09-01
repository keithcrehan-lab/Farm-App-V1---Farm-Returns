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
