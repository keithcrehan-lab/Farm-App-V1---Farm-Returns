"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Info } from "lucide-react";
import { mockCashflow, mockFinanceSummary } from "@/data/mock-farm";
import { useIsRealMode } from "@/store/farm-store";
import { formatEur, formatPct } from "@/lib/format";

/**
 * Dark-green hero card — "Forecast Farm Margin" — the recurring headline
 * figure across Dashboard/Finance mobile screens (design-system.md
 * "Component → token mapping": FinancialHeroCard).
 *
 * `detailed` adds the season selector and the revenue/operating-cost
 * breakdown row (Finance page); the compact form (Dashboard KPI row)
 * omits both.
 *
 * Codex remediation Priority 3 — a real signed-in farm account no longer
 * sees this card's numbers at all, "Sample data" label or not: no
 * cashflow-forecasting engine exists anywhere in this app yet (no real
 * sales-log/revenue-tracking feature), so every figure here is Phase 1
 * illustrative data, and the brief is explicit that labelling a fabricated
 * number is not the fix — an honest empty/setup state is. Mock mode
 * (design review/demo) is unchanged.
 */
export function MarginHeroCard({ detailed = false }: { detailed?: boolean }) {
  const isRealMode = useIsRealMode();

  if (isRealMode) {
    return (
      <div className="relative overflow-hidden rounded-fr-card bg-fr-green-900 p-5 text-white">
        <span className="flex items-center gap-1.5 text-sm text-white/70">Forecast Farm Margin</span>
        <p className="relative mt-2 text-sm text-white/80">
          No real sales/revenue data recorded yet — this needs a sales log this app doesn&apos;t capture yet, so no
          margin forecast is shown.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-fr-card bg-fr-green-900 p-5 text-white">
      {detailed ? (
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(15,40,24,0.9), rgba(15,40,24,0.3)), radial-gradient(ellipse at bottom, #4a6b3f, #0f2818 70%)",
          }}
        />
      ) : null}
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm text-white/70">
          Forecast Farm Margin
          {detailed ? <Info className="size-3.5" /> : null}
          {/* V3 closure pass, Priority 8 — no real sales-log/revenue-
              tracking feature exists in this app yet; every figure below
              is illustrative, not calculated from real farm data. */}
          <span className="rounded-full border border-white/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/60">
            Sample data
          </span>
        </span>
        {detailed ? (
          <span className="flex items-center gap-1 rounded-full border border-white/25 px-3 py-1 text-xs font-medium">
            This season
            <ChevronDown className="size-3.5" />
          </span>
        ) : null}
      </div>
      <div className="relative mt-1 flex items-end justify-between gap-4">
        <div>
          <span className="text-hero font-bold leading-none">
            {formatEur(mockFinanceSummary.forecastMarginEur)}
          </span>
          <span className="mt-1 flex items-center gap-1 text-sm font-medium text-fr-green-100">
            <ArrowUpRight className="size-4" />
            {formatPct(mockFinanceSummary.marginChangePct)} vs last season
          </span>
        </div>
        {!detailed ? (
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
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>

      {detailed ? (
        <div className="relative mt-4 flex gap-8 border-t border-white/15 pt-4">
          <div>
            <p className="text-xs text-white/70">Total revenue</p>
            <p className="flex items-baseline gap-1.5 text-lg font-bold">
              {formatEur(mockFinanceSummary.totalRevenueEur)}
              <span className="flex items-center text-xs font-medium text-fr-green-100">
                <ArrowUpRight className="size-3" />
                {formatPct(mockFinanceSummary.revenueChangePct)}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs text-white/70">Operating cost</p>
            <p className="flex items-baseline gap-1.5 text-lg font-bold">
              {formatEur(mockFinanceSummary.totalCostsEur)}
              <span className="flex items-center text-xs font-medium text-orange-200">
                {mockFinanceSummary.costsChangePct >= 0 ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownRight className="size-3" />
                )}
                {formatPct(mockFinanceSummary.costsChangePct)}
              </span>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
