"use client";

import { useLivestockTotals } from "@/store/farm-store";
import { formatEur, formatNumber } from "@/lib/format";

export function FinancePositionSummary({ assumptionCount, quoteCount }: { assumptionCount: number; quoteCount: number }) {
  const { totalLivestockCount, totalLivestockValue } = useLivestockTotals();
  return (
    <section className="border-y border-fr-border py-5" aria-label="Current financial position">
      <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-gold">Current position</p>
      <div className="mt-3 grid gap-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-fr-ink-600">Estimated livestock value</p>
          <p className="mt-1 text-2xl font-bold text-fr-ink-900">{formatEur(totalLivestockValue)}</p>
          <p className="text-xs text-fr-ink-400">{formatNumber(totalLivestockCount, 0)} cattle recorded · Farm Return estimate</p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Farm price assumptions</p>
          <p className="mt-1 text-2xl font-bold text-fr-ink-900">{assumptionCount}</p>
          <p className="text-xs text-fr-ink-400">Farmer-entered/reference inputs</p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Supplier quotes</p>
          <p className="mt-1 text-2xl font-bold text-fr-ink-900">{quoteCount}</p>
          <p className="text-xs text-fr-ink-400">Real quotes on file</p>
        </div>
      </div>
      <p className="mt-4 border-l-[3px] border-fr-v2-gold pl-3 text-xs leading-relaxed text-fr-ink-600">
        Farm Return does not show a farm margin until real revenue and cashflow records exist. Known asset and cost models remain available below.
      </p>
    </section>
  );
}
