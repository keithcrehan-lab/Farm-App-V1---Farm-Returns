import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/fertiliser-plan", () => ({ getFarmFertiliserDemandAction: vi.fn() }));

import { getFarmFertiliserDemandAction } from "@/app/actions/fertiliser-plan";
import { aggregateFarmFertiliserPurchasing, buildFarmFertiliserQuoteBasket, type FarmFertiliserAggregationFieldInput } from "@/domain/fertiliser-plan";
import type { FertiliserProduct, FieldPurchaseStatus } from "@/domain/types";
import { FarmFertiliserPurchaseRequirementCard } from "./FarmFertiliserPurchaseRequirementCard";

const mockAction = vi.mocked(getFarmFertiliserDemandAction);

function product(name: string, npkAnalysis: string, totalKg: number, costEur: number): FertiliserProduct {
  return { name, npkAnalysis, rateKgHa: 0, totalKg, costEur };
}

function fieldInput(fieldId: string, fieldName: string, purchaseStatus: FieldPurchaseStatus, purchasedProducts: FertiliserProduct[] = []): FarmFertiliserAggregationFieldInput {
  return { fieldId, fieldName, plan: { purchaseStatus, purchasedProducts, calculationVersion: "nutrient_engine_v1.5.0" } };
}

function result(
  fields: FarmFertiliserAggregationFieldInput[] = [],
  overrides: Partial<Awaited<ReturnType<typeof getFarmFertiliserDemandAction>>> = {},
): Awaited<ReturnType<typeof getFarmFertiliserDemandAction>> {
  const aggregation = aggregateFarmFertiliserPurchasing(fields);
  return {
    demand: [],
    purchaseRequirementTonnes: [],
    truncated: false,
    applicationsWithUnknownComposition: 0,
    fieldsWithBlockedEvidence: 0,
    aggregation,
    basket: buildFarmFertiliserQuoteBasket(aggregation, { farmId: "farm-1", createdAt: "2026-10-03T09:00:00.000Z" }),
    ...overrides,
  };
}

