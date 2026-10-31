import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { SupplierNotice } from "@/components/supplier/SupplierShell";
import { SupplierQuoteEditor } from "@/components/supplier/SupplierQuoteEditor";
import { SupplierQuoteSummary } from "@/components/supplier/SupplierQuoteSummary";
import { SupplierRfqAction } from "@/components/supplier/SupplierRfqActions";
import { RFQ_STATUS_LABEL, RFQ_STATUS_TONE, describeSupplierEvent, formatDateTime, formatDeliveryArea, formatIsoDate } from "@/components/supplier/supplier-presentation";
import { addDaysToIsoDate } from "@/domain/supplier-quote";
import { openSupplierRfq, supplierPortalToday } from "@/orchestration/supplier-portal";
import { loadForSupplier, loadSupplierContext } from "../../load";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_EXPLANATION: Partial<Record<keyof typeof RFQ_STATUS_LABEL, string>> = {
  QUOTE_NEEDS_REVIEW: "The farmer changed this request after you priced it. Review the draft against the current request below.",
  QUOTE_EXPIRED: "Your submitted quote's validity date has passed. Withdraw it and submit a new quote if you still want to offer.",
  FARMER_WITHDRAWN: "The farmer withdrew this request. No new quote can be submitted.",
  DECLINED: "You declined this RFQ.",
};

export default async function SupplierRfqDetailPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;
  const notFound = (
    <SupplierNotice title="RFQ not found">
      This RFQ does not exist or was not sent to your supplier account. <Link href="/supplier/rfqs" className="text-fr-green-700">Back to inbox</Link>
    </SupplierNotice>
  );
  if (!UUID_PATTERN.test(routeId)) return notFound;

  const today = supplierPortalToday();
  const [loaded, context] = await Promise.all([loadForSupplier(() => openSupplierRfq(routeId, today)), loadSupplierContext()]);
  if (loaded.state === "not-found") return notFound;
  if (loaded.state !== "ready") {
    return <SupplierNotice title="RFQ unavailable">{loaded.state === "unavailable" ? loaded.message : "This account is not linked to a supplier."}</SupplierNotice>;
  }

  const view = loaded.value;
  const { request } = view.rfq;
  const settings = context.state === "ready" ? context.value : null;
  const liveQuote = view.liveQuote?.quote ?? null;
  const editableDraft = liveQuote?.status === "draft" ? liveQuote : null;
  const explanation = STATUS_EXPLANATION[view.status];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/supplier/rfqs" className="text-sm text-fr-green-700">
        ← RFQ inbox
      </Link>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              {request.product} · {request.quantity} {request.unit}
            </CardTitle>
            <p className="text-xs text-fr-ink-600">RFQ reference {view.rfq.routeId}</p>
          </div>
          <Pill tone={RFQ_STATUS_TONE[view.status]}>{RFQ_STATUS_LABEL[view.status]}</Pill>
        </CardHeader>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-fr-ink-600">Requested</dt>
            <dd>
              {request.quantity} {request.unit}
              {request.packaging ? ` · ${request.packaging}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fr-ink-600">Preferred delivery window</dt>
            <dd>
              {formatIsoDate(request.deliveryWindowStart)} – {formatIsoDate(request.deliveryWindowEnd)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fr-ink-600">Delivery area</dt>
            <dd>{formatDeliveryArea(request)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fr-ink-600">Request revision</dt>
            <dd>
              {request.revisionNumber} · updated {formatDateTime(request.revisedAt)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-fr-ink-600">
          The farmer&apos;s name, contact details and exact address are not shared with suppliers at the RFQ stage.
        </p>
        {explanation ? <p className="mt-3 rounded-fr-control bg-fr-attention-bg px-3 py-2 text-sm text-fr-attention">{explanation}</p> : null}
      </Card>

      {liveQuote?.status === "submitted" && view.liveQuote ? (
        <Card>
          <CardHeader>
            <CardTitle>Your submitted quote</CardTitle>
          </CardHeader>
          <SupplierQuoteSummary view={view.liveQuote} currentRevisionNumber={request.revisionNumber} />
          {view.permissions.canWithdraw ? (
            <div className="mt-3">
              <SupplierRfqAction kind="withdraw" routeId={view.rfq.routeId} quoteId={liveQuote.id} version={liveQuote.version} />
            </div>
          ) : null}
        </Card>
      ) : null}

      {view.permissions.canEditDraft ? (
        <Card>
          <CardHeader>
            <CardTitle>{editableDraft ? "Your draft quote" : "Prepare a quote"}</CardTitle>
          </CardHeader>
          <SupplierQuoteEditor
            key={editableDraft ? `${editableDraft.id}:${editableDraft.version}` : "new"}
            routeId={view.rfq.routeId}
            request={request}
            draft={editableDraft}
            defaultValidUntil={settings?.defaultQuoteValidityDays ? addDaysToIsoDate(today, settings.defaultQuoteValidityDays) : null}
            defaultTerms={settings?.quoteTerms ?? null}
          />
        </Card>
      ) : null}

      {view.permissions.canDiscard && editableDraft ? (
        <div>
          <SupplierRfqAction kind="discard" routeId={view.rfq.routeId} quoteId={editableDraft.id} version={editableDraft.version} />
        </div>
      ) : null}
      {view.permissions.canDecline ? (
        <div>
          <SupplierRfqAction kind="decline" routeId={view.rfq.routeId} />
        </div>
      ) : null}

      {view.pastQuotes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Earlier quotes on this RFQ</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-4">
            {view.pastQuotes.map((past) => (
              <SupplierQuoteSummary key={past.quote.id} view={past} currentRevisionNumber={request.revisionNumber} />
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        {view.rfq.events && view.rfq.events.length > 0 ? (
          <ol className="flex flex-col gap-1.5 text-sm">
            {view.rfq.events.map((event) => (
              <li key={event.id} className="flex flex-col sm:flex-row sm:gap-3">
                <span className="shrink-0 text-xs text-fr-ink-400 sm:w-44">{formatDateTime(event.occurredAt)}</span>
                <span className="text-fr-ink-900">{describeSupplierEvent(event)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-fr-ink-600">No history recorded yet.</p>
        )}
      </Card>
    </div>
  );
}
