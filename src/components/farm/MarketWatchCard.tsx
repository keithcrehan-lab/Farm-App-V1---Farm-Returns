import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pill, StatusBadge } from "@/components/ui/StatusBadge";
import { mockMarketPrices } from "@/data/mock-farm";
import { withRealMarketPrices } from "@/domain/market";
import { useIsRealMode } from "@/store/farm-store";
import { formatPct } from "@/lib/format";

/**
 * V3 closure pass (second pass, mock-authority audit) — `withRealMarketPrices`
 * genuinely overrides several rows with real CSO AJM01/AJM09 observations
 * (src/domain/market.ts), but those are the latest available MONTHLY
 * historical figures, not a real-time feed — and rows it doesn't match
 * (Beef/Heifer per-kg, Feed ingredients) stay plain mock figures. The
 * previous "Live prices" label was inaccurate for both cases (see the
 * full /market-prices page's own honest footer, which this summary card
 * didn't match).
 *
 * Codex remediation Priority 3 — a "Sample data" pill on an unmatched row
 * is not sufficient for a real signed-in farm account: this dataset is a
 * shared market reference (not this farm's own data), and a row
 * `withRealMarketPrices` couldn't back with a real CSO observation is
 * dropped entirely for a real account rather than shown fabricated.
 * Mock mode keeps every row (labelled) — its job is demonstrating the
 * full illustrative dataset.
 */
export function MarketWatchCard() {
  const isRealMode = useIsRealMode();
  const allMarketPrices = withRealMarketPrices(mockMarketPrices);
  const marketPrices = isRealMode ? allMarketPrices.filter((p) => p.status !== undefined) : allMarketPrices;

  if (marketPrices.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Watch</CardTitle>
        </CardHeader>
        <p className="text-sm text-fr-ink-600">No real market price series available right now.</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Watch</CardTitle>
        <span className="text-xs text-fr-ink-400">Latest available</span>
      </CardHeader>
      <ul className="flex flex-col gap-2.5 text-sm">
        {marketPrices.map((price) => {
          const up = price.changePct >= 0;
          return (
            <li key={price.id} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-fr-ink-600">
                {price.label}
                {price.status ? (
                  <StatusBadge status={price.status} />
                ) : (
                  <Pill tone="neutral">Sample data</Pill>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold text-fr-ink-900">
                  €{price.price}
                  <span className="text-fr-ink-400">{price.unit}</span>
                </span>
                <span
                  className={`flex items-center gap-0.5 text-xs font-medium ${up ? "text-fr-good" : "text-fr-risk"}`}
                >
                  {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                  {formatPct(price.changePct)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <Link href="/market-prices" className="mt-4 inline-block text-sm font-medium text-fr-green-700">
        View all prices →
      </Link>
    </Card>
  );
}
