"use client";

import { useEffect, useState } from "react";
import { CloudRain, Radio, Thermometer } from "lucide-react";
import { weatherFreshnessLabel } from "@/lib/status";
import { formatNumber } from "@/lib/format";

/** Mirrors `WeatherApiResponse` in `CurrentConditionsCard.tsx` — same
 * real `/api/weather/observations` contract, a compact hero-overlay
 * presentation of it rather than a second implementation. See that
 * file's doc comment for the full field-by-field provenance note. */
interface WeatherApiResponse {
  status: "LIVE" | "STALE" | "UNAVAILABLE" | "UNVERIFIED";
  station: { canonicalName: string; distanceKm: number } | null;
  nearestGeographicStation: { canonicalName: string; distanceKm: number } | null;
  observations: Array<{ airTemperatureC: number | null }>;
  rollingRainfall: Array<{ windowHours: number; totalMm: number | null; complete: boolean }>;
}

/**
 * Compact real-weather chip for `MapHero` overlays (Today, spec §8
 * "weather only where relevant" — item 6 of the Today required
 * hierarchy). Same real Met Éireann station pipeline as
 * `CurrentConditionsCard`, at farm level (`centroid` here is the farm's
 * own `location.centroid`, not a specific field's) — a compact glance,
 * not a replacement for the full per-field card on Field detail/Spreading.
 * Renders nothing rather than a fabricated reading when the pipeline has
 * no real data yet (`UNAVAILABLE`/no observations).
 */
export function WeatherHeroChip({ centroid }: { centroid: [number, number] }) {
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
  const rolling24h = data?.rollingRainfall.find((w) => w.windowHours === 24);
  if (!data || !latest || data.status === "UNAVAILABLE") return null;

  return (
    <span className="flex items-center gap-2 rounded-full border border-white/25 bg-black/35 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
      <Thermometer className="size-3.5" />
      {latest.airTemperatureC !== null ? `${formatNumber(latest.airTemperatureC, 1)}°C` : "—"}
      <span className="h-3 w-px bg-white/25" />
      <CloudRain className="size-3.5" />
      {rolling24h?.complete && rolling24h.totalMm !== null ? `${formatNumber(rolling24h.totalMm, 1)}mm/24h` : "—"}
      <span className="h-3 w-px bg-white/25" />
      <Radio className="size-3 opacity-80" />
      {weatherFreshnessLabel(data.status)}
    </span>
  );
}
