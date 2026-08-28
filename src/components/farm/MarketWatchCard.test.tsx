import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MarketWatchCard } from "./MarketWatchCard";

// This file renders MarketWatchCard multiple times across `it` blocks;
// Vitest doesn't register React Testing Library's auto-cleanup unless
// `globals: true` is set (it isn't — see vitest.config.mts), so each test
// must unmount the previous render itself or queries collide across tests.
afterEach(cleanup);

// Real Mode Completion follow-up — `FINAL_MOCK_AUDIT.md`'s "new,
// lower-priority finding": every row used to render with identical visual
// weight whether or not `withRealMarketPrices` matched it. These
// assertions pin the fix: a row with a real CSO-backed status gets a real
// `StatusBadge`, and a row that stayed mock gets an explicit "Sample data"
// pill instead of blending in.
describe("MarketWatchCard", () => {
  it("gives a real CSO-matched row a real status badge, not a Sample data pill", () => {
    render(<MarketWatchCard />);
    // mp-1861-12 ("18-6-12") is matched by withRealMarketPrices with
    // status "verified" — its own row must show "Verified", not
    // "Sample data".
    const row = screen.getByText("18-6-12").closest("li");
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain("Verified");
    expect(row!.textContent).not.toContain("Sample data");
  });

  it("gives a still-mock row an explicit Sample data pill", () => {
    render(<MarketWatchCard />);
    // mp-beef ("Beef (R3)") has no real match in realMarketPriceOverridesById.
    const row = screen.getByText("Beef (R3)").closest("li");
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain("Sample data");
  });

  it("every row carries exactly one provenance label (never both, never neither)", () => {
    render(<MarketWatchCard />);
    const items = screen.getAllByRole("listitem");
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const hasStatusBadge = /Verified|Estimated|Farmer adjusted|Mapped/i.test(item.textContent ?? "");
      const hasSampleData = (item.textContent ?? "").includes("Sample data");
      expect(hasStatusBadge !== hasSampleData).toBe(true);
    }
  });
});
