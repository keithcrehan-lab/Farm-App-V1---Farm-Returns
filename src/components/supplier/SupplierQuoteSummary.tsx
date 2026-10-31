import { Pill } from "@/components/ui/StatusBadge";
import type { SupplierQuoteView } from "@/orchestration/supplier-portal/views";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE, formatCents, formatDateTime, formatIsoDate } from "./supplier-presentation";

/** Read-only rendering of a stored quote and its domain-computed totals. */
export function SupplierQuoteSummary({ view, currentRevisionNumber }: { view: SupplierQuoteView; currentRevisionNumber: number }) {
  const { quote, totals } = view;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={QUOTE_STATUS_TONE[quote.status]}>{QUOTE_STATUS_LABEL[quote.status]}</Pill>
        <span className="text-xs text-fr-ink-600">
          Priced against request revision {quote.quotedRevisionNumber}
          {quote.quotedRevisionNumber < currentRevisionNumber ? ` (farmer is now on revision ${currentRevisionNumber})` : ""}
          {quote.submittedAt ? ` · submitted ${formatDateTime(quote.submittedAt)}` : ` · last saved ${formatDateTime(quote.updatedAt)}`}
          {quote.withdrawnAt ? ` · withdrawn ${formatDateTime(quote.withdrawnAt)}` : ""}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs text-fr-ink-600">
            <tr>
              <th className="py-1 pr-2 font-medium">Item</th>
              <th className="py-1 pr-2 text-right font-medium">Qty</th>
              <th className="py-1 pr-2 text-right font-medium">Unit price ex VAT</th>
              <th className="py-1 pr-2 text-right font-medium">VAT</th>
              <th className="py-1 text-right font-medium">Line ex VAT</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((line, index) => (
              <tr key={line.lineNumber} className="border-t border-fr-border">
                <td className="py-1.5 pr-2 text-fr-ink-900">
                  {line.product}
                  {line.description ? <span className="block text-xs text-fr-ink-600">{line.description}</span> : null}
                </td>
                <td className="py-1.5 pr-2 text-right">
                  {line.quantity} {line.unit}
                </td>
                <td className="py-1.5 pr-2 text-right">€{line.unitPriceExVat}</td>
                <td className="py-1.5 pr-2 text-right">{line.vatRatePercent === null ? "Not declared" : `${line.vatRatePercent}%`}</td>
                <td className="py-1.5 text-right">{totals ? formatCents(totals.lines[index]?.exVatCents ?? null) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totals ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:max-w-sm sm:self-end">
          <dt className="text-fr-ink-600">Goods ex VAT</dt>
          <dd className="text-right">{formatCents(totals.goodsExVatCents)}</dd>
          <dt className="text-fr-ink-600">Delivery ex VAT</dt>
          <dd className="text-right">{totals.deliveryExVatCents === null ? "Not declared" : formatCents(totals.deliveryExVatCents)}</dd>
          {totals.vatBands.map((band) => (
            <VatBandRow key={band.ratePercent} rate={band.ratePercent} vat={band.vatCents} />
          ))}
          {totals.vatCents === null ? (
            <>
              <dt className="text-fr-ink-600">VAT</dt>
              <dd className="text-right">Unknown until every rate is declared</dd>
            </>
          ) : null}
          <dt className="font-semibold text-fr-ink-900">Total inc VAT</dt>
          <dd className="text-right font-semibold text-fr-ink-900">{totals.complete ? formatCents(totals.totalIncVatCents) : "Incomplete"}</dd>
        </dl>
      ) : (
        <p className="text-sm text-fr-attention">Totals for this quote could not be computed by this version of Farm Return, so none are shown.</p>
      )}

      <dl className="grid gap-1 text-xs text-fr-ink-600 sm:grid-cols-2">
        <div>
          Delivery: {formatIsoDate(quote.deliveryEarliest)} – {formatIsoDate(quote.deliveryLatest)}
        </div>
        <div>Valid until: {formatIsoDate(quote.validUntil)}</div>
        {quote.paymentTerms ? <div>Payment terms: {quote.paymentTerms}</div> : null}
        {quote.notes ? <div className="sm:col-span-2">Notes: {quote.notes}</div> : null}
        {quote.withdrawReason ? <div className="sm:col-span-2">Withdrawal reason: {quote.withdrawReason}</div> : null}
      </dl>
    </div>
  );
}

function VatBandRow({ rate, vat }: { rate: string; vat: number }) {
  return (
    <>
      <dt className="text-fr-ink-600">VAT at {rate}%</dt>
      <dd className="text-right">{formatCents(vat)}</dd>
    </>
  );
}
