"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_PLAIN_SATELLITE_STYLE, MAPBOX_TOKEN, mapboxConfigured } from "@/lib/mapbox";
import { formatNumber } from "@/lib/format";
import { surveyMapView, type LngLatBounds } from "@/domain/grass-survey";

export interface WalkMapField {
  id: string;
  name: string;
  ring: number[][];
  coverKgDmHa: number | null;
}

export interface WalkMapReading {
  id: string;
  fieldName: string;
  coverKgDmHa: number;
  lat: number;
  lng: number;
  accuracyM: number | null;
}

interface Props {
  /** Already cleaned with `cleanSurveyTrack`. */
  route: ReadonlyArray<{ lat: number; lng: number }>;
  readings: ReadonlyArray<WalkMapReading>;
  fields: ReadonlyArray<WalkMapField>;
}

const ROUTE = "#FC5200";
const START = "#0F6E56";
const FINISH = "#A32D2D";

/** Same cover bands the rest of the grass screens use. */
export const coverBandFill = (cover: number | null) =>
  cover === null ? "#98A2B3" : cover < 1350 ? "#D98324" : cover < 1650 ? "#8BA23A" : cover < 1850 ? "#2E7D4F" : "#2563AC";

function dotElement(color: string, label: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", label);
  el.style.cssText = `width:16px;height:16px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)`;
  return el;
}

function readingElement(r: WalkMapReading): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `${r.fieldName}: ${formatNumber(r.coverKgDmHa, 0)} kg DM/ha read here`);
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:none";
  const pill = document.createElement("div");
  pill.textContent = formatNumber(r.coverKgDmHa, 0);
  pill.style.cssText = "font:600 12px/1 ui-monospace,SFMono-Regular,monospace;color:#1F2A24;background:#fff;border-radius:9999px;padding:4px 7px;box-shadow:0 1px 4px rgba(0,0,0,.4);white-space:nowrap";
  const stem = document.createElement("div");
  stem.style.cssText = "width:2px;height:7px;background:#fff";
  const tip = document.createElement("div");
  tip.style.cssText = "width:8px;height:8px;border-radius:9999px;background:#1F2A24;border:2px solid #fff;margin-top:-1px";
  el.append(pill, stem, tip);
  return el;
}

