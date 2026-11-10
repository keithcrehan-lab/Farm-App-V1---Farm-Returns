"use client";

import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { FarmGrassGrowthForecast } from "@/domain/grass-management";
import { listGrassSurveysAction } from "@/app/actions/grass-surveys";

interface WalkGrowth { at: string; growth: number; fields: number }

/** Farm growth from walks (with its trend) beside the approved county figure. */
export function GrowthInsights({ forecasts }: { forecasts?: readonly FarmGrassGrowthForecast[] }) {
  const [walks, setWalks] = useState<WalkGrowth[] | null>(null);

  useEffect(() => {
    let live = true;
    void listGrassSurveysAction().catch(() => ({ ok: false as const, error: "" })).then((r) => {
      if (!live) return;
      setWalks(r.ok ? r.surveys
        .filter((s) => s.results?.farmGrowthKgDmHaDay != null)
        .map((s) => ({ at: s.startedAt, growth: s.results!.farmGrowthKgDmHaDay as number, fields: s.results!.farmGrowthFieldCount }))
        .reverse() : []);
    });
    return () => { live = false; };
  }, []);

  // The server only supplies county figures from the last two weeks.
  const regional = [...(forecasts ?? [])]
    .filter((f) => f.scope === "county")
    .sort((a, b) => Date.parse(b.validFrom) - Date.parse(a.validFrom))[0];
  const latest = walks?.at(-1);
  const previous = walks && walks.length > 1 ? walks.at(-2) : undefined;
  const trend = latest && previous ? latest.growth - previous.growth : null;
  const gap = latest && regional ? latest.growth - regional.growthRateKgDmHaDay : null;
  const recent = (walks ?? []).slice(-8);
  const max = Math.max(1, ...recent.map((w) => w.growth), regional?.growthRateKgDmHaDay ?? 0);
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-IE", { day: "numeric", month: "short" });

  return (
    <section className="mb-6 rounded-[20px] border border-fr-v2-cream-rule bg-fr-v2-cream p-5" aria-label="Growth rate">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fr-v2-muted">Growth rate · kg DM/ha/day</p>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-fr-v2-muted">Your farm (from walks)</p>
          <p className="mt-1 font-mono text-[28px] font-semibold leading-none tabular-nums text-fr-v2-charcoal">{latest ? formatNumber(latest.growth, 0) : "—"}</p>
          <p className="mt-1 text-[11px] text-fr-v2-muted">
            {latest ? <>Walk {day(latest.at)} · {latest.fields} {latest.fields === 1 ? "field" : "fields"}
              {trend !== null ? <span className={cn("ml-1 inline-flex items-center gap-0.5 font-semibold", trend >= 0 ? "text-fr-v2-forest" : "text-fr-red-700")}>
                {trend >= 0 ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}{trend >= 0 ? "+" : ""}{formatNumber(trend, 0)}
              </span> : null}</> : walks === null ? "Loading…" : "Needs two walks of the same fields"}
          </p>
        </div>
        <div>
          <p className="text-xs text-fr-v2-muted">{regional?.regionLabel ?? "Your county"} (Teagasc MoSt)</p>
          <p className="mt-1 font-mono text-[28px] font-semibold leading-none tabular-nums text-fr-v2-charcoal">{regional ? formatNumber(regional.growthRateKgDmHaDay, 0) : "—"}</p>
          <p className="mt-1 text-[11px] text-fr-v2-muted">{regional ? `Predicted, week from ${day(regional.validFrom)}` : "Not published for this week yet"}</p>
        </div>
      </div>
      {gap !== null ? (
        <p className="mt-3 text-sm text-fr-v2-charcoal">
          Your farm is growing <strong>{formatNumber(Math.abs(gap), 0)} kg/day {gap >= 0 ? "above" : "below"}</strong> the {regional!.regionLabel} prediction.
        </p>
      ) : null}
      {recent.length > 1 ? (
        <div className="mt-4" aria-label="Growth from your recent walks">
          <div className="flex h-16 items-end gap-1.5">
            {recent.map((w) => (
              <div key={w.at} className="flex flex-1 flex-col items-center justify-end" title={`${day(w.at)}: ${formatNumber(w.growth, 0)}`}>
                <div className="w-full rounded-t-[4px] bg-fr-v2-forest/70" style={{ height: `${Math.max(4, (w.growth / max) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-fr-v2-muted"><span>{day(recent[0].at)}</span><span>{day(recent.at(-1)!.at)}</span></div>
        </div>
      ) : null}
      <p className="mt-3 text-[10px] leading-snug text-fr-v2-muted">County figures: Teagasc MoSt grass growth predictions, published weekly via PastureBase Ireland and Grass10.</p>
    </section>
  );
}
