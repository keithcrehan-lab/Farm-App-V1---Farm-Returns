"use client";

import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { HelpCircle, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";
import { mockCashflow, mockFinanceSummary } from "@/data/mock-farm";
import { useIsRealMode } from "@/store/farm-store";
import { formatEur, formatPct } from "@/lib/format";

/**
 * Codex remediation Priority 3 — every figure on this card (forecast
 * margin, its month-over-month change, the whole cumulative-margin chart)
 * is `mockFinanceSummary`/`mockCashflow`: no cashflow-forecasting engine
 * exists anywhere in this app yet. A real signed-in farm account no
 * longer sees these numbers at all — a "Sample data" label is not
 * sufficient per the brief; an honest empty state replaces the whole
 * card body instead. Mock mode (design review/demo) is unchanged.
 */
export function CashflowCard() {
  const isRealMode = useIsRealMode();

  if (isRealMode) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-3">
            <IconChip icon={HelpCircle} tone="neutral" />
            <CardTitle>Cashflow this season</CardTitle>
          </span>
          <Pill tone="neutral">Unavailable</Pill>
        </CardHeader>
        <p className="text-sm text-fr-ink-600">
          No cashflow forecast engine exists yet — this needs a real sales log/revenue-tracking feature this app
          doesn&apos;t have yet.
        </p>
      </Card>
    );
  }

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
