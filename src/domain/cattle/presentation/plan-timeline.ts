/**
 * Cattle C10 — the animal plan's now → sale timeline, rendered ONLY from the
 * canonical `PlanIntervals` (invariant C): every day count and every phrase
 * comes from the same split the economics use. This module adds layout
 * proportions and wording; it computes no date or day count of its own.
 */

import type { PlanIntervals } from "../../animal-plan";
import { formatDayMonth, plural } from "./format";
import { details, type Details } from "./view-state";

export interface PlanTimelineSegmentVM {
  kind: "OUTDOORS" | "HOUSED";
  /** Layout only: share of the bar, in percent. */
  startPct: number;
  widthPct: number;
}

export type PlanTimelineVM =
  /** Dates invalid: no timeline (the plan's issues say why). */
  | { state: "NONE" }
  | {
      state: "UNSPLIT";
      totalDays: number;
      nowLabel: string;
      saleLabel: string;
      summary: string;
    }
  | {
      state: "SPLIT";
      totalDays: number;
      nowLabel: string;
      saleLabel: string;
      /** Every phase in order; they tile the bar exactly (0 → 100%). */
      segments: Details<PlanTimelineSegmentVM>;
      /** The housed stretches drawn on the bar (outdoor time is the bar itself). */
      housedSegments: Details<PlanTimelineSegmentVM>;
      /** The housing marker between now and sale (NOT_SHOWN when housing starts now or there's none). */
      housedMarker: { state: "SHOWN"; pct: number; label: string } | { state: "NOT_SHOWN" };
      summary: string;
      assumed: boolean;
      ariaLabel: string;
    };

export function planTimeline(intervals: PlanIntervals): PlanTimelineVM {
  if (intervals.state === "INVALID") return { state: "NONE" };
  const total = intervals.totalDays;
  const nowLabel = formatDayMonth(intervals.start);
  const saleLabel = formatDayMonth(intervals.sale);
  const days = `${plural(total, "day")} to sale`;
  if (intervals.split.state === "UNKNOWN") {
    return { state: "UNSPLIT", totalDays: total, nowLabel, saleLabel, summary: `${days} · housing now unknown, so days at grass and housed aren't split` };
  }
  const { phases, housedDays, outdoorDays, housedFrom } = intervals.split;
  let at = 0;
  const segments = phases.map((p) => {
    const seg = { kind: p.kind, startPct: (at / total) * 100, widthPct: (p.days / total) * 100 };
    at += p.days;
    return seg;
  });
  const assumed = intervals.housing.basis === "ASSUMED";
  const startsNow = housedFrom === intervals.start;
  const detail =
    housedDays === 0
      ? "not housed before sale"
      : outdoorDays === 0
        ? intervals.housing.housedNow
          ? "housed throughout"
          : `housed from today (${nowLabel}), ${plural(housedDays, "day")} housed`
        : `${outdoorDays} at grass, ${housedDays} housed from ${formatDayMonth(housedFrom as string)}`;
  const marker: Extract<PlanTimelineVM, { state: "SPLIT" }>["housedMarker"] = housedFrom !== null && !startsNow ? { state: "SHOWN", pct: (outdoorDays / total) * 100, label: formatDayMonth(housedFrom) } : { state: "NOT_SHOWN" };
  return {
    state: "SPLIT",
    totalDays: total,
    nowLabel,
    saleLabel,
    segments: details(segments),
    housedSegments: details(segments.filter((g) => g.kind === "HOUSED")),
    housedMarker: marker,
    summary: `${days} · ${detail}${assumed ? " (assumed housing)" : ""}`,
    assumed,
    ariaLabel: `Now to sale: ${plural(total, "day")}; ${detail}`,
  };
}
