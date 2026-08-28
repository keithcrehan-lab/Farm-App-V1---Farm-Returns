import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { MarketWatchCard } from "./MarketWatchCard";
import type { Farm } from "@/domain/types";

afterEach(cleanup);

/**
 * Codex remediation Priority 3 — "unmatched mock Market Price rows" must
 * not reach a real signed-in farm account, "Sample data" label or not.
 */
const REAL_FARM: Farm = {
  id: "farm-real-1",
  name: "A Real Farm",
  location: { county: "Cork", centroid: [-8.49, 51.9] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "A Real Farmer",
};

describe("MarketWatchCard — real mode drops unmatched rows", () => {
  it("never shows a 'Sample data' row or an unmatched mock price for a real farm", () => {
    render(
      <FarmProvider remote initialState={{ farm: REAL_FARM, fields: [], livestockGroups: [], housing: [], slurryAllocations: [] }}>
        <MarketWatchCard />
      </FarmProvider>,
    );
    expect(screen.queryByText(/Sample data/i)).toBeNull();
    // "Beef (R3)" has no real CSO match (MarketWatchCard.test.tsx's own
    // mock-mode assertion) — it must not appear at all in real mode.
    expect(screen.queryByText("Beef (R3)")).toBeNull();
  });
});
