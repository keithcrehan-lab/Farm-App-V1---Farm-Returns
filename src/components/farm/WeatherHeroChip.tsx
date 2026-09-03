"use client";

import { useEffect, useState } from "react";
import { Radio, Thermometer } from "lucide-react";
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
 * Codex audit round 3 (Phase V1) asked for less visual density (a
 * three-segment temp/rain/freshness-word chip read as "dense HUD-like");
 * the fix at the time (a bare colour dot + mouse-only `title`) went too
 * far the other way — the final whole-session audit correctly flagged
 * it as a real provenance regression: `CurrentConditionsCard`'s own rule
 * ("station name and distance are always shown alongside every reading
 * so [a farmer] never mistakes this for an in-field sensor") wasn't
 * being met, and a `title` attribute is invisible on any touch device.
 * This version keeps the same compact single-line footprint but shows
 * the real station and a real, always-visible freshness word — an
 * `aria-label` on the whole chip carries the complete sentence for
 * assistive tech that a screen-reader user can query without a hover.
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
  const station = data?.station ?? data?.nearestGeographicStation ?? null;
  if (!data || !latest || data.status === "UNAVAILABLE") return null;

  const freshness = weatherFreshnessLabel(data.status);
  const tempText = latest.airTemperatureC !== null ? `${formatNumber(latest.airTemperatureC, 1)}°C` : "—";
  const stationText = station ? `${station.canonicalName} · ${formatNumber(station.distanceKm, 1)}km` : null;

  return (
    <span
      className="flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-full border border-white/20 bg-fr-green-900/45 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm"
      aria-label={`${tempText}${stationText ? `, ${stationText} station` : ""}, ${freshness.toLowerCase()}`}
    >
      <Thermometer className="size-3.5 shrink-0" aria-hidden="true" />
      {tempText}
      {stationText ? (
        <>
          <span className="h-3 w-px shrink-0 bg-white/25" aria-hidden="true" />
          <Radio className="size-3 shrink-0 opacity-80" aria-hidden="true" />
          <span className="truncate">{stationText}</span>
        </>
      ) : null}
      <span className="h-3 w-px shrink-0 bg-white/25" aria-hidden="true" />
      <span className={cn("size-1.5 shrink-0 rounded-full", toneDot[weatherFreshnessTone(data.status)])} aria-hidden="true" />
      <span className="shrink-0">{freshness}</span>
    </span>
  );
}
