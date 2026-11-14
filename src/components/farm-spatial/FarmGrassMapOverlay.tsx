"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Leaf } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { DEFAULT_GRASS_PRESENTATION_TARGETS } from "@/domain/grass-management";
import { RegionalGrowthStatus } from "@/components/grass/RegionalGrowthStatus";
import type { RegionalGrassDisplay } from "@/domain/regional-grass-display";

export interface FarmGrassMapSummary {
  averageCoverKgDmHa?: number;
  growthRateKgDmHaDay?: number;
  /** Independent shared county forecast; never overwrite the farm rate. */
  regionalGrowth?: RegionalGrassDisplay;
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

const BANDS = [
  { key: "low", label: "Low", short: "Low", color: "#D98324" },
  { key: "target", label: "Target", short: "Target", color: "#8BA23A" },
  { key: "above", label: "Above target", short: "Above", color: "#2E7D4F" },
  { key: "surplus", label: "Surplus", short: "Surplus", color: "#2563AC" },
  { key: "unknown", label: "Unknown", short: "No data", color: "#98A2B3" },
] as const;

/**
 * Grass lens overlay on the Farm map.
 *
 * Phone: one compact strip (three headline numbers + a slim colour key) so
 * the fields stay visible. Tapping it expands the full ranges, outlook and
 * the link into Grass. Desktop (lg+) always shows the expanded layout.
 * A single DOM tree is used for both, so nothing is duplicated for
 * assistive tech or tests.
 */
export function FarmGrassMapOverlay({ summary, view = "today", onViewChange, estimateLabel }: {
  summary: FarmGrassMapSummary;
  view?: "today" | "measured";
  onViewChange?: (view: "today" | "measured") => void;
  estimateLabel?: string;
}) {
  const target = DEFAULT_GRASS_PRESENTATION_TARGETS;
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const ranges: Record<(typeof BANDS)[number]["key"], string> = {
    low: `< ${formatNumber(target.targetMinKgDmHa, 0)}`,
    target: `${formatNumber(target.targetMinKgDmHa, 0)}–${formatNumber(target.targetMaxKgDmHa, 0)}`,
    above: `${formatNumber(target.targetMaxKgDmHa, 0)}–${formatNumber(target.surplusFromKgDmHa, 0)}`,
    surplus: `≥ ${formatNumber(target.surplusFromKgDmHa, 0)}`,
    unknown: "No reading",
  };

  return (
    <div className="grid max-w-[560px] gap-3 lg:grid-cols-[210px_minmax(0,1fr)]" data-grass-map-overlay data-expanded={expanded || undefined}>
      {/* Full legend with ranges: desktop always, phone only when expanded. */}
      <section
        className={cn(
          "order-2 rounded-[12px] border border-white/15 bg-fr-v2-forest-deep/88 p-3.5 text-white shadow-[0_12px_30px_rgba(0,0,0,0.24)] backdrop-blur-md lg:order-none",
          !expanded && "max-lg:hidden",
        )}
        id={`${detailsId}-legend`}
      >
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60">Grass status · kg DM/ha</p>
        <div className="mt-3 space-y-2 text-[11px]">
          {BANDS.map((band) => (
            <LegendRow key={band.key} color={band.color} label={band.label} value={ranges[band.key]} />
          ))}
        </div>
      </section>

      <section className="order-1 rounded-[14px] border border-white/15 bg-fr-v2-forest-deep/92 text-white shadow-[0_12px_30px_rgba(0,0,0,0.26)] backdrop-blur-md lg:order-none lg:rounded-[12px] lg:p-4">
        {onViewChange ? (
          <div className="flex items-center justify-between gap-2 px-3.5 pt-3 lg:px-0 lg:pb-3 lg:pt-0">
            <div className="inline-flex shrink-0 rounded-full bg-white/10 p-0.5 text-[11px] font-semibold" role="group" aria-label="Cover shown on the map">
              {([["today", "Today (est.)"], ["measured", "Last walk"]] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={view === value} onClick={() => onViewChange(value)}
                  className={cn("min-h-8 rounded-full px-3", view === value ? "bg-white text-fr-v2-forest-deep" : "text-white/75")}>{label}</button>
              ))}
            </div>
            <span className="truncate text-[10.5px] text-white/60">{view === "today" ? (estimateLabel ? `Growth ${estimateLabel}` : "No growth rate yet") : "As measured"}</span>
          </div>
        ) : null}
        {/* Phone header doubles as the expand toggle. */}
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={`${detailsId}-details ${detailsId}-legend`}
          className="flex w-full items-center gap-3 px-3.5 pb-2 pt-3 text-left lg:hidden"
        >
          <Leaf className="size-4 shrink-0 text-fr-v2-straw" aria-hidden />
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
            <CompactMetric label="Cover" value={summary.averageCoverKgDmHa} unit="kg DM/ha" />
            <CompactMetric label="Growth" value={summary.growthRateKgDmHaDay} unit="/day" />
            <CompactMetric label="Demand" value={summary.animalDemandKgDmDay} unit="kg/day" />
          </div>
          <ChevronDown className={cn("size-4 shrink-0 text-white/60 transition-transform motion-reduce:transition-none", expanded && "rotate-180")} aria-hidden />
          <span className="sr-only">{expanded ? "Hide grass details" : "Show grass details"}</span>
        </button>

        {/* Slim colour key: phone only, always visible so map colours make sense. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 px-3.5 py-2 text-[10px] text-white/70 lg:hidden" aria-hidden={expanded}>
          {BANDS.map((band) => (
            <span key={band.key} className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ backgroundColor: band.color }} />
              {band.short}
            </span>
          ))}
        </div>

        {/* The county figure stays visible even while the main map details
            are collapsed, without adding another full-size metric. */}
        <RegionalGrowthStatus regional={summary.regionalGrowth} theme="dark" />

        {/* Detail block: desktop always, phone only when expanded. */}
        <div id={`${detailsId}-details`} className={cn("max-lg:border-t max-lg:border-white/10 max-lg:px-3.5 max-lg:pb-3 max-lg:pt-3", !expanded && "max-lg:hidden")}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 max-lg:hidden">
              <Leaf className="size-4 text-fr-v2-straw" />
              <p className="text-sm font-semibold">Grass summary</p>
            </div>
            <p className="text-[10.5px] text-white/55">
              {summary.lastWalkAt ? `Last walk · ${dateLabel(summary.lastWalkAt)}` : "No grass walk yet"}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 max-lg:hidden">
            <Metric label="Average cover" value={summary.averageCoverKgDmHa} unit="kg DM/ha" />
            <Metric label="Growth" value={summary.growthRateKgDmHaDay} unit="kg DM/ha/day" className="pl-4" />
            <Metric label="Animal demand" value={summary.animalDemandKgDmDay} unit="kg DM/day" className="pl-4" />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] lg:mt-4 lg:border-t lg:border-white/10 lg:pt-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Outlook days={3} value={summary.outlook3Pct} />
              <Outlook days={7} value={summary.outlook7Pct} />
            </div>
            <Link href="/grass/walk" className="inline-flex min-h-9 items-center rounded-full bg-white/15 px-3 font-semibold text-white hover:bg-white/25 lg:min-h-0 lg:py-1">Start walk</Link>
            <Link href="/grass" className="inline-flex min-h-9 items-center gap-1 font-semibold text-white/80 underline decoration-white/25 underline-offset-2 hover:text-white lg:min-h-0">
              Open Grass <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-white/48">
            {summary.knownFieldCount} of {summary.totalFieldCount} fields have grass ground truth
            {summary.forecastLabel ? ` · ${summary.forecastLabel}` : ""}.
          </p>
        </div>
      </section>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[18px_1fr_auto] items-center gap-2">
      <span aria-hidden className="h-3.5 rounded-[3px] border" style={{ borderColor: color, backgroundColor: `${color}33` }} />
      <span className="font-semibold text-white/88">{label}</span>
      <span className="font-mono tabular-nums text-white/56">{value}</span>
    </div>
  );
}

function CompactMetric({ label, value, unit }: { label: string; value?: number; unit: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/50">{label}</p>
      <p className="mt-0.5 truncate font-display text-[18px] leading-none tabular-nums text-white">
        {value === undefined ? "—" : formatNumber(value, 0)}
        <span className="ml-1 font-sans text-[9px] font-normal text-white/50">{unit}</span>
      </p>
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
