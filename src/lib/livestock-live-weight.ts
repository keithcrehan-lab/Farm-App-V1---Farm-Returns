import type { LivestockGroup } from "@/domain/types";

/**
 * Pilot acceptance repair — the herd's live-weight summary for Manage herd's "Total Cattle" card. A group's weight is
 * its recorded average (`avgWeightKg`); a group without one (or with a non-positive / non-finite value, which is never
 * a real cattle weight) is NOT RECORDED — it is never counted as 0 kg. So:
 *  - no group has a usable weight → `NOT_RECORDED` (no total, no average);
 *  - every group with head has one → `COMPLETE`;
 *  - only some do → `PARTIAL`: the total and average cover the weighed head only, and say so.
 */
export type LiveWeightSummary =
  | { state: "NOT_RECORDED" }
  | { state: "COMPLETE"; totalKg: number; avgKg: number }
  | { state: "PARTIAL"; totalKg: number; avgKg: number; weighedHead: number; totalHead: number };

function usableWeightKg(g: LivestockGroup): number | null {
  const kg = g.avgWeightKg?.value;
  return typeof kg === "number" && Number.isFinite(kg) && kg > 0 ? kg : null;
}

export function summariseLiveWeight(groups: readonly LivestockGroup[]): LiveWeightSummary {
  let totalHead = 0;
  let weighedHead = 0;
  let totalKg = 0;
  for (const g of groups) {
    const head = g.count.value;
    if (!(Number.isFinite(head) && head > 0)) continue;
    totalHead += head;
    const kg = usableWeightKg(g);
    if (kg === null) continue;
    weighedHead += head;
    totalKg += head * kg;
  }
  if (weighedHead === 0) return { state: "NOT_RECORDED" };
  const avgKg = Math.round(totalKg / weighedHead);
  return weighedHead === totalHead ? { state: "COMPLETE", totalKg, avgKg } : { state: "PARTIAL", totalKg, avgKg, weighedHead, totalHead };
}

/** Farmer-facing line for the summary (presentation only). */
export function liveWeightLine(s: LiveWeightSummary, formatKg: (kg: number) => string): string {
  if (s.state === "NOT_RECORDED") return "Live weight not recorded";
  if (s.state === "COMPLETE") return `Live Weight ${formatKg(s.totalKg)} kg · Avg ${formatKg(s.avgKg)} kg`;
  return `Live Weight ${formatKg(s.totalKg)} kg · Avg ${formatKg(s.avgKg)} kg — for ${formatKg(s.weighedHead)} of ${formatKg(s.totalHead)} head with a weight recorded`;
}
