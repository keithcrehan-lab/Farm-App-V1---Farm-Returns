import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RecordsPageClient } from "./RecordsPageClient";

afterEach(() => {
  cleanup();
});

describe("RecordsPageClient", () => {
  it("renders both real history cards with their own honest empty states when there is no history yet", () => {
    render(<RecordsPageClient jobs={[]} decisions={[]} />);
    expect(screen.getByText(/no job history yet/i)).toBeTruthy();
    expect(screen.getByText(/no decisions recorded yet/i)).toBeTruthy();
  });

  it("provides a real Ask AI affordance scoped to Records", () => {
    render(<RecordsPageClient jobs={[]} decisions={[]} />);
    expect(screen.getByText("Ask AI")).toBeTruthy();
  });
});
