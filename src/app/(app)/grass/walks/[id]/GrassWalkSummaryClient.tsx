"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CloudRain, MapPin, Sprout, Thermometer, Wind } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useFields } from "@/store/farm-store";
import { cleanSurveyTrack, type GrassSurveyMode, type SurveyFieldResult, type SurveyTrackPoint } from "@/domain/grass-survey";
import { getGrassSurveyAction, type GrassSurveyReading } from "@/app/actions/grass-surveys";
import { isUsableReadingLocation } from "@/lib/location/reading-location";
import { WalkRouteMap, type WalkMapField, type WalkMapReading } from "@/components/grass/WalkRouteMap";
import type { GrassSurveyRecord } from "@/lib/farm-data/grass-surveys";

function RouteMap({ track, mode, readings, fieldResults }: { track: SurveyTrackPoint[]; mode: GrassSurveyMode; readings: GrassSurveyReading[]; fieldResults: SurveyFieldResult[] }) {
  const storeFields = useFields();
  const route = useMemo(() => cleanSurveyTrack(track, mode), [track, mode]);
  const fields = useMemo<WalkMapField[]>(() => {
    const byId = new Map(fieldResults.map((f) => [f.fieldId, f]));
    return storeFields
      .filter((f) => f.polygon && byId.has(f.id))
      .map((f) => ({ id: f.id, name: f.name, ring: f.polygon!.coordinates[0] as number[][], coverKgDmHa: byId.get(f.id)!.coverKgDmHa }));
  }, [storeFields, fieldResults]);
  const pins = useMemo<WalkMapReading[]>(() => {
    const names = new Map(fieldResults.map((f) => [f.fieldId, f.name]));
    // Only locations accurate enough to place the reading; a vague one would stretch the map.
    return readings.flatMap((r) => (isUsableReadingLocation(r) ? [{ id: r.id, fieldName: names.get(r.fieldId) ?? "Field", coverKgDmHa: r.coverKgDmHa, lat: r.lat, lng: r.lng, accuracyM: r.accuracyM }] : []));
  }, [readings, fieldResults]);
  return <WalkRouteMap route={route} readings={pins} fields={fields} />;
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

const EMPTY_TRACK: SurveyTrackPoint[] = [];
const EMPTY_READINGS: GrassSurveyReading[] = [];
const EMPTY_RESULTS: SurveyFieldResult[] = [];

const STATUS_LABEL: Record<SurveyFieldResult["status"], string> = { measured: "", grazed: "Just grazed", skipped: "Skipped", not_visited: "Not walked" };

export function GrassWalkSummaryClient({ id }: { id: string }) {
  const [state, setState] = useState<{ loading: true } | { loading: false; error?: string; survey?: GrassSurveyRecord; track?: SurveyTrackPoint[]; readings?: GrassSurveyReading[] }>({ loading: true });

  useEffect(() => {
    let live = true;
    void getGrassSurveyAction(id).then((r) => {
      if (!live) return;
      setState(r.ok ? { loading: false, survey: r.survey, track: r.track, readings: r.readings } : { loading: false, error: r.error });
    });
    return () => { live = false; };
  }, [id]);

  if (state.loading) return <p className="py-10 text-center text-sm text-fr-v2-muted" role="status">Loading walk…</p>;
  if (!state.survey) return <p className="py-10 text-center text-sm text-fr-v2-muted">{state.error ?? "Walk not found."}</p>;

  const { survey, track = EMPTY_TRACK, readings = EMPTY_READINGS } = state;
  const located = new Set(readings.filter(isUsableReadingLocation).map((x) => x.fieldId));
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
        <RouteMap track={track} mode={survey.mode} readings={readings} fieldResults={r?.fields ?? EMPTY_RESULTS} />
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
                <span className={cn("inline-flex items-center gap-1 font-semibold", f.status !== "measured" && "font-normal text-fr-v2-muted")}>
                  {f.name}
                  {f.status === "measured" && located.has(f.fieldId) ? <MapPin className="size-3.5 text-fr-v2-muted" aria-label="Location recorded" /> : null}
                </span>
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
