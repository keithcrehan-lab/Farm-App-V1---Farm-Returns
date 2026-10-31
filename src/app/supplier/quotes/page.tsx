import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { SupplierNotice } from "@/components/supplier/SupplierShell";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE, RFQ_STATUS_LABEL, formatCents, formatDateTime, formatIsoDate } from "@/components/supplier/supplier-presentation";
import { getSupplierQuoteHistory } from "@/orchestration/supplier-portal";
import { loadForSupplier } from "../load";

export default async function SupplierQuotesPage() {
  const history = await loadForSupplier(() => getSupplierQuoteHistory());
  if (history.state !== "ready") {
    return <SupplierNotice title="Quotes unavailable">{history.state === "unavailable" ? history.message : "This account is not linked to a supplier."}</SupplierNotice>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-title text-fr-ink-900">Quotes</h1>
        <p className="text-sm text-fr-ink-600">Every quote your supplier account has drafted, submitted, withdrawn or discarded — nothing is deleted.</p>
      </div>
      {history.value.length === 0 ? (
        <p className="rounded-fr-control border border-dashed border-fr-border py-6 text-center text-sm text-fr-ink-600">
          No quotes yet. Open an RFQ from the inbox to prepare one.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {history.value.map((row) => {
            const { quote, totals } = row.quote;
            return (
              <li key={quote.id}>
                <Link href={`/supplier/rfqs/${row.routeId}`} className="block">
                  <Card className="flex flex-col gap-1 p-4 hover:border-fr-green-700">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-fr-ink-900">{row.product}</p>
                      <Pill tone={QUOTE_STATUS_TONE[quote.status]}>{QUOTE_STATUS_LABEL[quote.status]}</Pill>
                    </div>
                    <p className="text-xs text-fr-ink-600">
                      {quote.lines.length} line{quote.lines.length === 1 ? "" : "s"} · {totals?.complete ? `${formatCents(totals.totalIncVatCents)} inc VAT` : "Total incomplete"} · valid until{" "}
                      {formatIsoDate(quote.validUntil)}
                    </p>
                    <p className="text-xs text-fr-ink-400">
                      RFQ: {RFQ_STATUS_LABEL[row.rfqStatus]} · last change {formatDateTime(quote.updatedAt)}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