const RECOMMENDED: FieldPurchaseStatus = { status: "RECOMMENDED" };
const TWO_FIELDS_SAME_PRODUCT = [
  fieldInput("f1", "Top Field", RECOMMENDED, [product("18-6-12", "18-6-12", 600, 300)]),
  fieldInput("f2", "River Field", RECOMMENDED, [product("18-6-12", "18-6-12", 400.5, 200)]),
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FarmFertiliserPurchaseRequirementCard", () => {
  it("renders nothing outside real mode — never fetches a real farm-scoped demand without a real farm", () => {
    render(<FarmFertiliserPurchaseRequirementCard canRecord={false} />);
    expect(mockAction).not.toHaveBeenCalled();
    expect(screen.queryByText(/farm fertiliser requirement/i)).toBeNull();
  });

  it("shows each aggregated product once with its quantity, cost, field count and field contributions", async () => {
    mockAction.mockResolvedValue(result(TWO_FIELDS_SAME_PRODUCT));
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText("Ready")).toBeTruthy());
    expect(screen.getAllByText("18-6-12")).toHaveLength(1);
    // 1000.5 kg rounds UP to 1.01 t for display — never below the aggregate.
    expect(screen.getByText("1.01 t")).toBeTruthy();
    expect(screen.getByText(/€500 · 2 fields/)).toBeTruthy();
    expect(screen.getByText("Top Field")).toBeTruthy();
    expect(screen.getByText("600 kg")).toBeTruthy();
    expect(screen.getByText("400.5 kg")).toBeTruthy();
    expect(screen.getByText("Estimated total cost")).toBeTruthy();
  });

  it("marks an INCOMPLETE requirement, names the fields awaiting evidence and labels the cost a known subtotal", async () => {
    mockAction.mockResolvedValue(
      result([
        ...TWO_FIELDS_SAME_PRODUCT,
        fieldInput("f3", "Mixed Field", { status: "WITHHELD_MIXED_EVIDENCE", reasonCode: "MIXED_SOIL_INDEX_EVIDENCE", missingInputs: ["kIndex"] }),
        fieldInput("f4", "Unknown Field", { status: "UNKNOWN", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: ["pIndex", "kIndex"] }),
      ]),
    );
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText("Incomplete")).toBeTruthy());
    expect(screen.getAllByText(/2 fields require more information before fertiliser can be included/).length).toBeGreaterThan(0);
    expect(screen.getByText("Known subtotal (incomplete)")).toBeTruthy();
    expect(screen.queryByText("Estimated total cost")).toBeNull();
    expect(screen.getByText("Mixed Field")).toBeTruthy();
    expect(screen.getByText("Unknown Field")).toBeTruthy();
  });

  it("shows provisional contributions distinctly", async () => {
    mockAction.mockResolvedValue(
      result([
        fieldInput("f1", "Slurry Field", { status: "RECOMMENDED_CREDIT_NOT_COUNTED", reasonCode: "SLURRY_TIMING_NOT_SUPPORTED", missingInputs: [] }, [
          product("Protected Urea", "46-0-0", 200, 120),
        ]),
      ]),
    );
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText("Ready — provisional items")).toBeTruthy());
    expect(screen.getByText("Provisional")).toBeTruthy();
    expect(screen.getByText(/1 field with provisional quantities/)).toBeTruthy();
    expect(screen.getByText(/Slurry nutrient credit not included/)).toBeTruthy();
  });

  it("lists no-purchase and excluded fields separately from fields awaiting evidence", async () => {
    mockAction.mockResolvedValue(
      result([
        fieldInput("f1", "Done Field", { status: "NONE_NEEDED", basis: "REMAINING_ZERO" }),
        fieldInput("f2", "Commonage", { status: "PROHIBITED", reasonCode: "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED" }),
        fieldInput("f3", "Barley", { status: "NOT_APPLICABLE", reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED" }),
      ]),
    );
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText("Ready")).toBeTruthy());
    expect(screen.getByText("No fertiliser purchase is currently needed on this farm.")).toBeTruthy();
    expect(screen.getByText("1 field needs no fertiliser")).toBeTruthy();
    expect(screen.getByText("2 fields excluded from purchasing")).toBeTruthy();
    expect(screen.getByText(/prohibited on commonage/)).toBeTruthy();
    expect(screen.getByText(/tillage/)).toBeTruthy();
    expect(screen.queryByText(/require more information/)).toBeNull();
    // No products → nothing to prepare a quote for.
    expect(screen.queryByRole("button", { name: /prepare quote/i })).toBeNull();
  });

  it("opens the quote basket for review only — no submission", async () => {
    mockAction.mockResolvedValue(result(TWO_FIELDS_SAME_PRODUCT));
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    const button = await screen.findByRole("button", { name: /prepare quote/i });
    fireEvent.click(button);
    expect(await screen.findByText(/Review only — Farm Return hasn't sent this to any supplier/)).toBeTruthy();
    expect(screen.getByText(/nutrient_engine_v1\.5\.0/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /submit|send/i })).toBeNull();
  });

  it("shows the real tonnes still to buy per product", async () => {
    mockAction.mockResolvedValue(
      result(TWO_FIELDS_SAME_PRODUCT, {
        purchaseRequirementTonnes: [
          { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalTonnes: 1, plannedTotalTonnes: 0.4, confirmedAppliedTotalTonnes: 0.3, remainingTotalTonnes: 0.7, remainingTotalKg: 700, fieldsCount: 2 },
        ],
      }),
    );
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText(/0\.7 t still to buy/)).toBeTruthy());
  });

  it("shows an honest 'nothing left to buy' message when every product is already fully planned or applied", async () => {
    mockAction.mockResolvedValue(
      result(TWO_FIELDS_SAME_PRODUCT, {
        purchaseRequirementTonnes: [
          { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalTonnes: 1, plannedTotalTonnes: 0, confirmedAppliedTotalTonnes: 1, remainingTotalTonnes: 0, remainingTotalKg: 0, fieldsCount: 2 },
        ],
      }),
    );
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText(/nothing left to buy/i)).toBeTruthy());
    expect(screen.queryByText(/still to buy$/)).toBeNull();
  });

  // Codex audit HIGH (rounds 1/2): a genuine sub-rounding remainder is
  // decided from the exact kg and never shown as "0.00 t".
  it("still shows a real product with a genuine sub-rounding-threshold remainder — never silently drops it or claims nothing is left to buy", async () => {
    mockAction.mockResolvedValue(
      result(TWO_FIELDS_SAME_PRODUCT, {
        purchaseRequirementTonnes: [
          { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalTonnes: 1, plannedTotalTonnes: 1, confirmedAppliedTotalTonnes: 0.99, remainingTotalTonnes: 0, remainingTotalKg: 4, fieldsCount: 2 },
        ],
      }),
    );
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText(/< 0\.01 t still to buy/i)).toBeTruthy());
    expect(screen.queryByText(/nothing left to buy/i)).toBeNull();
    expect(screen.queryByText(/0\.00 t still to buy/i)).toBeNull();
  });

  it("discloses when confirmed applications farm-wide could not be included — never presents figures as exact", async () => {
    mockAction.mockResolvedValue(result([], { applicationsWithUnknownComposition: 2 }));
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText(/could not be included above/i)).toBeTruthy());
  });

  it("discloses when the real underlying read was truncated", async () => {
    mockAction.mockResolvedValue(result([], { truncated: true }));
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText(/may be incomplete/i)).toBeTruthy());
  });

  it("shows an honest 'couldn't check' disclosure on a genuine fetch failure — never silently renders nothing", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAction.mockRejectedValueOnce(new Error("network error"));
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: /farm fertiliser requirement/i })).toBeTruthy();
    expect(screen.getByText(/couldn't check your farm-wide purchase requirement/i)).toBeTruthy();
    consoleErrorSpy.mockRestore();
  });

  it("re-fetches when canRecord turns on", async () => {
    mockAction.mockResolvedValue(result());
    const { rerender } = render(<FarmFertiliserPurchaseRequirementCard canRecord={false} />);
    expect(mockAction).not.toHaveBeenCalled();
    rerender(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(mockAction).toHaveBeenCalled());
  });
});
