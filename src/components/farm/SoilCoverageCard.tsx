"use client";

import { Info, Layers } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { mockFarmStats } from "@/data/mock-farm";
import { useFields } from "@/store/farm-store";
import { calculateFarmCoverageStats } from "@/domain/farm-stats";

/** "Soil coverage" summary — spec §5, matches mobile-soil-overview.png.
 * Fields mapped / verified tests are real, live counts over this farm's
 * actual fields; "planning accuracy %" stays the Phase 1 mock figure —
 * no defined scoring methodology exists for it anywhere in this app's
 * evidence base yet. */
export function SoilCoverageCard() {
  const fields = useFields();
  const { totalFieldsMapped, totalVerifiedTests } = calculateFarmCoverageStats(fields);

  return (
    <Card>
      <div className="mb-4 flex items-center gap-3">
        <IconChip icon={Layers} tone="good" />
        <h3 className="text-base font-semibold text-fr-ink-900">Soil coverage</h3>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-2xl font-bold text-fr-ink-900">{totalFieldsMapped}</p>
          <p className="text-xs text-fr-ink-600">fields mapped</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-fr-ink-900">{totalVerifiedTests}</p>
          <p className="text-xs text-fr-ink-600">verified tests</p>
        </div>
        <div>
          <p className="flex items-center justify-center gap-1 text-2xl font-bold text-fr-good">
            {mockFarmStats.planningAccuracyPct}%
          </p>
          <p className="flex items-center justify-center gap-1 text-xs text-fr-ink-600">
            planning accuracy
            <Info className="size-3.5 text-fr-ink-400" />
          </p>
        </div>
      </div>
    </Card>
  );
}
