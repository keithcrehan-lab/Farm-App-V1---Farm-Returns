"use client";

import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Leaf, Loader2, Satellite, TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  getFieldNdviSeriesAction,
  getFieldSatelliteHistoryAction,
  getFieldSatelliteImageAction,
  type FieldNdviPoint,
  type SatelliteHistoryPreset,
  type SatelliteHistoryResult,
  type SatelliteHistoryScene,
} from "@/app/actions/field-satellite-history";
import type { Field } from "@/domain/types";
import { MAPBOX_TOKEN, mapboxConfigured } from "@/lib/mapbox";

type ImageMode = "satellite" | "vegetation";
type QualityFilter = "all" | "clear";
type RenderedImage = {
  dataUrl: string;
  bounds: [number, number, number, number];
};

function mapboxSatelliteUrl(bounds: [number, number, number, number]): string | null {
  if (!mapboxConfigured) return null;
  const bbox = `[${bounds.map((value) => value.toFixed(7)).join(",")}]`;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${bbox}/1280x900@2x?access_token=${MAPBOX_TOKEN}`;
}

const CLEAR_CLOUD_LIMIT = 40;

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

function dayKey(value: string): string {
  return value.slice(0, 10);
}

function ndviLabel(value: number): string {
  return value.toFixed(2);
}

function clearNdvi(points: FieldNdviPoint[]): FieldNdviPoint[] {
  return points.filter(
    (point) => point.fieldCloudPercent === null || point.fieldCloudPercent <= CLEAR_CLOUD_LIMIT,
  );
}

function trendSummary(points: FieldNdviPoint[]): {
  label: string;
  detail: string;
  delta: number | null;
  direction: "up" | "down" | "flat" | "none";
} {
  if (points.length < 2) {
    return {
      label: "More data needed",
      detail: "A second clear observation is needed before Farm Return can describe a change.",
      delta: null,
      direction: "none",
    };
  }

  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const delta = latest.meanNdvi - previous.meanNdvi;

  if (Math.abs(delta) < 0.03) {
    return {
      label: "Broadly stable",
      detail: `Vegetation signal changed by only ${Math.abs(delta).toFixed(2)} since the previous clear observation.`,
      delta,
      direction: "flat",
    };
  }

  return delta > 0
    ? {
        label: "Increasing",
        detail: `Vegetation signal increased by ${delta.toFixed(2)} since the previous clear observation.`,
        delta,
        direction: "up",
      }
    : {
        label: "Decreasing",
        detail: `Vegetation signal decreased by ${Math.abs(delta).toFixed(2)} since the previous clear observation.`,
        delta,
        direction: "down",
      };
}

function NdviChart({ points }: { points: FieldNdviPoint[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-fr-v2-muted">Not enough clear observations to draw a trend yet.</p>;
  }

  const width = 640;
  const height = 180;
  const left = 42;
  const right = 12;
  const top = 12;
  const bottom = 28;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const minY = -0.2;
  const maxY = 1;
  const x = (index: number) => left + (index / Math.max(1, points.length - 1)) * plotW;
  const y = (value: number) => top + ((maxY - Math.max(minY, Math.min(maxY, value))) / (maxY - minY)) * plotH;
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.meanNdvi).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Vegetation index time series" className="w-full">
      {[0, 0.5, 1].map((tick) => (
        <g key={tick}>
          <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="currentColor" opacity="0.12" />
          <text x={left - 8} y={y(tick) + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.62">
            {tick.toFixed(1)}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {points.map((point, index) => (
        <circle key={`${point.intervalFrom}-${index}`} cx={x(index)} cy={y(point.meanNdvi)} r="2.5" fill="currentColor">
          <title>
            {`${shortDate(point.intervalFrom)} · vegetation index ${ndviLabel(point.meanNdvi)}${point.fieldCloudPercent === null ? "" : ` · field cloud ${Math.round(point.fieldCloudPercent)}%`}`}
          </title>
        </circle>
      ))}
      <text x={left} y={height - 8} fontSize="10" fill="currentColor" opacity="0.62">
        {shortDate(points[0].intervalFrom)}
      </text>
      <text x={width - right} y={height - 8} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.62">
        {shortDate(points[points.length - 1].intervalFrom)}
      </text>
    </svg>
  );
}

function FieldBoundaryOverlay({
  polygon,
  bounds,
}: {
  polygon: GeoJSON.Polygon;
  bounds: [number, number, number, number];
}) {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const width = maxLng - minLng;
  const height = maxLat - minLat;
  if (width <= 0 || height <= 0) return null;

  const points = polygon.coordinates[0]
    .map(([lng, lat]) => {
      const x = ((lng - minLng) / width) * 100;
      const y = ((maxLat - lat) / height) * 100;
      return `${x.toFixed(3)},${y.toFixed(3)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full text-fr-v2-forest-deep"
    >
      <polygon points={points} fill="none" stroke="white" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
      <polygon points={points} fill="none" stroke="currentColor" strokeWidth="0.55" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function FieldSatelliteHistory({ field }: { field: Field }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<SatelliteHistoryPreset>("1Y");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [history, setHistory] = useState<SatelliteHistoryResult | null>(null);
  const [ndvi, setNdvi] = useState<FieldNdviPoint[]>([]);
  const [ndviMessage, setNdviMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<SatelliteHistoryScene | null>(null);
  const [mode, setMode] = useState<ImageMode>("satellite");
  const [overlayOpacity, setOverlayOpacity] = useState(60);
  const [quality, setQuality] = useState<QualityFilter>("clear");
  const [renderedImage, setRenderedImage] = useState<RenderedImage | null>(null);
  const [imageMessage, setImageMessage] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!open) return;
      setLoadingHistory(true);
      setHistory(null);
      setNdvi([]);
      setNdviMessage(null);
      setSelected(null);
      setRenderedImage(null);

      const [historyResult, ndviResult] = await Promise.all([
        getFieldSatelliteHistoryAction(
          field.id,
          preset,
          preset === "CUSTOM" ? customFrom : undefined,
          preset === "CUSTOM" ? customTo : undefined,
        ),
        getFieldNdviSeriesAction(
          field.id,
          preset,
          preset === "CUSTOM" ? customFrom : undefined,
          preset === "CUSTOM" ? customTo : undefined,
        ),
      ]);

      if (cancelled) return;
      setHistory(historyResult);
      if (historyResult?.scenes[0]) setSelected(historyResult.scenes[0]);
      if (ndviResult.ok) setNdvi(ndviResult.points);
      else setNdviMessage(ndviResult.message);
      setLoadingHistory(false);
    }

    if (preset !== "CUSTOM" || (customFrom && customTo)) void load();
    return () => {
      cancelled = true;
    };
  }, [field.id, open, preset, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;

    async function loadImage() {
      if (!open || !selected) {
        setLoadingImage(false);
        setRenderedImage(null);
        setImageMessage(null);
        return;
      }

      setLoadingImage(true);
      setRenderedImage(null);
      setImageMessage(null);

      const result = await getFieldSatelliteImageAction(
        field.id,
        selected.acquisitionTimestamp,
        mode === "vegetation" ? "ndvi" : "natural",
      );
      if (cancelled) return;

      if (result.ok) setRenderedImage({ dataUrl: result.dataUrl, bounds: result.bounds });
      else setImageMessage(result.message);
      setLoadingImage(false);
    }

    if (selected) void loadImage();
    return () => {
      cancelled = true;
    };
  }, [field.id, open, selected, mode]);

  const usableNdvi = useMemo(() => clearNdvi(ndvi), [ndvi]);
  const latestClear = usableNdvi.at(-1) ?? null;
  const trend = useMemo(() => trendSummary(usableNdvi), [usableNdvi]);

  const fieldCloudByDay = useMemo(
    () => new Map(ndvi.map((point) => [dayKey(point.intervalFrom), point.fieldCloudPercent])),
    [ndvi],
  );

  const visibleScenes = useMemo(() => {
    const scenes = history?.scenes ?? [];
    if (quality === "all") return scenes;
    return scenes.filter((scene) => {
      const fieldCloud = fieldCloudByDay.get(dayKey(scene.acquisitionTimestamp));
      return (fieldCloud ?? scene.cloudCoverPercent) <= CLEAR_CLOUD_LIMIT;
    });
  }, [history, quality, fieldCloudByDay]);

  useEffect(() => {
    if (!open) return;
    if (visibleScenes.length === 0) {
      setSelected(null);
      return;
    }
    if (!selected || !visibleScenes.some((scene) => scene.id === selected.id)) {
      setSelected(visibleScenes[0]);
    }
  }, [open, selected, visibleScenes]);

  const baseSatelliteUrl = history ? mapboxSatelliteUrl(history.contextBounds) : null;

  if (!field.polygon) {
    return <p className="text-sm italic text-fr-v2-muted">Map this field boundary to enable satellite history.</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center justify-between gap-4 border-y border-fr-v2-cream-rule py-3 text-left"
      >
        <span>
          <span className="block font-display text-lg text-fr-v2-graphite">Field through time</span>
          <span className="mt-1 block text-xs text-fr-v2-muted">See vegetation change and browse clear Sentinel-2 observations.</span>
        </span>
        <span className="text-sm font-semibold text-fr-v2-forest">Open →</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-field-satellite-history>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl text-fr-v2-graphite">Satellite field signal</p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-fr-v2-muted">
            Track vegetation change across this field using clear Sentinel-2 observations.
          </p>
        </div>
        <div className="flex border border-fr-v2-cream-rule" aria-label="Satellite history period">
          {(["3M", "1Y", "3Y", "CUSTOM"] as SatelliteHistoryPreset[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPreset(value)}
              className={`min-h-9 px-3 text-xs font-semibold ${preset === value ? "bg-fr-v2-forest-deep text-white" : "bg-fr-v2-cream text-fr-v2-graphite"}`}
            >
              {value === "CUSTOM" ? "Custom" : value}
            </button>
          ))}
        </div>
      </div>

      {preset === "CUSTOM" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-fr-v2-muted">
            From
            <input
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
              className="mt-1 w-full border border-fr-v2-cream-rule bg-white px-2.5 py-2 text-sm text-fr-v2-graphite"
            />
          </label>
          <label className="text-xs font-semibold text-fr-v2-muted">
            To
            <input
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
              className="mt-1 w-full border border-fr-v2-cream-rule bg-white px-2.5 py-2 text-sm text-fr-v2-graphite"
            />
          </label>
        </div>
      ) : null}

      {loadingHistory ? (
        <div className="flex items-center gap-2 py-8 text-sm text-fr-v2-muted">
          <Loader2 className="size-4 animate-spin" /> Loading satellite history…
        </div>
      ) : history ? (
        <>
          <section className="border-y border-fr-v2-cream-rule py-4">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fr-v2-muted">
              Latest clear observation
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold text-fr-v2-muted">Vegetation signal</p>
                <p className="mt-1 font-display text-3xl text-fr-v2-graphite">
                  {latestClear ? ndviLabel(latestClear.meanNdvi) : "—"}
                </p>
                <p className="mt-1 text-xs text-fr-v2-muted">NDVI · satellite vegetation index</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-fr-v2-muted">Change</p>
                <div className="mt-1 flex items-center gap-2">
                  {trend.direction === "up" ? <TrendingUp className="size-5 text-fr-v2-forest" /> : null}
                  {trend.direction === "down" ? <TrendingDown className="size-5 text-fr-v2-graphite" /> : null}
                  {trend.direction === "flat" ? <Minus className="size-5 text-fr-v2-muted" /> : null}
                  <p className="font-display text-2xl text-fr-v2-graphite">{trend.label}</p>
                </div>
                {trend.delta !== null ? (
                  <p className="mt-1 font-mono text-xs text-fr-v2-muted">
                    {trend.delta > 0 ? "+" : ""}{trend.delta.toFixed(2)} vs previous clear date
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-fr-v2-muted">Needs another clear date</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-fr-v2-muted">Observation</p>
                <p className="mt-1 font-display text-2xl text-fr-v2-graphite">
                  {latestClear ? shortDate(latestClear.intervalFrom) : "No clear reading"}
                </p>
                <p className="mt-1 text-xs text-fr-v2-muted">
                  {latestClear?.fieldCloudPercent === null || latestClear?.fieldCloudPercent === undefined
                    ? "Field cloud not available"
                    : `${Math.round(latestClear.fieldCloudPercent)}% field cloud`}
                </p>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-fr-v2-graphite">{trend.detail}</p>
          </section>

          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-display text-lg text-fr-v2-graphite">Vegetation trend</p>
                <p className="mt-1 text-xs text-fr-v2-muted">
                  Clear observations only. Cloud and shadow pixels are excluded before the field average is calculated.
                </p>
              </div>
              {usableNdvi.length > 0 ? (
                <p className="shrink-0 font-mono text-xs text-fr-v2-muted">{usableNdvi.length} clear dates</p>
              ) : null}
            </div>
            <div className="mt-3 text-fr-v2-forest-deep">
              {usableNdvi.length > 0 ? (
                <NdviChart points={usableNdvi} />
              ) : (
                <p className="text-sm text-fr-v2-muted">{ndviMessage ?? "No clear vegetation observations in this period."}</p>
              )}
            </div>
            <p className="mt-3 border-l-2 border-fr-v2-straw pl-3 text-xs leading-relaxed text-fr-v2-muted">
              This is a vegetation signal, not a diagnosis. Farm Return does not infer grass quantity, yield, nutrient need,
              disease or a recommended action from NDVI alone.
            </p>
          </section>

          <section className="border-t border-fr-v2-cream-rule pt-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-display text-lg text-fr-v2-graphite">View the field</p>
                <p className="mt-1 text-xs text-fr-v2-muted">
                  Browse the dated Sentinel observation for each pass. Vegetation mode overlays the NDVI signal on reference context.
                </p>
              </div>
              <div className="flex border border-fr-v2-cream-rule">
                <button
                  type="button"
                  onClick={() => setMode("satellite")}
                  className={`flex min-h-8 items-center gap-1.5 px-2.5 text-xs font-semibold ${mode === "satellite" ? "bg-fr-v2-forest-deep text-white" : "bg-white text-fr-v2-graphite"}`}
                >
                  <ImageIcon className="size-3.5" /> Satellite
                </button>
                <button
                  type="button"
                  onClick={() => setMode("vegetation")}
                  className={`flex min-h-8 items-center gap-1.5 px-2.5 text-xs font-semibold ${mode === "vegetation" ? "bg-fr-v2-forest-deep text-white" : "bg-white text-fr-v2-graphite"}`}
                >
                  <Leaf className="size-3.5" /> Vegetation
                </button>
              </div>
            </div>

            {mode === "vegetation" ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-y border-fr-v2-cream-rule py-2.5">
                <div>
                  <p className="text-xs font-semibold text-fr-v2-graphite">Vegetation overlay</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-fr-v2-muted">
                    Sentinel-derived broad field signal. Native detail is approximately 10 m per pixel.
                  </p>
                </div>
                <label className="flex min-w-[210px] items-center gap-3 text-xs font-semibold text-fr-v2-muted">
                  Opacity
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={overlayOpacity}
                    onChange={(event) => setOverlayOpacity(Number(event.target.value))}
                    aria-label="Vegetation overlay opacity"
                    className="w-32 accent-fr-v2-forest-deep"
                  />
                  <span className="w-9 text-right font-mono text-[11px]">{overlayOpacity}%</span>
                </label>
              </div>
            ) : null}

            <div className="mt-3 overflow-hidden border border-fr-v2-cream-rule bg-fr-v2-cream">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-fr-v2-cream-rule px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-fr-v2-graphite">
                    {selected
                      ? `${mode === "vegetation" ? "Vegetation" : "Satellite"} observation · ${shortDate(selected.acquisitionTimestamp)}`
                      : "Reference aerial imagery"}
                  </p>
                  <p className="text-xs text-fr-v2-muted">
                    {selected
                      ? `${selected.platform.replace("sentinel-", "Sentinel-").toUpperCase()} · scene cloud ${Math.round(selected.cloudCoverPercent)}%`
                      : "Mapbox satellite context · imagery capture date is not supplied here"}
                  </p>
                </div>
                {mode === "vegetation" ? (
                  <div className="flex items-center gap-2 text-[10px] font-semibold text-fr-v2-muted" aria-label="Vegetation signal legend">
                    <span>Lower</span>
                    <span
                      className="h-2.5 w-28 border border-black/10"
                      style={{ background: "linear-gradient(90deg,#736040,#c7c169,#8cad4d,#4d8c2e,#1f651d)" }}
                    />
                    <span>Higher</span>
                  </div>
                ) : null}
              </div>

              <div className="relative flex min-h-[320px] items-center justify-center bg-fr-v2-forest-deep/5" style={{ aspectRatio: "64 / 45" }}>
                {baseSatelliteUrl || renderedImage ? (
                  <>
                    {mode === "satellite" && renderedImage ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          key={`natural-${selected?.id ?? "none"}`}
                          src={renderedImage.dataUrl}
                          alt={`Sentinel satellite observation for ${field.name} on ${shortDate(selected?.acquisitionTimestamp ?? "")}`}
                          className="absolute inset-0 size-full object-fill"
                        />
                      </>
                    ) : baseSatelliteUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={baseSatelliteUrl}
                          alt={`High-resolution satellite context for ${field.name}`}
                          className="absolute inset-0 size-full object-fill"
                        />
                      </>
                    ) : null}
                    {loadingImage ? (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-fr-v2-cream/20">
                        <Loader2 className="size-5 animate-spin text-white drop-shadow" />
                      </div>
                    ) : null}
                    {mode === "vegetation" && renderedImage ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          key={`ndvi-${selected?.id ?? "none"}`}
                          src={renderedImage.dataUrl}
                          alt={`Sentinel vegetation overlay for ${field.name} on ${shortDate(selected?.acquisitionTimestamp ?? "")}`}
                          className="absolute inset-0 size-full object-fill"
                          style={{ opacity: overlayOpacity / 100 }}
                        />
                      </>
                    ) : null}
                    <FieldBoundaryOverlay polygon={field.polygon} bounds={renderedImage?.bounds ?? history.contextBounds} />
                  </>
                ) : (
                  <div className="max-w-md px-6 py-10 text-center">
                    <Satellite className="mx-auto size-6 text-fr-v2-muted" />
                    <p className="mt-3 text-sm font-semibold text-fr-v2-graphite">High-resolution satellite context unavailable</p>
                    <p className="mt-1 text-xs leading-relaxed text-fr-v2-muted">
                      Mapbox satellite imagery is not configured in this environment.
                    </p>
                  </div>
                )}
              </div>

              {imageMessage ? (
                <p className="border-t border-fr-v2-cream-rule px-3 py-2 text-xs leading-relaxed text-fr-v2-muted">
                  {mode === "vegetation" ? "Vegetation overlay" : "Selected satellite observation"} unavailable: {imageMessage}
                </p>
              ) : null}
            </div>

            {mode === "vegetation" ? (
              <p className="mt-2 text-[11px] leading-relaxed text-fr-v2-muted">
                The coloured layer is the selected Sentinel observation. Reference aerial context is only used underneath it and is not presented as the dated observation.
              </p>
            ) : null}
          </section>

          <section className="border-t border-fr-v2-cream-rule pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg text-fr-v2-graphite">Browse observations</p>
                <p className="mt-1 text-xs text-fr-v2-muted">
                  {visibleScenes.length} shown · {history.scenes.length} passes found
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setQuality("clear")}
                  className={`px-2.5 py-1.5 text-xs font-semibold ${quality === "clear" ? "bg-fr-v2-forest-deep text-white" : "text-fr-v2-muted"}`}
                >
                  Clearer
                </button>
                <button
                  type="button"
                  onClick={() => setQuality("all")}
                  className={`px-2.5 py-1.5 text-xs font-semibold ${quality === "all" ? "bg-fr-v2-forest-deep text-white" : "text-fr-v2-muted"}`}
                >
                  All passes
                </button>
              </div>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {visibleScenes.map((scene) => {
                const fieldCloud = fieldCloudByDay.get(dayKey(scene.acquisitionTimestamp));
                const isSelected = selected?.id === scene.id;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => setSelected(scene)}
                    className={`min-w-[118px] border px-3 py-2 text-left ${isSelected ? "border-fr-v2-forest-deep bg-fr-v2-forest-deep text-white" : "border-fr-v2-cream-rule bg-fr-v2-cream text-fr-v2-graphite"}`}
                  >
                    <span className="block text-xs font-semibold">{shortDate(scene.acquisitionTimestamp)}</span>
                    <span className={`mt-1 block font-mono text-[10px] ${isSelected ? "text-white/70" : "text-fr-v2-muted"}`}>
                      {fieldCloud === undefined || fieldCloud === null
                        ? `scene ${Math.round(scene.cloudCoverPercent)}% cloud`
                        : `field ${Math.round(fieldCloud)}% cloud`}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <p className="text-sm text-fr-v2-muted">Satellite history is unavailable for this field.</p>
      )}
    </div>
  );
}
