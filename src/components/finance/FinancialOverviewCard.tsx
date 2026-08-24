import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { mockFinanceSummary } from "@/data/mock-farm";
import { formatEur } from "@/lib/format";

/**
 * Revenue vs. costs donut. Hand-rolled SVG (not a charting library) — this
 * is two stroked arcs on a circle, simple and reliable to keep predictable
 * inside a narrow desktop grid card.
 */
function RevenueCostDonut({ revenue, costs, size = 96, strokeWidth = 12 }: {
  revenue: number;
  costs: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = revenue + costs;
  const revenueLength = (revenue / total) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--fr-status-risk)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--fr-status-good)"
        strokeWidth={strokeWidth}
        strokeDasharray={`${revenueLength} ${circumference - revenueLength}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FinancialOverviewCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial Overview</CardTitle>
        <span className="text-xs text-fr-ink-400">This Season</span>
      </CardHeader>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <RevenueCostDonut
            revenue={mockFinanceSummary.totalRevenueEur}
            costs={mockFinanceSummary.totalCostsEur}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-bold leading-none text-fr-ink-900">
              {formatEur(mockFinanceSummary.forecastMarginEur)}
            </span>
            <span className="mt-1 text-[10px] text-fr-ink-400 leading-none">Margin</span>
          </div>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
          <li className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-fr-ink-600">
              <span className="size-2 shrink-0 rounded-full bg-fr-good" />
              Revenue
            </span>
            <span className="font-semibold text-fr-ink-900">
              {formatEur(mockFinanceSummary.totalRevenueEur)}
            </span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-fr-ink-600">
              <span className="size-2 shrink-0 rounded-full bg-fr-risk" />
              Costs
            </span>
            <span className="font-semibold text-fr-ink-900">
              {formatEur(mockFinanceSummary.totalCostsEur)}
            </span>
          </li>
        </ul>
      </div>
      <Link href="/finance" className="mt-4 inline-block text-sm font-medium text-fr-green-700">
        View full report →
      </Link>
    </Card>
  );
}
