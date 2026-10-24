"use client";

import { useLivestockTotals } from "@/store/farm-store";
import { formatNumber } from "@/lib/format";
import { liveWeightLine } from "@/lib/livestock-live-weight";

/** "63 Total Cattle" hero — light-green stat card, master-02 Livestock screen. Live weight is shown only where it is
 * recorded (`summariseLiveWeight`): never "0 kg" for a weight nobody recorded. */
export function LivestockHeroCard() {
  const { totalLivestockCount, liveWeight } = useLivestockTotals();
  return (
    <div className="rounded-fr-card bg-fr-green-100 p-5">
      <p className="text-sm font-medium text-fr-green-700">Total Cattle</p>
      <p className="text-hero font-bold leading-tight text-fr-green-900">
        {formatNumber(totalLivestockCount, 0)}
      </p>
      <p className="mt-1 text-sm text-fr-green-700">{liveWeightLine(liveWeight, (kg) => formatNumber(kg, 0))}</p>
    </div>
  );
}
