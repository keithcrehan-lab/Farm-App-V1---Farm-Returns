"use client";

/**
 * Grassland Fertiliser Pilot Completion, Checkpoint C (audit F3/F12) —
 * renders exactly what `getOperatorDemandInboxAction` already computed
 * (`OperatorDemandInbox`) — this component performs no calculation of
 * its own, matching the "actions are thin, orchestration does the work,
 * components only render" discipline this app follows throughout.
 *
 * Two views of the same real data: the compatible-demand groups (what
 * an operator would seek a bulk supplier quote for) and the raw request
 * list (every individual real submission, so nothing is ever hidden
 * behind the grouping). `estimateSnapshot` is already stripped server-side
 * (`sanitiseQuoteRequestForOperator`) — never rendered here even if
 * present.
 */
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { formatNumber } from "@/lib/format";
import type { OperatorDemandInbox } from "@/orchestration/quotes";

function statusPill(status: "requested" | "withdrawn") {
  return status === "withdrawn" ? <Pill tone="neutral">Withdrawn</Pill> : <Pill tone="info">Requested</Pill>;
}

export function OperatorQuotesClient({ inbox, unavailable }: { inbox: OperatorDemandInbox; unavailable: boolean }) {
  if (unavailable) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <h1 className="mb-1 text-title text-fr-ink-900">Quote demand inbox</h1>
        <p className="rounded-fr-control border border-dashed border-fr-border py-8 text-center text-sm text-fr-ink-600">
          The quote demand inbox isn&apos;t available right now — please try again shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <div>
        <h1 className="text-title text-fr-ink-900">Quote demand inbox</h1>
        <p className="text-sm text-fr-ink-600">Every real farmer-submitted quote request on file, exactly as submitted.</p>
      </div>

      <section>
        <h2 className="mb-2 text-base font-semibold text-fr-ink-900">Compatible demand groups</h2>
        {inbox.groups.length === 0 ? (
          <p className="rounded-fr-control border border-dashed border-fr-border py-6 text-center text-sm text-fr-ink-600">
            {/* Codex audit LOW (Checkpoint C round 5) — `groupCompatibleQuoteDemand`
                groups by product/window even for a single, otherwise
                distinct active request (a real group of size 1), so an
                empty `groups` array specifically means no real ACTIVE
                (non-withdrawn) request exists at all — never "distinct
                or withdrawn", which wrongly implied a distinct active
                request could exist here with no group of its own. */}
            No real outstanding demand — every real request on file has been withdrawn (or none exist yet).
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {inbox.groups.map((g) => (
              <Card key={`${g.product}-${g.deliveryWindow.start}-${g.deliveryWindow.end}`} className="flex flex-col gap-1">
                <CardHeader>
                  <CardTitle>{g.product}</CardTitle>
                </CardHeader>
                <p className="text-sm text-fr-ink-900">
                  {/* Codex audit HIGH (Checkpoint C round 8) — `resolvedTotalKg`
                      is a real sum of converted kg quantities
                      (`domain/quote-request.ts`'s `groupCompatibleQuoteDemand`)
                      that can carry genuine floating-point summation
                      noise at very fine precision; 2dp is real
                      kg-level precision (not the previous 0dp, which
                      discarded a real fractional kg total) without
                      exposing that noise. */}
                  {formatNumber(g.resolvedTotalKg, 2)} kg total, across {g.resolvedLineIds.length} real request{g.resolvedLineIds.length === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-fr-ink-600">
                  Delivery window: {g.deliveryWindow.start} – {g.deliveryWindow.end}
                </p>
                {g.unresolvedLines.length > 0 ? (
                  <p className="text-xs text-fr-attention">
                    {g.unresolvedLines.length} real request{g.unresolvedLines.length === 1 ? "" : "s"} in a unit with no known kg equivalent
                    (e.g. bags) — excluded from the total above, not silently guessed into it.
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold text-fr-ink-900">Every real submitted request</h2>
        {inbox.requests.length === 0 ? (
          <p className="rounded-fr-control border border-dashed border-fr-border py-6 text-center text-sm text-fr-ink-600">No real requests on file yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {inbox.requests.map((r) => (
              <Card key={r.id} className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-fr-ink-900">{r.currentRevision.product}</p>
                  {statusPill(r.status)}
                </div>
                <p className="text-xs text-fr-ink-600">
                  {/* Codex audit HIGH (Checkpoint C round 8, and its own
                      genuine round-9 re-review: an earlier 6dp ceiling
                      still truncated a real value with more than 6
                      fractional digits, contradicting this screen's own
                      "exactly as submitted" header claim) — 20dp
                      exceeds what a JS `number` can even accurately
                      represent (~15-17 significant decimal digits
                      total), so every digit a real value can genuinely
                      carry is shown. */}
                  {formatNumber(r.currentRevision.quantity, 20)} {r.currentRevision.unit}
                  {r.currentRevision.packaging ? ` · ${r.currentRevision.packaging}` : ""} · Delivery window:{" "}
                  {r.currentRevision.deliveryWindow.start} – {r.currentRevision.deliveryWindow.end}
                </p>
                <p className="text-xs text-fr-ink-600">
                  Reference {r.id} · Farm {r.farmId} · {r.currentRevision.quantityBasis === "estimated" ? "Started from the farm's estimated requirement" : "Manually entered"}
                </p>
                <p className="text-xs text-fr-ink-400">Submitted {new Date(r.createdAt).toLocaleString("en-IE")}</p>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
