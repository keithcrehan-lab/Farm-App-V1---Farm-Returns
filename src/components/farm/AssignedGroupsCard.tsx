import Link from "next/link";
import { Beef, Check, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatNumber } from "@/lib/format";
import type { LivestockGroup } from "@/domain/types";

/**
 * Housing links to *existing* livestock groups rather than re-asking
 * headcount — spec §6 "link the shed to previously entered animal groups".
 */
export function AssignedGroupsCard({ groups }: { groups: LivestockGroup[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assigned animal groups</CardTitle>
      </CardHeader>
      <ul className="flex flex-col divide-y divide-fr-border">
        {groups.map((group) => (
          <li key={group.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-fr-green-100">
              <Beef className="size-5 text-fr-green-700" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="text-base font-bold text-fr-ink-900">
                  {formatNumber(group.count.value, 0)}
                </span>
                <span className="text-sm text-fr-ink-900">{group.label}</span>
              </span>
              {group.avgWeightKg ? (
                <span className="block text-xs text-fr-ink-600">
                  {formatNumber(group.avgWeightKg.value, 0)} kg average
                </span>
              ) : null}
            </span>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fr-good-bg text-fr-good">
              <Check className="size-4" />
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/livestock"
        className="mt-3 flex items-center justify-between border-t border-fr-border pt-3 text-sm font-medium text-fr-ink-900"
      >
        Manage animal groups
        <ChevronRight className="size-4 text-fr-ink-400" />
      </Link>
    </Card>
  );
}
