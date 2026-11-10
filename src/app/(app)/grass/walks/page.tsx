"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Footprints } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { listGrassSurveysAction } from "@/app/actions/grass-surveys";
import type { GrassSurveyRecord } from "@/lib/farm-data/grass-surveys";

export default function GrassWalksPage() {
  const [state, setState] = useState<{ loading: true } | { loading: false; surveys: GrassSurveyRecord[]; error?: string }>({ loading: true });

  useEffect(() => {
    let live = true;
    void listGrassSurveysAction().then((r) => {
      if (!live) return;
      setState(r.ok ? { loading: false, surveys: r.surveys } : { loading: false, surveys: [], error: r.error });
    });
    return () => { live = false; };
  }, []);

  return (
    <div className="mx-auto max-w-xl space-y-5 pb-10 text-fr-v2-graphite">
      <header>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fr-v2-muted">Grass · History</p>
        <h1 className="mt-1 font-display text-[34px] leading-none">Grass walks</h1>
      </header>
      <Link href="/grass/walk" className="flex min-h-14 items-center justify-center gap-2 rounded-[16px] bg-fr-v2-forest text-base font-semibold text-white">
        <Footprints className="size-5" aria-hidden />Start grass walk
      </Link>
      {state.loading ? <p className="text-sm text-fr-v2-muted" role="status">Loading walks…</p> : null}
      {!state.loading && state.error ? <p role="alert" className="text-sm text-fr-v2-muted">{state.error}</p> : null}
      {!state.loading && !state.error && state.surveys.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-fr-v2-cream-rule p-8 text-center text-sm text-fr-v2-muted">Your first walk will show here, with its route, readings and growth.</div>
      ) : null}
      <ul className="space-y-2">
        {(state.loading ? [] : state.surveys).map((s) => {
          const r = s.results;
          const started = new Date(s.startedAt);
          return (
            <li key={s.id}>
              <Link href={`/grass/walks/${s.id}`} className="flex items-center justify-between gap-3 rounded-[16px] border border-fr-v2-cream-rule bg-fr-v2-cream px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs text-fr-v2-muted">{started.toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {s.mode === "quad" ? "Quad" : s.mode === "drone" ? "Drone" : "On foot"}</p>
                  <p className="mt-0.5 text-sm font-semibold text-fr-v2-charcoal">
                    {r ? `${r.fieldsMeasured}/${r.fieldsTotal} fields · ${(r.distanceM / 1000).toFixed(1)} km · ${r.durationMin} min` : "Not finished"}
                  </p>
                  {r ? (
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-fr-v2-muted">
                      Cover {r.farmCoverKgDmHa === null ? "—" : formatNumber(r.farmCoverKgDmHa, 0)} · Growth {r.farmGrowthKgDmHaDay === null ? "—" : `${formatNumber(r.farmGrowthKgDmHaDay, 0)}/day`}
                    </p>
                  ) : null}
                </div>
                <ChevronRight className="size-4 shrink-0 text-fr-v2-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
