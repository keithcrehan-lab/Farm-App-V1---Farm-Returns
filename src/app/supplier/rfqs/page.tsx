import Link from "next/link";
import { filterSupplierRfqViews, listSupplierRfqViews, SUPPLIER_RFQ_STATUS_FILTERS, type SupplierRfqStatusFilter } from "@/orchestration/supplier-portal";
import { SupplierNotice } from "@/components/supplier/SupplierShell";
import { SupplierRfqList } from "@/components/supplier/SupplierRfqList";
import { cn } from "@/lib/cn";
import { loadForSupplier } from "../load";

const FILTER_LABEL: Record<SupplierRfqStatusFilter, string> = {
  all: "All",
  awaiting: "Awaiting quote",
  submitted: "Submitted",
  review: "Needs review",
  closed: "Closed",
};

export default async function SupplierRfqInboxPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const { status } = await searchParams;
  const filter: SupplierRfqStatusFilter = (SUPPLIER_RFQ_STATUS_FILTERS as readonly string[]).includes(String(status)) ? (status as SupplierRfqStatusFilter) : "all";
  const views = await loadForSupplier(() => listSupplierRfqViews());
  if (views.state !== "ready") {
    return <SupplierNotice title="RFQ inbox unavailable">{views.state === "unavailable" ? views.message : "This account is not linked to a supplier."}</SupplierNotice>;
  }
  const filtered = filterSupplierRfqViews(views.value, filter);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-title text-fr-ink-900">RFQ inbox</h1>
        <p className="text-sm text-fr-ink-600">
          Real farmer quote requests Farm Return has routed to you. Farmer identity and contact details are not shared at this stage —
          only what you need to price and deliver.
        </p>
      </div>
      <nav aria-label="Filter RFQs" className="flex flex-wrap gap-1">
        {SUPPLIER_RFQ_STATUS_FILTERS.map((option) => (
          <Link
            key={option}
            href={option === "all" ? "/supplier/rfqs" : `/supplier/rfqs?status=${option}`}
            aria-current={option === filter ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium", option === filter ? "border-fr-green-700 bg-fr-green-700 text-white" : "border-fr-border text-fr-ink-600")}
          >
            {FILTER_LABEL[option]} ({filterSupplierRfqViews(views.value, option).length})
          </Link>
        ))}
      </nav>
      <SupplierRfqList views={filtered} emptyMessage={filter === "all" ? "No RFQs have been sent to your supplier account yet." : "No RFQs match this filter."} />
      {views.value.length >= 500 ? <p className="text-xs text-fr-attention">Showing your 500 most recent RFQs.</p> : null}
    </div>
  );
}
