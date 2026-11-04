import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/app/actions/inputs-market", () => ({ getInputsMarketViewAction: vi.fn() }));
vi.mock("@/app/actions/quote-requests", () => ({
  getFarmDeliveryDetailsAction: vi.fn(),
  getQuoteRequestPrefillContextAction: vi.fn(),
  saveFarmDeliveryDetailsAction: vi.fn(),
  submitQuoteRequestAction: vi.fn(),
}));

import { FarmProvider } from "@/store/farm-store";
import { getInputsMarketViewAction } from "@/app/actions/inputs-market";
import { getFarmDeliveryDetailsAction, getQuoteRequestPrefillContextAction } from "@/app/actions/quote-requests";
import { InputsMarketClient } from "./InputsMarketClient";
import {
  INPUTS_MARKET_VERSION,
  buildFeedNeed,
  buildFertiliserNeedLines,
  summariseCategory,
  type InputsMarketView,
} from "@/domain/inputs-market";
import { buildFertiliserStockBand } from "@/domain/fertiliser-stock";
import { deriveCattleGroupProductionPlanMetrics } from "@/domain/cattle-group-production-plan";
import { tracked, type Farm, type LivestockGroup } from "@/domain/types";
import type { QuoteRequestPrefillContext } from "@/orchestration/quotes";