/** Strava-style route over satellite imagery, with a pin wherever a reading was taken. */
export function WalkRouteMap({ route, readings, fields }: Props) {
  const view = useMemo(() => surveyMapView({ route, readings, fields }), [route, readings, fields]);
  const shown = useMemo(() => fields.filter((f) => view.fieldIds.includes(f.id)), [fields, view.fieldIds]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Set when this phone can't run the satellite map (e.g. no WebGL): the plain drawing is shown instead.
  const [mapFailed, setMapFailed] = useState(false);
  // The farm store hands back new field arrays on every render, so the map is
  // keyed on what it actually draws, not on array identity: it is built once
  // per walk, not on every re-render.
  const boundsKey = JSON.stringify(view.bounds);
  const shownKey = shown.map((f) => `${f.id}:${f.coverKgDmHa}:${f.ring.length}`).join("|");
  const latest = useRef({ route, readings, shown, bounds: view.bounds });
  useEffect(() => {
    latest.current = { route, readings, shown, bounds: view.bounds };
  });

  useEffect(() => {
    const { route, readings, shown, bounds } = latest.current;
    if (!mapboxConfigured || !containerRef.current || !bounds) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: MAPBOX_PLAIN_SATELLITE_STYLE,
        bounds: bounds as mapboxgl.LngLatBoundsLike,
        fitBoundsOptions: { padding: 36, maxZoom: 17.5 },
        cooperativeGestures: true,
        pitchWithRotate: false,
        dragRotate: false,
      });
    } catch (err) {
      console.error("[Walk map] satellite map unavailable", err);
      void Promise.resolve().then(() => setMapFailed(true));
      return;
    }
    const markers: mapboxgl.Marker[] = [];
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    let styleLoaded = false;
    let removed = false;
    let loadDeadline: ReturnType<typeof setTimeout> | undefined;
    const teardown = () => {
      if (removed) return;
      removed = true;
      clearTimeout(loadDeadline);
      ro.disconnect();
      markers.forEach((m) => m.remove());
      map.remove();
    };
    // If the satellite style never loads (blocked request, bad network, GPU lost),
    // drop the map and show the plain route drawing instead of a blank box.
    const fallBack = (reason: unknown) => {
      if (styleLoaded || removed) return;
      console.error("[Walk map] satellite map failed to load", reason);
      teardown();
      setMapFailed(true);
    };
    loadDeadline = setTimeout(() => fallBack("timed out"), 15_000);
    map.on("error", (e) => {
      console.error("[Walk map]", e.error);
      fallBack(e.error);
    });

    map.on("style.load", () => {
      styleLoaded = true;
      clearTimeout(loadDeadline);
      map.addSource("walk-fields", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: shown.map((f): GeoJSON.Feature<GeoJSON.Polygon> => ({ type: "Feature", properties: { fill: coverBandFill(f.coverKgDmHa) }, geometry: { type: "Polygon", coordinates: [f.ring] } })),
        },
      });
      map.addLayer({ id: "walk-fields-fill", type: "fill", source: "walk-fields", paint: { "fill-color": ["get", "fill"], "fill-opacity": 0.3 } });
      map.addLayer({ id: "walk-fields-line", type: "line", source: "walk-fields", paint: { "line-color": "#ffffff", "line-width": 1.5, "line-opacity": 0.85 } });
      if (route.length > 1) {
        const line: GeoJSON.Feature<GeoJSON.LineString> = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.map((p) => [p.lng, p.lat]) } };
        map.addSource("walk-route", { type: "geojson", data: line });
        const layout = { "line-cap": "round", "line-join": "round" } as const;
        map.addLayer({ id: "walk-route-casing", type: "line", source: "walk-route", layout, paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 } });
        map.addLayer({ id: "walk-route-line", type: "line", source: "walk-route", layout, paint: { "line-color": ROUTE, "line-width": 4 } });
      }
    });

    if (route.length > 0) {
      const first = route[0];
      const last = route.at(-1)!;
      markers.push(new mapboxgl.Marker({ element: dotElement(START, "Start") }).setLngLat([first.lng, first.lat]).addTo(map));
      if (route.length > 1) markers.push(new mapboxgl.Marker({ element: dotElement(FINISH, "Finish") }).setLngLat([last.lng, last.lat]).addTo(map));
    }
    for (const r of readings) {
      markers.push(new mapboxgl.Marker({ element: readingElement(r), anchor: "bottom" }).setLngLat([r.lng, r.lat]).addTo(map));
    }

    return teardown;
  }, [boundsKey, shownKey, route, readings]);

  if (!view.bounds) {
    return <div className="flex h-56 items-center justify-center bg-fr-surface-alt px-6 text-center text-xs text-fr-v2-muted">No route was recorded. Keep this app open with location allowed while you walk.</div>;
  }

  return (
    <div>
      <div className="relative h-64 w-full bg-[#e9e4d8] sm:h-72">
        {mapboxConfigured && !mapFailed ? (
          <div ref={containerRef} className="absolute inset-0" aria-label="Walk route over your fields" role="region" />
        ) : (
          <SchematicRoute bounds={view.bounds} route={route} readings={readings} fields={shown} />
        )}
      </div>
      {view.nearestFieldKm !== null ? (
        <p className="border-b border-fr-v2-cream-rule bg-fr-v2-straw/20 px-4 py-2 text-xs text-fr-v2-charcoal">
          This route is {formatNumber(view.nearestFieldKm, 1)} km from your nearest mapped field, so your fields aren&apos;t shown.
        </p>
      ) : null}
    </div>
  );
}

/** Plain drawing for deployments without a map token. Same framing rules as the real map. */
function SchematicRoute({ bounds, route, readings, fields }: { bounds: LngLatBounds; route: Props["route"]; readings: Props["readings"]; fields: Props["fields"] }) {
  const W = 360;
  const H = 240;
  const pad = 22;
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * k, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const ox = (W - spanX * scale) / 2;
  const oy = (H - spanY * scale) / 2;
  const xy = (lng: number, lat: number): [number, number] => [ox + (lng - minLng) * k * scale, oy + (maxLat - lat) * scale];
  const pts = (list: ReadonlyArray<readonly number[]>) => list.map((c) => xy(c[0], c[1]).map((n) => n.toFixed(1)).join(",")).join(" ");
  const start = route[0] ? xy(route[0].lng, route[0].lat) : null;
  const end = route.length > 1 ? xy(route.at(-1)!.lng, route.at(-1)!.lat) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" role="img" aria-label="Walk route over your fields">
      {fields.map((f) => <polygon key={f.id} points={pts(f.ring)} fill={coverBandFill(f.coverKgDmHa)} fillOpacity={0.28} stroke="#667085" strokeWidth={0.8} />)}
      {route.length > 1 ? <polyline points={pts(route.map((p) => [p.lng, p.lat]))} fill="none" stroke={ROUTE} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /> : null}
      {start ? <circle cx={start[0]} cy={start[1]} r={5} fill={START} stroke="#fff" strokeWidth={1.5} /> : null}
      {end ? <circle cx={end[0]} cy={end[1]} r={5} fill={FINISH} stroke="#fff" strokeWidth={1.5} /> : null}
      {readings.map((r) => {
        const [x, y] = xy(r.lng, r.lat);
        return (
          <g key={r.id}>
            <circle cx={x} cy={y} r={3.5} fill="#1F2A24" stroke="#fff" strokeWidth={1.2} />
            <text x={x} y={y - 7} textAnchor="middle" className="fill-fr-v2-charcoal font-mono text-[9px] font-semibold">{formatNumber(r.coverKgDmHa, 0)}</text>
          </g>
        );
      })}
    </svg>
  );
}
