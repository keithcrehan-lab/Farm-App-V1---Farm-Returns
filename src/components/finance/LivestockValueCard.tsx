"use client";

import { Beef, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";
import { mockFinanceSummary } from "@/data/mock-farm";
import { useLivestockTotals } from "@/store/farm-store";
import { formatEur, formatNumber } from "@/lib/format";

export function LivestockValueCard() {
  const { totalLivestockCount, totalLivestockValue } = useLivestockTotals();
  // V3 closure pass (second pass, mock-authority audit) — totalLivestockValue
  // above is real (calculateFarmCoverageStats/useLivestockTotals, derived
  // from this farm's actual livestock records). The season-over-season
  // change below has no real prior-season valuation history behind it —
  // no such feature exists in this app yet — so it must not sit at the
  // same visual confidence as the real headline figure above it.
  const changeEur = mockFinanceSummary.livestockValueChangeEur;
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Beef} tone="good" />
          <CardTitle>Livestock value</CardTitle>
        </span>
        <ChevronRight className="size-4 text-fr-ink-400" />
      </CardHeader>
      <p className="text-metric font-bold text-fr-ink-900">{formatEur(totalLivestockValue)}</p>
      <p className="text-sm text-fr-ink-600">{formatNumber(totalLivestockCount, 0)} cattle</p>
      <p className="mt-3 flex items-center gap-2 rounded-fr-control bg-fr-good-bg px-3 py-2 text-sm font-medium text-fr-good">
        +{formatEur(changeEur)} vs last season
        <Pill tone="neutral" className="ml-auto">
          Sample data
        </Pill>
      </p>
    </Card>
  );
}
