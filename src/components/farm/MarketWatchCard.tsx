import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { mockMarketPrices } from "@/data/mock-farm";
import { withRealMarketPrices } from "@/domain/market";
import { formatPct } from "@/lib/format";

export function MarketWatchCard() {
  const marketPrices = withRealMarketPrices(mockMarketPrices);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Watch</CardTitle>
        <span className="text-xs text-fr-ink-400">Live prices</span>
      </CardHeader>
      <ul className="flex flex-col gap-2.5 text-sm">
        {marketPrices.map((price) => {
          const up = price.changePct >= 0;
          return (
            <li key={price.id} className="flex items-center justify-between">
              <span className="text-fr-ink-600">{price.label}</span>
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
