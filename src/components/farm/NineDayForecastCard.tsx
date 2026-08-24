"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CloudRain, Info, Thermometer, Wind } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { weatherFreshnessLabel, weatherFreshnessTone } from "@/lib/status";
import { formatNumber, formatWindDirection } from "@/lib/format";
import { forecastSymbolDisplay } from "@/lib/forecast-symbols";
import {
  calculateForecastRainfallTotals,
  forecastTemperatureRange,
  groupForecastPointsByLocalDay,
  strongestForecastWind,
  type ForecastDaySummary,
} from "@/domain/weather-forecast";

/** Mirrors `ForecastResult`/`ForecastPoint` (src/server/weather/) field for
 * field — declared locally rather than imported so this client component
 * never pulls in the `server-only`-guarded forecast pipeline, even by
 * type. Same pattern as `CurrentConditionsCard`. Every field is kept
 * (including ones this card doesn't render) because `data.points` is
 * passed straight into the `src/domain/weather-forecast.ts` aggregation
 * functions, which are typed against the real `ForecastPoint` shape. */
interface ForecastApiPoint {
  validAt: string;
  airTemperatureC: number | null;
  windSpeedMps: number | null;
  windDirectionDeg: number | null;
  windGustMps: number | null;
  humidityPct: number | null;
  pressureHPa: number | null;
  cloudinessPct: number | null;
  rainfallMm: number | null;
  rainfallWindowStartIso: string | null;
  symbolId: string | null;
  source: string;
  retrievedAt: string;
}

interface ForecastApiResponse {
  status: "LIVE" | "STALE" | "UNAVAILABLE" | "UNVERIFIED";
  points: ForecastApiPoint[];
  modelRunAt: string | null;
  reason?: string;
  retrievedAt: string;
}

const FORECAST_SOURCE_LABEL = "Met Éireann";
const ROLLING_HORIZONS = [24, 72] as const; // "next 24 hours", "next 3 days"

/**
 * "9-Day Farm Forecast" — real Met Éireann point-forecast data from
 * `GET /api/weather/forecast` (`src/server/weather/forecast-provider.ts`
 * — see its doc comment and `docs/evidence-register.md` for the live
 * verification evidence). Deliberately separate from
 * `CurrentConditionsCard` (observations): forecast and observation data
 * are never merged into one provenance-ambiguous panel — see
 * `forecast-provider.ts`'s own doc comment.
 *
 * Renders only what the pipeline actually returns. No spreading
 * suitability, score, or recommendation is derived here — see
 * `spreading.ts`'s doc comment for why a composite score isn't
 * implemented, and `SpreadingSuitabilityValidationCard` for how the
 * page presents that gap to a farmer instead of a fabricated score.
 */
