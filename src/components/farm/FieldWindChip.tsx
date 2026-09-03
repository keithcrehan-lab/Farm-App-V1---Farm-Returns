"use client";

import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { formatNumber, formatWindDirection } from "@/lib/format";

/** Mirrors the real `/api/weather/observations` contract other real
 * weather consumers already use (`WeatherHeroChip`/`CurrentConditionsCard`)
 * — only the two real fields this chip needs. */
interface WeatherApiResponse {
  status: "LIVE" | "STALE" | "UNAVAILABLE" | "UNVERIFIED";
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

  return (
    <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-fr-green-900/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
      <Compass className="size-3.5" aria-hidden="true" />
      {formatWindDirection(latest.windDirectionDeg)} · {formatNumber(latest.windSpeedMps, 0)} m/s
    </span>
  );
}
