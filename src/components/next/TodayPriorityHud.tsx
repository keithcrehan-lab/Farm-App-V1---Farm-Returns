"use client";

import { PRIORITY_DOT_BG, toneForTodayPriority } from "@/components/next/TodayOpportunityCard";
import { TODAY_PRIORITY_LABEL, TODAY_PRIORITY_ORDER, type TodayPriorityCounts } from "@/orchestration/prompt/today-priority";
import { cn } from "@/lib/cn";

/**
 * Today Control Room V1 (2026-09-19) — the compact bottom HUD replacing
 * the former large clickable priority-tracker tile. Same real
 * `TodayPriorityCounts` (`countTodayPriorities`, `today/page.tsx`) — a
 * farm-level opportunity count per band, never a field count — no new
 * priority calculation, just a smaller, denser presentation of the
 * identical real numbers. Dot colours reuse `toneForTodayPriority`/
 * `PRIORITY_DOT_BG`, the exact same source the rail and opportunity
 * cards/sheet already use — one colour language, everywhere.
 */
export function TodayPriorityHud({ counts, variant = "overlay" }: { counts: TodayPriorityCounts; variant?: "overlay" | "surface" }) {
  const overlay = variant === "overlay";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-full px-3 py-1.5",
        overlay ? "border border-white/15 bg-fr-ink-900/55 backdrop-blur-sm" : "border border-fr-border bg-fr-surface shadow-fr-card",
      )}
      aria-label={`${counts.HIGH} high priority, ${counts.MEDIUM} medium priority, ${counts.LOW} low priority, ${counts.VERY_LOW} for later`}
    >
      {TODAY_PRIORITY_ORDER.map((priority) => (
        <span key={priority} className="flex items-center gap-1.5">
          <span className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT_BG[toneForTodayPriority(priority)])} />
          <span className={cn("text-xs font-semibold", overlay ? "text-white" : "text-fr-ink-900")}>{counts[priority]}</span>
          <span className={cn("whitespace-nowrap text-[10px]", overlay ? "text-white/70" : "text-fr-ink-600")}>{TODAY_PRIORITY_LABEL[priority]}</span>
        </span>
      ))}
    </div>
  );
}
