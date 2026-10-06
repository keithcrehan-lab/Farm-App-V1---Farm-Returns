import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/quote-requests", () => ({
  getFarmDeliveryDetailsAction: vi.fn(),
  listKnownSupplierNamesAction: vi.fn(),
}));

import { getFarmDeliveryDetailsAction, listKnownSupplierNamesAction } from "@/app/actions/quote-requests";
import { aggregateFarmFertiliserPurchasing, buildFarmFertiliserQuoteBasket, type FarmFertiliserAggregationFieldInput } from "@/domain/fertiliser-plan";
import { createFertiliserQuoteRequestDraft, type FertiliserQuoteRequest } from "@/domain/fertiliser-quote-request";
import type { FertiliserProduct, FieldPurchaseStatus } from "@/domain/types";
import { FertiliserQuoteRequestFlow } from "./FertiliserQuoteRequestFlow";

const mockDelivery = vi.mocked(getFarmDeliveryDetailsAction);
const mockSuppliers = vi.mocked(listKnownSupplierNamesAction);

function product(name: string, npkAnalysis: string, totalKg: number, costEur: number): FertiliserProduct {
  return { name, npkAnalysis, rateKgHa: 0, totalKg, costEur };
}

function fieldInput(fieldId: string, fieldName: string, purchaseStatus: FieldPurchaseStatus, purchasedProducts: FertiliserProduct[] = []): FarmFertiliserAggregationFieldInput {
  return { fieldId, fieldName, plan: { purchaseStatus, purchasedProducts, calculationVersion: "nutrient_engine_v1.5.0" } };
}

const READY = [fieldInput("f1", "Top Field", { status: "RECOMMENDED" }, [product("18-6-12", "18-6-12", 2395.5, 1200)])];
const INCOMPLETE = [...READY, fieldInput("f2", "Hill Field", { status: "UNKNOWN", reasonCode: "MISSING_SOIL_TEST" } as unknown as FieldPurchaseStatus)];

const latest: { request: FertiliserQuoteRequest | null } = { request: null };

function Harness({ fields }: { fields: FarmFertiliserAggregationFieldInput[] }) {
  const [request, setRequest] = useState<FertiliserQuoteRequest>(() => {
    const basket = buildFarmFertiliserQuoteBasket(aggregateFarmFertiliserPurchasing(fields), { farmId: "farm-1", createdAt: "2026-10-05T09:00:00.000Z" });
    const draft = createFertiliserQuoteRequestDraft(basket, { requestId: "req-1", createdAt: "2026-10-05T10:00:00.000Z" });
    if (!draft.ok) throw new Error("draft failed");
    return draft.value;
  });
  useEffect(() => {
    latest.request = request;
  }, [request]);
  return <FertiliserQuoteRequestFlow request={request} onRequestChange={setRequest} />;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  latest.request = null;
});

