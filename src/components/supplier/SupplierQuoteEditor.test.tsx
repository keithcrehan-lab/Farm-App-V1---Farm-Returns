import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/actions/supplier-portal", () => ({ saveSupplierQuoteDraftAction: vi.fn(), submitSupplierQuoteAction: vi.fn() }));

import { saveSupplierQuoteDraftAction, submitSupplierQuoteAction } from "@/app/actions/supplier-portal";
import type { SupplierPortalRequest } from "@/lib/farm-data/supplier-portal";
import { SupplierQuoteEditor } from "./SupplierQuoteEditor";
import { SupplierRfqList } from "./SupplierRfqList";

const ROUTE = "11111111-1111-4111-8111-111111111111";
const request: SupplierPortalRequest = {
  requestedAt: "2026-10-30T10:00:00Z",
  withdrawn: false,
  revisionNumber: 1,
  revisedAt: "2026-10-30T10:00:00Z",
  product: "CAN 27%N",
  quantity: "10",
  unit: "tonnes",
  packaging: "600kg bags",
  deliveryWindowStart: "2026-11-10",
  deliveryWindowEnd: "2026-11-20",
  townOrCity: "Navan",
  county: "Meath",
  eircodeRoutingKey: "C15",
};

beforeEach(() => {
  vi.mocked(saveSupplierQuoteDraftAction).mockReset();
  vi.mocked(submitSupplierQuoteAction).mockReset();
  refresh.mockReset();
});
afterEach(() => cleanup());

function preview() {
  return within(screen.getByRole("region", { name: "Quote totals preview" }));
}

describe("SupplierQuoteEditor", () => {
  it("prefills the farmer's ask but never a price or VAT rate", () => {
    render(<SupplierQuoteEditor routeId={ROUTE} request={request} draft={null} defaultValidUntil="2026-11-15" defaultTerms="30 days" />);
    expect((screen.getByLabelText("Product") as HTMLInputElement).value).toBe("CAN 27%N");
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe("10");
    expect((screen.getByLabelText("Unit price € ex VAT") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("VAT rate %") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Quote valid until") as HTMLInputElement).value).toBe("2026-11-15");
    expect(preview().getByText(/Totals appear once/)).toBeTruthy();
  });

  it("shows exact live totals, and VAT as unknown (not €0) until a rate is entered", () => {
    render(<SupplierQuoteEditor routeId={ROUTE} request={request} draft={null} defaultValidUntil={null} defaultTerms={null} />);
    fireEvent.change(screen.getByLabelText("Unit price € ex VAT"), { target: { value: "385.10" } });
    fireEvent.change(screen.getByLabelText("Delivery charge € ex VAT (0 if included)"), { target: { value: "0" } });
    expect(preview().getByText("Unknown until every rate is entered")).toBeTruthy();
    expect(preview().getByText("Incomplete")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("VAT rate %"), { target: { value: "13.5" } });
    // 10 × 385.10 = 3851.00; VAT 13.5% = 519.885 → 519.89; total 4370.89
    expect(preview().getByText("€3,851.00")).toBeTruthy();
    expect(preview().getByText("€519.89")).toBeTruthy();
    expect(preview().getByText("€4,370.89")).toBeTruthy();
  });

  it("requires an explicit confirmation before submitting, and sends only references plus content", async () => {
    vi.mocked(submitSupplierQuoteAction).mockResolvedValue({ ok: true, value: { quoteId: "22222222-2222-4222-8222-222222222222", version: 2 } });
    render(<SupplierQuoteEditor routeId={ROUTE} request={request} draft={null} defaultValidUntil="2026-11-30" defaultTerms={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit quote…" }));
    expect(submitSupplierQuoteAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and submit" }));
    await waitFor(() => expect(submitSupplierQuoteAction).toHaveBeenCalledTimes(1));
    const body = vi.mocked(submitSupplierQuoteAction).mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["draft", "expectedVersion", "quoteId", "routeId"]);
    expect(JSON.stringify(body)).not.toMatch(/supplier/i);
    await waitFor(() => expect(screen.getByText("Quote submitted.")).toBeTruthy());
  });

  it("shows server-side field issues next to the fields", async () => {
    vi.mocked(saveSupplierQuoteDraftAction).mockResolvedValue({
      ok: false,
      code: "INVALID",
      message: "Some values are not valid.",
      issues: [{ path: "lines.0.unitPriceExVat", message: "Unit price must be a number with at most 2 decimal places." }],
    });
    render(<SupplierQuoteEditor routeId={ROUTE} request={request} draft={null} defaultValidUntil={null} defaultTerms={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.getByText(/Line 1: Unit price must be a number/)).toBeTruthy());
    expect(screen.getByLabelText("Unit price € ex VAT").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("SupplierRfqList", () => {
  it("shows an honest empty state rather than sample RFQs", () => {
    render(<SupplierRfqList views={[]} emptyMessage="No RFQs have been sent to your supplier account yet." />);
    expect(screen.getByText("No RFQs have been sent to your supplier account yet.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
