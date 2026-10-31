/**
 * Supplier Portal — operator screen: create suppliers, link existing
 * accounts to them, and route real farmer quote requests to a supplier's
 * RFQ inbox. Gated by `src/app/operator/layout.tsx` (quote_operators
 * allow-list); every action and RPC re-checks it.
 */
import { getOperatorDemandInboxAction } from "@/app/actions/quote-operator";
import { getSupplierPortalOperatorOverviewAction } from "@/app/actions/supplier-portal-operator";
import { SupplierPortalError, type SupplierPortalOperatorOverview } from "@/lib/farm-data/supplier-portal";
import type { OperatorDemandInbox } from "@/orchestration/quotes";
import { OperatorSuppliersClient } from "./OperatorSuppliersClient";

export default async function OperatorSuppliersPage() {
  let overview: SupplierPortalOperatorOverview | null = null;
  let inbox: OperatorDemandInbox = { requests: [], groups: [] };
  let unavailableReason: string | null = null;
  try {
    [overview, inbox] = await Promise.all([getSupplierPortalOperatorOverviewAction(), getOperatorDemandInboxAction()]);
  } catch (error) {
    unavailableReason =
      error instanceof SupplierPortalError && error.code === "UNAVAILABLE"
        ? "The supplier portal migration (20261031150000_supplier_portal_foundations.sql) has not been applied to this database."
        : "Supplier management isn't available right now — please try again shortly.";
    if (!(error instanceof SupplierPortalError)) console.error("[OperatorSuppliersPage] load failed:", error);
  }

  const activeRequests = inbox.requests
    .filter((request) => request.status === "requested")
    .map((request) => ({
      id: request.id,
      label: `${request.currentRevision.product} · ${request.currentRevision.quantity} ${request.currentRevision.unit} · ${request.currentRevision.deliveryWindow.start}–${request.currentRevision.deliveryWindow.end}`,
    }));

  return <OperatorSuppliersClient overview={overview} activeRequests={activeRequests} unavailableReason={unavailableReason} />;
}