describe("FertiliserQuoteRequestFlow", () => {
  it("walks a READY basket through review, details and final review to READY_TO_SEND — never 'sent'", async () => {
    mockSuppliers.mockResolvedValue(["Agri Store"]);
    mockDelivery.mockResolvedValue({
      farmId: "farm-1",
      contactName: "Pat",
      contactPhone: "087 000 0000",
      contactEmail: null,
      addressLine1: "Farm yard",
      addressLine2: null,
      townOrCity: "Ballyduff",
      county: "Kerry",
      eircode: null,
    });
    render(<Harness fields={READY} />);
    expect(screen.getByText("Whole-farm requirement")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Requested tonnes for 18-6-12 (18-6-12)"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(latest.request?.lines[0].requestedQuantityKg).toBe(3000);
    expect(latest.request?.lines[0].canonicalQuantityKg).toBe(2395.5);

    await waitFor(() => expect((screen.getByLabelText("Delivery location") as HTMLTextAreaElement).value).toBe("Farm yard, Ballyduff, Kerry"));
    expect((screen.getByLabelText("Contact") as HTMLInputElement).value).toBe("Pat, 087 000 0000");
    fireEvent.click(await screen.findByRole("button", { name: "+ Agri Store" }));
    fireEvent.change(screen.getByLabelText("Note for supplier (optional)"), { target: { value: "Bulk bags" } });
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));

    const preview = screen.getByLabelText("Quote request preview");
    expect(preview.textContent).toBe(
      [
        "Farm Return fertiliser quote request",
        "Reference: req-1",
        "",
        "Product: 18-6-12 (N-P-K 18-6-12) — Quantity: 3.00 tonnes",
        "",
        "Delivery: Farm yard, Ballyduff, Kerry",
        "Contact: Pat, 087 000 0000",
        "Notes: Bulk bags",
        "Bag quantities not specified. This is a request for a quote, not an order.",
      ].join("\n"),
    );
    expect(screen.getByText("Suppliers: Agri Store")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Prepare quote request" }));
    expect(latest.request?.status).toBe("READY_TO_SEND");
    expect(screen.getByText("Ready to send")).toBeTruthy();
    expect(screen.getByText(/Farm Return hasn't sent this to any supplier/)).toBeTruthy();
    // Duplicate-click protection: the prepare action is gone once ready.
    expect(screen.queryByRole("button", { name: "Prepare quote request" })).toBeNull();
    expect(screen.queryByText(/^Sent$/)).toBeNull();
    expect(screen.queryByRole("button", { name: /request quote|send/i })).toBeNull();
  });

  it("rejects a zero or negative requested quantity without changing the request", () => {
    mockSuppliers.mockResolvedValue([]);
    mockDelivery.mockResolvedValue(null);
    render(<Harness fields={READY} />);
    const before = latest.request;
    for (const bad of ["0", "-2"]) {
      fireEvent.change(screen.getByLabelText("Requested tonnes for 18-6-12 (18-6-12)"), { target: { value: bad } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect(screen.getByRole("alert").textContent).toMatch(/greater than zero/);
      expect(latest.request).toBe(before);
    }
  });

  it("requires delivery location and contact before the final review", async () => {
    mockSuppliers.mockResolvedValue([]);
    mockDelivery.mockResolvedValue(null);
    render(<Harness fields={READY} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(mockDelivery).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    expect(screen.getByRole("alert").textContent).toMatch(/delivery location/);
    expect(screen.getByRole("alert").textContent).toMatch(/contact/);
    expect(screen.queryByLabelText("Quote request preview")).toBeNull();
  });

  it("F002: Back from the final review, or from details to review and on again, keeps every entered quote detail", async () => {
    mockSuppliers.mockResolvedValue([]);
    mockDelivery.mockResolvedValue(null);
    render(<Harness fields={READY} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(mockDelivery).toHaveBeenCalled());

    const fill = () => {
      fireEvent.change(screen.getByLabelText("Delivery location"), { target: { value: "Farm yard" } });
      fireEvent.change(screen.getByLabelText("Contact"), { target: { value: "Pat 087" } });
      fireEvent.change(screen.getByLabelText("Delivery window start"), { target: { value: "2027-02-01" } });
      fireEvent.change(screen.getByLabelText("Delivery window end"), { target: { value: "2027-02-14" } });
      fireEvent.change(screen.getByLabelText("Note for supplier (optional)"), { target: { value: "Bulk bags" } });
      fireEvent.change(screen.getByLabelText("Supplier name"), { target: { value: "Agri Store" } });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    };
    const expectKept = () => {
      expect((screen.getByLabelText("Delivery location") as HTMLTextAreaElement).value).toBe("Farm yard");
      expect((screen.getByLabelText("Contact") as HTMLInputElement).value).toBe("Pat 087");
      expect((screen.getByLabelText("Delivery window start") as HTMLInputElement).value).toBe("2027-02-01");
      expect((screen.getByLabelText("Delivery window end") as HTMLInputElement).value).toBe("2027-02-14");
      expect((screen.getByLabelText("Note for supplier (optional)") as HTMLTextAreaElement).value).toBe("Bulk bags");
      expect(screen.getByText("Agri Store")).toBeTruthy();
    };

    // Details → Back → review → Continue: nothing committed yet, nothing lost.
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expectKept();

    // Details → final review → Back.
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    expect(screen.getByLabelText("Quote request preview").textContent).toContain("Delivery: Farm yard");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expectKept();
    // A late prefill never overwrites what the farmer entered.
    expect(latest.request?.details).toMatchObject({ deliveryLocation: "Farm yard", contact: "Pat 087", farmerNote: "Bulk bags" });
  });

  it("labels an INCOMPLETE basket a partial request and names the unresolved fields", () => {
    mockSuppliers.mockResolvedValue([]);
    mockDelivery.mockResolvedValue(null);
    render(<Harness fields={INCOMPLETE} />);
    expect(screen.getByText("Partial request")).toBeTruthy();
    expect(screen.getByText(/not the farm's full requirement/)).toBeTruthy();
    expect(screen.getByText(/Hill Field/)).toBeTruthy();
  });
});
