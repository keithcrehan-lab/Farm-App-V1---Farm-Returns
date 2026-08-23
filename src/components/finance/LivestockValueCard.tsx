import { Beef, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { mockFinanceSummary, totalLivestockCount, totalLivestockValue } from "@/data/mock-farm";
import { formatEur, formatNumber } from "@/lib/format";

export function LivestockValueCard() {
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
      <p className="mt-3 flex items-center gap-1 rounded-fr-control bg-fr-good-bg px-3 py-2 text-sm font-medium text-fr-good">
        +{formatEur(changeEur)} vs last season
        <ChevronRight className="ml-auto size-4" />
      </p>
    </Card>
  );
}
