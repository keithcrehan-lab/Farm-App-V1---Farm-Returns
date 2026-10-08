import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/app/actions/fertiliser-plan-overview", () => ({
  getFertiliserPlanOverviewAction: vi.fn(),
  addFertiliserStockRecordAction: vi.fn(),
}));
vi.mock("@/app/actions/quote-requests", () => ({
  getFarmDeliveryDetailsAction: vi.fn(),
  getQuoteRequestPrefillContextAction: vi.fn(),
  saveFarmDeliveryDetailsAction: vi.fn(),
  submitQuoteRequestAction: vi.fn(),
  listKnownSupplierNamesAction: vi.fn(),
}));

import { FarmProvider } from "@/store/farm-store";
import { getFertiliserPlanOverviewAction } from "@/app/actions/fertiliser-plan-overview";
import { FertiliserPlanOverviewClient } from "./FertiliserPlanOverviewClient";
import type { Farm } from "@/domain/types";
import type { FertiliserPlanOverview } from "@/app/actions/fertiliser-plan-overview";
import { getFarmDeliveryDetailsAction, listKnownSupplierNamesAction } from "@/app/actions/quote-requests";
import {
  aggregateFarmFertiliserPurchasing,
  buildFarmFertiliserQuoteBasket,
  type FarmFertiliserAggregationFieldInput,
} from "@/domain/fertiliser-plan";
import type { FertiliserProduct, FieldPurchaseStatus } from "@/domain/types";
import { buildFertiliserStockBand, type CurrentFertiliserStock } from "@/domain/fertiliser-stock";

const mockOverviewAction = vi.mocked(getFertiliserPlanOverviewAction);

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

function overview(overrides: Partial<FertiliserPlanOverview> = {}): FertiliserPlanOverview {
  return {
    seasonLabel: "2026",
    farmName: "Test Farm",
    ownerName: "Keith",
    fieldsTotal: 2,
    totalAreaHaTotal: 20,
    fieldsIncluded: 1,
    totalAreaHaIncluded: 10,
    fieldsExcluded: 1,
    nutrientRequirementKg: { n: 500, p: 100, k: 200, fieldsIncluded: 1 },
    demand: [],
    purchaseRequirementTonnes: [],
    applicationsWithUnknownComposition: 0,
    fieldsWithBlockedEvidence: 0,
    truncated: false,
    lime: { fields: [], farmTotalTonnes: 0, fieldsWithoutLimeEvidence: 0 },
    stockColumns: [],
    limeStockBand: { status: "not_recorded", product: "Lime", remainingRequirementKg: 0, hasRemainingRequirement: false },
    slurry: { tanks: [], totalCapacityM3: 0, totalVolumeM3: 0, farmFillPct: 0, totalAllocatedM3: 0, totalUnallocatedM3: 0 },
    fieldBreakdown: [],
    aggregation: EMPTY_AGGREGATION,
    basket: buildFarmFertiliserQuoteBasket(EMPTY_AGGREGATION, { farmId: "farm-1", createdAt: "2026-10-08T09:00:00.000Z" }),
    ...overrides,
  };
}

const EMPTY_AGGREGATION = aggregateFarmFertiliserPurchasing([]);

