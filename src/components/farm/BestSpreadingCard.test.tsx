import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BestSpreadingCard } from "./BestSpreadingCard";

describe("BestSpreadingCard (Dashboard)", () => {
  it("shows 'Under validation' instead of the old mock '91/100' headline stat", () => {
    render(<BestSpreadingCard />);
    expect(screen.getByText("Under validation")).toBeTruthy();
    expect(screen.queryByText(/\/100/)).toBeNull();
  });

  it("never shows suitable/marginal/unsuitable counts derived from the mock score", () => {
    render(<BestSpreadingCard />);
    expect(screen.queryByText(/suitable/i)).toBeNull();
    expect(screen.queryByText(/unsuitable/i)).toBeNull();
    expect(screen.queryByText(/marginal/i)).toBeNull();
  });
});
