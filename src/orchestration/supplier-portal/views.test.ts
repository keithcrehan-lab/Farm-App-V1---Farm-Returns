import { describe, expect, it } from "vitest";
import type { SupplierPortalQuote, SupplierPortalRfq } from "@/lib/farm-data/supplier-portal";
import { buildSupplierPortalOverview, buildSupplierQuoteHistory, buildSupplierRfqView, filterSupplierRfqViews } from "./views";

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

function quote(overrides: Partial<SupplierPortalQuote> = {}): SupplierPortalQuote {
  return {
    id: id(),
    status: "submitted",
    version: 2,
    quotedRevisionNumber: 1,
    currency: "EUR",
    deliveryChargeExVat: "50.00",
    deliveryVatRatePercent: "23",
    deliveryEarliest: "2026-11-10",
    deliveryLatest: "2026-11-20",
    validUntil: "2026-11-30",
    paymentTerms: null,
    notes: null,
    totalsMethod: "supplier_quote_totals_v1",
    submittedAt: "2026-10-31T10:00:00Z",
    withdrawnAt: null,
    withdrawReason: null,
    createdAt: "2026-10-31T09:00:00Z",
    updatedAt: "2026-10-31T10:00:00Z",
    lines: [{ lineNumber: 1, product: "CAN", description: null, quantity: "10", unit: "tonnes", unitPriceExVat: "385.00", vatRatePercent: "0" }],
    ...overrides,
  };
}

function rfq(overrides: Partial<SupplierPortalRfq> = {}, quotes: SupplierPortalQuote[] = []): SupplierPortalRfq {
  return {
    routeId: id(),
    routedAt: "2026-10-30T10:00:00Z",
    firstViewedAt: "2026-10-30T11:00:00Z",
    declinedAt: null,
    declineReason: null,
    request: {
      requestedAt: "2026-10-29T10:00:00Z",
      withdrawn: false,
      revisionNumber: 1,
      revisedAt: "2026-10-29T10:00:00Z",
      product: "CAN 27%N",
      quantity: "10",
      unit: "tonnes",
      packaging: null,
      deliveryWindowStart: "2026-11-10",
      deliveryWindowEnd: "2026-11-20",
      townOrCity: null,
      county: "Meath",
      eircodeRoutingKey: null,
    },
    quotes,
    events: null,
    ...overrides,
  };
}

describe("supplier portal views", () => {
  it("computes totals for the live quote and separates history", () => {
    const withdrawn = quote({ status: "withdrawn", withdrawnAt: "2026-10-31T09:30:00Z", updatedAt: "2026-10-31T09:30:00Z" });
    const live = quote();
    const view = buildSupplierRfqView(rfq({}, [withdrawn, live]), "2026-11-01");
    expect(view.status).toBe("QUOTE_SUBMITTED");
    expect(view.liveQuote?.quote.id).toBe(live.id);
    expect(view.liveQuote?.totals?.totalIncVatCents).toBe(385000 + 5000 + 1150);
    expect(view.pastQuotes.map((p) => p.quote.id)).toEqual([withdrawn.id]);
    expect(view.permissions).toMatchObject({ canWithdraw: true, canEditDraft: false, canDecline: false });
  });

  it("fails closed (no totals) for an unsupported stored totals method", () => {
    const view = buildSupplierRfqView(rfq({}, [quote({ totalsMethod: "supplier_quote_totals_v9" })]), "2026-11-01");
    expect(view.liveQuote?.totals).toBeNull();
    const overview = buildSupplierPortalOverview([view], "2026-11-01");
    expect(overview.kpis.liveSubmittedValueCents).toBe(0);
    expect(overview.kpis.liveSubmittedValueUnknown).toBe(1);
  });

  it("marks a quote priced against an earlier revision for review", () => {
    const view = buildSupplierRfqView(rfq({ request: { ...rfq().request, revisionNumber: 2 } }, [quote()]), "2026-11-01");
    expect(view.status).toBe("QUOTE_NEEDS_REVIEW");
  });

  it("builds a newest-first quote history across RFQs and filters the inbox", () => {
    const a = buildSupplierRfqView(rfq({}, [quote({ updatedAt: "2026-10-31T08:00:00Z" })]), "2026-11-01");
    const b = buildSupplierRfqView(rfq({ firstViewedAt: null }), "2026-11-01");
    const c = buildSupplierRfqView(rfq({}, [quote({ status: "draft", totalsMethod: null, submittedAt: null, updatedAt: "2026-10-31T12:00:00Z" })]), "2026-11-01");
    expect(buildSupplierQuoteHistory([a, b, c]).map((row) => row.quote.quote.status)).toEqual(["draft", "submitted"]);
    expect(filterSupplierRfqViews([a, b, c], "awaiting").map((v) => v.status)).toEqual(["NEW", "DRAFT"]);
    expect(filterSupplierRfqViews([a, b, c], "submitted")).toHaveLength(1);
  });
});
