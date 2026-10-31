import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import type { SupplierRfqView } from "@/orchestration/supplier-portal/views";
import { RFQ_STATUS_LABEL, RFQ_STATUS_TONE, formatCents, formatDateTime, formatDeliveryArea, formatIsoDate } from "./supplier-presentation";

export function SupplierRfqList({ views, emptyMessage }: { views: SupplierRfqView[]; emptyMessage: string }) {
  if (views.length === 0) {
    return <p className="rounded-fr-control border border-dashed border-fr-border py-6 text-center text-sm text-fr-ink-600">{emptyMessage}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {views.map((view) => {
        const { request } = view.rfq;
        return (
          <li key={view.rfq.routeId}>
            <Link href={`/supplier/rfqs/${view.rfq.routeId}`} className="block">
              <Card className="flex flex-col gap-1 p-4 hover:border-fr-green-700">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-fr-ink-900">
                    {request.product} · {request.quantity} {request.unit}
                    {request.packaging ? ` · ${request.packaging}` : ""}
                  </p>
                  <Pill tone={RFQ_STATUS_TONE[view.status]}>{RFQ_STATUS_LABEL[view.status]}</Pill>
                </div>
                <p className="text-xs text-fr-ink-600">
                  Delivery {formatIsoDate(request.deliveryWindowStart)} – {formatIsoDate(request.deliveryWindowEnd)} · {formatDeliveryArea(request)}
                </p>
                <p className="text-xs text-fr-ink-400">
                  Received {formatDateTime(view.rfq.routedAt)}
                  {view.liveQuote ? ` · Your quote: ${view.liveQuote.totals?.complete ? formatCents(view.liveQuote.totals.totalIncVatCents) + " inc. VAT" : "total not complete"}` : ""}
                </p>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
