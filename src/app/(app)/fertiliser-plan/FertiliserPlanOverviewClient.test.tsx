import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

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
}));

import { FarmProvider } from "@/store/farm-store";
import { getFertiliserPlanOverviewAction } from "@/app/actions/fertiliser-plan-overview";
import { FertiliserPlanOverviewClient } from "./FertiliserPlanOverviewClient";
import type { Farm } from "@/domain/types";
import type { FertiliserPlanOverview } from "@/app/actions/fertiliser-plan-overview";

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
    ...overrides,
  };
}

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
});
