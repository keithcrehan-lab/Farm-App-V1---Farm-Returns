import Link from "next/link";
import { Beef, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { formatNumber } from "@/lib/format";
import { livestockCategoryLabel } from "@/lib/status";
import { livestockLabelCategoryConflict } from "@/lib/livestock-label-category";
import type { LivestockGroup } from "@/domain/types";

/**
 * One livestock group row/card — reused in a mobile stack and a desktop
 * grid. Links through to the Livestock Economics drilldown only when that
 * group has a real economics model (see FINISHING_OPTIONS in
 * LivestockEconomicsView.tsx) — the other groups don't pretend to have a
 * working link.
 */
export function LivestockGroupCard({ group, hasEconomics = false }: { group: LivestockGroup; hasEconomics?: boolean }) {
  const labelConflict = livestockLabelCategoryConflict(group);
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
        {/* Grassland Fertiliser Pilot Completion, Checkpoint A (audit
            finding F9) — the real category driving this group's own
            N/LU stocking calculations, exposed alongside the farmer's
            own free-text label (a real audited group labelled
            "weanlings" was stored as `category: "suckler_cow"`). */}
        <p className="text-xs text-fr-ink-600">
          Calculated as {livestockCategoryLabel(group.category)}
          {group.avgWeightKg ? ` · Avg ${formatNumber(group.avgWeightKg.value, 0)} kg` : ""}
        </p>
        {labelConflict ? (
          <p role="note" className="mt-1 text-xs font-medium text-fr-attention">
            Check this group: it is named “{labelConflict.label}” but its category is{" "}
            {livestockCategoryLabel(labelConflict.category)}. The category changes the stocking rate used for fertiliser — edit it if it is wrong.
          </p>
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
