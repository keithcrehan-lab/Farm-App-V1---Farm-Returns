import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/fertiliser-plan", () => ({ getFarmFertiliserDemandAction: vi.fn() }));

import { getFarmFertiliserDemandAction } from "@/app/actions/fertiliser-plan";
import { FarmFertiliserPurchaseRequirementCard } from "./FarmFertiliserPurchaseRequirementCard";

const mockAction = vi.mocked(getFarmFertiliserDemandAction);

function result(overrides: Partial<Awaited<ReturnType<typeof getFarmFertiliserDemandAction>>> = {}) {
  return {
    demand: [],
    purchaseRequirementTonnes: [],
    truncated: false,
    applicationsWithUnknownComposition: 0,
    fieldsWithBlockedEvidence: 0,
    ...overrides,
  };
}

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

  it("shows an honest 'nothing left to buy' message when every product is already fully planned or applied", async () => {
    mockAction.mockResolvedValue(
      result({
        purchaseRequirementTonnes: [
          { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalTonnes: 1, plannedTotalTonnes: 0, confirmedAppliedTotalTonnes: 1, remainingTotalTonnes: 0, remainingTotalKg: 0, fieldsCount: 2 },
        ],
      }),
    );
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText(/farm fertiliser requirement/i)).toBeTruthy());
    expect(screen.getByText(/nothing left to buy/i)).toBeTruthy();
  });

  it("shows the real tonnes still to buy per product", async () => {
    mockAction.mockResolvedValue(
      result({
        purchaseRequirementTonnes: [
          { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalTonnes: 1, plannedTotalTonnes: 0.4, confirmedAppliedTotalTonnes: 0.3, remainingTotalTonnes: 0.7, remainingTotalKg: 700, fieldsCount: 2 },
        ],
      }),
    );
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText(/0\.7 t still to buy/)).toBeTruthy());
    expect(screen.getByText("18-6-12")).toBeTruthy();
    expect(screen.getByText(/\(18-6-12\)/)).toBeTruthy();
  });

  it("never shows a product line with zero remaining tonnes — only what's genuinely still needed", async () => {
    mockAction.mockResolvedValue(
      result({
        purchaseRequirementTonnes: [
          { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalTonnes: 1, plannedTotalTonnes: 0, confirmedAppliedTotalTonnes: 1, remainingTotalTonnes: 0, remainingTotalKg: 0, fieldsCount: 2 },
          { product: "Protected Urea", npkAnalysis: "46-0-0", recommendedTotalTonnes: 0.5, plannedTotalTonnes: 0, confirmedAppliedTotalTonnes: 0, remainingTotalTonnes: 0.5, remainingTotalKg: 500, fieldsCount: 1 },
        ],
      }),
    );
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText("Protected Urea")).toBeTruthy());
    expect(screen.queryByText("18-6-12")).toBeNull();
  });

  // Codex audit HIGH (round 1): filtering/gating on the rounded
  // `remainingTotalTonnes` figure could silently drop (or claim
  // "nothing left to buy" for) a real farm-wide remainder below the 5 kg
  // rounding threshold — this must be decided from the exact
  // `remainingTotalKg` instead, never the rounded display value.
  it("still shows a real product with a genuine sub-rounding-threshold remainder — never silently drops it or claims nothing is left to buy", async () => {
    mockAction.mockResolvedValue(
      result({
        purchaseRequirementTonnes: [
          { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalTonnes: 1, plannedTotalTonnes: 1, confirmedAppliedTotalTonnes: 0.99, remainingTotalTonnes: 0, remainingTotalKg: 4, fieldsCount: 2 },
        ],
      }),
    );
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText("18-6-12")).toBeTruthy());
    expect(screen.queryByText(/nothing left to buy/i)).toBeNull();
    // Codex audit HIGH (round 2): round 1's own fix kept this line in
    // the list but still rendered its rounded tonnage as a flat "0.00 t
    // still to buy" — a real, positive remainder displayed as an
    // actionable zero is exactly as misleading as omitting the line
    // outright. Must show an honest, genuinely non-zero bound instead.
    expect(screen.queryByText(/0\.00 t still to buy/i)).toBeNull();
    expect(screen.getByText(/< 0\.01 t still to buy/i)).toBeTruthy();
  });

  it("discloses when confirmed applications farm-wide could not be included — never presents figures as exact", async () => {
    mockAction.mockResolvedValue(result({ applicationsWithUnknownComposition: 2 }));
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText(/could not be included above/i)).toBeTruthy());
  });

  it("discloses when a real field was excluded due to blocked evidence", async () => {
    mockAction.mockResolvedValue(result({ fieldsWithBlockedEvidence: 1 }));
    render(<FarmFertiliserPurchaseRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText(/could not be included in the figures above/i)).toBeTruthy());
  });

  it("discloses when the real underlying read was truncated", async () => {
    mockAction.mockResolvedValue(result({ truncated: true }));
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
