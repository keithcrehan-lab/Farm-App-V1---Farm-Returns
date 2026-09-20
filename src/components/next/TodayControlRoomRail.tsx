"use client";

import { ChevronRight, Droplets, FlaskConical, Mountain, Sprout } from "lucide-react";
import { PRIORITY_DOT_BG, toneForTodayPriority } from "@/components/next/TodayOpportunityCard";
import { cn } from "@/lib/cn";
import type { TodayOpportunity, TodayOpportunityCategory } from "@/orchestration/prompt/today-opportunities";

/**
 * Today Control Room V1 (2026-09-19) — the compact opportunity rail:
 * one small row per active farm-topic `TodayOpportunity` (never more
 * than the four that already exist — `buildTodayOpportunities`'s own
 * "one per category" guarantee, unchanged, not re-derived here). Reused
 * as-is in two real places (`today/page.tsx`): the desktop map overlay
 * (`variant="overlay"`, glass-over-photo) and the mobile bottom `Sheet`
 * (`variant="surface"`, ordinary light card) — one component, not two
 * near-duplicates (`CLAUDE.md`'s reuse rule).
 *
 * Every figure on a row is real, already-canonical data already present
 * on the `TodayOpportunity` (`affectedFieldCount`, `metrics[0]`,
 * `headline`) — never a fabricated agronomic/weather claim invented for
 * this rail.
 */
const CATEGORY_ICON: Record<TodayOpportunityCategory, React.ComponentType<{ className?: string }>> = {
  slurry: Droplets,
  lime: Mountain,
  fertiliser: FlaskConical,
  soil: Sprout,
};

export function TodayControlRoomRail({
  opportunities,
  selectedCategory,
  onSelectOpportunity,
  variant = "overlay",
}: {
  opportunities: readonly TodayOpportunity[];
  /** The currently focused category, if any — drives this rail's own
   * "selected" row emphasis; `today/page.tsx` owns what "focused" does
   * to the map (`highlightedFieldIds`) and the drill-down sheet. */
  selectedCategory?: TodayOpportunityCategory;
  onSelectOpportunity: (opportunity: TodayOpportunity) => void;
  /** `"overlay"` — glass-over-satellite-photo styling for the desktop
   * map rail. `"surface"` — ordinary light `Card`-style row for the
   * mobile bottom sheet. Same data, same interaction, different chrome
   * for where real imagery is/isn't behind it. */
  variant?: "overlay" | "surface";
}) {
  const overlay = variant === "overlay";
  return (
    <div className="flex flex-col gap-2">
      {opportunities.map((opportunity) => {
        const tone = toneForTodayPriority(opportunity.priority);
        const Icon = CATEGORY_ICON[opportunity.category];
        const selected = opportunity.category === selectedCategory;
        const metric = opportunity.metrics[0];
        return (
          <button
            key={opportunity.category}
            type="button"
            onClick={() => onSelectOpportunity(opportunity)}
            aria-pressed={selected}
            className={cn(
              "flex items-start gap-2.5 rounded-fr-card border px-3 py-2.5 text-left shadow-fr-card transition-colors",
              overlay ? "border-white/15 bg-fr-ink-900/55 backdrop-blur-sm" : "border-fr-border bg-fr-surface",
              selected ? (overlay ? "border-white/50 bg-fr-ink-900/75" : "border-fr-green-700") : null,
            )}
          >
            <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", PRIORITY_DOT_BG[tone])} />
            <Icon className={cn("mt-0.5 size-3.5 shrink-0", overlay ? "text-white/70" : "text-fr-ink-600")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("text-xs font-semibold", overlay ? "text-white" : "text-fr-ink-900")}>{opportunity.categoryLabel}</span>
                <span className={cn("shrink-0 text-[10px] font-semibold uppercase tracking-wide", overlay ? "text-white/70" : "text-fr-ink-600")}>
                  {opportunity.priorityLabel}
                </span>
              </div>
              <p className={cn("text-[11px]", overlay ? "text-white/75" : "text-fr-ink-600")}>
                {opportunity.affectedFieldCount} {opportunity.affectedFieldCount === 1 ? "field" : "fields"}
                {metric ? ` · ${metric.value}` : ""}
              </p>
              <p className={cn("truncate text-[11px]", overlay ? "text-white/60" : "text-fr-ink-400")}>{opportunity.headline}</p>
            </div>
            <ChevronRight className={cn("mt-0.5 size-3.5 shrink-0", overlay ? "text-white/50" : "text-fr-ink-400")} />
          </button>
        );
      })}
    </div>
  );
}
