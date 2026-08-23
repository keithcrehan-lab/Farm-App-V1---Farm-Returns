import { PieChart } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatEur, formatPct } from "@/lib/format";
import type { LivestockEconomics } from "@/domain/types";

export function MarginOutlookCard({ outlook }: { outlook: LivestockEconomics["marginOutlook"] }) {
  const diff = outlook.finishEur - outlook.sellNowEur;
  const diffPct = (diff / outlook.sellNowEur) * 100;

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={PieChart} tone="good" />
          <div>
            <CardTitle>Margin outlook</CardTitle>
            <p className="text-xs text-fr-ink-600">Per head comparison</p>
          </div>
        </span>
      </CardHeader>
      <div className="flex items-center gap-3">
        <div className="flex-1 rounded-fr-control border border-fr-border p-3 text-center">
          <p className="text-xs text-fr-ink-600">Sell now</p>
          <p className="text-xl font-bold text-fr-ink-900">{formatEur(outlook.sellNowEur)}</p>
          <p className="text-xs text-fr-ink-400">Per head margin</p>
        </div>
        <span className="shrink-0 text-sm font-medium text-fr-ink-400">VS</span>
        <div className="flex-1 rounded-fr-control border border-fr-border p-3 text-center">
          <p className="text-xs text-fr-ink-600">Finish for slaughter</p>
          <p className="text-xl font-bold text-fr-ink-900">{formatEur(outlook.finishEur)}</p>
          <p className="text-xs text-fr-ink-400">Per head margin</p>
        </div>
      </div>
      <div className="mt-3 rounded-fr-control bg-fr-good-bg p-3 text-center">
        <p className="text-xs text-fr-good">Margin difference</p>
        <p className="text-xl font-bold text-fr-good">
          +{formatEur(diff)} <span className="text-sm font-normal">Per head</span>
        </p>
        <p className="text-xs font-medium text-fr-good">{formatPct(diffPct)} higher</p>
      </div>
    </Card>
  );
}
