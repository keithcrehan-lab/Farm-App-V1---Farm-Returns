import "server-only";

/**
 * Supplier Portal — server orchestration: fetch through the
 * session-scoped RPC layer, then assemble views with `./views`. The
 * supplier is always the caller's own (resolved inside the database);
 * nothing here takes a supplier id.
 */
import { dublinDate } from "@/domain/slurry-allocation-lifecycle";
import { getMySupplierRfq, listMySupplierRfqs, markMySupplierRfqViewed } from "@/lib/farm-data/supplier-portal";
import { buildSupplierPortalOverview, buildSupplierQuoteHistory, buildSupplierRfqView, type SupplierPortalOverview, type SupplierQuoteHistoryRow, type SupplierRfqView } from "./views";

export * from "./views";

/** Today's calendar date in Europe/Dublin — the same day boundary the
 * database's submit check uses (`_supplier_portal_dublin_today`). */
export function supplierPortalToday(now: Date = new Date()): string {
  return dublinDate(now);
}

export async function listSupplierRfqViews(today = supplierPortalToday()): Promise<SupplierRfqView[]> {
  const rfqs = await listMySupplierRfqs();
  return rfqs.map((rfq) => buildSupplierRfqView(rfq, today));
}

export async function getSupplierPortalOverview(today = supplierPortalToday()): Promise<SupplierPortalOverview> {
  return buildSupplierPortalOverview(await listSupplierRfqViews(today), today);
}

export async function getSupplierQuoteHistory(): Promise<SupplierQuoteHistoryRow[]> {
  return buildSupplierQuoteHistory(await listSupplierRfqViews());
}

/** Opening an RFQ records the first view (idempotent in the database). */
export async function openSupplierRfq(routeId: string, today = supplierPortalToday()): Promise<SupplierRfqView> {
  const rfq = await getMySupplierRfq(routeId);
  if (rfq.firstViewedAt === null) {
    await markMySupplierRfqViewed(routeId);
    return buildSupplierRfqView(await getMySupplierRfq(routeId), today);
  }
  return buildSupplierRfqView(rfq, today);
}
