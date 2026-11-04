"use client";

import Link from "next/link";
import { ArrowUpRight, Leaf } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { DEFAULT_GRASS_PRESENTATION_TARGETS } from "@/domain/grass-management";

export interface FarmGrassMapSummary {
  averageCoverKgDmHa?: number;
  growthRateKgDmHaDay?: number;
  animalDemandKgDmDay?: number;
  lastWalkAt?: string;
  knownFieldCount: number;
  totalFieldCount: number;
  outlook3Pct?: number;
  outlook7Pct?: number;
  forecastLabel?: string;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short" }).format(new Date(value));
}

function Outlook({ days, value }: { days: number; value?: number }) {
  if (value === undefined) {
    return <span className="text-white/48">{days}-day · unavailable</span>;
  }
  const sign = value > 0 ? "+" : "";
  return (
    <span className={cn("font-semibold tabular-nums", value >= 0 ? "text-fr-v2-straw" : "text-fr-v2-clay-tint")}>
      {days}-day · {sign}{formatNumber(value, 1)}%
    </span>
  );
}

export function FarmGrassMapOverlay({ summary }: { summary: FarmGrassMapSummary }) {
  const target = DEFAULT_GRASS_PRESENTATION_TARGETS;
  return (
    <div className="grid max-w-[560px] gap-3 lg:grid-cols-[210px_minmax(0,1fr)]" data-grass-map-overlay>
      <section className="rounded-[12px] border border-white/15 bg-fr-v2-forest-deep/88 p-3.5 text-white shadow-[0_12px_30px_rgba(0,0,0,0.24)] backdrop-blur-md">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60">Grass status · kg DM/ha</p>
        <div className="mt-3 space-y-2 text-[11px]">
          <LegendRow swatch="border-[#D98324] bg-[#D98324]/20" label="Low" value={`< ${formatNumber(target.targetMinKgDmHa, 0)}`} />
          <LegendRow swatch="border-[#8BA23A] bg-[#8BA23A]/20" label="Target" value={`${formatNumber(target.targetMinKgDmHa, 0)}–${formatNumber(target.targetMaxKgDmHa, 0)}`} />
          <LegendRow swatch="border-[#2E7D4F] bg-[#2E7D4F]/20" label="Above target" value={`${formatNumber(target.targetMaxKgDmHa, 0)}–${formatNumber(target.surplusFromKgDmHa, 0)}`} />
          <LegendRow swatch="border-[#2563AC] bg-[#2563AC]/20" label="Surplus" value={`≥ ${formatNumber(target.surplusFromKgDmHa, 0)}`} />
          <LegendRow swatch="border-[#98A2B3] bg-[#98A2B3]/15" label="Unknown" value="No reading" />
        </div>
      </section>

      <section className="rounded-[12px] border border-white/15 bg-fr-v2-forest-deep/92 p-4 text-white shadow-[0_12px_30px_rgba(0,0,0,0.26)] backdrop-blur-md">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Leaf className="size-4 text-fr-v2-straw" />
            <p className="text-sm font-semibold">Grass summary</p>
          </div>
          <p className="text-[10.5px] text-white/55">
            {summary.lastWalkAt ? `Last walk · ${dateLabel(summary.lastWalkAt)}` : "No grass walk yet"}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 divide-x divide-white/10">
          <Metric label="Average cover" value={summary.averageCoverKgDmHa} unit="kg DM/ha" />
          <Metric label="Growth" value={summary.growthRateKgDmHaDay} unit="kg DM/ha/day" className="pl-4" />
          <Metric label="Animal demand" value={summary.animalDemandKgDmDay} unit="kg DM/day" className="pl-4" />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-white/10 pt-3 text-[11px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Outlook days={3} value={summary.outlook3Pct} />
            <Outlook days={7} value={summary.outlook7Pct} />
          </div>
          <Link href="/grass" className="inline-flex items-center gap-1 font-semibold text-white/80 underline decoration-white/25 underline-offset-2 hover:text-white">
            Open Grass <ArrowUpRight className="size-3" />
          </Link>
        </div>
        <p className="mt-2 text-[10px] leading-snug text-white/48">
          {summary.knownFieldCount} of {summary.totalFieldCount} fields have grass ground truth
          {summary.forecastLabel ? ` · ${summary.forecastLabel}` : ""}.
        </p>
      </section>
    </div>
  );
}

function LegendRow({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[18px_1fr_auto] items-center gap-2">
      <span aria-hidden className={cn("h-3.5 rounded-[3px] border", swatch)} />
      <span className="font-semibold text-white/88">{label}</span>
      <span className="font-mono tabular-nums text-white/56">{value}</span>
    </div>
  );
}

function Metric({ label, value, unit, className }: { label: string; value?: number; unit: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/50">{label}</p>
      <p className="mt-1 font-display text-[25px] leading-none tabular-nums text-white">
        {value === undefined ? "—" : formatNumber(value, 0)}
      </p>
      <p className="mt-1 text-[9.5px] leading-tight text-white/50">{unit}</p>
    </div>
  );
}
