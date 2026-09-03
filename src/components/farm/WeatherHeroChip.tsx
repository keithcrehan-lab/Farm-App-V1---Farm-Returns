"use client";

import { useEffect, useState } from "react";
import { Thermometer } from "lucide-react";
import { weatherFreshnessLabel, weatherFreshnessTone, type StatusTone } from "@/lib/status";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

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

const toneDot: Record<StatusTone, string> = {
  good: "bg-fr-good",
  attention: "bg-fr-attention",
  risk: "bg-fr-risk",
  info: "bg-fr-info",
  neutral: "bg-white/50",
};

/**
 * Compact real-weather chip for `MapHero` overlays (Today, spec §8
 * "weather only where relevant" — item 6 of the Today required
 * hierarchy). Same real Met Éireann station pipeline as
 * `CurrentConditionsCard`, at farm level (`centroid` here is the farm's
 * own `location.centroid`, not a specific field's) — a compact glance,
 * not a replacement for the full per-field card on Field detail/Spreading.
 * Renders nothing rather than a fabricated reading when the pipeline has
 * no real data yet (`UNAVAILABLE`/no observations).
 *
 * Codex audit round 3 (Phase V1): the original three-segment
 * temp/rain/freshness-word chip read as a "dense HUD-like pill" — down
 * to one real reading (air temperature) plus a small freshness dot
 * (colour-coded via the same `weatherFreshnessTone` used elsewhere,
 * label kept as its `title` for accessibility rather than printed text).
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
  if (!data || !latest || data.status === "UNAVAILABLE") return null;

  return (
    <span
      className="flex items-center gap-1.5 rounded-full border border-white/20 bg-fr-green-900/45 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm"
      title={weatherFreshnessLabel(data.status)}
    >
      <Thermometer className="size-3.5" />
      {latest.airTemperatureC !== null ? `${formatNumber(latest.airTemperatureC, 1)}°C` : "—"}
      <span className={cn("size-1.5 rounded-full", toneDot[weatherFreshnessTone(data.status)])} />
    </span>
  );
}
