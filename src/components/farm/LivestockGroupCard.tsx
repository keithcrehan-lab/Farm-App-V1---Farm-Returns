import { Beef } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { formatNumber } from "@/lib/format";
import type { LivestockGroup } from "@/domain/types";

/** One livestock group row/card — reused in a mobile stack and a desktop grid. */
export function LivestockGroupCard({ group }: { group: LivestockGroup }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-fr-green-100">
        <Beef className="size-5 text-fr-green-700" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-fr-ink-900">{formatNumber(group.count.value, 0)}</span>
          <span className="truncate text-sm font-medium text-fr-ink-900">{group.label}</span>
        </p>
        {group.avgWeightKg ? (
          <p className="text-xs text-fr-ink-600">Avg {formatNumber(group.avgWeightKg.value, 0)} kg</p>
        ) : null}
      </div>
      {group.statusLabel ? <Pill tone="good">{group.statusLabel}</Pill> : null}
    </Card>
  );
}
