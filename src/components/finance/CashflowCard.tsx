"use client";

import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";
import { mockCashflow, mockFinanceSummary } from "@/data/mock-farm";
import { formatEur, formatPct } from "@/lib/format";

/**
 * V3 closure pass (second pass, mock-authority audit) — every figure on
 * this card (forecast margin, its month-over-month change, the whole
 * cumulative-margin chart) is `mockFinanceSummary`/`mockCashflow`: no
 * cashflow-forecasting engine exists anywhere in this app yet (the real
 * engines that do exist — nutrient/fodder/finance cost calculators —
 * compute a snapshot, not a forward projection). Previously shown with
 * the same green "confident forecast" styling as `FeedCostOverviewCard`'s
 * real cost lines, with nothing to tell a farmer the difference — the
 * same gap Priority 8 fixed on the Dashboard, missed here.
 */
export function CashflowCard() {
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={TrendingUp} tone="good" />
          <CardTitle>Cashflow this season</CardTitle>
        </span>
        <Pill tone="neutral">Sample data</Pill>
      </CardHeader>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-metric font-bold text-fr-ink-900">
          {formatEur(mockFinanceSummary.forecastMarginEur)}
        </span>
        <Pill tone="good">{formatPct(mockFinanceSummary.marginChangePct)}</Pill>
      </div>
      <p className="mb-2 text-xs text-fr-ink-600">Forecast margin</p>
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mockCashflow} margin={{ top: 4, right: 16, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "var(--fr-ink-400)" }}
              axisLine={false}
              tickLine={false}
              interval={1}
              tickMargin={4}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--fr-ink-400)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `€${Math.round(v / 1000)}k`}
            />
            <Line
              type="monotone"
              dataKey="cumulativeMargin"
              stroke="var(--fr-status-good)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--fr-status-good)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
