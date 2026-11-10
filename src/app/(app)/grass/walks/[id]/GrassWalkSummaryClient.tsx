"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CloudRain, Sprout, Thermometer, Wind } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useFields } from "@/store/farm-store";
import type { SurveyFieldResult, SurveyTrackPoint } from "@/domain/grass-survey";
import { getGrassSurveyAction } from "@/app/actions/grass-surveys";
import type { GrassSurveyRecord } from "@/lib/farm-data/grass-surveys";

const BAND_FILL = (cover: number | null) =>
  cover === null ? "#98A2B3" : cover < 1350 ? "#D98324" : cover < 1650 ? "#8BA23A" : cover < 1850 ? "#2E7D4F" : "#2563AC";

function RouteMap({ track, fieldResults }: { track: SurveyTrackPoint[]; fieldResults: SurveyFieldResult[] }) {
  const storeFields = useFields();
  const shapes = useMemo(() => {
    const byId = new Map(fieldResults.map((f) => [f.fieldId, f]));
    return storeFields.filter((f) => byId.has(f.id) && f.polygon).map((f) => ({ id: f.id, ring: f.polygon!.coordinates[0] as number[][], cover: byId.get(f.id)!.coverKgDmHa }));
  }, [storeFields, fieldResults]);

  const W = 360;
  const H = 220;
  const pad = 14;
  const all: Array<[number, number]> = [...shapes.flatMap((s) => s.ring.map((c) => [c[0], c[1]] as [number, number])), ...track.map((p) => [p.lng, p.lat] as [number, number])];
  if (all.length < 2) return <div className="flex h-40 items-center justify-center bg-fr-surface-alt text-xs text-fr-v2-muted">No route or field boundaries to draw.</div>;
  const lats = all.map((c) => c[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = all.map((c) => c[0] * k);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...lats), maxY = Math.max(...lats);
  const scale = Math.min((W - 2 * pad) / Math.max(maxX - minX, 1e-9), (H - 2 * pad) / Math.max(maxY - minY, 1e-9));
  const ox = (W - (maxX - minX) * scale) / 2;
  const oy = (H - (maxY - minY) * scale) / 2;
  const px = (lng: number, lat: number) => `${(ox + (lng * k - minX) * scale).toFixed(1)},${(oy + (maxY - lat) * scale).toFixed(1)}`;
  const route = track.filter((p) => p.accuracyM === null || p.accuracyM <= 50);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full bg-fr-surface-alt" role="img" aria-label="Walk route over your fields">
      {shapes.map((s) => (
        <polygon key={s.id} points={s.ring.map((c) => px(c[0], c[1])).join(" ")} fill={BAND_FILL(s.cover)} fillOpacity={0.28} stroke="#667085" strokeWidth={0.8} />
      ))}
      {route.length > 1 ? (
        <>
          <polyline points={route.map((p) => px(p.lng, p.lat)).join(" ")} fill="none" stroke="#D85A30" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={px(route[0].lng, route[0].lat).split(",")[0]} cy={px(route[0].lng, route[0].lat).split(",")[1]} r={5} fill="#0F6E56" />
          <circle cx={px(route.at(-1)!.lng, route.at(-1)!.lat).split(",")[0]} cy={px(route.at(-1)!.lng, route.at(-1)!.lat).split(",")[1]} r={5} fill="#A32D2D" />
        </>
      ) : null}
    </svg>
  );
}

function Stat({ label, value, extra, tone }: { label: string; value: string; extra?: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-[12px] bg-fr-surface-alt px-3 py-2.5">
      <p className="text-[11px] text-fr-v2-muted">{label}</p>
      <p className="font-mono text-lg font-semibold tabular-nums text-fr-v2-charcoal">
        {value}
        {extra ? <span className={cn("ml-1.5 text-xs", tone === "up" ? "text-fr-v2-forest" : tone === "down" ? "text-fr-red-700" : "text-fr-v2-muted")}>{extra}</span> : null}
      </p>
    </div>
  );
}

const STATUS_LABEL: Record<SurveyFieldResult["status"], string> = { measured: "", grazed: "Just grazed", skipped: "Skipped", not_visited: "Not walked" };

