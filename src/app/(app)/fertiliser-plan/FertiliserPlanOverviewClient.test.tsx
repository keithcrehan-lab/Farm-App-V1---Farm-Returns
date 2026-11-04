import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

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
import {
  getFarmDeliveryDetailsAction,
  getQuoteRequestPrefillContextAction,
  listKnownSupplierNamesAction,
} from "@/app/actions/quote-requests";
import {
  aggregateFarmFertiliserPurchasing,
  buildFarmFertiliserQuoteBasket,
  type FarmFertiliserAggregationFieldInput,
} from "@/domain/fertiliser-plan";
import type { FertiliserProduct, FieldPurchaseStatus } from "@/domain/types";
import {
  buildFertiliserStockBand,
  type CurrentFertiliserStock,
} from "@/domain/fertiliser-stock";

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

function overview(
  overrides: Partial<FertiliserPlanOverview> = {},
): FertiliserPlanOverview {
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
    limeStockBand: {
      status: "not_recorded",
      product: "Lime",
      remainingRequirementKg: 0,
      hasRemainingRequirement: false,
    },
    slurry: {
      tanks: [],
      totalCapacityM3: 0,
      totalVolumeM3: 0,
      farmFillPct: 0,
      totalAllocatedM3: 0,
      totalUnallocatedM3: 0,
    },
    fieldBreakdown: [],
    aggregation: EMPTY_AGGREGATION,
    basket: buildFarmFertiliserQuoteBasket(EMPTY_AGGREGATION, {
      farmId: "farm-1",
      createdAt: "2026-10-08T09:00:00.000Z",
    }),
    quoteReadiness: {
      percentage: 50,
      completeCount: 1,
      totalCount: 2,
      remainingCount: 1,
      ready: false,
      items: [
        {
          id: "f1:cycle",
          fieldId: "f1",
          fieldName: "Field 1",
          label: "Field use / production cycle",
          complete: true,
          href: "/fields?field=f1&chapter=nutrients",
        },
        {
          id: "f2:cycle",
          fieldId: "f2",
          fieldName: "Field 2",
          label: "Field use / production cycle",
          complete: false,
          href: "/fields?field=f2&chapter=nutrients",
        },
      ],
    },
    planningSeason: "2026",
    planningBasis: "CURRENT_SEASON",
    ...overrides,
  };
}

const EMPTY_AGGREGATION = aggregateFarmFertiliserPurchasing([]);

function renderReal(overridesOverview: Partial<FertiliserPlanOverview> = {}) {
  mockOverviewAction.mockResolvedValue(overview(overridesOverview));
  return render(
    <FarmProvider
      remote
      initialState={{
        farm: FARM,
        fields: [],
        livestockGroups: [],
        housing: [],
        slurryAllocations: [],
        slurryCompositionRecords: [],
      }}
    >
      <FertiliserPlanOverviewClient />
    </FarmProvider>,
  );
}

