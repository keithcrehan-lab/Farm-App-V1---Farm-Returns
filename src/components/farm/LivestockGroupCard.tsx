import Link from "next/link";
import { Beef, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { formatNumber } from "@/lib/format";
import type { LivestockGroup } from "@/domain/types";

/**
 * One livestock group row/card — reused in a mobile stack and a desktop
 * grid. Links through to the Livestock Economics drilldown only when that
 * group has a real economics model (see FINISHING_OPTIONS in
 * LivestockEconomicsView.tsx) — the other groups don't pretend to have a
 * working link.
 */
export function LivestockGroupCard({ group, hasEconomics = false }: { group: LivestockGroup; hasEconomics?: boolean }) {
  const content = (
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
      {hasEconomics ? <ChevronRight className="size-4 shrink-0 text-fr-ink-400" /> : null}
    </Card>
  );

  return hasEconomics ? (
    <Link href={`/livestock/${group.id}`} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}
