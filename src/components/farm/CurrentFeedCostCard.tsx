import { ChevronDown, Sprout } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatEur } from "@/lib/format";
import type { LivestockEconomics } from "@/domain/types";

export function CurrentFeedCostCard({ feed }: { feed: LivestockEconomics["currentFeedCost"] }) {
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Sprout} tone="good" />
          <div>
            <CardTitle>Current feed cost</CardTitle>
            <p className="text-xs text-fr-ink-600">Based on current diet</p>
          </div>
        </span>
      </CardHeader>
      <div className="flex gap-6">
        <div>
          <p className="text-xs text-fr-ink-600">Per head per day</p>
          <p className="text-lg font-bold text-fr-ink-900">{formatEur(feed.perHeadPerDayEur, true)}</p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Total group per day</p>
          <p className="text-lg font-bold text-fr-ink-900">{formatEur(feed.totalGroupPerDayEur, true)}</p>
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1 text-xs font-medium text-fr-good">
        {formatEur(feed.changeVsLastWeekEur, true)} vs last week
        <ChevronDown className="size-3.5" />
      </p>
    </Card>
  );
}