const mockView = vi.mocked(getInputsMarketViewAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FARM: Farm = {
  id: "farm-1",
  name: "Test Farm",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Keith",
};

const STEERS = {
  id: "g-1",
  farmId: "farm-1",
  category: "steer",
  label: "Finishing steers",
  count: tracked(20, "verified", "Farmer"),
  system: "housed",
  value: tracked(0, "estimated", "test"),
} as LivestockGroup;

function view(): InputsMarketView {
  const fertiliserLines = buildFertiliserNeedLines({
    stockBands: [buildFertiliserStockBand({ product: "18-6-12", npkAnalysis: "18-6-12", remainingRequirementKg: 4000 })],
    aggregation: { status: "INCOMPLETE", products: [] },
  });
  const plan = { groupId: "g-1", farmId: "farm-1", targetDate: "2027-01-31", concentrateKgHeadDay: 4 };
  const feed = buildFeedNeed([
    { group: STEERS, plan, metrics: deriveCattleGroupProductionPlanMetrics({ plan, headCount: 20, asOfDate: "2026-11-02" }) },
    { group: { ...STEERS, id: "g-2", label: "Heifers" }, metrics: deriveCattleGroupProductionPlanMetrics({ headCount: 10, asOfDate: "2026-11-02" }) },
  ]);
  return {
    version: INPUTS_MARKET_VERSION,
    planningSeason: "2026",
    seasonLabel: "2026 season",
    needs: {
      fertiliser: {
        status: "ready",
        summary: summariseCategory("fertiliser", fertiliserLines, [], true),
        disclosure: "Some fields are unresolved in the fertiliser plan, so this is a known subtotal, not the whole-farm requirement.",
      },
      feed: { status: "ready", summary: summariseCategory("feed", feed.lines, feed.gaps), disclosure: null },
    },
  };
}

function renderClient(remote: boolean) {
  return render(
    <FarmProvider
      {...(remote ? { remote: true } : {})}
      initialState={{ farm: FARM, fields: [], livestockGroups: [], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}
    >
      <InputsMarketClient />
    </FarmProvider>,
  );
}

const PREFILL = {
  options: [
    {
      product: "18-6-12",
      remainingRequirementKg: 4000,
      mayUnderstate: false,
      stock: { status: "not_recorded" },
      suggestedPurchaseKg: 4000,
    },
  ],
  demandContext: {},
  asOf: "2026-11-02",
} as unknown as QuoteRequestPrefillContext;

describe("InputsMarketClient", () => {
  it("outside real mode shows reference prices but never a farm need or a quote action", () => {
    renderClient(false);
    expect(mockView).not.toHaveBeenCalled();
    expect(screen.getByText(/sign in to see your farm's calculated need/i)).toBeTruthy();
    const prices = screen.getByTestId("reference-prices");
    expect(within(prices).getByText("18-6-12")).toBeTruthy();
    expect(within(prices).getAllByText(/Official statistic · CSO AJM09/).length).toBeGreaterThan(0);
    expect(within(prices).queryByRole("button", { name: /request quote/i })).toBeNull();
  });

  it("shows the fertiliser need with implied reference cost and discloses a partial upstream plan", async () => {
    mockView.mockResolvedValue(view());
    renderClient(true);
    await waitFor(() => expect(screen.getByTestId("need-summary")).toBeTruthy());
    expect(mockView).toHaveBeenCalledWith(String(new Date().getUTCFullYear()));
    const rows = screen.getAllByTestId("need-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("4 t")).toBeTruthy();
    expect(within(rows[0]).getByText(/^≈ €/)).toBeTruthy();
    expect(screen.getByRole("note").textContent).toMatch(/known subtotal/i);
  });

  it("switches to Feed: plan-led line, unsized group as a gap linking to its plan, unsourced feeds unpriced", async () => {
    mockView.mockResolvedValue(view());
    renderClient(true);
    await waitFor(() => expect(screen.getByTestId("need-summary")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: /feed/i }));
    expect(screen.getByRole("tab", { name: /feed/i }).getAttribute("aria-selected")).toBe("true");
    const row = screen.getByTestId("need-row");
    expect(within(row).getByText("Finishing steers")).toBeTruthy();
    // 4 kg × 20 head × 90 days = 7.2 t at the €350/t benchmark.
    expect(within(row).getByText("7.2 t")).toBeTruthy();
    expect(within(row).getByText("≈ €2,520")).toBeTruthy();
    expect(screen.getByRole("link", { name: /set diet in group plan/i }).getAttribute("href")).toBe("/cattle/groups/g-2");
    expect(within(screen.getByTestId("reference-prices")).getAllByText("Price not sourced").length).toBeGreaterThan(0);

    fireEvent.click(within(row).getByRole("button", { name: /show detail/i }));
    expect(within(row).getByText("4 kg/head/day")).toBeTruthy();
  });

  it("opens the existing quote sheet with the fertiliser estimate option preselected", async () => {
    mockView.mockResolvedValue(view());
    vi.mocked(getQuoteRequestPrefillContextAction).mockResolvedValue(PREFILL);
    vi.mocked(getFarmDeliveryDetailsAction).mockResolvedValue(null);
    renderClient(true);
    await waitFor(() => expect(screen.getByTestId("need-summary")).toBeTruthy());
    fireEvent.click(within(screen.getByTestId("need-row")).getByRole("button", { name: /request quote/i }));
    const source = (await screen.findByLabelText("Product source")) as HTMLSelectElement;
    expect(source.value).toBe("18-6-12");
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe("4000");
  });

  it("for feed names the product and shows the calculated figure without auto-filling the quantity", async () => {
    mockView.mockResolvedValue(view());
    vi.mocked(getQuoteRequestPrefillContextAction).mockResolvedValue(PREFILL);
    vi.mocked(getFarmDeliveryDetailsAction).mockResolvedValue(null);
    renderClient(true);
    await waitFor(() => expect(screen.getByTestId("need-summary")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: /feed/i }));
    fireEvent.click(within(screen.getByTestId("need-row")).getByRole("button", { name: /request quote/i }));
    const name = (await screen.findByLabelText("Product name")) as HTMLInputElement;
    expect(name.value).toBe("Beef concentrate ration");
    expect(screen.getByTestId("quote-context-note").textContent).toMatch(/about 7\.2 t of concentrate/);
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe("");
  });

  it("offers a retry when the need cannot be loaded", async () => {
    mockView.mockRejectedValueOnce(new Error("boom"));
    renderClient(true);
    await screen.findByText(/couldn't load your inputs/i);
    mockView.mockResolvedValue(view());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByTestId("need-summary")).toBeTruthy());
  });
});
