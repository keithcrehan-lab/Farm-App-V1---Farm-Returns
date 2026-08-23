import { Beef } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatNumber } from "@/lib/format";
import type { LivestockEconomics, LivestockGroup } from "@/domain/types";

export function FeedGroupSummaryCard({ group, economics }: { group: LivestockGroup; economics: LivestockEconomics }) {
  const targetDate = new Date(economics.targetDate).toLocaleDateString("en-IE", { day: "numeric", month: "short" });

  return (
    <Card className="flex items-center gap-4">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-fr-green-100">
        <Beef className="size-6 text-fr-green-700" />
      </span>
      <div className="flex flex-1 flex-wrap gap-x-8 gap-y-2">
        <p className="basis-full text-base font-bold text-fr-ink-900">
          {formatNumber(group.count.value, 0)} {group.label}
        </p>
        <div>
          <p className="text-xs text-fr-ink-600">Current weight</p>
          <p className="text-lg font-bold text-fr-ink-900">
            {group.avgWeightKg ? formatNumber(group.avgWeightKg.value, 0) : "—"}
            <span className="text-sm font-normal text-fr-ink-400"> kg</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Goal</p>
          <p className="text-lg font-bold text-fr-ink-900">
            {formatNumber(economics.targetWeightKg, 0)}
            <span className="text-sm font-normal text-fr-ink-400"> kg by {targetDate}</span>
          </p>
        </div>
      </div>
    </Card>
  );
}
