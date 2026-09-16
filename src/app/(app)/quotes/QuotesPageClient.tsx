"use client";

/**
 * Managed Quote Pilot, Checkpoint 1 — "My quote requests"
 * (`managed-quotes-build-brief.md`: entry point on Input Planner).
 * **No approved reference image exists yet** — see
 * `RequestQuoteSheet.tsx`'s own identical note; this follows the
 * architecture doc's reviewed section 7 wireframe as the working basis.
 *
 * Status shown is `QuoteRequest.status`, derived server-side by
 * `deriveQuoteRequestFarmerStatus` — never set by this component
 * (brief: "Derive these from authoritative workflow events rather than
 * letting the browser set arbitrary states"). Checkpoint 1's own real
 * scope is `requested`/`withdrawn` only; the brief's fuller status list
 * (Being quoted / Quote available / …) arrives with Checkpoints 2/3.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { RequestQuoteSheet } from "@/components/farm/RequestQuoteSheet";
import { withdrawQuoteRequestAction } from "@/app/actions/quote-requests";
import type { QuoteRequest } from "@/lib/farm-data/quote-requests";
import { formatNumber } from "@/lib/format";

function statusPill(status: QuoteRequest["status"]) {
  if (status === "withdrawn") return <Pill tone="neutral">Withdrawn</Pill>;
  return <Pill tone="info">Requested</Pill>;
}

export function QuotesPageClient({ requests, unavailable }: { requests: QuoteRequest[]; unavailable: boolean }) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleWithdraw(requestId: string) {
    setWithdrawing(requestId);
    setError(null);
    const result = await withdrawQuoteRequestAction(requestId);
    setWithdrawing(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-2 lg:hidden">
        <div>
          <h1 className="text-title text-fr-ink-900">My quote requests</h1>
          <p className="text-sm text-fr-ink-600">Requests you&apos;ve submitted for a supplier quote.</p>
        </div>
        <button type="button" onClick={() => setSheetOpen(true)} className="rounded-full bg-fr-green-700 px-3 py-2 text-xs font-semibold text-white">
          Request a quote
        </button>
      </div>
      <PageHeader
        title="My quote requests"
        subtitle="Requests you've submitted for a supplier quote."
        actions={
          <button type="button" onClick={() => setSheetOpen(true)} className="rounded-full bg-fr-green-700 px-4 py-2 text-sm font-semibold text-white">
            Request a quote
          </button>
        }
      />

      {unavailable ? (
        <p className="rounded-fr-control border border-dashed border-fr-border py-8 text-center text-sm text-fr-ink-600">
          Quote requests aren&apos;t available right now — please try again shortly.
        </p>
      ) : requests.length === 0 ? (
        <p className="rounded-fr-control border border-dashed border-fr-border py-8 text-center text-sm text-fr-ink-600">
          No quote requests yet.{" "}
          <button type="button" className="font-medium text-fr-green-700 underline" onClick={() => setSheetOpen(true)}>
            Request a quote
          </button>{" "}
          to get started.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((r) => (
            <Card key={r.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-fr-ink-900">{r.currentRevision.product}</p>
                  <p className="text-xs text-fr-ink-600">
                    {/* Codex audit HIGH (Checkpoint C round 8, and its
                        own genuine round-9 re-review: an earlier 6dp
                        ceiling still truncated a real value with more
                        than 6 fractional digits, contradicting this
                        very claim) — this is the farmer's own real
                        submitted quantity, shown back to them. 20dp
                        exceeds what a JS `number` can even accurately
                        represent (~15-17 significant decimal digits
                        total), so every digit a real value can
                        genuinely carry is shown — never truncated, for
                        real this time, not just for realistic inputs. */}
                    {formatNumber(r.currentRevision.quantity, 20)} {r.currentRevision.unit}
                    {r.currentRevision.packaging ? ` · ${r.currentRevision.packaging}` : ""}
                  </p>
                </div>
                {statusPill(r.status)}
              </div>
              <p className="text-xs text-fr-ink-600">
                Delivery window: {r.currentRevision.deliveryWindow.start} – {r.currentRevision.deliveryWindow.end}
              </p>
              <p className="text-xs text-fr-ink-600">
                {r.currentRevision.quantityBasis === "estimated" ? "Started from your farm's estimated requirement" : "Manually entered"} · Reference {r.id}
              </p>
              {r.status !== "withdrawn" ? (
                <button
                  type="button"
                  disabled={withdrawing === r.id}
                  onClick={() => handleWithdraw(r.id)}
                  className="self-start text-xs font-medium text-fr-attention underline disabled:opacity-60"
                >
                  {withdrawing === r.id ? "Withdrawing…" : "Withdraw request"}
                </button>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {error ? (
        <div role="alert" className="mt-3 rounded-fr-control bg-fr-attention-bg px-3 py-2.5 text-sm text-fr-attention">
          {error}
        </div>
      ) : null}

      <RequestQuoteSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSubmitted={() => {
          setSheetOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
