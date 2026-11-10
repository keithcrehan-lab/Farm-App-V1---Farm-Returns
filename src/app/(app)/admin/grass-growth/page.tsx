"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Download, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import { fetchTeagascGrowthNowAction, getGrowthAdminViewAction, reviewGrowthBatchAction, type GrowthAdminView } from "@/app/actions/regional-grass-growth";

export default function GrassGrowthAdminPage() {
  const [view, setView] = useState<GrowthAdminView | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const v = await getGrowthAdminViewAction();
    setView(v);
    if (v.status === "ok") setValues(Object.fromEntries(v.batch.map((r) => [r.id, String(r.growthKgDmHaDay)])));
  }, []);

  useEffect(() => {
    let live = true;
    void getGrowthAdminViewAction().then((v) => {
      if (!live) return;
      setView(v);
      if (v.status === "ok") setValues(Object.fromEntries(v.batch.map((r) => [r.id, String(r.growthKgDmHaDay)])));
    });
    return () => { live = false; };
  }, []);

  async function fetchNow() {
    setBusy(true);
    setMessage("Reading this week's Teagasc map…");
    const res = await fetchTeagascGrowthNowAction();
    setBusy(false);
    setMessage(res.status === "created" ? `Read ${res.counties} counties for the week from ${res.validFrom}. Check them against the map, then approve.`
      : res.status === "exists" ? `This week's map (from ${res.validFrom}) has already been read.`
      : res.status === "failed" ? res.reason : "Admins only.");
    await load();
  }

  async function review(decision: "approve" | "reject") {
    if (view?.status !== "ok" || !view.batch.length) return;
    setBusy(true);
    const edits = view.batch.filter((r) => r.status === "pending").map((r) => ({ id: r.id, growth: Number(values[r.id]) }));
    const res = await reviewGrowthBatchAction(view.batch[0].batchId, decision, edits);
    setBusy(false);
    setMessage(res.ok ? (decision === "approve" ? "Approved. Farms in these counties now use these figures." : "Rejected. Nothing was published.") : res.error);
    await load();
  }

  if (!view) return <p className="py-10 text-center text-sm text-fr-v2-muted" role="status">Loading…</p>;
  if (view.status === "forbidden") return <p className="py-10 text-center text-sm text-fr-v2-muted">This page is for Farm Return admins.</p>;

  const batch = view.batch;
  const first = batch[0];
  const pending = batch.some((r) => r.status === "pending");

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-12 text-fr-v2-graphite">
      <header>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fr-v2-muted">Admin · Regional growth</p>
        <h1 className="mt-1 font-display text-[32px] leading-none">Teagasc county growth</h1>
        <p className="mt-2 text-sm text-fr-v2-muted">The weekly MoSt prediction map is read automatically. Check each figure against the map, correct any misreads, then approve. Nothing reaches farmers until you approve.</p>
      </header>

      <button type="button" onClick={() => void fetchNow()} disabled={busy || !view.aiConfigured}
        className="inline-flex min-h-11 items-center gap-2 rounded-[12px] border border-fr-v2-forest px-4 text-sm font-semibold text-fr-v2-forest disabled:opacity-50">
        <Download className="size-4" aria-hidden />Read this week&apos;s map now
      </button>
      {!view.aiConfigured ? <p className="text-xs text-fr-red-700">Map reading is off: ANTHROPIC_API_KEY isn&apos;t set in Vercel.</p> : null}
      {message ? <p role="status" className="flex gap-2 text-sm text-fr-v2-charcoal"><AlertCircle className="size-4 shrink-0" aria-hidden />{message}</p> : null}

      {first ? (
        <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
          <section className="space-y-2">
            <p className="text-sm font-semibold">{first.caption ?? `Week from ${first.validFrom}`}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {first.imageUrl ? <img src={first.imageUrl} alt="Teagasc MoSt predicted grass growth map" className="w-full rounded-[12px] border border-fr-v2-cream-rule" /> : null}
            <a href={first.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-fr-v2-forest underline">Teagasc page <ExternalLink className="size-3" aria-hidden /></a>
          </section>
          <section>
            <p className="mb-2 text-sm font-semibold">{pending ? "Waiting for your review" : <span className="inline-flex items-center gap-1 text-fr-v2-forest"><CheckCircle2 className="size-4" aria-hidden />Approved</span>}</p>
            <div className="divide-y divide-fr-v2-cream-rule rounded-[12px] border border-fr-v2-cream-rule bg-fr-v2-cream">
              {batch.map((r) => (
                <label key={r.id} className={cn("flex items-center justify-between gap-3 px-3 py-1.5 text-sm", r.confidence === "low" && "bg-[#D98324]/10")}>
                  <span>{r.county}{r.confidence === "low" ? <span className="ml-1.5 text-[11px] font-semibold text-[#8A4F0E]">check</span> : null}</span>
                  <input inputMode="decimal" disabled={r.status !== "pending"} value={values[r.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [r.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                    className="w-20 rounded-[8px] border border-fr-v2-cream-rule bg-white px-2 py-1 text-right font-mono tabular-nums disabled:bg-transparent disabled:border-transparent" aria-label={`${r.county} growth`} />
                </label>
              ))}
            </div>
            {pending ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void review("approve")} disabled={busy} className="min-h-11 rounded-[12px] bg-fr-v2-forest text-sm font-semibold text-white disabled:opacity-50">Approve and publish</button>
                <button type="button" onClick={() => void review("reject")} disabled={busy} className="min-h-11 rounded-[12px] border border-fr-v2-cream-rule bg-white text-sm font-semibold text-fr-v2-charcoal disabled:opacity-50">Reject</button>
              </div>
            ) : null}
          </section>
        </div>
      ) : <p className="text-sm text-fr-v2-muted">No maps read yet. Tap &quot;Read this week&apos;s map now&quot;.</p>}
    </div>
  );
}
