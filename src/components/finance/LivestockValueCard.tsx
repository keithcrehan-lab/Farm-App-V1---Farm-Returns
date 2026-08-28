"use client";

import { Beef, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";
import { mockFinanceSummary } from "@/data/mock-farm";
import { useIsRealMode, useLivestockTotals } from "@/store/farm-store";
import { formatEur, formatNumber } from "@/lib/format";

/**
 * Codex remediation Priority 3 — `totalLivestockValue`/`totalLivestockCount`
 * are real (`useLivestockTotals`, derived from this farm's actual
 * livestock records) on both real and mock accounts, unchanged. The
 * season-over-season change row has no real prior-season valuation
 * history behind it anywhere in this app — a real account no longer sees
 * that fabricated row at all (a "Sample data" label was not sufficient
 * per the brief); mock mode keeps it, labelled, as before.
 */
export function LivestockValueCard() {
  const { totalLivestockCount, totalLivestockValue } = useLivestockTotals();
  const isRealMode = useIsRealMode();
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
      {isRealMode ? null : (
        <p className="mt-3 flex items-center gap-2 rounded-fr-control bg-fr-good-bg px-3 py-2 text-sm font-medium text-fr-good">
          +{formatEur(changeEur)} vs last season
          <Pill tone="neutral" className="ml-auto">
            Sample data
          </Pill>
        </p>
      )}
    </Card>
  );
}