export function GrassWalkSummaryClient({ id }: { id: string }) {
  const [state, setState] = useState<{ loading: true } | { loading: false; error?: string; survey?: GrassSurveyRecord; track?: SurveyTrackPoint[] }>({ loading: true });

  useEffect(() => {
    let live = true;
    void getGrassSurveyAction(id).then((r) => {
      if (!live) return;
      setState(r.ok ? { loading: false, survey: r.survey, track: r.track } : { loading: false, error: r.error });
    });
    return () => { live = false; };
  }, [id]);

  if (state.loading) return <p className="py-10 text-center text-sm text-fr-v2-muted" role="status">Loading walk…</p>;
  if (!state.survey) return <p className="py-10 text-center text-sm text-fr-v2-muted">{state.error ?? "Walk not found."}</p>;

  const { survey, track = [] } = state;
  const r = survey.results;
  const w = survey.weather;
  const started = new Date(survey.startedAt);
  const dateLabel = started.toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" });
  const timeLabel = `${started.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}${survey.finishedAt ? `–${new Date(survey.finishedAt).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}` : ""}`;
  const hour = started.getHours();
  const title = `${hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening"} grass ${survey.mode === "quad" ? "run" : survey.mode === "drone" ? "flight" : "walk"}`;
  const sorted = [...(r?.fields ?? [])].sort((a, b) => Number(b.status === "measured") - Number(a.status === "measured") || (b.coverKgDmHa ?? -1) - (a.coverKgDmHa ?? -1));

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-12 text-fr-v2-graphite">
      <div className="overflow-hidden rounded-[20px] border border-fr-v2-cream-rule bg-fr-v2-cream">
        <div className="px-4 pb-3 pt-4">
          <p className="text-xs text-fr-v2-muted">{dateLabel} · {timeLabel}</p>
          <h1 className="font-display text-[26px] leading-tight">{title}</h1>
        </div>
        <RouteMap track={track} fieldResults={r?.fields ?? []} />
        {r ? (
          <div className="grid grid-cols-2 gap-2 p-4">
            <Stat label="Distance · time" value={`${(r.distanceM / 1000).toFixed(1)} km · ${r.durationMin} min`} />
            <Stat label="Fields measured" value={`${r.fieldsMeasured} of ${r.fieldsTotal}`} />
            <Stat label="Farm cover (kg DM/ha)" value={r.farmCoverKgDmHa === null ? "—" : formatNumber(r.farmCoverKgDmHa, 0)}
              extra={r.farmCoverChange === null ? undefined : `${r.farmCoverChange >= 0 ? "+" : ""}${formatNumber(r.farmCoverChange, 0)}`} tone={r.farmCoverChange === null ? undefined : r.farmCoverChange >= 0 ? "up" : "down"} />
            <Stat label="Growth (kg DM/ha/day)" value={r.farmGrowthKgDmHaDay === null ? "—" : formatNumber(r.farmGrowthKgDmHaDay, 0)}
              extra={r.farmGrowthKgDmHaDay === null ? "needs 2 walks" : `${r.farmGrowthFieldCount} ${r.farmGrowthFieldCount === 1 ? "field" : "fields"}`} />
          </div>
        ) : <p className="p-4 text-sm text-fr-v2-muted">This walk hasn&apos;t been finished yet.</p>}
        {w ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 pb-3 text-xs text-fr-v2-muted">
            {w.airTemperatureC !== null ? <span className="inline-flex items-center gap-1"><Thermometer className="size-3.5" aria-hidden />{formatNumber(w.airTemperatureC, 1)}°C</span> : null}
            {w.soilTemperatureC !== null ? <span className="inline-flex items-center gap-1"><Sprout className="size-3.5" aria-hidden />Soil {formatNumber(w.soilTemperatureC, 1)}°C</span> : null}
            {w.rainfall7dMm !== null ? <span className="inline-flex items-center gap-1"><CloudRain className="size-3.5" aria-hidden />{formatNumber(w.rainfall7dMm, 1)} mm / 7 days</span> : null}
            {w.windSpeedKmh !== null ? <span className="inline-flex items-center gap-1"><Wind className="size-3.5" aria-hidden />{w.windSpeedKmh} km/h</span> : null}
            <span className="w-full">{w.stationName ? `Met Éireann ${w.stationName}${w.distanceKm !== null ? `, ${formatNumber(w.distanceKm, 0)} km away` : ""}` : "Weather unavailable for this walk"}</span>
          </div>
        ) : <p className="px-4 pb-3 text-xs text-fr-v2-muted">Weather unavailable for this walk.</p>}
        {sorted.length ? (
          <ul className="divide-y divide-fr-v2-cream-rule border-t border-fr-v2-cream-rule px-4 text-sm">
            {sorted.map((f) => (
              <li key={f.fieldId} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className={cn("font-semibold", f.status !== "measured" && "font-normal text-fr-v2-muted")}>{f.name}</span>
                <span className="text-right text-xs text-fr-v2-muted">
                  {f.status === "measured" ? (
                    <>
                      <span className="font-mono text-sm tabular-nums text-fr-v2-charcoal">{f.coverKgDmHa === null ? "—" : formatNumber(f.coverKgDmHa, 0)}</span>
                      {" · "}
                      {f.growthKgDmHaDay !== null ? <span className="font-semibold text-fr-v2-forest">+{formatNumber(f.growthKgDmHaDay, 0)}/day</span> : f.growthNote}
                    </>
                  ) : STATUS_LABEL[f.status]}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link href="/grass" className="flex min-h-12 items-center justify-center rounded-[14px] bg-fr-v2-forest text-sm font-semibold text-white">Done</Link>
        <Link href="/grass/walks" className="flex min-h-12 items-center justify-center rounded-[14px] border border-fr-v2-cream-rule bg-fr-v2-cream text-sm font-semibold text-fr-v2-forest">Past walks</Link>
      </div>
    </div>
  );
}
