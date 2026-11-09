"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Pill, Plus, ScanBarcode } from "lucide-react";
import { cn } from "@/lib/cn";
import { listMedicinePurchasesAction } from "@/app/actions/medicines";
import type { MedicinePurchase } from "@/lib/farm-data/medicine-purchases";
import { expiryState } from "@/lib/medicines/purchase-form";

const prettyDate = (iso: string) => new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00`));

const EXPIRY_STYLE = {
  expired: "bg-[#C0362C]/10 text-[#9A2B23]",
  soon: "bg-[#D98324]/15 text-[#8A4F0E]",
  ok: "bg-fr-surface-alt text-fr-ink-600",
  unknown: "bg-fr-surface-alt text-fr-ink-600",
} as const;

export default function MedicinesPage() {
  const [state, setState] = useState<{ loading: true } | { loading: false; purchases: MedicinePurchase[]; error?: string }>({ loading: true });

  useEffect(() => {
    let live = true;
    void listMedicinePurchasesAction().then((r) => {
      if (!live) return;
      setState(r.ok ? { loading: false, purchases: r.purchases } : { loading: false, purchases: [], error: r.error });
    });
    return () => { live = false; };
  }, []);

  const today = new Date().toLocaleDateString("en-CA");
  const purchases = state.loading ? [] : state.purchases;
  const expired = purchases.filter((p) => expiryState(p.expiryDate, today) === "expired").length;
  const soon = purchases.filter((p) => expiryState(p.expiryDate, today) === "soon").length;

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10 text-fr-v2-graphite">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2 text-fr-green-700"><Pill className="size-5" aria-hidden /><span className="text-sm font-semibold">Animal remedies record</span></div>
        <h1 className="font-display text-[32px] font-normal leading-tight">Medicines</h1>
        <p className="text-sm text-fr-ink-600">Medicines bought for the farm, with batch and expiry. Scan the box to add one.</p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/smart-camera" className="flex items-center justify-center gap-2 rounded-xl bg-fr-green-700 px-4 py-3.5 font-semibold text-white"><ScanBarcode className="size-5" aria-hidden />Scan a medicine</Link>
        <Link href="/medicines/record" className="flex items-center justify-center gap-2 rounded-xl border border-fr-v2-cream-rule bg-fr-v2-cream px-4 py-3.5 font-semibold text-fr-green-700"><Plus className="size-5" aria-hidden />Add without scanning</Link>
      </div>

      {expired || soon ? (
        <p role="status" className="flex gap-2 rounded-xl bg-[#D98324]/12 p-3 text-sm text-[#8A4F0E]">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {[expired ? `${expired} expired` : "", soon ? `${soon} expiring within 30 days` : ""].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {state.loading ? <p className="text-sm text-fr-ink-600" role="status">Loading medicines…</p> : null}
      {!state.loading && state.error ? <p role="alert" className="text-sm text-fr-ink-600">{state.error}</p> : null}
      {!state.loading && !state.error && purchases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-fr-v2-cream-rule p-8 text-center text-sm text-fr-ink-600">No medicine purchases recorded yet.</div>
      ) : null}

      <ul className="space-y-2.5">
        {purchases.map((p) => {
          const status = expiryState(p.expiryDate, today);
          return (
            <li key={p.id} className="space-y-1.5 rounded-2xl border border-fr-v2-cream-rule bg-fr-v2-cream p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold leading-snug text-fr-ink-900">{p.productName}</p>
                <span className="shrink-0 font-display text-lg tabular-nums">×{p.quantity}</span>
              </div>
              <p className="text-xs text-fr-ink-600">Received {prettyDate(p.dateReceived)} · {p.supplierName}{p.vetName ? ` · Vet: ${p.vetName}` : ""}</p>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                {p.batchNumber ? <span className="rounded-full bg-fr-surface-alt px-2 py-0.5 text-fr-ink-600">Batch {p.batchNumber}</span> : null}
                <span className={cn("rounded-full px-2 py-0.5", EXPIRY_STYLE[status])}>
                  {p.expiryDate ? `${status === "expired" ? "Expired" : "Expires"} ${prettyDate(p.expiryDate)}` : "Expiry not recorded"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
