import Link from "next/link";
import { ClipboardList, FileClock, FilePen, Inbox, Send, TimerReset } from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import type { SupplierPortalOverview } from "@/orchestration/supplier-portal/views";
import { SupplierRfqList } from "./SupplierRfqList";
import { formatCents } from "./supplier-presentation";

export function SupplierOverview({ overview }: { overview: SupplierPortalOverview }) {
  const { kpis, recent } = overview;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-title text-fr-ink-900">Overview</h1>
        <p className="text-sm text-fr-ink-600">Quote requests Farm Return has sent to your supplier account, and your responses.</p>
      </div>

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricCard label="New RFQs" value={String(kpis.newRfqs)} icon={Inbox} />
        <MetricCard label="Awaiting your quote" value={String(kpis.awaitingQuote)} icon={ClipboardList} />
        <MetricCard label="Drafts in progress" value={String(kpis.drafts)} icon={FilePen} />
        <MetricCard label="Live submitted quotes" value={String(kpis.submitted)} icon={Send} />
        <MetricCard
          label="Need review"
          value={String(kpis.needsReview + kpis.expired)}
          icon={FileClock}
          partialCaption={kpis.needsReview + kpis.expired > 0 ? `${kpis.needsReview} changed by farmer · ${kpis.expired} expired` : undefined}
        />
        <MetricCard label="Expiring within 7 days" value={String(kpis.expiringWithinWeek)} icon={TimerReset} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Value of live submitted quotes</CardTitle>
        </CardHeader>
        <p className="text-metric font-bold text-fr-ink-900">{formatCents(kpis.liveSubmittedValueCents)}</p>
        <p className="mt-1 text-xs text-fr-ink-600">
          Sum of your submitted, unexpired quote totals including VAT. These are offers to farmers — not orders or accepted business.
          {kpis.liveSubmittedValueUnknown > 0 ? ` ${kpis.liveSubmittedValueUnknown} quote total(s) could not be computed and are excluded.` : ""}
        </p>
      </Card>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-fr-ink-900">Most recent RFQs</h2>
          <Link href="/supplier/rfqs" className="text-sm font-medium text-fr-green-700">
            Open inbox ({kpis.totalRfqs})
          </Link>
        </div>
        <SupplierRfqList views={recent} emptyMessage="No RFQs have been sent to your supplier account yet." />
      </section>
    </div>
  );
}
