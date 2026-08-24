import { TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatEur, formatNumber } from "@/lib/format";
import type { LivestockEconomics } from "@/domain/types";

export function PerformanceForecastCard({ forecast }: { forecast: LivestockEconomics["performanceForecast"] }) {
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={TrendingUp} tone="good" />
          <div>
            <CardTitle>Performance forecast</CardTitle>
            <p className="text-xs text-fr-ink-600">If current plan continues</p>
          </div>
        </span>
      </CardHeader>
      <div className="flex flex-wrap gap-5">
        <div>
          <p className="text-xs text-fr-ink-600">Avg. daily gain</p>
          <p className="text-lg font-bold text-fr-ink-900">
            {formatNumber(forecast.avgDailyGainKg, 2)} <span className="text-sm font-normal text-fr-ink-400">kg</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Days to finish</p>
          <p className="text-lg font-bold text-fr-ink-900">
            {forecast.daysToFinish} <span className="text-sm font-normal text-fr-ink-400">days</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Forecast sale value</p>
          <p className="text-lg font-bold text-fr-ink-900">{formatEur(forecast.forecastSaleValueEur)}</p>
        </div>
      </div>
    </Card>
  );
}
