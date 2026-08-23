"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { ArrowUpRight } from "lucide-react";
import { mockCashflow, mockFinanceSummary } from "@/data/mock-farm";
import { formatEur, formatPct } from "@/lib/format";

/**
 * Dark-green hero card — "Forecast Farm Margin" — the recurring headline
 * figure across Dashboard/Finance mobile screens (design-system.md
 * "Component → token mapping": FinancialHeroCard).
 */
export function MarginHeroCard() {
  return (
    <div className="rounded-fr-card bg-fr-green-900 p-5 text-white">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/70">Forecast Farm Margin</span>
      </div>
      <div className="mt-1 flex items-end justify-between gap-4">
        <div>
          <span className="text-hero font-bold leading-none">
            {formatEur(mockFinanceSummary.forecastMarginEur)}
          </span>
          <span className="mt-1 flex items-center gap-1 text-sm font-medium text-fr-green-100">
            <ArrowUpRight className="size-4" />
            {formatPct(mockFinanceSummary.marginChangePct)} vs last season
          </span>
        </div>
        <div className="h-16 w-28">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockCashflow} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="marginSpark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e3f2e8" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#e3f2e8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="cumulativeMargin"
                stroke="#e3f2e8"
                strokeWidth={2}
                fill="url(#marginSpark)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