export function NineDayForecastCard({ centroid }: { centroid: [number, number] | null }) {
  const [data, setData] = useState<ForecastApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const validCentroid = centroid !== null && Number.isFinite(centroid[0]) && Number.isFinite(centroid[1]);
  const lng = validCentroid ? centroid![0] : null;
  const lat = validCentroid ? centroid![1] : null;

  useEffect(() => {
    // No setState here when invalid — the render below already checks
    // `!validCentroid` before it ever looks at `loading`/`data`, so
    // there's nothing for this branch to synchronise.
    if (!validCentroid) return;
    let cancelled = false;
    fetch(`/api/weather/forecast?lat=${lat}&lng=${lng}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [validCentroid, lat, lng]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <CalendarDays className="size-4 text-fr-green-700" />
          9-Day Farm Forecast
        </CardTitle>
        {data ? <Pill tone={weatherFreshnessTone(data.status)}>{weatherFreshnessLabel(data.status)}</Pill> : null}
      </CardHeader>

      {!validCentroid ? (
        <p className="text-sm text-fr-ink-600">No farm location set — add your farm&apos;s location to see a forecast.</p>
      ) : loading ? (
        <p className="text-sm text-fr-ink-400">Loading real Met Éireann forecast…</p>
      ) : !data || data.points.length === 0 ? (
        <div className="text-sm text-fr-ink-600">
          <p>No real forecast available right now.</p>
          {data?.reason ? <p className="mt-1 text-xs text-fr-ink-400">{data.reason}</p> : null}
        </div>
      ) : (
        <ForecastBody data={data} />
      )}
    </Card>
  );
}

function ForecastBody({ data }: { data: ForecastApiResponse }) {
  const now = new Date(data.retrievedAt);
  const days = groupForecastPointsByLocalDay(data.points, now, 9);
  const rainfallTotals = calculateForecastRainfallTotals(data.points, now, ROLLING_HORIZONS, {
    source: FORECAST_SOURCE_LABEL,
    retrievedAt: data.retrievedAt,
  });
  const rain24h = rainfallTotals.find((r) => r.hoursAhead === 24);
  const rain3d = rainfallTotals.find((r) => r.hoursAhead === 72);
  const tempRange = forecastTemperatureRange(data.points);
  const strongestWind = strongestForecastWind(data.points);

  const hasSummary = Boolean(
    (rain24h?.complete && rain24h.totalMm !== null) ||
      (rain3d?.complete && rain3d.totalMm !== null) ||
      strongestWind ||
      tempRange,
  );

  return (
    <div className="flex flex-col gap-4">
      {hasSummary ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-fr-ink-700">
          {rain24h?.complete && rain24h.totalMm !== null ? (
            <SummaryStat icon={CloudRain} text={`${formatNumber(rain24h.totalMm, 1)}mm forecast over the next 24 hours`} />
          ) : null}
          {rain3d?.complete && rain3d.totalMm !== null ? (
            <SummaryStat icon={CloudRain} text={`${formatNumber(rain3d.totalMm, 1)}mm forecast over the next 3 days`} />
          ) : null}
          {strongestWind ? (
            <SummaryStat icon={Wind} text={`Strongest forecast wind: ${formatNumber(strongestWind.speedMps, 1)} m/s`} />
          ) : null}
          {tempRange ? (
            <SummaryStat
              icon={Thermometer}
              text={`Forecast temperatures: ${formatNumber(tempRange.minC, 0)}–${formatNumber(tempRange.maxC, 0)}°C`}
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible lg:grid-cols-9">
        {days.map((day) => (
          <DayCard key={day.date} day={day} />
        ))}
      </div>

      <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-fr-ink-400">
        <Info className="size-3.5 shrink-0" />
        <span>Source: {FORECAST_SOURCE_LABEL}</span>
        <span>
          · Forecast model run:{" "}
          {data.modelRunAt
            ? new Date(data.modelRunAt).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
            : "unavailable"}
        </span>
        <span>
          · Retrieved{" "}
          {new Date(data.retrievedAt).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
      </p>
    </div>
  );
}

function DayCard({ day }: { day: ForecastDaySummary }) {
  const { icon: Icon, label } = forecastSymbolDisplay(day.representativeSymbolId);
  return (
    <div className="flex min-w-[92px] shrink-0 flex-col items-center gap-1 rounded-fr-control border border-fr-border bg-fr-surface-alt p-2.5 text-center sm:min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-fr-ink-900">{day.dayLabel}</p>
      <Icon className="size-5 text-fr-info" />
      <p className="text-sm font-semibold text-fr-ink-900">
        {day.tempMinC !== null && day.tempMaxC !== null ? `${formatNumber(day.tempMinC, 0)}–${formatNumber(day.tempMaxC, 0)}°C` : "—"}
      </p>
      <p className="text-xs text-fr-ink-600">
        {day.rainfallComplete && day.rainfallTotalMm !== null ? `${formatNumber(day.rainfallTotalMm, 1)}mm` : "—"}
      </p>
      <p className="text-[11px] text-fr-ink-400">
        {day.maxWindSpeedMps !== null
          ? `Wind ${formatNumber(day.maxWindSpeedMps, 1)} m/s${day.windDirectionDeg !== null ? ` ${formatWindDirection(day.windDirectionDeg)}` : ""}`
          : "Wind —"}
      </p>
      <p className="text-[11px] text-fr-ink-400">{label}</p>
    </div>
  );
}

function SummaryStat({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon className="size-3.5 text-fr-info" />
      {text}
    </span>
  );
}
