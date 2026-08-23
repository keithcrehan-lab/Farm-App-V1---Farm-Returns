import { Layers } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatEur } from "@/lib/format";
import type { CostBreakdownItem } from "@/domain/types";

export function CostBreakdownCard({ items }: { items: CostBreakdownItem[] }) {
  const totalPerHead = items.reduce((sum, i) => sum + i.costPerHeadEur, 0);
  const totalGroup = items.reduce((sum, i) => sum + i.totalGroupEur, 0);

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Layers} tone="good" />
          <div>
            <CardTitle>Cost breakdown</CardTitle>
            <p className="text-xs text-fr-ink-600">Estimated additional cost to finish</p>
          </div>
        </span>
      </CardHeader>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-fr-ink-600">
            <th className="pb-2 font-medium">Item</th>
            <th className="pb-2 text-right font-medium">Cost per head</th>
            <th className="pb-2 text-right font-medium">Total group</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.label} className="border-t border-fr-border">
              <td className="py-2 text-fr-ink-900">{item.label}</td>
              <td className="py-2 text-right text-fr-ink-600">{formatEur(item.costPerHeadEur)}</td>
              <td className="py-2 text-right text-fr-ink-600">{formatEur(item.totalGroupEur)}</td>
            </tr>
          ))}
          <tr className="border-t border-fr-border bg-fr-good-bg font-semibold text-fr-good">
            <td className="rounded-l-fr-control py-2 pl-2">Total cost</td>
            <td className="py-2 text-right">{formatEur(totalPerHead)}</td>
            <td className="rounded-r-fr-control py-2 pr-2 text-right">{formatEur(totalGroup)}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}
