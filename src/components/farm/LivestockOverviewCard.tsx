import Link from "next/link";
import { Beef } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { mockLivestockGroups, totalLivestockCount } from "@/data/mock-farm";
import { formatNumber } from "@/lib/format";

export function LivestockOverviewCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Livestock Overview</CardTitle>
      </CardHeader>
      <div className="mb-3 flex items-baseline gap-2">
        <Beef className="size-5 text-fr-green-700" />
        <span className="text-2xl font-bold text-fr-ink-900">{totalLivestockCount}</span>
        <span className="text-sm text-fr-ink-600">Total Animals</span>
      </div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fr-ink-400">
        Breakdown by type
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        {mockLivestockGroups.map((group) => (
          <li key={group.id} className="flex items-center justify-between">
            <span className="text-fr-ink-600">{group.label}</span>
            <span className="font-semibold text-fr-ink-900">
              {formatNumber(group.count.value, 0)}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/livestock" className="mt-4 inline-block text-sm font-medium text-fr-green-700">
        View livestock →
      </Link>
    </Card>
  );
}
