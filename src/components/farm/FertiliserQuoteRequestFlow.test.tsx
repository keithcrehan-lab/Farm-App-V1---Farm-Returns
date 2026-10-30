import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/quote-requests", () => ({
  getFarmDeliveryDetailsAction: vi.fn(),
}));

vi.mock("@/app/actions/fertiliser-rfq", () => ({
  sendFertiliserRfqEmailAction: vi.fn(),
}));

import { getFarmDeliveryDetailsAction } from "@/app/actions/quote-requests";
import { sendFertiliserRfqEmailAction } from "@/app/actions/fertiliser-rfq";
import {
  aggregateFarmFertiliserPurchasing,
  buildFarmFertiliserQuoteBasket,
  type FarmFertiliserAggregationFieldInput,
} from "@/domain/fertiliser-plan";
import { createFertiliserQuoteRequestDraft, type FertiliserQuoteRequest } from "@/domain/fertiliser-quote-request";
import type { FertiliserProduct, FieldPurchaseStatus } from "@/domain/types";
import { FertiliserQuoteRequestFlow } from "./FertiliserQuoteRequestFlow";

const mockDelivery = vi.mocked(getFarmDeliveryDetailsAction);
const mockSend = vi.mocked(sendFertiliserRfqEmailAction);

function product(name: string, npkAnalysis: string, totalKg: number, costEur: number): FertiliserProduct {
  return { name, npkAnalysis, rateKgHa: 0, totalKg, costEur };
}

function fieldInput(
  fieldId: string,
  fieldName: string,
  purchaseStatus: FieldPurchaseStatus,
  purchasedProducts: FertiliserProduct[] = [],
): FarmFertiliserAggregationFieldInput {
  return { fieldId, fieldName, plan: { purchaseStatus, purchasedProducts, calculationVersion: "nutrient_engine_v1.5.0" } };
}

const READY = [
  fieldInput("f1", "Top Field", { status: "RECOMMENDED" }, [product("18-6-12", "18-6-12", 2395.5, 1200)]),
];

const INCOMPLETE = [
  ...READY,
  fieldInput("f2", "Hill Field", { status: "UNKNOWN", reasonCode: "MISSING_SOIL_TEST" } as unknown as FieldPurchaseStatus),
];

const latest: { request: FertiliserQuoteRequest | null } = { request: null };

function Harness({ fields }: { fields: FarmFertiliserAggregationFieldInput[] }) {
  const [request, setRequest] = useState<FertiliserQuoteRequest>(() => {
    const basket = buildFarmFertiliserQuoteBasket(aggregateFarmFertiliserPurchasing(fields), {
      farmId: "farm-1",
      createdAt: "2026-10-05T09:00:00.000Z",
    });
    const draft = createFertiliserQuoteRequestDraft(basket, {
      requestId: "req-1",
      createdAt: "2026-10-05T10:00:00.000Z",
    });
    if (!draft.ok) throw new Error("draft failed");
    return draft.value;
  });

  useEffect(() => {
    latest.request = request;
  }, [request]);

  return <FertiliserQuoteRequestFlow request={request} onRequestChange={setRequest} />;
}

function savedDelivery() {
  return {
    farmId: "farm-1",
    contactName: "Pat",
    contactPhone: "087 000 0000",
    contactEmail: null,
    addressLine1: "Farm yard",
    addressLine2: null,
    townOrCity: "Ballyduff",
    county: "Kerry",
    eircode: null,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  latest.request = null;
});

describe("FertiliserQuoteRequestFlow", () => {
  it("shows one aggregated review surface and sends the canonical request through the test-locked email action", async () => {
    mockDelivery.mockResolvedValue(savedDelivery());
    mockSend.mockResolvedValue({
      ok: true,
      attemptedAt: "2026-10-29T23:00:00.000Z",
      recipientName: "Prototype supplier",
      providerReference: "<brevo-message-id>",
      deliveryMode: "TEST_LOCKED",
    });

    render(<Harness fields={READY} />);

    expect(screen.getByText("Fertiliser to buy")).toBeTruthy();
    expect(screen.getByText("2.40 t")).toBeTruthy();
    expect(screen.getByText("18-6-12")).toBeTruthy();
    expect(screen.queryByText("1. Review requirement")).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();

    const quantity = screen.getByLabelText("Request tonnes for 18-6-12 (18-6-12)") as HTMLInputElement;
    expect(quantity.value).toBe("2.40");
    fireEvent.change(quantity, { target: { value: "3.00" } });
    expect(screen.getByText("3.00 t")).toBeTruthy();

    await waitFor(() => expect(screen.getByText("Farm yard, Ballyduff, Kerry")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    const requestSent = mockSend.mock.calls[0][0];
    expect(requestSent.status).toBe("READY_TO_SEND");
    expect(requestSent.lines[0].canonicalQuantityKg).toBe(2395.5);
    expect(requestSent.lines[0].requestedQuantityKg).toBe(3000);
    expect(requestSent.details).toMatchObject({
      recipients: [{ name: "Prototype supplier", contact: null }],
      deliveryLocation: "Farm yard, Ballyduff, Kerry",
      contact: "Pat, 087 000 0000",
    });

    await waitFor(() => expect(latest.request?.status).toBe("SENT"));
    expect(latest.request?.deliveryAttempts[0]).toMatchObject({
      outcome: "SUCCEEDED",
      providerReference: "<brevo-message-id>",
      recipientName: "Prototype supplier",
    });
    expect((screen.getByRole("button", { name: "Request sent" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Request sent to the Farm Return test inbox.")).toBeTruthy();
  });

  it("keeps Send request disabled when saved delivery details are unavailable", async () => {
    mockDelivery.mockResolvedValue(null);
    render(<Harness fields={READY} />);

    await waitFor(() => expect(screen.getByText(/delivery address or contact details are not recorded yet/i)).toBeTruthy());
    expect((screen.getByRole("button", { name: "Send request" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("records a real failed provider attempt as FAILED and offers Retry request", async () => {
    mockDelivery.mockResolvedValue(savedDelivery());
    mockSend.mockResolvedValue({
      ok: false,
      status: "failed",
      message: "Brevo rejected the request.",
      attemptedAt: "2026-10-29T23:00:00.000Z",
      recipientName: "Prototype supplier",
    });

    render(<Harness fields={READY} />);
    await waitFor(() => expect(screen.getByText("Farm yard, Ballyduff, Kerry")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(latest.request?.status).toBe("FAILED"));
    expect(screen.getByRole("button", { name: "Retry request" })).toBeTruthy();
    expect(screen.getByText("Brevo rejected the request.")).toBeTruthy();
  });

  it("keeps partial-farm evidence visible on the simplified review", () => {
    mockDelivery.mockResolvedValue(savedDelivery());
    render(<Harness fields={INCOMPLETE} />);

    expect(screen.getByText("Partial request")).toBeTruthy();
    expect(screen.getByText(/not the farm's full requirement/i)).toBeTruthy();
    expect(screen.getByText(/Hill Field/)).toBeTruthy();
  });
});
