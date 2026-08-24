import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { mockInputRequirements, mockInputPlannerSummary } from "@/data/mock-farm";
import { formatEur, formatNumber } from "@/lib/format";

export function InputSummaryCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Input Summary</CardTitle>
        <span className="text-xs text-fr-ink-400">2026 Requirements</span>
      </CardHeader>
      <ul className="flex flex-col gap-2 text-sm">
        {mockInputRequirements.map((input) => (
          <li key={input.id} className="flex items-center justify-between">
            <span className="text-fr-ink-600">{input.label}</span>
            <span className="flex items-baseline gap-3">
              <span className="text-fr-ink-400">
                {formatNumber(input.requiredQty.value, 1)} {input.unit}
              </span>
              <span className="w-16 text-right font-semibold text-fr-ink-900">
                {formatEur(input.estCost.value)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-fr-border pt-3 text-sm font-semibold text-fr-ink-900">
        <span>Total</span>
        <span>{formatEur(mockInputPlannerSummary.forecastSpendEur)}</span>
      </div>
      <Link href="/input-planner" className="mt-4 inline-block text-sm font-medium text-fr-green-700">
        View input planner →
      </Link>
    </Card>
  );
}
