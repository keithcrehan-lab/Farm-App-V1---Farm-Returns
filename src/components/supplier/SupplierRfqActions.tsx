"use client";

/** Supplier Portal — the lifecycle actions outside the editor: decline
 * an RFQ, withdraw a submitted quote, discard a draft. Each sends only a
 * reference plus an optional reason. */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { declineSupplierRfqAction, discardSupplierQuoteDraftAction, withdrawSupplierQuoteAction } from "@/app/actions/supplier-portal";

type Kind = "decline" | "withdraw" | "discard";

const COPY: Record<Kind, { button: string; confirm: string; reasonLabel: string | null }> = {
  decline: { button: "Decline this RFQ", confirm: "Decline", reasonLabel: "Reason (optional, kept in your history)" },
  withdraw: { button: "Withdraw quote", confirm: "Withdraw", reasonLabel: "Reason (optional)" },
  discard: { button: "Discard draft", confirm: "Discard", reasonLabel: null },
};

export function SupplierRfqAction({ kind, routeId, quoteId, version }: { kind: Kind; routeId: string; quoteId?: string; version?: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const copy = COPY[kind];

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result =
        kind === "decline"
          ? await declineSupplierRfqAction({ routeId, reason: reason || null })
          : kind === "withdraw"
            ? await withdrawSupplierQuoteAction({ quoteId, expectedVersion: version, reason: reason || null })
            : await discardSupplierQuoteDraftAction({ quoteId, expectedVersion: version });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-fr-border px-3 py-1.5 text-sm text-fr-ink-900">
        {copy.button}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-fr-control border border-fr-border p-3">
      {copy.reasonLabel ? (
        <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
          {copy.reasonLabel}
          <input className="rounded-fr-control border border-fr-border px-2.5 py-1.5 text-sm text-fr-ink-900" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-fr-risk">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={confirm} className="rounded-full bg-fr-risk px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Working…" : copy.confirm}
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="text-sm text-fr-ink-600">
          Cancel
        </button>
      </div>
    </div>
  );
}