function renderReal(overridesOverview: Partial<FertiliserPlanOverview> = {}) {
  mockOverviewAction.mockResolvedValue(overview(overridesOverview));
  return render(
    <FarmProvider remote initialState={{ farm: FARM, fields: [], livestockGroups: [], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}>
      <FertiliserPlanOverviewClient />
    </FarmProvider>,
  );
}

describe("FertiliserPlanOverviewClient", () => {
  it("shows a sign-in prompt outside real mode, never fetching real farm-scoped data", () => {
    render(
      <FarmProvider initialState={{ farm: FARM, fields: [], livestockGroups: [], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}>
        <FertiliserPlanOverviewClient />
      </FarmProvider>,
    );
    expect(mockOverviewAction).not.toHaveBeenCalled();
    expect(screen.getByText(/sign in to see your farm-wide fertiliser plan/i)).toBeTruthy();
  });

  it("renders the real farm summary once loaded", async () => {
    renderReal();
    await waitFor(() => expect(screen.getByText(/farm summary/i)).toBeTruthy());
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(screen.getByText(/N 500 · P 100 · K 200 kg/)).toBeTruthy();
  });

  it("discloses excluded fields rather than silently omitting them", async () => {
    renderReal();
    await waitFor(() => expect(screen.getByText(/1 field not applicable or missing evidence/i)).toBeTruthy());
  });

  it("shows an honest empty state when there is no housing/tank yet", async () => {
    renderReal();
    await waitFor(() => expect(screen.getByText(/no housing\/tank recorded yet/i)).toBeTruthy());
  });

  it("renders a real tank with its own fill/volume/capacity", async () => {
    renderReal({
      slurry: {
        tanks: [
          {
            housingId: "h1",
            shedName: "Shed 1",
            capacityM3: 200,
            volumeM3: 100,
            fillPct: 50,
            observedFillPct: 50,
            status: "farmer_recorded",
            recordedAt: "2026-12-12T00:00:00.000Z",
            allocatedM3: 60,
            unallocatedM3: 40,
            allocationExceedsVolume: false,
          },
        ],
        totalCapacityM3: 200,
        totalVolumeM3: 100,
        farmFillPct: 50,
        totalAllocatedM3: 60,
        totalUnallocatedM3: 40,
      },
    });
    await waitFor(() => expect(screen.getByText("Shed 1")).toBeTruthy());
    expect(screen.getByText(/100 m³ stored/)).toBeTruthy();
    expect(screen.getByText(/60 m³ allocated · 40 m³ unallocated/)).toBeTruthy();
    expect(screen.getByText(/Farmer updated/)).toBeTruthy();
  });

  it("renders the field breakdown with a real status and a link to the field's existing detailed plan", async () => {
    renderReal({
      fieldBreakdown: [
        { fieldId: "f1", fieldName: "Home Field", areaHa: 5, seasonalUse: "grazing", status: "OK" },
        { fieldId: "f2", fieldName: "Bog Field", areaHa: 3, status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "NO_LIVESTOCK" },
      ],
    });
    await waitFor(() => expect(screen.getByText("Home Field")).toBeTruthy());
    const link = screen.getByText("Home Field").closest("a");
    expect(link?.getAttribute("href")).toBe("/nutrients?field=f1");
    expect(screen.getByText("Included in plan")).toBeTruthy();
    expect(screen.getByText("Missing evidence")).toBeTruthy();
  });

  it("shows an honest error state and lets the farmer retry", async () => {
    mockOverviewAction.mockRejectedValueOnce(new Error("boom"));
    render(
      <FarmProvider remote initialState={{ farm: FARM, fields: [], livestockGroups: [], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}>
        <FertiliserPlanOverviewClient />
      </FarmProvider>,
    );
    await waitFor(() => expect(screen.getByText(/couldn't load your farm-wide fertiliser plan/i)).toBeTruthy());
  });

  describe("Farm Spatial V2 Phase 5 — whole-farm nutrient plan", () => {
    const product = (name: string, npkAnalysis: string, totalKg: number): FertiliserProduct => ({ name, npkAnalysis, rateKgHa: 0, totalKg, costEur: totalKg * 0.6 });
    const entry = (fieldId: string, fieldName: string, purchaseStatus: FieldPurchaseStatus, purchasedProducts: FertiliserProduct[] = []): FarmFertiliserAggregationFieldInput => ({
      fieldId,
      fieldName,
      plan: { purchaseStatus, purchasedProducts },
    });
    const aggregation = aggregateFarmFertiliserPurchasing([
      entry("f1", "Home Field", { status: "RECOMMENDED" }, [product("18-6-12", "18-6-12", 2004), product("Protected Urea", "46-0-0", 300)]),
      entry("f2", "Bog Field", { status: "UNKNOWN", reasonCode: "MISSING_LIVESTOCK_DATA", missingInputs: ["livestockGroups"] }),
    ]);
    const basket = buildFarmFertiliserQuoteBasket(aggregation, { farmId: "farm-1", createdAt: "2026-10-08T09:00:00.000Z" });
    const phase5: Partial<FertiliserPlanOverview> = {
      aggregation,
      basket,
      fieldBreakdown: [
        { fieldId: "f1", fieldName: "Home Field", areaHa: 5, seasonalUse: "grazing", status: "OK" },
        { fieldId: "f2", fieldName: "Bog Field", areaHa: 3, status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "NO_LIVESTOCK" },
      ],
      purchaseRequirementTonnes: [
        { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalTonnes: 2.01, plannedTotalTonnes: 0, confirmedAppliedTotalTonnes: 1, remainingTotalTonnes: 1.01, remainingTotalKg: 1004, fieldsCount: 1 },
      ],
      stockColumns: [{ status: "not_recorded", product: "18-6-12", npkAnalysis: "18-6-12", remainingRequirementKg: 1004, hasRemainingRequirement: true }],
    };

    it("leads with the largest canonical product quantity and discloses an incomplete requirement", async () => {
      renderReal(phase5);
      await waitFor(() => expect(screen.getByTestId("primary-quantity")).toBeTruthy());
      expect(screen.getByTestId("primary-quantity").textContent).toBe("2.01 t");
      expect(screen.getByText(/known subtotal, not the whole-farm requirement/)).toBeTruthy();
    });

    it("shows field rows with canonical contributions and links to the field plan and planner", async () => {
      renderReal(phase5);
      await waitFor(() => expect(screen.getByText("Home Field")).toBeTruthy());
      const row = document.querySelector('[data-field-row="f1"]') as HTMLElement;
      expect(within(row).getByText("2,004 kg")).toBeTruthy();
      expect(within(row).getByText("Field plan").closest("a")?.getAttribute("href")).toBe("/today/field/f1");
      expect(within(row).getByText("Plan application").closest("a")?.getAttribute("href")).toBe("/nutrients?field=f1");
      const bog = document.querySelector('[data-field-row="f2"]') as HTMLElement;
      expect(within(bog).getByText("Needs more information")).toBeTruthy();
      expect(within(bog).queryByText("Plan application")).toBeNull();
    });

    it("keeps still-to-buy separate from the canonical requirement", async () => {
      renderReal(phase5);
      await waitFor(() => expect(screen.getByText(/Still to buy after recorded stock and applications/)).toBeTruthy());
      const table = document.querySelector('[data-product="18-6-12|18-6-12"]') as HTMLElement;
      expect(within(table).getByText("2.01 t")).toBeTruthy();
      const line = document.querySelector('[data-still-to-buy="stock_not_recorded"]') as HTMLElement;
      expect(within(line).getByText("1.01 t")).toBeTruthy();
      expect(within(line).getByText(/Remaining requirement — stock not recorded/)).toBeTruthy();
    });

    it("F001: recorded stock covering the remaining requirement is not shown as still to buy", async () => {
      renderReal({
        ...phase5,
        stockColumns: [
          buildFertiliserStockBand({
            product: "18-6-12",
            npkAnalysis: "18-6-12",
            remainingRequirementKg: 1004,
            currentStock: { product: "18-6-12", quantityKg: 1004, effectiveDate: "2026-10-01", source: "Farmer count" } as CurrentFertiliserStock,
          }),
        ],
      });
      await waitFor(() => expect(screen.getByText(/Still to buy after recorded stock and applications/)).toBeTruthy());
      expect(document.querySelector("[data-still-to-buy]")).toBeNull();
      expect(screen.getByText(/Nothing left to buy right now/)).toBeTruthy();
    });

    it("never claims the whole-farm plan is saved", async () => {
      renderReal(phase5);
      await waitFor(() => expect(screen.getByText("Add to Plan")).toBeTruthy());
      expect(screen.getByText("Not saved")).toBeTruthy();
      expect(screen.getByText(/nothing on this page is saved to Plan/)).toBeTruthy();
    });

    it("hands the canonical basket to the quote workflow without changing the requirement", async () => {
      vi.mocked(getFarmDeliveryDetailsAction).mockResolvedValue(null as never);
      vi.mocked(listKnownSupplierNamesAction).mockResolvedValue([] as never);
      renderReal(phase5);
      await waitFor(() => expect(screen.getByText("Prepare supplier quote")).toBeTruthy());
      expect(screen.getByText(/a known subtotal, not the farm's full requirement/)).toBeTruthy();
      fireEvent.click(screen.getByText("Prepare supplier quote"));
      await waitFor(() => expect(screen.getByText("Partial request")).toBeTruthy());
      expect(screen.getByTestId("primary-quantity").textContent).toBe("2.01 t");
      expect(aggregation.products.find((p) => p.name === "18-6-12")?.totalKg).toBe(2004);
    });
  });
});
