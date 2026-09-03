"use client";

import { useEffect, useState } from "react";
import { Compass, Radio } from "lucide-react";
import { formatNumber, formatWindDirection } from "@/lib/format";
import { metresPerSecondToKmPerHour } from "@/domain/wind-speed";
import { weatherFreshnessLabel, weatherFreshnessTone, type StatusTone } from "@/lib/status";
import { cn } from "@/lib/cn";

const toneDot: Record<StatusTone, string> = {
  good: "bg-fr-good",
  attention: "bg-fr-attention",
  risk: "bg-fr-risk",
  info: "bg-fr-info",
  neutral: "bg-white/50",
};

/** Mirrors `WeatherApiResponse` in `WeatherHeroChip.tsx`/`CurrentConditionsCard.tsx`
 * — same real `/api/weather/observations` contract, the fields this chip
 * needs (final whole-session Codex audit, HIGH: the wind reading itself
 * was shown with no station/freshness provenance at all — `station`/
 * `nearestGeographicStation`/`status` added so this chip can carry the
 * same provenance every other weather consumer already does). */
interface WeatherApiResponse {
  status: "LIVE" | "STALE" | "UNAVAILABLE" | "UNVERIFIED";
  station: { canonicalName: string; distanceKm: number } | null;
  nearestGeographicStation: { canonicalName: string; distanceKm: number } | null;
  observations: Array<{ windSpeedMps: number | null; windDirectionDeg: number | null }>;
}

/**
 * Strict Visual Reproduction phase (2026-09-03) — Field detail's own
 * real wind fact (media/image3.png's own literal "SW · 12 km/h" chip).
 * Same real Met Éireann station pipeline as every other weather
 * consumer in this app, at the selected field's own real centroid.
 * `formatWindDirection` (`lib/format.ts`) is a standard, non-invented
 * 16-point compass conversion, not a domain calculation. Renders
 * nothing when either real value is unavailable — never a guessed
 * direction or speed.
 *
 * Final whole-session Codex audit (HIGH x2): the km/h conversion now
 * comes from `src/domain/wind-speed.ts` (a pure, tested module), not an
 * inline `* 3.6` here; and the reading now always shows its real
 * station and freshness alongside it — `CurrentConditionsCard`'s own
 * rule ("station name and distance are always shown alongside every
 * reading so a farmer never mistakes this for an in-field sensor")
 * applied here too, not just on the whole-farm chip.
 */
export function FieldWindChip({ centroid }: { centroid: [number, number] }) {
  const [data, setData] = useState<WeatherApiResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/weather/observations?lat=${centroid[1]}&lng=${centroid[0]}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- centroid is a tuple literal; compare by value
  }, [centroid[0], centroid[1]]);

  const latest = data?.observations[data.observations.length - 1];
  if (!data || !latest || data.status === "UNAVAILABLE" || latest.windSpeedMps === null || latest.windDirectionDeg === null) {
    return null;
  }

  const station = data.station ?? data.nearestGeographicStation;
  const windKmh = metresPerSecondToKmPerHour(latest.windSpeedMps);
  const freshness = weatherFreshnessLabel(data.status);

  return (
    <span
      className="flex max-w-[220px] items-center gap-1.5 rounded-full border border-white/20 bg-fr-green-900/55 px-3.5 py-2 text-sm font-medium text-white backdrop-blur-md"
      aria-label={`Wind ${formatWindDirection(latest.windDirectionDeg)} ${formatNumber(windKmh, 0)} km/h${
        station ? `, ${station.canonicalName} station` : ""
      }, ${freshness.toLowerCase()}`}
    >
      <Compass className="size-4 shrink-0" aria-hidden="true" />
      {formatWindDirection(latest.windDirectionDeg)} · {formatNumber(windKmh, 0)} km/h
      {station ? (
        <>
          <span className="h-3 w-px shrink-0 bg-white/25" aria-hidden="true" />
          <Radio className="size-3 shrink-0 opacity-80" aria-hidden="true" />
          <span className="truncate text-xs">{station.canonicalName}</span>
        </>
      ) : null}
      <span className="h-3 w-px shrink-0 bg-white/25" aria-hidden="true" />
      <span className={cn("size-1.5 shrink-0 rounded-full", toneDot[weatherFreshnessTone(data.status)])} aria-hidden="true" />
    </span>
  );
}
