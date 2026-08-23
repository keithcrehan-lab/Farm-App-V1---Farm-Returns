"use client";

import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChevronRight, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";
import { mockCashflow, mockFinanceSummary } from "@/data/mock-farm";
import { formatEur, formatPct } from "@/lib/format";

export function CashflowCard() {
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={TrendingUp} tone="good" />
          <CardTitle>Cashflow this season</CardTitle>
        </span>
        <ChevronRight className="size-4 text-fr-ink-400" />
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
