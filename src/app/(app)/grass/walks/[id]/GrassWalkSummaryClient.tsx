"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
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

/** One quiet label/value row on the dark panel, as on the selected-field panel. */
function Row({ label, value, tone = "fact" }: { label: string; value: ReactNode; tone?: "fact" | "unknown" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/50">{label}</dt>
      <dd className={cn("min-w-0 text-right text-[13px] tabular-nums", tone === "unknown" ? "italic text-white/50" : "text-white/90")}>{value}</dd>
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

  const kind = survey.mode === "quad" ? "run" : survey.mode === "drone" ? "flight" : "walk";
  const weatherBits = w
    ? [
        w.airTemperatureC !== null ? `${formatNumber(w.airTemperatureC, 1)}°C air` : null,
        w.soilTemperatureC !== null ? `${formatNumber(w.soilTemperatureC, 1)}°C soil` : null,
        w.rainfall7dMm !== null ? `${formatNumber(w.rainfall7dMm, 1)} mm / 7 days` : null,
        w.windSpeedKmh !== null ? `${w.windSpeedKmh} km/h wind` : null,
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="mx-auto max-w-xl pb-12 text-fr-v2-graphite">
      {/* The farm is the hero: the walk drawn on the real satellite map, edge to edge. */}
      <RouteMap track={track} mode={survey.mode} readings={readings} fieldResults={r?.fields ?? EMPTY_RESULTS} />

      {/* The walk comes forward from the map: deep forest surface, thin straw/gold rule. */}
      <section aria-label={title} className="flex bg-fr-v2-forest-deep text-white">
        <span aria-hidden className="w-[3px] shrink-0 bg-fr-v2-gold" />
        <div className="min-w-0 flex-1 px-5 pb-5 pt-4">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-fr-v2-straw">
            Grass {kind} <span className="text-white/45">· {dateLabel} · {timeLabel}</span>
          </p>
          <h1 className="mt-1 text-balance font-display text-[30px] leading-[1.02] tracking-[-0.015em]">{title}</h1>
          {r ? (
            <>
              <p className="mt-2 font-mono text-[12px] tabular-nums text-white/70">
                {(r.distanceM / 1000).toFixed(1)} km · {r.durationMin} min<span className="text-white/50"> · {r.fieldsMeasured} of {r.fieldsTotal} fields measured</span>
              </p>
              <p className="mt-4 text-[15px] leading-snug text-white">
                {r.farmCoverKgDmHa === null ? (
                  <span className="text-white/70">Farm cover couldn&apos;t be worked out from this {kind}.</span>
                ) : (
                  <>
                    Farm cover is <span className="font-mono tabular-nums">{formatNumber(r.farmCoverKgDmHa, 0)}</span> kg DM/ha
                    {r.farmCoverChange !== null ? (
                      <span className={r.farmCoverChange >= 0 ? "text-fr-v2-straw" : "text-fr-v2-clay-tint"}>
                        {" "}({r.farmCoverChange >= 0 ? "+" : ""}{formatNumber(r.farmCoverChange, 0)} since last {kind})
                      </span>
                    ) : null}
                    .
                  </>
                )}
              </p>
              <dl className="mt-4 border-t border-white/10 pt-3">
                {r.farmGrowthKgDmHaDay === null ? (
                  <Row label="Growth" value="Needs a second walk" tone="unknown" />
                ) : (
                  <Row label="Growth" value={`${formatNumber(r.farmGrowthKgDmHaDay, 0)} kg DM/ha/day · ${r.farmGrowthFieldCount} ${r.farmGrowthFieldCount === 1 ? "field" : "fields"}`} />
                )}
                {weatherBits ? <Row label="Weather" value={weatherBits} /> : <Row label="Weather" value="Unavailable" tone="unknown" />}
                {w?.stationName ? <Row label="Station" value={`Met Éireann ${w.stationName}${w.distanceKm !== null ? ` · ${formatNumber(w.distanceKm, 0)} km` : ""}`} /> : null}
                {w?.nearestStationName ? (
                  <Row
                    label="Nearer"
                    tone="unknown"
                    value={`${w.nearestStationName}${w.nearestStationDistanceKm !== undefined ? ` · ${formatNumber(w.nearestStationDistanceKm, 0)} km` : ""} has no live data feed`}
                  />
                ) : null}
              </dl>
            </>
          ) : (
            <p className="mt-4 text-[15px] leading-snug text-white/70">This {kind} hasn&apos;t been finished yet.</p>
          )}
          <Link
            href="/grass"
            className="mt-4 flex min-h-11 w-full items-center justify-between gap-3 bg-fr-v2-cream px-4 text-sm font-semibold text-fr-v2-forest-deep transition-colors duration-[160ms] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fr-v2-straw motion-reduce:transition-none"
          >
            Done
            <ArrowRight className="size-4" />
          </Link>
          <p className="mt-3">
            <Link href="/grass/walks" className="text-xs font-semibold text-white/75 underline decoration-white/25 underline-offset-[3px] transition-colors duration-[160ms] hover:text-white hover:decoration-fr-v2-straw motion-reduce:transition-none">
              Past walks
            </Link>
          </p>
        </div>
      </section>

      {sorted.length ? (
        <section aria-label="Fields" className="px-5 pt-6">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-fr-v2-muted">Fields · kg DM/ha</p>
          <ul className="mt-2 divide-y divide-fr-v2-cream-rule border-y border-fr-v2-cream-rule">
            {sorted.map((f) => (
              <li key={f.fieldId} className="flex items-baseline justify-between gap-3 py-3">
                <span className={cn("inline-flex items-center gap-1.5 font-display text-[19px] leading-tight text-fr-v2-charcoal", f.status !== "measured" && "text-fr-v2-muted")}>
                  {f.name}
                  {f.status === "measured" && located.has(f.fieldId) ? <MapPin className="size-3.5 text-fr-v2-muted" aria-label="Location recorded" /> : null}
                </span>
                <span className="text-right">
                  {f.status === "measured" ? (
                    <>
                      <span className="block font-mono text-[15px] tabular-nums text-fr-v2-charcoal">{f.coverKgDmHa === null ? "—" : formatNumber(f.coverKgDmHa, 0)}</span>
                      <span className="block text-[11px] text-fr-v2-muted">
                        {f.growthKgDmHaDay !== null ? <span className="font-semibold text-fr-v2-forest">+{formatNumber(f.growthKgDmHaDay, 0)}/day</span> : f.growthNote}
                      </span>
                    </>
                  ) : (
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-fr-v2-muted">{STATUS_LABEL[f.status]}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
