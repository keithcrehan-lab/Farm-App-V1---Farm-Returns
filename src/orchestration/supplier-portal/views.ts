/**
 * Supplier Portal — pure view assembly over RPC payloads. No I/O: the
 * server half (`./index.ts`) fetches, these functions only combine the
 * domain module's status/totals/KPI logic with the fetched records, so
 * pages and client components render without calculating anything.
 */
import {
  computeStoredSupplierQuoteTotals,
  deriveSupplierRfqStatus,
  isLiveSupplierQuoteStatus,
  summariseSupplierPortal,
  supplierRfqPermissions,
  type SupplierPortalKpis,
  type SupplierQuoteDraftInput,
  type SupplierQuoteTotals,
  type SupplierRfqStatus,
} from "@/domain/supplier-quote";
import type { SupplierPortalQuote, SupplierPortalRfq } from "@/lib/farm-data/supplier-portal";

export interface SupplierQuoteView {
  quote: SupplierPortalQuote;
  /** null = totals could not be computed (unsupported stored method or
   * malformed stored input) — rendered as "unavailable", never as 0. */
  totals: SupplierQuoteTotals | null;
}

export interface SupplierRfqView {
  rfq: SupplierPortalRfq;
  status: SupplierRfqStatus;
  liveQuote: SupplierQuoteView | null;
  pastQuotes: SupplierQuoteView[];
  permissions: ReturnType<typeof supplierRfqPermissions>;
}

export function supplierQuoteAsDraftInput(quote: SupplierPortalQuote): SupplierQuoteDraftInput {
  return {
    lines: quote.lines.map((line) => ({
      product: line.product,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceExVat: line.unitPriceExVat,
      vatRatePercent: line.vatRatePercent,
    })),
    deliveryChargeExVat: quote.deliveryChargeExVat,
    deliveryVatRatePercent: quote.deliveryVatRatePercent,
    deliveryEarliest: quote.deliveryEarliest,
    deliveryLatest: quote.deliveryLatest,
    validUntil: quote.validUntil,
    paymentTerms: quote.paymentTerms,
    notes: quote.notes,
  };
}

export function buildSupplierQuoteView(quote: SupplierPortalQuote): SupplierQuoteView {
  try {
    const totals = computeStoredSupplierQuoteTotals({ ...supplierQuoteAsDraftInput(quote), totalsMethod: quote.totalsMethod });
    return { quote, totals: "unsupported" in totals ? null : totals };
  } catch {
    return { quote, totals: null };
  }
}

export function buildSupplierRfqView(rfq: SupplierPortalRfq, today: string): SupplierRfqView {
  const quoteViews = rfq.quotes.map(buildSupplierQuoteView);
  const liveQuote = quoteViews.find((view) => isLiveSupplierQuoteStatus(view.quote.status)) ?? null;
  const pastQuotes = quoteViews.filter((view) => view !== liveQuote).reverse();
  const status = deriveSupplierRfqStatus({
    requestWithdrawn: rfq.request.withdrawn,
    declined: rfq.declinedAt !== null,
    viewed: rfq.firstViewedAt !== null,
    currentRevisionNumber: rfq.request.revisionNumber,
    liveQuote: liveQuote ? { status: liveQuote.quote.status, quotedRevisionNumber: liveQuote.quote.quotedRevisionNumber, validUntil: liveQuote.quote.validUntil } : null,
    today,
  });
  return { rfq, status, liveQuote, pastQuotes, permissions: supplierRfqPermissions(status, liveQuote?.quote.status ?? null) };
}

export interface SupplierPortalOverview {
  kpis: SupplierPortalKpis;
  recent: SupplierRfqView[];
}

export function buildSupplierPortalOverview(views: SupplierRfqView[], today: string): SupplierPortalOverview {
  const kpis = summariseSupplierPortal(
    views.map((view) => ({
      status: view.status,
      liveQuote: view.liveQuote ? { status: view.liveQuote.quote.status, validUntil: view.liveQuote.quote.validUntil, totalIncVatCents: view.liveQuote.totals?.totalIncVatCents ?? null } : null,
    })),
    today,
  );
  return { kpis, recent: views.slice(0, 5) };
}

export interface SupplierQuoteHistoryRow {
  routeId: string;
  product: string;
  rfqStatus: SupplierRfqStatus;
  quote: SupplierQuoteView;
}

/** Every quote the supplier has ever created, newest activity first. */
export function buildSupplierQuoteHistory(views: SupplierRfqView[]): SupplierQuoteHistoryRow[] {
  const rows: SupplierQuoteHistoryRow[] = [];
  for (const view of views) {
    for (const quote of [...(view.liveQuote ? [view.liveQuote] : []), ...view.pastQuotes]) {
      rows.push({ routeId: view.rfq.routeId, product: view.rfq.request.product, rfqStatus: view.status, quote });
    }
  }
  return rows.sort((a, b) => (a.quote.quote.updatedAt < b.quote.quote.updatedAt ? 1 : a.quote.quote.updatedAt > b.quote.quote.updatedAt ? -1 : 0));
}

export const SUPPLIER_RFQ_STATUS_FILTERS = ["all", "awaiting", "submitted", "review", "closed"] as const;
export type SupplierRfqStatusFilter = (typeof SUPPLIER_RFQ_STATUS_FILTERS)[number];

export function filterSupplierRfqViews(views: SupplierRfqView[], filter: SupplierRfqStatusFilter): SupplierRfqView[] {
  switch (filter) {
    case "all":
      return views;
    case "awaiting":
      return views.filter((v) => v.status === "NEW" || v.status === "OPEN" || v.status === "DRAFT");
    case "submitted":
      return views.filter((v) => v.status === "QUOTE_SUBMITTED");
    case "review":
      return views.filter((v) => v.status === "QUOTE_NEEDS_REVIEW" || v.status === "QUOTE_EXPIRED");
    case "closed":
      return views.filter((v) => v.status === "DECLINED" || v.status === "FARMER_WITHDRAWN");
  }
}
