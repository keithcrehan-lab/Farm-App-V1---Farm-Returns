"use client";

import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { sendFertiliserRfqEmailAction } from "@/app/actions/fertiliser-rfq";
import { getFarmDeliveryDetailsAction } from "@/app/actions/quote-requests";
import {
  markFertiliserQuoteRequestReady,
  parseRequestedTonnes,
  recordFertiliserQuoteDeliveryAttempt,
  setQuoteRequestDetails,
  setRequestedQuantity,
  type FertiliserQuoteRequest,
  type FertiliserQuoteRequestIssue,
} from "@/domain/fertiliser-quote-request";
import { formatDisplayTonnes } from "@/lib/farm-fertiliser-basket-presentation";
import {
  deliveryPrefillFromFarmDetails,
  quoteCoverageNotice,
  quoteRequestIssueMessages,
} from "@/lib/fertiliser-quote-request-presentation";

const PROTOTYPE_RECIPIENT_NAME = "Prototype supplier";

export function FertiliserQuoteRequestFlow({
  request,
  onRequestChange,
}: {
  request: FertiliserQuoteRequest;
  onRequestChange: (request: FertiliserQuoteRequest) => void;
}) {
  const [delivery, setDelivery] = useState<{ deliveryLocation: string; contact: string } | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<FertiliserQuoteRequestIssue[]>([]);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.lines.map((line) => [line.productKey, line.requestedTonnes.toFixed(2)])),
  );

  useEffect(() => {
    let cancelled = false;
    getFarmDeliveryDetailsAction().then(
      (details) => {
        if (cancelled) return;
        setDelivery(deliveryPrefillFromFarmDetails(details));
        setDeliveryLoading(false);
      },
      (error: unknown) => {
        console.error("[FertiliserQuoteRequestFlow] getFarmDeliveryDetailsAction failed:", error);
        if (!cancelled) {
          setDelivery(null);
          setDeliveryLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const coverage = quoteCoverageNotice(request);
  const totalTonnes = useMemo(
    () =>
      request.lines.reduce((sum, line) => {
        const parsed = parseRequestedTonnes(quantities[line.productKey] ?? "");
        return sum + (parsed ?? line.requestedTonnes);
      }, 0),
    [quantities, request.lines],
  );
  const sent = request.status === "SENT";
  const failed = request.status === "FAILED";

  async function handleSend() {
    if (sending || sent) return;
    setSending(true);
    setErrors([]);
    setSendMessage(null);

    try {
      if (!delivery?.deliveryLocation || !delivery.contact) {
        setSendMessage("Farm delivery details are missing. Add a delivery address and contact before sending the request.");
        return;
      }

      let editable = request;
      for (const line of request.lines) {
        const tonnes = parseRequestedTonnes(quantities[line.productKey] ?? "");
        if (tonnes === null) {
          setErrors(["INVALID_REQUESTED_QUANTITY"]);
          return;
        }
        if (tonnes === line.requestedTonnes) continue;
        const updated = setRequestedQuantity(editable, line.productKey, tonnes);
        if (!updated.ok) {
          setErrors(updated.issues);
          return;
        }
        editable = updated.value;
      }

      const detailed = setQuoteRequestDetails(editable, {
        recipients: [{ name: PROTOTYPE_RECIPIENT_NAME, contact: null }],
        deliveryLocation: delivery.deliveryLocation,
        contact: delivery.contact,
        deliveryWindow: null,
        farmerNote: null,
      });
      if (!detailed.ok) {
        setErrors(detailed.issues);
        return;
      }

      const prepared = markFertiliserQuoteRequestReady(detailed.value, new Date().toISOString());
      if (!prepared.ok) {
        setErrors(prepared.issues);
        return;
      }
      const sendable = prepared.value;

      const result = await sendFertiliserRfqEmailAction(sendable);
      if (!result.ok) {
        setSendMessage(result.message);
        if (result.status === "failed" && result.attemptedAt && result.recipientName) {
          const recorded = recordFertiliserQuoteDeliveryAttempt(sendable, {
            attemptedAt: result.attemptedAt,
            recipientName: result.recipientName,
            outcome: "FAILED",
            providerReference: null,
            failureReason: result.message,
          });
          if (recorded.ok) onRequestChange(recorded.value);
        } else {
          onRequestChange(sendable);
        }
        return;
      }

      const recorded = recordFertiliserQuoteDeliveryAttempt(sendable, {
        attemptedAt: result.attemptedAt,
        recipientName: result.recipientName,
        outcome: "SUCCEEDED",
        providerReference: result.providerReference,
        failureReason: null,
      });
      if (!recorded.ok) {
        setErrors(recorded.issues);
        return;
      }

      onRequestChange(recorded.value);
      setSendMessage("Request sent to the Farm Return test inbox.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 text-sm">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fr-ink-600">Supplier request</p>
        <h2 className="mt-1 font-display text-2xl leading-tight text-fr-v2-forest-deep">Fertiliser to buy</h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-fr-ink-600">
          Farm Return has combined the fertiliser requirement across the farm. Review the quantities below, then send one test request.
        </p>
      </div>

      {coverage.tone === "good" ? null : (
        <div className="border-l-[3px] border-fr-v2-straw bg-fr-v2-cream px-4 py-3">
          <p className="font-semibold text-fr-v2-forest-deep">{coverage.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-fr-ink-600">{coverage.message}</p>
        </div>
      )}

      <div className="border-y border-fr-border py-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fr-ink-600">Total to request</p>
            <p className="mt-1 font-display text-4xl leading-none text-fr-v2-forest-deep">{totalTonnes.toFixed(2)} t</p>
          </div>
          <p className="max-w-[260px] text-right text-xs leading-relaxed text-fr-ink-600">
            Starts from the current farm fertiliser plan. You can adjust the tonnes you want suppliers to quote.
          </p>
        </div>
      </div>

      <div className="flex flex-col">
        {request.lines.map((line) => (
          <div key={line.productKey} className="grid grid-cols-[1fr_150px] items-center gap-6 border-b border-fr-border py-4 first:pt-0">
            <div>
              <p className="font-semibold text-fr-v2-forest-deep">{line.name}</p>
              <p className="mt-0.5 text-xs text-fr-ink-600">N-P-K {line.npkAnalysis}{line.provisional ? " · provisional" : ""}</p>
              <p className="mt-1 text-[11px] text-fr-ink-400">Plan requirement {formatDisplayTonnes(line.canonicalDisplayTonnes)}</p>
            </div>
            <label className="flex flex-col items-end gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fr-ink-600">Request tonnes</span>
              <div className="flex w-full items-center border border-fr-v2-forest-deep/25 bg-white">
                <input
                  aria-label={`Request tonnes for ${line.name} (${line.npkAnalysis})`}
                  inputMode="decimal"
                  value={quantities[line.productKey] ?? ""}
                  disabled={sent}
                  onChange={(event) =>
                    setQuantities((current) => ({ ...current, [line.productKey]: event.target.value }))
                  }
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-right font-mono text-base font-semibold text-fr-v2-forest-deep outline-none focus:ring-2 focus:ring-inset focus:ring-fr-v2-straw disabled:opacity-60"
                />
                <span className="border-l border-fr-v2-forest-deep/15 px-2.5 font-mono text-sm text-fr-ink-600">t</span>
              </div>
            </label>
          </div>
        ))}
      </div>

      <div className="bg-fr-v2-cream px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fr-ink-600">Delivery</p>
        {deliveryLoading ? (
          <p className="mt-1 text-sm text-fr-ink-600">Loading saved farm details…</p>
        ) : delivery?.deliveryLocation && delivery.contact ? (
          <>
            <p className="mt-1 text-sm font-medium text-fr-v2-forest-deep">{delivery.deliveryLocation}</p>
            <p className="mt-0.5 text-xs text-fr-ink-600">{delivery.contact}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-fr-attention">Delivery address or contact details are not recorded yet.</p>
        )}
      </div>

      <p className="border-l-2 border-fr-v2-straw pl-3 text-xs leading-relaxed text-fr-ink-600">
        Prototype mode: Brevo is locked to the Farm Return test inbox. No supplier email address can receive this request.
      </p>

      {errors.length > 0 ? (
        <div role="alert" className="border-l-[3px] border-fr-v2-straw bg-fr-v2-cream px-4 py-3 text-sm text-fr-attention">
          {quoteRequestIssueMessages(errors).map((message) => <p key={message}>{message}</p>)}
        </div>
      ) : null}

      {sendMessage ? (
        <p role="status" className={sent ? "text-sm font-semibold text-fr-v2-forest-deep" : "text-sm text-fr-attention"}>
          {sendMessage}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleSend}
        disabled={sending || sent || deliveryLoading || !delivery?.deliveryLocation || !delivery.contact}
        className="flex w-full items-center justify-center gap-2 border border-fr-v2-forest-deep bg-fr-v2-forest-deep px-5 py-3.5 text-sm font-semibold text-fr-v2-straw transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        {sent ? "Request sent" : sending ? "Sending request…" : failed ? "Retry request" : "Send request"}
      </button>
    </div>
  );
}
