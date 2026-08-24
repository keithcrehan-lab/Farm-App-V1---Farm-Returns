"use client";

import { useEffect, useState } from "react";
import { CloudRain, Droplets, Radio, Thermometer, Wind } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { weatherFreshnessLabel, weatherFreshnessTone } from "@/lib/status";
import { formatNumber } from "@/lib/format";

/** Mirrors `WeatherForFieldResult`/`WeatherObservation`
 * (src/server/weather/) — declared locally rather than imported so this
 * client component never pulls in the `server-only`-guarded pipeline,
 * even by type. Kept structurally in sync deliberately, not by import. */
interface WeatherApiResponse {
  status: "LIVE" | "STALE" | "UNAVAILABLE" | "UNVERIFIED";
  station: { canonicalName: string; distanceKm: number } | null;
  nearestGeographicStation: { canonicalName: string; distanceKm: number } | null;
  fallbackUsed: boolean;
  observations: Array<{
    observedAt: string;
    rainfallMm: number | null;
    airTemperatureC: number | null;
    windSpeedMps: number | null;
    relativeHumidityPct: number | null;
  }>;
  rollingRainfall: Array<{ windowHours: number; totalMm: number | null; complete: boolean }>;
  reason?: string;
  retrievedAt: string;
}

/**
 * Real current conditions for the farm, from Met Éireann's EDR API via
 * `GET /api/weather/observations` (`src/server/weather/weather-service.ts`
 * — see its doc comment and `docs/evidence-register.md` for the live
 * verification evidence). Renders exactly what the pipeline reports —
 * LIVE/STALE/UNAVAILABLE/UNVERIFIED — and never fabricates a reading the
 * API didn't return. CLAUDE.md: this is real Met Éireann STATION data,
 * not an in-field sensor — the station name and distance are always
 * shown alongside every reading so that distinction stays visible.
 */
export function CurrentConditionsCard({ centroid }: { centroid: [number, number] }) {
  const [data, setData] = useState<WeatherApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/weather/observations?lat=${centroid[1]}&lng=${centroid[0]}`)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- centroid is a tuple literal; compare by value below
  }, [centroid[0], centroid[1]]);

  const station = data?.station ?? data?.nearestGeographicStation ?? null;
  const latest = data?.observations[data.observations.length - 1];
  const rolling24h = data?.rollingRainfall.find((w) => w.windowHours === 24);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Radio className="size-4 text-fr-green-700" />
          Current conditions
        </CardTitle>
        {data ? <Pill tone={weatherFreshnessTone(data.status)}>{weatherFreshnessLabel(data.status)}</Pill> : null}
      </CardHeader>

      {loading ? (
        <p className="text-sm text-fr-ink-400">Loading real Met Éireann station data…</p>
      ) : !data || !latest ? (
        <div className="text-sm text-fr-ink-600">
          <p>No real observation available right now.</p>
          {data?.reason ? <p className="mt-1 text-xs text-fr-ink-400">{data.reason}</p> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              icon={Thermometer}
              label="Air temp"
              value={latest.airTemperatureC !== null ? `${formatNumber(latest.airTemperatureC, 1)}°C` : "—"}
            />
            <Stat
              icon={CloudRain}
              label="Rain (24h)"
              value={rolling24h?.complete && rolling24h.totalMm !== null ? `${formatNumber(rolling24h.totalMm, 1)}mm` : "—"}
            />
            <Stat
              icon={Wind}
              label="Wind"
              value={latest.windSpeedMps !== null ? `${formatNumber(latest.windSpeedMps, 1)} m/s` : "—"}
            />
            <Stat
              icon={Droplets}
              label="Humidity"
              value={latest.relativeHumidityPct !== null ? `${formatNumber(latest.relativeHumidityPct, 0)}%` : "—"}
            />
          </div>

          {station ? (
            <p className="text-xs text-fr-ink-400">
              {station.canonicalName} station, {formatNumber(station.distanceKm, 1)}km away
              {data.fallbackUsed ? " (nearest station with confirmed live data)" : ""} · as of{" "}
              {new Date(latest.observedAt).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-fr-control bg-fr-surface-alt py-2.5 text-center">
      <Icon className="size-4 text-fr-info" />
      <p className="text-sm font-semibold text-fr-ink-900">{value}</p>
      <p className="text-[11px] text-fr-ink-400">{label}</p>
    </div>
  );
}
