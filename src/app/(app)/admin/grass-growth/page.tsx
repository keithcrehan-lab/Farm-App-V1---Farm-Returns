"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Download, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  fetchTeagascGrowthNowAction,
  getGrowthAdminViewAction,
  getLatestMostMapAction,
  publishManualGrowthAction,
  reviewGrowthBatchAction,
  type GrowthAdminView,
  type LatestMapView,
} from "@/app/actions/regional-grass-growth";

const ROI_COUNTIES = [
  "Carlow", "Cavan", "Clare", "Cork", "Donegal", "Dublin", "Galway", "Kerry", "Kildare", "Kilkenny", "Laois", "Leitrim", "Limerick",
  "Longford", "Louth", "Mayo", "Meath", "Monaghan", "Offaly", "Roscommon", "Sligo", "Tipperary", "Waterford", "Westmeath", "Wexford", "Wicklow",
];

const inputClass = "w-20 rounded-[8px] border border-fr-v2-cream-rule bg-white px-2 py-1 text-right font-mono tabular-nums disabled:border-transparent disabled:bg-transparent";

export default function GrassGrowthAdminPage() {
  const [view, setView] = useState<GrowthAdminView | null>(null);
  const [mapView, setMapView] = useState<LatestMapView | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const apply = useCallback((v: GrowthAdminView, m: LatestMapView) => {
    setView(v);
    setMapView(m);
    if (v.status === "ok") setValues(Object.fromEntries(v.batch.map((r) => [r.id, String(r.growthKgDmHaDay)])));
  }, []);

  const load = useCallback(async () => {
    const [v, m] = await Promise.all([getGrowthAdminViewAction(), getLatestMostMapAction()]);
    apply(v, m);
  }, [apply]);

  useEffect(() => {
    let live = true;
    void Promise.all([getGrowthAdminViewAction(), getLatestMostMapAction()]).then(([v, m]) => { if (live) apply(v, m); });
    return () => { live = false; };
  }, [apply]);

  if (!view || !mapView) return <p className="py-10 text-center text-sm text-fr-v2-muted" role="status">Loading this week&apos;s Teagasc map…</p>;
  if (view.status === "forbidden" || mapView.status === "forbidden") return <p className="py-10 text-center text-sm text-fr-v2-muted">This page is for Farm Return admins.</p>;

  const map = mapView.map;
  const batch = view.batch;
  const pendingBatch = batch.some((r) => r.status === "pending");
  const missingCounties = ROI_COUNTIES.filter((c) => !batch.some((r) => r.county === c));
  const publishedThisWeek = Boolean(map && batch.length && batch[0].validFrom === map.validFrom && batch[0].status === "approved");
  const manualMode = Boolean(map) && !pendingBatch && !publishedThisWeek;

  async function publishManual() {
    if (!map) return;
    const figures = ROI_COUNTIES.filter((c) => (values[c] ?? "").trim() !== "").map((c) => ({ county: c, growth: Number(values[c]) }));
    if (!figures.length) { setMessage("Type at least one county's figure first."); return; }
    setBusy(true);
    const res = await publishManualGrowthAction({ validFrom: map.validFrom, validTo: map.validTo, imageUrl: map.imageUrl, caption: map.caption, figures });
    setBusy(false);
    setMessage(res.ok ? `Published ${figures.length} counties for the week from ${map.validFrom}.` : res.error);
    if (res.ok) await load();
  }

  async function readWithAi() {
    setBusy(true);
    setMessage("Reading the map…");
    const res = await fetchTeagascGrowthNowAction();
    setBusy(false);
    setMessage(res.status === "created"
      ? res.autoPublished
        ? `Verified all ${res.counties} counties with two matching reads and published automatically.`
        : `Read ${res.counties} counties. Check against the source map, then approve.`
      : res.status === "exists" ? "This week's map has already been read." : res.status === "failed" ? res.reason : "Admins only.");
    await load();
  }

  async function review(decision: "approve" | "reject") {
    if (!batch.length) return;
    setBusy(true);
    const edits = batch.filter((r) => r.status === "pending").map((r) => ({ id: r.id, growth: Number(values[r.id]) }));
    const res = await reviewGrowthBatchAction(batch[0].batchId, decision, edits);
    setBusy(false);
    setMessage(res.ok ? (decision === "approve" ? "Approved and published." : "Rejected. Nothing was published.") : res.error);
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-12 text-fr-v2-graphite">
      <header>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fr-v2-muted">Admin · Regional growth</p>
        <h1 className="mt-1 font-display text-[32px] leading-none">Teagasc county growth</h1>
        <p className="mt-2 text-sm text-fr-v2-muted">Enter the figures from this week&apos;s Teagasc MoSt map in kg DM/ha/day. Publishing updates the shared regional growth reference for every Farm Return account in the relevant counties. Check each figure against the source map; leave any uncertain county blank.</p>
      </header>

      {message ? <p role="status" className="flex gap-2 text-sm text-fr-v2-charcoal"><AlertCircle className="size-4 shrink-0" aria-hidden />{message}</p> : null}
      {!map ? <p role="alert" className="text-sm text-fr-red-700">{mapView.reason ?? "Couldn't find this week's map on the Teagasc page."}</p> : null}

      <div className="grid gap-5 md:grid-cols-2">
        <section className="space-y-2">
          {map ? (
            <>
              <p className="text-sm font-semibold">{map.caption}</p>
              <a href={map.imageUrl} target="_blank" rel="noopener noreferrer" aria-label="Open the map full size">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={map.imageUrl} alt="Teagasc MoSt predicted grass growth map" className="w-full rounded-[12px] border border-fr-v2-cream-rule" />
              </a>
              <p className="text-xs text-fr-v2-muted">Tap the map to open it full size and zoom in.</p>
            </>
          ) : null}
          <a href="https://teagasc.ie/crops/grassland/current-grassland-management/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-fr-v2-forest underline">Teagasc page <ExternalLink className="size-3" aria-hidden /></a>
        </section>

        <section>
          {manualMode ? (
            <>
              <p className="mb-2 text-sm font-semibold">Week from {map!.validFrom} · not published yet</p>
              <div className="divide-y divide-fr-v2-cream-rule rounded-[12px] border border-fr-v2-cream-rule bg-fr-v2-cream">
                {ROI_COUNTIES.map((c) => (
                  <label key={c} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                    <span>{c}</span>
                    <input inputMode="decimal" value={values[c] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [c]: e.target.value.replace(/[^0-9.]/g, "") }))} className={inputClass} aria-label={`${c} growth`} placeholder="—" />
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => void publishManual()} disabled={busy} className="mt-3 min-h-11 w-full rounded-[12px] bg-fr-v2-forest text-sm font-semibold text-white disabled:opacity-50">Publish to all farms</button>
              {view.aiConfigured ? (
                <button type="button" onClick={() => void readWithAi()} disabled={busy} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-fr-v2-forest text-sm font-semibold text-fr-v2-forest disabled:opacity-50">
                  <Download className="size-4" aria-hidden />Read the map automatically instead
                </button>
              ) : null}
            </>
          ) : batch.length ? (
            <>
              <p className="mb-2 text-sm font-semibold">
                {pendingBatch ? "Read automatically · waiting for your review" : <span className="inline-flex items-center gap-1 text-fr-v2-forest"><CheckCircle2 className="size-4" aria-hidden />Published for the week from {batch[0].validFrom}</span>}
              </p>
              {pendingBatch ? (
                <div className="mb-2 space-y-1 text-xs leading-5 text-fr-v2-muted">
                  <p>{batch.length} of {ROI_COUNTIES.length} counties extracted. Compare each number with the source map before approval.</p>
                  {missingCounties.length ? <p className="font-semibold text-fr-v2-harvest">Missing counties (no figure will be shown): {missingCounties.join(", ")}.</p> : null}
                  {batch.some((r) => r.confidence === "low") ? <p>Highlighted readings were unclear to the image reader and require particular attention.</p> : null}
                </div>
              ) : null}
              <div className="divide-y divide-fr-v2-cream-rule rounded-[12px] border border-fr-v2-cream-rule bg-fr-v2-cream">
                {batch.map((r) => (
                  <label key={r.id} className={cn("flex items-center justify-between gap-3 px-3 py-1.5 text-sm", r.status === "pending" && r.confidence === "low" && "bg-[#D98324]/10")}>
                    <span>{r.county}{r.status === "pending" && r.confidence === "low" ? <span className="ml-1.5 text-[11px] font-semibold text-[#8A4F0E]">check</span> : null}</span>
                    <input inputMode="decimal" disabled={r.status !== "pending"} value={values[r.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [r.id]: e.target.value.replace(/[^0-9.]/g, "") }))} className={inputClass} aria-label={`${r.county} growth`} />
                  </label>
                ))}
              </div>
              {pendingBatch ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => void review("approve")} disabled={busy} className="min-h-11 rounded-[12px] bg-fr-v2-forest text-sm font-semibold text-white disabled:opacity-50">Approve and publish</button>
                  <button type="button" onClick={() => void review("reject")} disabled={busy} className="min-h-11 rounded-[12px] border border-fr-v2-cream-rule bg-white text-sm font-semibold text-fr-v2-charcoal disabled:opacity-50">Reject</button>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
