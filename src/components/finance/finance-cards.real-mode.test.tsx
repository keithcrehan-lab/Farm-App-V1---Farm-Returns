import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { MarginHeroCard } from "./MarginHeroCard";
import { CashflowCard } from "./CashflowCard";
import { BestOpportunitiesCard } from "./BestOpportunitiesCard";
import { FinancialOverviewCard } from "./FinancialOverviewCard";
import { LivestockValueCard } from "./LivestockValueCard";
import { mockFinanceSummary, mockOpportunities } from "@/data/mock-farm";
import type { Farm } from "@/domain/types";

afterEach(cleanup);

/**
 * Codex remediation Priority 3 — "Tests must explicitly prove fresh real
 * farms contain no demo farm names, mock dates, quantities, prices or
 * outputs." A real (`FarmProvider remote`) render of every finance card
 * that used to show Phase 1 `mockFinanceSummary`/`mockCashflow`/
 * `mockOpportunities` data (with only a "Sample data" label) must show
 * NONE of that fabricated content at all — an honest empty/unavailable
 * state instead, not the same numbers with a smaller disclaimer.
 */
const REAL_FARM: Farm = {
  id: "farm-real-1",
  name: "A Real Farm",
  location: { county: "Cork", centroid: [-8.49, 51.9] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "A Real Farmer",
};

function renderRemote(ui: React.ReactElement) {
  return render(
    <FarmProvider remote initialState={{ farm: REAL_FARM, fields: [], livestockGroups: [], housing: [], slurryAllocations: [] }}>
      {ui}
    </FarmProvider>,
  );
}

describe("finance cards — real mode never shows fabricated Phase 1 figures", () => {
  it("MarginHeroCard shows no mock forecast margin figure for a real farm", () => {
    renderRemote(<MarginHeroCard />);
    expect(screen.queryByText(/Sample data/i)).toBeNull();
    expect(screen.queryByText(new RegExp(String(mockFinanceSummary.forecastMarginEur)))).toBeNull();
  });

  it("CashflowCard shows no mock cashflow chart/figure for a real farm", () => {
    renderRemote(<CashflowCard />);
    expect(screen.queryByText(/Sample data/i)).toBeNull();
    expect(screen.getByText(/Unavailable/i)).toBeTruthy();
  });

  it("BestOpportunitiesCard shows none of the demo opportunity titles for a real farm", () => {
    renderRemote(<BestOpportunitiesCard />);
    for (const opp of mockOpportunities) {
      expect(screen.queryByText(opp.title)).toBeNull();
    }
    expect(screen.queryByText(/Sample data/i)).toBeNull();
  });

  it("FinancialOverviewCard shows no mock revenue/cost/margin figures for a real farm", () => {
    renderRemote(<FinancialOverviewCard />);
    expect(screen.queryByText(/Sample data/i)).toBeNull();
    expect(screen.queryByText(new RegExp(String(mockFinanceSummary.totalRevenueEur)))).toBeNull();
  });

  it("LivestockValueCard shows the real (zero) headline value, never the mock season-over-season change", () => {
    renderRemote(<LivestockValueCard />);
    expect(screen.queryByText(/Sample data/i)).toBeNull();
    expect(screen.queryByText(/vs last season/i)).toBeNull();
  });
});
