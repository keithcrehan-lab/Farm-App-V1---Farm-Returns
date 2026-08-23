import { TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { mockMarketPrices } from "@/data/mock-farm";
import { formatPct } from "@/lib/format";
import type { MarketPrice } from "@/domain/types";

const CATEGORIES: MarketPrice["category"][] = ["Cattle", "Feed", "Fertiliser"];

export default function MarketPricesPage() {
  const asOf = new Date(mockMarketPrices[0].asOf).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <>
      <div className="mb-4 lg:hidden">
        <h1 className="text-title text-fr-ink-900">Market Prices</h1>
        <p className="text-sm text-fr-ink-600">Live/benchmark cattle, feed and fertiliser prices</p>
      </div>
      <PageHeader title="Market Prices" subtitle="Live/benchmark cattle, feed and fertiliser prices" />

      <div className="flex flex-col gap-4">
        {CATEGORIES.map((category) => {
          const rows = mockMarketPrices.filter((p) => p.category === category);
          return (
            <Card key={category}>
              <CardHeader>
                <CardTitle>{category}</CardTitle>
              </CardHeader>
              <ul className="flex flex-col divide-y divide-fr-border">
                {rows.map((price) => {
                  const up = price.changePct >= 0;
                  return (
                    <li key={price.id} className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0">
                      <span className="text-fr-ink-600">{price.label}</span>
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
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>

      <p className="mt-4 text-center text-xs text-fr-ink-400">
        Benchmark prices as of {asOf} — Bord Bia / CSO. Farmer actual prices and supplier quotes supersede these
        wherever entered (spec §15 price provenance).
      </p>
    </>
  );
}
