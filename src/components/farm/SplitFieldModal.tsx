"use client";

/**
 * Split a mapped field into paddocks: tap fences across it on the satellite
 * map (or split it evenly to start), name each paddock, then save. Each
 * paddock becomes its own field for grazing, grass walks and fertiliser,
 * keeping the original parcel's LPIS number and a link back to it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { PenLine, RotateCcw, Rows3, X } from "lucide-react";
import { MAPBOX_SATELLITE_STYLE, MAPBOX_TOKEN, mapboxConfigured } from "@/lib/mapbox";
import { formatHa } from "@/lib/format";
import { computeBoundaryGeometry, boundingBox } from "@/domain/field-boundary";
import { applyFences, evenFences, orderPaddocks } from "@/domain/paddock-split";
import type { Field } from "@/domain/types";

const COLOURS = ["#e3c77e", "#7fc4ad", "#e39a6f", "#a9cf6a", "#8fb0e3", "#d9a3cf", "#f0dd8c", "#6fb7c9"];
const FIELD_SRC = "split-field";
const PIECES_SRC = "split-pieces";
const FENCES_SRC = "split-fences";

type Position = GeoJSON.Position;

export function SplitFieldModal({ field, onClose, onSave }: {
  field: Field & { polygon: GeoJSON.Polygon };
  onClose: () => void;
  onSave: (paddocks: Array<{ name: string; polygon: GeoJSON.Polygon }>) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const fencesRef = useRef<Position[][]>([]);
  const [fences, setFences] = useState<Position[][]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [drawing, setDrawing] = useState(true);
  const [evenCount, setEvenCount] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const result = useMemo(() => applyFences(field.polygon, fences), [field.polygon, fences]);
  const pieces = useMemo(() => (result.ok ? orderPaddocks(result.paddocks) : [field.polygon]), [result, field.polygon]);
  const split = pieces.length >= 2;

  // Default names follow the field's own name; anything the farmer typed is kept.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- names track the number of pieces the fences make
    setNames((prev) => pieces.map((_, i) => prev[i] ?? `${field.name} ${i + 1}`));
  }, [pieces, field.name]);

  function commitFences(next: Position[][]) {
    const r = applyFences(field.polygon, next);
    if (!r.ok) { setError(r.error); return false; }
    fencesRef.current = next;
    setFences(next);
    setError(null);
    return true;
  }

  useEffect(() => {
    if (!mapboxConfigured || !containerRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const [minX, minY, maxX, maxY] = boundingBox(field.polygon);
    const map = new mapboxgl.Map({ container: containerRef.current, style: MAPBOX_SATELLITE_STYLE, bounds: [[minX, minY], [maxX, maxY]], fitBoundsOptions: { padding: 48 } });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    const draw = new MapboxDraw({ displayControlsDefault: false, defaultMode: "draw_line_string" });
    drawRef.current = draw;
    map.addControl(draw);

    map.on("load", () => {
      map.addSource(FIELD_SRC, { type: "geojson", data: { type: "Feature", properties: {}, geometry: field.polygon } });
      map.addSource(PIECES_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(FENCES_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: `${PIECES_SRC}-fill`, type: "fill", source: PIECES_SRC, paint: { "fill-color": ["get", "colour"], "fill-opacity": 0.32 } });
      map.addLayer({ id: `${FIELD_SRC}-line`, type: "line", source: FIELD_SRC, paint: { "line-color": "#ffffff", "line-width": 2.5 } });
      map.addLayer({ id: `${FENCES_SRC}-line`, type: "line", source: FENCES_SRC, paint: { "line-color": "#f1d98f", "line-width": 3, "line-dasharray": [1.5, 1] } });
      map.addLayer({
        id: `${PIECES_SRC}-label`, type: "symbol", source: PIECES_SRC,
        layout: { "text-field": ["get", "label"], "text-size": 13, "text-allow-overlap": true },
        paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.75)", "text-halo-width": 1.5 },
      });
      draw.changeMode("draw_line_string");
    });

    map.on("draw.create", (e: { features: Array<GeoJSON.Feature> }) => {
      const g = e.features[0]?.geometry;
      draw.deleteAll();
      if (g?.type === "LineString" && g.coordinates.length >= 2) commitFences([...fencesRef.current, g.coordinates]);
      // Ready for the next fence straight away.
      setTimeout(() => { try { draw.changeMode("draw_line_string"); } catch { /* map closing */ } }, 0);
    });
    map.on("draw.modechange", (e: { mode: string }) => setDrawing(e.mode === "draw_line_string"));

    return () => { ro.disconnect(); map.remove(); mapRef.current = null; drawRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is built once per open
  }, []);

  // Keep the map's paddock colours, labels and fences in step.
  useEffect(() => {
    const map = mapRef.current;
    const update = () => {
      const piecesSrc = map?.getSource(PIECES_SRC) as mapboxgl.GeoJSONSource | undefined;
      const fencesSrc = map?.getSource(FENCES_SRC) as mapboxgl.GeoJSONSource | undefined;
      piecesSrc?.setData({
        type: "FeatureCollection",
        features: split ? pieces.map((p, i) => ({ type: "Feature", properties: { colour: COLOURS[i % COLOURS.length], label: `${names[i] ?? ""}\n${formatHa(computeBoundaryGeometry(p).areaHa)}` }, geometry: p })) : [],
      });
      fencesSrc?.setData({ type: "FeatureCollection", features: fences.map((c) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: c } })) });
    };
    if (map?.isStyleLoaded()) update(); else map?.once("load", update);
  }, [pieces, fences, names, split]);

  function startFence() {
    setError(null);
    try { drawRef.current?.changeMode("draw_line_string"); setDrawing(true); } catch { /* not ready */ }
  }
  function undo() {
    const next = fencesRef.current.slice(0, -1);
    fencesRef.current = next;
    setFences(next);
    setError(null);
  }
  function splitEvenly() {
    if (commitFences(evenFences(field.polygon, evenCount))) setNames([]);
  }
  async function save() {
    const trimmed = names.map((n) => n.trim());
    if (trimmed.some((n) => !n)) { setError("Give every paddock a name."); return; }
    if (new Set(trimmed.map((n) => n.toLocaleLowerCase())).size !== trimmed.length) { setError("Give each paddock its own name."); return; }
    setSaving(true); setError(null);
    try {
      await onSave(pieces.map((polygon, i) => ({ name: trimmed[i], polygon })));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't save the paddocks just now. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-fr-v2-cream" role="dialog" aria-modal="true" aria-label={`Split ${field.name} into paddocks`}>
      <div className="flex items-center justify-between border-b border-fr-v2-cream-rule px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fr-green-700">Split into paddocks</p>
          <h2 className="mt-0.5 truncate font-display text-xl leading-none text-fr-ink-900">{field.name} · {formatHa(field.areaHa)}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full text-fr-ink-600"><X className="size-5" /></button>
      </div>

      <div className="relative min-h-[42dvh] flex-1 bg-[#1a2e1e]">
        {mapboxConfigured ? <div ref={containerRef} className="h-full w-full" /> : (
          <p className="p-6 text-sm text-white/80">Mapping isn&apos;t configured on this deployment, so fences can&apos;t be drawn.</p>
        )}
        <p className="pointer-events-none absolute left-3 top-3 max-w-[70%] rounded-[10px] bg-black/60 px-3 py-2 text-xs leading-snug text-white" aria-live="polite">
          {drawing ? "Tap where the fence starts, outside the field. Tap along it, then tap the last point again to finish." : "Tap Draw a fence to add another."}
        </p>
      </div>

      <div className="max-h-[48dvh] overflow-y-auto border-t border-fr-v2-cream-rule px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={startFence} className="flex min-h-11 items-center gap-1.5 rounded-full bg-fr-v2-forest px-4 text-sm font-semibold text-white"><PenLine className="size-4" aria-hidden />Draw a fence</button>
          <button type="button" onClick={undo} disabled={!fences.length} className="flex min-h-11 items-center gap-1.5 rounded-full border border-fr-v2-cream-rule bg-white px-4 text-sm font-semibold text-fr-ink-900 disabled:opacity-40"><RotateCcw className="size-4" aria-hidden />Undo fence</button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-fr-ink-900">
          <Rows3 className="size-4 text-fr-ink-600" aria-hidden />
          <span>Or split evenly into</span>
          <select aria-label="Number of paddocks" value={evenCount} onChange={(e) => setEvenCount(Number(e.target.value))} className="min-h-10 rounded-[10px] border border-fr-v2-cream-rule bg-white px-2">
            {[2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" onClick={splitEvenly} className="min-h-10 rounded-full border border-fr-v2-forest px-3 text-sm font-semibold text-fr-v2-forest">Split</button>
        </div>
        {error ? <p role="alert" className="mt-2 text-sm text-fr-risk">{error}</p> : null}

        {split ? (
          <ul className="mt-3 space-y-2" aria-label="Paddocks">
            {pieces.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: COLOURS[i % COLOURS.length] }} aria-hidden />
                <input value={names[i] ?? ""} onChange={(e) => setNames((n) => n.map((v, j) => (j === i ? e.target.value : v)))} maxLength={80} aria-label={`Paddock ${i + 1} name`}
                  className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-fr-v2-cream-rule bg-white px-3 text-base text-fr-ink-900" />
                <span className="w-16 shrink-0 text-right text-sm tabular-nums text-fr-ink-600">{formatHa(computeBoundaryGeometry(p).areaHa)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-fr-ink-600">Draw a fence across the field to make your first two paddocks.</p>
        )}

        <p className="mt-3 text-xs leading-relaxed text-fr-ink-600">
          Each paddock becomes its own field for grazing, grass walks and fertiliser. They keep this field&apos;s LPIS number, so your parcel area isn&apos;t counted twice. Records already on {field.name} stay with it in your history.
        </p>
        <button type="button" onClick={() => void save()} disabled={!split || saving}
          className="mt-3 min-h-12 w-full rounded-[12px] bg-fr-green-700 text-base font-semibold text-white disabled:opacity-50">
          {saving ? "Saving paddocks…" : split ? `Save ${pieces.length} paddocks` : "Save paddocks"}
        </button>
      </div>
    </div>
  );
}
