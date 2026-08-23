"use client";

import { useLivestockTotals } from "@/store/farm-store";
import { formatNumber } from "@/lib/format";

/** "63 Total Cattle" hero — light-green stat card, master-02 Livestock screen. */
export function LivestockHeroCard() {
  const { totalLivestockCount, totalLiveWeightKg, avgLiveWeightKg } = useLivestockTotals();
  return (
    <div className="rounded-fr-card bg-fr-green-100 p-5">
      <p className="text-sm font-medium text-fr-green-700">Total Cattle</p>
      <p className="text-hero font-bold leading-tight text-fr-green-900">
        {formatNumber(totalLivestockCount, 0)}
      </p>
      <p className="mt-1 text-sm text-fr-green-700">
        Live Weight {formatNumber(totalLiveWeightKg, 0)} kg
        <span className="text-fr-green-700/70"> · Avg {avgLiveWeightKg} kg</span>
      </p>
    </div>
  );
}