describe("FertiliserPlanOverviewClient", () => {
  it("shows a sign-in prompt outside real mode, never fetching real farm-scoped data", () => {
    render(
      <FarmProvider
        initialState={{
          farm: FARM,
          fields: [],
          livestockGroups: [],
          housing: [],
          slurryAllocations: [],
          slurryCompositionRecords: [],
        }}
      >
        <FertiliserPlanOverviewClient />
      </FarmProvider>,
    );
    expect(mockOverviewAction).not.toHaveBeenCalled();
    expect(
      screen.getByText(/sign in to see your farm-wide fertiliser plan/i),
    ).toBeTruthy();
  });

  it("switches the quote planning basis to next season and refetches the target-season calculation", async () => {
    const currentSeason = String(new Date().getUTCFullYear());
    const nextSeason = String(new Date().getUTCFullYear() + 1);
    mockOverviewAction.mockImplementation(async (season?: string) =>
      overview({
        seasonLabel: season ?? currentSeason,
        planningSeason: season ?? currentSeason,
        planningBasis: season === nextSeason ? "NEXT_SEASON" : "CURRENT_SEASON",
        ...(season === nextSeason
          ? {
              planningAssumption: `Current ${currentSeason} field use carried forward for quote planning.`,
            }
          : {}),
      }),
    );

    render(
      <FarmProvider
        remote
        initialState={{
          farm: FARM,
          fields: [],
          livestockGroups: [],
          housing: [],
          slurryAllocations: [],
          slurryCompositionRecords: [],
        }}
      >
        <FertiliserPlanOverviewClient />
      </FarmProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `Next season · ${nextSeason}` }),
      ).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Next season · ${nextSeason}` }),
    );

    await waitFor(() =>
      expect(mockOverviewAction).toHaveBeenCalledWith(nextSeason),
    );
    await waitFor(() =>
      expect(
        screen.getByText(new RegExp(`${nextSeason} quote basis`, "i")),
      ).toBeTruthy(),
    );
  });

  it("keeps resolved field detail collapsed even when some fields do not contribute to purchase totals", async () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "Field 1",
        plan: {
          purchaseStatus: { status: "RECOMMENDED" },
          purchasedProducts: [
            {
              name: "18-6-12",
              npkAnalysis: "18-6-12",
              rateKgHa: 10,
              totalKg: 100,
              costEur: 0,
            },
          ],
        },
      },
      {
        fieldId: "f2",
        fieldName: "Field 2",
        plan: {
          purchaseStatus: { status: "NONE_NEEDED", basis: "REMAINING_ZERO" },
          purchasedProducts: [],
        },
      },
    ]);
    renderReal({
      aggregation,
      fieldsExcluded: 1,
      quoteReadiness: {
        percentage: 100,
        completeCount: 2,
        totalCount: 2,
        remainingCount: 0,
        ready: true,
        items: [],
      },
    });

    const heading = await screen.findByText("Field requirement detail");
    const details = heading.closest("details") as HTMLDetailsElement | null;
    expect(details).toBeTruthy();
    expect(details?.open).toBe(false);
    expect(screen.queryByText(/1 field needs attention/i)).toBeNull();
  });

  it("leads with the farm's N/P/K agronomic requirement once loaded", async () => {
    renderReal();
    await waitFor(() =>
      expect(screen.getByText("Farm nutrient requirement")).toBeTruthy(),
    );
    const npk = screen.getByTestId("nutrient-requirement");
    expect(npk.textContent).toMatch(/N500\s*kg/);
    expect(npk.textContent).toMatch(/P100\s*kg/);
    expect(npk.textContent).toMatch(/K200\s*kg/);
    // The headline is the gross agronomic requirement (engine
    // grossRequirementKgHa); organic and applied credits come later.
    expect(
      screen.getByText(/before slurry and fertiliser already applied are credited/),
    ).toBeTruthy();
    expect(screen.queryByText(/Agronomic N, P and K still required/)).toBeNull();
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(screen.getByText("Fields requiring purchase")).toBeTruthy();
  });

  it("keeps a compact readiness indicator visible when complete, without a resolve prompt", async () => {
    renderReal({
      quoteReadiness: {
        percentage: 100,
        completeCount: 2,
        totalCount: 2,
        remainingCount: 0,
        ready: true,
        items: [],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Quote readiness 100%" }),
      ).toBeTruthy(),
    );
    expect(screen.getByText("100% ready")).toBeTruthy();
    expect(screen.queryByText(/Resolve missing inputs/)).toBeNull();
  });

  it("shows incomplete readiness inline once, opening the readiness sheet", async () => {
    renderReal();
    await waitFor(() =>
      expect(screen.getByText("1 item to resolve before quoting")).toBeTruthy(),
    );
    expect(
      screen.getAllByRole("button", { name: "Quote readiness 50%" }),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: /Resolve missing inputs/ }),
    );
    await waitFor(() =>
      expect(screen.getByText(/1 of 2 required inputs complete/)).toBeTruthy(),
    );
  });

  it("auto-opens field evidence only when a field is unresolved", async () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "Field 1",
        plan: {
          purchaseStatus: {
            status: "UNKNOWN",
            reasonCode: "MISSING_LIVESTOCK_DATA",
            missingInputs: ["livestockGroups"],
          },
          purchasedProducts: [],
        },
      },
    ]);
    renderReal({ aggregation });
    const heading = await screen.findByText("1 field needs attention");
    expect((heading.closest("details") as HTMLDetailsElement).open).toBe(true);
  });

  it("separates unresolved fields from fields that are resolved without a purchase contribution", async () => {
    const aggregation = aggregateFarmFertiliserPurchasing([
      {
        fieldId: "f1",
        fieldName: "Field 1",
        plan: {
          purchaseStatus: {
            status: "UNKNOWN",
            reasonCode: "MISSING_LIVESTOCK_DATA",
            missingInputs: ["livestockGroups"],
          },
          purchasedProducts: [],
        },
      },
      {
        fieldId: "f2",
        fieldName: "Field 2",
        plan: {
          purchaseStatus: {
            status: "NOT_APPLICABLE",
            reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED",
          },
          purchasedProducts: [],
        },
      },
    ]);
    renderReal({ aggregation });
    await waitFor(() =>
      expect(screen.getByText(/1 field still needs information/i)).toBeTruthy(),
    );
    expect(
      screen.getByText(/1 field is resolved without contributing/i),
    ).toBeTruthy();
  });

  it("shows an honest empty state when there is no housing/tank yet", async () => {
    renderReal();
    await waitFor(() =>
      expect(screen.getByTestId("slurry-summary").textContent).toMatch(
        /no housing\/tank recorded yet/i,
      ),
    );
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
    expect(
      screen.getByText(/60 m³ allocated · 40 m³ unallocated/),
    ).toBeTruthy();
    expect(screen.getByText(/Farmer updated/)).toBeTruthy();
  });

  it("renders the field breakdown with a real status and a link to the field's existing detailed plan", async () => {
    renderReal({
      fieldBreakdown: [
        {
          fieldId: "f1",
          fieldName: "Home Field",
          areaHa: 5,
          seasonalUse: "grazing",
          status: "OK",
        },
        {
          fieldId: "f2",
          fieldName: "Bog Field",
          areaHa: 3,
          status: "BLOCKED_INSUFFICIENT_EVIDENCE",
          reasonCode: "NO_LIVESTOCK",
        },
      ],
    });
    await waitFor(() => expect(screen.getByText("Home Field")).toBeTruthy());
    const link = screen.getByText("Home Field").closest("a");
    expect(link?.getAttribute("href")).toBe(
      "/fields?field=f1&chapter=nutrients",
    );
    expect(screen.getByText("Included in plan")).toBeTruthy();
    expect(screen.getByText("Missing evidence")).toBeTruthy();
  });

  it("shows an honest error state and lets the farmer retry", async () => {
    mockOverviewAction.mockRejectedValueOnce(new Error("boom"));
    render(
      <FarmProvider
        remote
        initialState={{
          farm: FARM,
          fields: [],
          livestockGroups: [],
          housing: [],
          slurryAllocations: [],
          slurryCompositionRecords: [],
        }}
      >
        <FertiliserPlanOverviewClient />
      </FarmProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/couldn't load your farm-wide fertiliser plan/i),
      ).toBeTruthy(),
    );
  });

  describe("Farm Spatial V2 Phase 5 — whole-farm nutrient plan", () => {
    const product = (
      name: string,
      npkAnalysis: string,
      totalKg: number,
    ): FertiliserProduct => ({
      name,
      npkAnalysis,
      rateKgHa: 0,
      totalKg,
      costEur: totalKg * 0.6,
    });
    const entry = (
      fieldId: string,
      fieldName: string,
      purchaseStatus: FieldPurchaseStatus,
      purchasedProducts: FertiliserProduct[] = [],
    ): FarmFertiliserAggregationFieldInput => ({
      fieldId,
      fieldName,
      plan: { purchaseStatus, purchasedProducts },
    });
    const aggregation = aggregateFarmFertiliserPurchasing([
      entry("f1", "Home Field", { status: "RECOMMENDED" }, [
        product("18-6-12", "18-6-12", 2004),
        product("Protected Urea", "46-0-0", 300),
      ]),
      entry("f2", "Bog Field", {
        status: "UNKNOWN",
        reasonCode: "MISSING_LIVESTOCK_DATA",
        missingInputs: ["livestockGroups"],
      }),
    ]);
    const basket = buildFarmFertiliserQuoteBasket(aggregation, {
      farmId: "farm-1",
      createdAt: "2026-10-08T09:00:00.000Z",
    });
    const phase5: Partial<FertiliserPlanOverview> = {
      aggregation,
      basket,
      fieldBreakdown: [
        {
          fieldId: "f1",
          fieldName: "Home Field",
          areaHa: 5,
          seasonalUse: "grazing",
          status: "OK",
        },
        {
          fieldId: "f2",
          fieldName: "Bog Field",
          areaHa: 3,
          status: "BLOCKED_INSUFFICIENT_EVIDENCE",
          reasonCode: "NO_LIVESTOCK",
        },
      ],
      purchaseRequirementTonnes: [
        {
          product: "18-6-12",
          npkAnalysis: "18-6-12",
          recommendedTotalTonnes: 2.01,
          plannedTotalTonnes: 0,
          confirmedAppliedTotalTonnes: 1,
          remainingTotalTonnes: 1.01,
          remainingTotalKg: 1004,
          fieldsCount: 1,
        },
      ],
      stockColumns: [
        {
          status: "not_recorded",
          product: "18-6-12",
          npkAnalysis: "18-6-12",
          remainingRequirementKg: 1004,
          hasRemainingRequirement: true,
        },
      ],
    };

    it("leads with the largest canonical product quantity and discloses an incomplete requirement", async () => {
      renderReal(phase5);
      await waitFor(() =>
        expect(screen.getByTestId("primary-quantity")).toBeTruthy(),
      );
      expect(screen.getByTestId("primary-quantity").textContent).toBe("2.01 t");
      expect(
        screen.getByText(/known subtotal, not the whole-farm requirement/),
      ).toBeTruthy();
    });

    it("shows field rows with canonical contributions and links to the field plan and planner", async () => {
      renderReal(phase5);
      await waitFor(() => expect(screen.getByText("Home Field")).toBeTruthy());
      const row = document.querySelector(
        '[data-field-row="f1"]',
      ) as HTMLElement;
      expect(within(row).getByText("2,004 kg")).toBeTruthy();
      expect(
        within(row).getByText("Field plan").closest("a")?.getAttribute("href"),
      ).toBe("/today/field/f1");
      expect(
        within(row)
          .getByText("Plan application")
          .closest("a")
          ?.getAttribute("href"),
      ).toBe("/fields?field=f1&chapter=nutrients");
      const bog = document.querySelector(
        '[data-field-row="f2"]',
      ) as HTMLElement;
      expect(within(bog).getByText("Needs more information")).toBeTruthy();
      expect(within(bog).queryByText("Plan application")).toBeNull();
    });

    it("keeps still-to-buy separate from the canonical requirement", async () => {
      renderReal(phase5);
      await waitFor(() =>
        expect(
          screen.getByText(
            /Still to buy after recorded stock and applications/,
          ),
        ).toBeTruthy(),
      );
      const table = document.querySelector(
        '[data-product="18-6-12|18-6-12"]',
      ) as HTMLElement;
      expect(within(table).getByText("2.01 t")).toBeTruthy();
      const line = document.querySelector(
        '[data-still-to-buy="stock_not_recorded"]',
      ) as HTMLElement;
      expect(within(line).getByText("1.01 t")).toBeTruthy();
      expect(
        within(line).getByText(/Remaining requirement — stock not recorded/),
      ).toBeTruthy();
    });

    it("F001: recorded stock covering the remaining requirement is not shown as still to buy", async () => {
      renderReal({
        ...phase5,
        stockColumns: [
          buildFertiliserStockBand({
            product: "18-6-12",
            npkAnalysis: "18-6-12",
            remainingRequirementKg: 1004,
            currentStock: {
              product: "18-6-12",
              quantityKg: 1004,
              effectiveDate: "2026-10-01",
              source: "Farmer count",
            } as CurrentFertiliserStock,
          }),
        ],
      });
      await waitFor(() =>
        expect(
          screen.getByText(
            /Still to buy after recorded stock and applications/,
          ),
        ).toBeTruthy(),
      );
      expect(document.querySelector("[data-still-to-buy]")).toBeNull();
      expect(screen.getByText(/Nothing left to buy right now/)).toBeTruthy();
    });

    it("reads in causal order: requirement, field evidence, organic allocation, chemical requirement, purchase, supplier action", async () => {
      renderReal(phase5);
      await waitFor(() =>
        expect(screen.getByText("Prepare supplier quote")).toBeTruthy(),
      );
      const order = [
        screen.getByText("Farm nutrient requirement"),
        screen.getByText("Field evidence"),
        screen.getByText("Organic allocation"),
        screen.getByText("Remaining chemical requirement"),
        screen.getByText("Purchase requirement"),
        screen.getByText("Add to Plan"),
        screen.getByText("Market"),
        screen.getByText("On-farm stock"),
      ];
      for (let i = 1; i < order.length; i++) {
        expect(
          order[i - 1].compareDocumentPosition(order[i]) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
      expect(
        screen.getByText("Product requirement after organic allocation"),
      ).toBeTruthy();
    });

    it("A5: a resolved farm opens quiet — every supporting section is collapsed and the default view does not grow with the farm", async () => {
      // A resolved farm of `count` fields, each contributing a purchase.
      const resolvedFarm = (count: number): Partial<FertiliserPlanOverview> => {
        const ids = Array.from({ length: count }, (_, i) => `f${i + 1}`);
        const resolved = aggregateFarmFertiliserPurchasing(
          ids.map((id, i) =>
            entry(id, `Field number ${i + 1}`, { status: "RECOMMENDED" }, [
              product("18-6-12", "18-6-12", 2004),
            ]),
          ),
        );
        return {
          ...phase5,
          aggregation: resolved,
          basket: buildFarmFertiliserQuoteBasket(resolved, {
            farmId: "farm-1",
            createdAt: "2026-10-08T09:00:00.000Z",
          }),
          fieldBreakdown: ids.map((fieldId, i) => ({
            fieldId,
            fieldName: `Field number ${i + 1}`,
            areaHa: 5,
            seasonalUse: "grazing" as const,
            status: "OK" as const,
          })),
          fieldsTotal: count,
          fieldsIncluded: count,
          fieldsExcluded: 0,
          quoteReadiness: {
            percentage: 100,
            completeCount: count,
            totalCount: count,
            remainingCount: 0,
            ready: true,
            items: [],
          },
        };
      };
      // Text a farmer sees by default: everything outside a closed
      // disclosure's body. Total: everything the page holds.
      const measure = async (count: number) => {
        const { container, unmount } = renderReal(resolvedFarm(count));
        await waitFor(() =>
          expect(screen.getByText("Prepare supplier quote")).toBeTruthy(),
        );
        const disclosures = [...container.querySelectorAll("details")];
        const allClosed = disclosures.every((details) => !details.open);
        const visible = container.cloneNode(true) as HTMLElement;
        for (const details of visible.querySelectorAll("details"))
          for (const child of [...details.children])
            if (child.tagName !== "SUMMARY") child.remove();
        const length = (node: Node) =>
          (node.textContent ?? "").replace(/\s+/g, " ").length;
        const result = {
          disclosureCount: disclosures.length,
          allClosed,
          alert: screen.queryByRole("alert"),
          resolvePrompt: screen.queryByText(/Resolve missing inputs/),
          slurryOpen: screen
            .getByRole("button", { name: /slurry before fertiliser/i })
            .closest("details")?.open,
          visible: length(visible),
          total: length(container),
        };
        unmount();
        return result;
      };

      const small = await measure(1);
      const large = await measure(12);
      for (const view of [small, large]) {
        // Every supporting section (field evidence, slurry, stock) is closed.
        expect(view.disclosureCount).toBeGreaterThanOrEqual(3);
        expect(view.allClosed).toBe(true);
        expect(view.slurryOpen).toBe(false);
        // No warning or resolve prompt competes with the answer.
        expect(view.alert).toBeNull();
        expect(view.resolvePrompt).toBeNull();
      }
      // Field rows sit behind disclosure: twelve fields hold far more
      // detail than one, yet the default view only changes by the digits
      // of its counts and totals.
      expect(large.total - small.total).toBeGreaterThan(300);
      expect(Math.abs(large.visible - small.visible)).toBeLessThanOrEqual(20);
      // For a real-sized farm, most of the page is one interaction away.
      expect(large.visible / large.total).toBeLessThan(0.5);
    });

    it("keeps calculation, evidence and quote history as quiet secondary links", async () => {
      renderReal(phase5);
      const nav = await screen.findByRole("navigation", {
        name: "Plan evidence",
      });
      expect(
        within(nav).getByRole("button", { name: "Show calculations" }),
      ).toBeTruthy();
      expect(
        within(nav)
          .getByRole("link", { name: "Scientific evidence" })
          .getAttribute("href"),
      ).toBe("/reports");
      expect(
        within(nav)
          .getByRole("link", { name: "Quote requests" })
          .getAttribute("href"),
      ).toBe("/quotes");
    });

    it("offers show-maths at farm and per-field level for the planning season, behind a secondary control", async () => {
      renderReal(phase5);
      const nav = await screen.findByRole("navigation", {
        name: "Plan evidence",
      });
      // Not in the default view until the farmer asks for it.
      expect(screen.queryByText("All fields calculation audit")).toBeNull();
      fireEvent.click(
        within(nav).getByRole("button", { name: "Show calculations" }),
      );
      const farmLink = (
        await screen.findByText("All fields calculation audit")
      ).closest("a");
      expect(farmLink?.getAttribute("href")).toMatch(
        /^\/fertiliser-plan\/calculations\?season=\d{4}$/,
      );
      const fieldLinks = screen
        .getAllByText("View calculation →")
        .map((node) => node.closest("a")?.getAttribute("href"));
      expect(fieldLinks.length).toBe(phase5.fieldBreakdown!.length);
      expect(fieldLinks[0]).toMatch(
        /^\/fertiliser-plan\/calculations\?field=f1&season=\d{4}$/,
      );
    });

    it("separates the product requirement, product kg and number of fields in the purchase requirement", async () => {
      renderReal(phase5);
      const section = await screen.findByRole("region", {
        name: "Purchase requirement",
      });
      const table = within(section).getByRole("table", {
        name: "Canonical fertiliser requirement by product",
      });
      expect(
        within(table)
          .getAllByRole("columnheader")
          .map((cell) => cell.textContent),
      ).toEqual(["Product", "Requirement", "Product kg", "Fields"]);
      const row = table.querySelector('tr[data-product]') as HTMLElement;
      const cells = within(row).getAllByRole("cell");
      expect(cells[1].textContent).toBe("2.01 t");
      expect(cells[2].textContent).toMatch(/2,004 kg/);
      expect(cells[3].textContent).toBe("1 field");
    });

    it("never claims the whole-farm plan is saved", async () => {
      renderReal(phase5);
      await waitFor(() => expect(screen.getByText("Add to Plan")).toBeTruthy());
      expect(screen.getByText("Not saved")).toBeTruthy();
      expect(
        screen.getByText(/nothing on this page is saved to Plan/),
      ).toBeTruthy();
    });

    it("hands off to the existing RequestQuoteSheet supplier workflow for the planning season without changing the requirement", async () => {
      vi.mocked(getFarmDeliveryDetailsAction).mockResolvedValue(null as never);
      vi.mocked(listKnownSupplierNamesAction).mockResolvedValue([] as never);
      // The sheet's prefill is the server-recomputed canonical farm demand
      // for the planning season (`getQuoteRequestPrefillContext`), never a
      // client-side copy of the basket.
      vi.mocked(getQuoteRequestPrefillContextAction).mockResolvedValue({
        options: [
          {
            product: "18-6-12",
            remainingRequirementKg: 1004,
            mayUnderstate: true,
            stock: { status: "not_recorded" },
            suggestedPurchaseKg: 1004,
          },
        ],
        demandContext: {} as never,
        asOf: "2026-10-08T09:00:00.000Z",
      });
      renderReal(phase5);
      await waitFor(() =>
        expect(screen.getByText("Prepare supplier quote")).toBeTruthy(),
      );
      expect(
        screen.getByText(/a known subtotal, not the farm's full requirement/),
      ).toBeTruthy();
      fireEvent.click(screen.getByText("Prepare supplier quote"));
      await waitFor(() =>
        expect(
          screen.getByRole("combobox", { name: "Product source" }),
        ).toBeTruthy(),
      );
      expect(getQuoteRequestPrefillContextAction).toHaveBeenCalledWith(
        String(new Date().getUTCFullYear()),
      );
      expect(
        screen.getByRole("option", {
          name: /18-6-12 — estimated 1,004 kg remaining/,
        }),
      ).toBeTruthy();
      expect(screen.getByTestId("primary-quantity").textContent).toBe("2.01 t");
      expect(
        aggregation.products.find((p) => p.name === "18-6-12")?.totalKg,
      ).toBe(2004);
    });
  });
});
