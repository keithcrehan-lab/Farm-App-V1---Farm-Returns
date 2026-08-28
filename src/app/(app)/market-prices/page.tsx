"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { mockMarketPrices } from "@/data/mock-farm";
import {
  agriPriceSqueezeRatio,
  latestPoint,
  trendPct,
  withRealMarketPrices,
} from "@/domain/market";
import { useIsRealMode } from "@/store/farm-store";
import { formatPct } from "@/lib/format";
import type { MarketPrice } from "@/domain/types";

const CATEGORIES: MarketPrice["category"][] = ["Cattle", "Feed", "Fertiliser"];

export default function MarketPricesPage() {
  const isRealMode = useIsRealMode();
  // Codex remediation Priority 3 — a row `withRealMarketPrices` couldn't
  // back with a real CSO observation is dropped entirely for a real
  // account, not shown unlabelled/footnoted next to real ones. Mock mode
  // keeps every row, unchanged.
  const allMarketPrices = withRealMarketPrices(mockMarketPrices);
  const marketPrices = isRealMode ? allMarketPrices.filter((p) => p.status !== undefined) : allMarketPrices;
  const mockAsOf = new Date(mockMarketPrices[0].asOf).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const squeeze = agriPriceSqueezeRatio();
  const squeezeLatest = latestPoint(squeeze);
  const squeezeMonth = new Date(`${squeezeLatest.month}-01`).toLocaleDateString("en-IE", {
    month: "short",
    year: "numeric",
  });
  const squeezePeak = squeeze.reduce((max, p) => (p.value > max.value ? p : max), squeeze[0]);
  const squeeze12moPct = trendPct(squeeze, 12);

  return (
    <>
      <div className="mb-4 lg:hidden">
        <h1 className="text-title text-fr-ink-900">Market Prices</h1>
        <p className="text-sm text-fr-ink-600">Live/benchmark cattle, feed and fertiliser prices</p>
      </div>
      <PageHeader title="Market Prices" subtitle="Live/benchmark cattle, feed and fertiliser prices" />

      <div className="flex flex-col gap-4">
        {CATEGORIES.map((category) => {
          const rows = marketPrices.filter((p) => p.category === category);
          if (rows.length === 0) return null;
          return (
            <Card key={category}>
              <CardHeader>
                <CardTitle>{category}</CardTitle>
              </CardHeader>
              <ul className="flex flex-col divide-y divide-fr-border">
                {rows.map((price) => {
                  const up = price.changePct >= 0;
                  return (
                    <li key={price.id} className="flex flex-col gap-1 py-2.5 text-sm first:pt-0 last:pb-0">
                      <span className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-fr-ink-600">
                          {price.label}
                          {price.status ? <StatusBadge status={price.status} /> : null}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="font-semibold text-fr-ink-900">
                            €{price.price}
                            <span className="text-fr-ink-400">{price.unit}</span>
                          </span>
                          <span
                            className={`flex w-16 items-center gap-0.5 text-xs font-medium ${up ? "text-fr-good" : "text-fr-risk"}`}
                          >
                            {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                            {formatPct(price.changePct)}
                          </span>
                        </span>
                      </span>
                      {price.range ? (
                        <span className="text-xs text-fr-ink-400">
                          12-month range €{price.range.low}–€{price.range.high} · month vs month
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}

        <Card>
          <CardHeader>
            <CardTitle>Price-cost squeeze</CardTitle>
            <StatusBadge status="verified" />
          </CardHeader>
          <p className="text-sm text-fr-ink-600">
            Agricultural output price index ÷ input price index (CSO AHM05, base 2020=100) — a real read on
            whether farm-gate prices are keeping up with costs, not a farm-specific revenue forecast.
          </p>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-metric font-bold text-fr-ink-900">{squeezeLatest.value.toFixed(1)}</span>
            <span className="text-xs text-fr-ink-400">as of {squeezeMonth}</span>
          </p>
          <p className="mt-1 text-xs text-fr-ink-600">
            Down {Math.abs(squeeze12moPct).toFixed(1)}% over the last 12 months, and {(squeezePeak.value - squeezeLatest.value).toFixed(1)}{" "}
            points below its {new Date(`${squeezePeak.month}-01`).toLocaleDateString("en-IE", { month: "short", year: "numeric" })}{" "}
            peak of {squeezePeak.value.toFixed(1)} — cattle prices have cooled from their spring-2025 highs while
            fertiliser costs jumped sharply in 2026.
          </p>
        </Card>
      </div>

      <p className="mt-4 text-center text-xs text-fr-ink-400">
        {isRealMode
          ? `Real CSO AJM01/AJM09 observations, latest month ${squeezeMonth} — historical, not a forecast. Farmer actual prices and supplier quotes supersede these wherever entered (spec §15 price provenance).`
          : `Bord Bia figures as of ${mockAsOf}. Cattle (weanling/store) and fertiliser rows carrying a status badge are real CSO AJM01/AJM09 observations, latest month ${squeezeMonth} — historical, not a forecast. Farmer actual prices and supplier quotes supersede these wherever entered (spec §15 price provenance).`}
      </p>
    </>
  );
}
