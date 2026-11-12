"use client";

/**
 * Split a mapped field into paddocks on the satellite map. The farmer drags a
 * finger along each fence (or taps it point by point, walks it with GPS, or
 * splits the field evenly), sees the paddocks and their hectares as they go,
 * names them, then saves. Each paddock becomes its own field for grazing,
 * grass walks and fertiliser, keeping the original parcel's LPIS number and a
 * link back to it.
 *
 * All fence geometry lives in `src/domain/paddock-split.ts`; this file only
 * turns touches into drawn lines and shows the result.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Check, Footprints, PenLine, RotateCcw, Rows3, Trash2, X } from "lucide-react";
import { StepTip, StepTipButton } from "@/components/onboarding/StepTip";
import { MAPBOX_SATELLITE_STYLE, MAPBOX_TOKEN, mapboxConfigured } from "@/lib/mapbox";
import { formatHa } from "@/lib/format";
import { createWebLocationTrackingProvider } from "@/lib/location/web-location-tracking-provider";
import { computeBoundaryGeometry, boundingBox } from "@/domain/field-boundary";
import { applyFences, evenFencesAtBearing, fitAllFences, orderPaddocks, shortestFenceBearing, straightenTrace } from "@/domain/paddock-split";
import type { Field } from "@/domain/types";

const COLOURS = ["#e3c77e", "#7fc4ad", "#e39a6f", "#a9cf6a", "#8fb0e3", "#d9a3cf", "#f0dd8c", "#6fb7c9"];
const FIELD_SRC = "split-field";
const PIECES_SRC = "split-pieces";
const FENCES_SRC = "split-fences";
const DRAFT_SRC = "split-draft";
const POINTS_SRC = "split-points";
const HERE_SRC = "split-here";
const TIP_ID = "split-draw";

/** Finger movement under this many pixels is a tap, not a drag. */
const TAP_SLOP_PX = 10;
/** A traced line is straightened to within this many pixels of where the finger went. */
const TRACE_TOLERANCE_PX = 8;
/** How close (pixels) a touch must be to pick a fence, a fence corner, or the last tapped point. */
const PICK_PX = 22;
/** GPS fixes worse than this are not used for a walked fence. */
const WALK_MAX_ACCURACY_M = 20;
/** A walked fence takes a new point once the farmer has moved this far. */
const WALK_STEP_M = 3;
/** A walked fence is straightened to within this distance of the route walked. */
const WALK_TOLERANCE_M = 2;

type Position = GeoJSON.Position;
type Mode = "draw" | "move";
type Gesture =
  | { kind: "stroke"; id: number; x: number; y: number; moved: boolean; points: Position[] }
  | { kind: "corner"; id: number; fence: number; corner: number }
  | { kind: "pick"; id: number; x: number; y: number; moved: boolean };
type Shown = { fences: Position[][]; pieces: GeoJSON.Polygon[]; split: boolean; previewOk: boolean };

/** Metres between two map points close together (screen-scale geometry only). */
function metresBetween(a: Position, b: Position): number {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * 110_540);
}

function pixelsToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const lineFeature = (coordinates: Position[], properties: Record<string, unknown> = {}): GeoJSON.Feature => ({ type: "Feature", properties, geometry: { type: "LineString", coordinates } });
const pointFeature = (coordinates: Position, properties: Record<string, unknown> = {}): GeoJSON.Feature => ({ type: "Feature", properties, geometry: { type: "Point", coordinates } });
const polygonFeature = (geometry: GeoJSON.Polygon, properties: Record<string, unknown>): GeoJSON.Feature => ({ type: "Feature", properties, geometry });
const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });

export function SplitFieldModal({ field, onClose, onSave }: {
  field: Pick<Field, "name" | "areaHa"> & { polygon: GeoJSON.Polygon };
  onClose: () => void;
  onSave: (paddocks: Array<{ name: string; polygon: GeoJSON.Polygon }>) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  /** Fences as the farmer drew them, in order. Fitting to the field happens on every change. */
  const [drawn, setDrawn] = useState<Position[][]>([]);
  /** Earlier versions of `drawn`, for Undo. */
  const [history, setHistory] = useState<Position[][][]>([]);
  /** Points tapped (or walked) for the fence being drawn. */
  const [pending, setPending] = useState<Position[]>([]);
  /** What a finished touch would give right now: the fences, including the one in progress. */
  const [preview, setPreview] = useState<Position[][] | null>(null);
  /** The line under the finger, exactly as drawn. */
  const [draftLine, setDraftLine] = useState<Position[]>([]);
  const [mode, setMode] = useState<Mode>("draw");
  const [selected, setSelected] = useState<number | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [evenCount, setEvenCount] = useState(2);
  /** Set while the fences on screen came from "split evenly", so Turn can redo them. */
  const [evenBearing, setEvenBearing] = useState<number | null>(null);
  const [walking, setWalking] = useState(false);
  const [walkAccuracy, setWalkAccuracy] = useState<number | null>(null);
  const [here, setHere] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The touch handlers are attached once, so they read the latest values from here.
  const live = useRef({ drawn, pending, mode, selected, walking, fitted: [] as Position[][] });
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef<Set<number>>(new Set());
  const frameRef = useRef<number | null>(null);
  const providerRef = useRef<ReturnType<typeof createWebLocationTrackingProvider> | null>(null);

  const committed = useMemo(() => {
    const fit = fitAllFences(field.polygon, drawn);
    const fences = fit.ok ? fit.fences : [];
    const result = applyFences(field.polygon, fences);
    return { fences, pieces: result.ok ? orderPaddocks(result.paddocks) : [field.polygon] };
  }, [field.polygon, drawn]);

  /** What the map shows: the fence in progress included, when it makes a valid split. */
  const shown: Shown = useMemo(() => {
    if (preview) {
      const fit = fitAllFences(field.polygon, preview);
      if (fit.ok) {
        const result = applyFences(field.polygon, fit.fences);
        if (result.ok) return { fences: fit.fences, pieces: orderPaddocks(result.paddocks), split: result.paddocks.length >= 2, previewOk: true };
      }
    }
    return { fences: committed.fences, pieces: committed.pieces, split: committed.pieces.length >= 2, previewOk: false };
  }, [field.polygon, preview, committed]);

  const pieces = committed.pieces;
  const split = pieces.length >= 2;

  useEffect(() => {
    live.current = { drawn, pending, mode, selected, walking, fitted: committed.fences };
  }, [drawn, pending, mode, selected, walking, committed.fences]);

  // Default names follow the field's own name; anything the farmer typed is kept.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- names track the number of pieces the fences make
    setNames((prev) => pieces.map((_, i) => prev[i] ?? `${field.name} ${i + 1}`));
  }, [pieces, field.name]);

  /** Saves a new set of fences if they split the field cleanly; otherwise says why and changes nothing. */
  const commit = useCallback((next: Position[][], failMessage?: string): boolean => {
    const fit = fitAllFences(field.polygon, next);
    if (!fit.ok) { setError(failMessage ?? fit.error); return false; }
    const result = applyFences(field.polygon, fit.fences);
    if (!result.ok) { setError(failMessage ?? result.error); return false; }
    const before = live.current.drawn;
    setHistory((h) => [...h, before]);
    setDrawn(next);
    setPending([]);
    setPreview(null);
    setDraftLine([]);
    setSelected(null);
    setError(null);
    return true;
  }, [field.polygon]);

  const finishFence = useCallback((points: Position[]): boolean => {
    if (points.length < 2) return false;
    const ok = commit([...live.current.drawn, points], "That line doesn't divide the field. Draw it across the field, along where the fence runs.");
    if (ok) setEvenBearing(null);
    else { setPreview(null); setDraftLine(live.current.pending); }
    return ok;
  }, [commit]);

  // Build the map once per open.
  useEffect(() => {
    if (!mapboxConfigured || !containerRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const [minX, minY, maxX, maxY] = boundingBox(field.polygon);
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_SATELLITE_STYLE,
      bounds: [[minX, minY], [maxX, maxY]],
      fitBoundsOptions: { padding: 48 },
      pitchWithRotate: false,
      dragRotate: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.touchZoomRotate.disableRotation();
    map.doubleClickZoom.disable();
    // One finger draws; the browser must not treat it as a scroll.
    map.getCanvas().style.touchAction = "none";
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    map.on("load", () => {
      const empty = collection([]);
      map.addSource(FIELD_SRC, { type: "geojson", data: { type: "Feature", properties: {}, geometry: field.polygon } });
      for (const id of [PIECES_SRC, FENCES_SRC, DRAFT_SRC, POINTS_SRC, HERE_SRC]) map.addSource(id, { type: "geojson", data: empty });
      map.addLayer({ id: `${PIECES_SRC}-fill`, type: "fill", source: PIECES_SRC, paint: { "fill-color": ["get", "colour"], "fill-opacity": 0.32 } });
      map.addLayer({ id: `${FIELD_SRC}-line`, type: "line", source: FIELD_SRC, paint: { "line-color": "#ffffff", "line-width": 2.5 } });
      map.addLayer({
        id: `${FENCES_SRC}-line`, type: "line", source: FENCES_SRC,
        paint: { "line-color": ["case", ["==", ["get", "selected"], 1], "#ffffff", "#f1d98f"], "line-width": ["case", ["==", ["get", "selected"], 1], 5, 3], "line-dasharray": [1.5, 1] },
      });
      map.addLayer({ id: `${DRAFT_SRC}-line`, type: "line", source: DRAFT_SRC, paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.85 } });
      map.addLayer({
        id: `${POINTS_SRC}-circle`, type: "circle", source: POINTS_SRC,
        paint: { "circle-radius": ["case", ["==", ["get", "corner"], 1], 8, 5], "circle-color": "#ffffff", "circle-stroke-color": "#173f2d", "circle-stroke-width": 2 },
      });
      map.addLayer({ id: `${HERE_SRC}-circle`, type: "circle", source: HERE_SRC, paint: { "circle-radius": 7, "circle-color": "#3b82f6", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
      map.addLayer({
        id: `${PIECES_SRC}-label`, type: "symbol", source: PIECES_SRC,
        layout: { "text-field": ["get", "label"], "text-size": 13, "text-allow-overlap": true },
        paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.75)", "text-halo-width": 1.5 },
      });
      setMapReady(true);
    });

    return () => { ro.disconnect(); map.remove(); mapRef.current = null; setMapReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is built once per open
  }, []);

  // One finger draws in Draw mode and moves the map in Move mode. Two fingers always zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === "draw") map.dragPan.disable();
    else map.dragPan.enable();
  }, [mode, mapReady]);

  // Touch, pen and mouse handling for drawing and editing fences.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const el = map.getCanvasContainer();
    const at = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    };
    const lngLat = (p: { x: number; y: number }): Position => {
      const ll = map.unproject([p.x, p.y]);
      return [ll.lng, ll.lat];
    };
    const px = (p: Position) => map.project([p[0], p[1]]);
    const metresPerPixel = () => metresBetween(lngLat({ x: 0, y: 0 }), lngLat({ x: 100, y: 0 })) / 100;

    const showStroke = () => {
      frameRef.current = null;
      const g = gestureRef.current;
      if (!g) return;
      if (g.kind === "stroke" && g.moved) {
        const line = [...live.current.pending, ...straightenTrace(g.points, TRACE_TOLERANCE_PX * metresPerPixel())];
        setDraftLine([...live.current.pending, ...g.points]);
        setPreview(line.length >= 2 ? [...live.current.drawn, line] : null);
      }
    };
    const schedule = () => {
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(showStroke);
    };
    const dropGesture = () => {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g) return;
      if (g.kind === "corner" && live.current.mode === "move") map.dragPan.enable();
      // Back to what was there before this touch.
      const waiting = live.current.pending;
      setDraftLine(waiting);
      setPreview(waiting.length >= 2 ? [...live.current.drawn, waiting] : null);
    };

    const down = (ev: PointerEvent) => {
      pointersRef.current.add(ev.pointerId);
      if (pointersRef.current.size > 1) { dropGesture(); return; } // a second finger means zoom, not draw
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      const p = at(ev);
      const state = live.current;
      if (state.mode === "draw") {
        if (state.walking) return;
        gestureRef.current = { kind: "stroke", id: ev.pointerId, x: p.x, y: p.y, moved: false, points: [lngLat(p)] };
        return;
      }
      if (state.selected !== null) {
        const fence = state.fitted[state.selected] ?? [];
        const corner = fence.findIndex((c) => { const q = px(c); return Math.hypot(q.x - p.x, q.y - p.y) <= PICK_PX; });
        if (corner >= 0) {
          map.dragPan.disable();
          gestureRef.current = { kind: "corner", id: ev.pointerId, fence: state.selected, corner };
          return;
        }
      }
      gestureRef.current = { kind: "pick", id: ev.pointerId, x: p.x, y: p.y, moved: false };
    };

    const move = (ev: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || g.id !== ev.pointerId) return;
      const p = at(ev);
      if (g.kind === "stroke") {
        if (!g.moved && Math.hypot(p.x - g.x, p.y - g.y) > TAP_SLOP_PX) g.moved = true;
        if (g.moved) { g.points.push(lngLat(p)); schedule(); }
      } else if (g.kind === "pick") {
        if (Math.hypot(p.x - g.x, p.y - g.y) > TAP_SLOP_PX) g.moved = true;
      } else {
        const fences = live.current.fitted.map((f, i) => (i === g.fence ? f.map((c, j) => (j === g.corner ? lngLat(p) : c)) : f));
        setDraftLine(fences[g.fence] ?? []);
        setPreview(fences);
      }
    };

    const up = (ev: PointerEvent) => {
      pointersRef.current.delete(ev.pointerId);
      const g = gestureRef.current;
      if (!g || g.id !== ev.pointerId) return;
      gestureRef.current = null;
      const p = at(ev);
      const state = live.current;
      if (g.kind === "stroke") {
        if (g.moved) {
          // A drag is a whole fence (joined on to any points already tapped).
          const traced = straightenTrace(g.points, TRACE_TOLERANCE_PX * metresPerPixel());
          finishFence([...state.pending, ...traced]);
          return;
        }
        // A tap adds a point; tapping the last point again finishes the fence.
        const last = state.pending[state.pending.length - 1];
        if (last && state.pending.length >= 2) {
          const q = px(last);
          if (Math.hypot(q.x - p.x, q.y - p.y) <= PICK_PX) { finishFence(state.pending); return; }
        }
        const next = [...state.pending, lngLat(p)];
        setPending(next);
        setDraftLine(next);
        setPreview(next.length >= 2 ? [...state.drawn, next] : null);
        setError(null);
        return;
      }
      if (g.kind === "pick") {
        if (g.moved) return; // the map was moved
        const hit = state.fitted.findIndex((fence) => fence.some((c, i) => i > 0 && pixelsToSegment(p, px(fence[i - 1]), px(c)) <= PICK_PX));
        setSelected(hit >= 0 ? hit : null);
        setError(null);
        return;
      }
      // A fence corner was dragged: keep the change if the fences still split the field cleanly.
      if (state.mode === "move") map.dragPan.enable();
      const moved = state.fitted.map((f, i) => (i === g.fence ? f.map((c, j) => (j === g.corner ? lngLat(p) : c)) : f));
      const keep = g.fence;
      if (commit(moved, "The fence can't go there. It has to run across the field.")) { setSelected(keep); setEvenBearing(null); }
      else { setPreview(null); setDraftLine([]); }
    };

    const cancel = (ev: PointerEvent) => {
      pointersRef.current.delete(ev.pointerId);
      if (gestureRef.current?.id === ev.pointerId) dropGesture();
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    const pointers = pointersRef.current;
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      pointers.clear();
      gestureRef.current = null;
      if (frameRef.current !== null) { window.cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    };
  }, [mapReady, commit, finishFence]);

  // Keep the map's paddocks, fences, line in progress and location dot in step.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const set = (id: string, data: GeoJSON.FeatureCollection) => (map.getSource(id) as mapboxgl.GeoJSONSource | undefined)?.setData(data);
    set(PIECES_SRC, collection(shown.split ? shown.pieces.map((p, i) => polygonFeature(p, {
      colour: COLOURS[i % COLOURS.length],
      label: `${(shown.previewOk ? "" : names[i]) || `${field.name} ${i + 1}`}\n${formatHa(computeBoundaryGeometry(p).areaHa)}`,
    })) : []));
    set(FENCES_SRC, collection(shown.fences.map((c, i) => lineFeature(c, { selected: !shown.previewOk && i === selected ? 1 : 0 }))));
    // The raw line only shows while it isn't yet a fence the field can take.
    set(DRAFT_SRC, collection(!shown.previewOk && draftLine.length >= 2 ? [lineFeature(draftLine)] : []));
    const corners = mode === "move" && selected !== null && !preview ? (committed.fences[selected] ?? []).map((c) => pointFeature(c, { corner: 1 })) : [];
    set(POINTS_SRC, collection([...pending.map((c) => pointFeature(c, { corner: 0 })), ...corners]));
    set(HERE_SRC, collection(here ? [pointFeature(here)] : []));
  }, [mapReady, shown, names, selected, draftLine, pending, here, mode, preview, committed.fences, field.name]);

  const stopWalking = useCallback(() => {
    void providerRef.current?.stopActiveTracking();
    setWalking(false);
  }, []);
  useEffect(() => () => { void providerRef.current?.stopActiveTracking(); }, []);

  function startWalking() {
    setError(null);
    setMode("draw");
    setSelected(null);
    setPending([]);
    setDraftLine([]);
    setPreview(null);
    setWalkAccuracy(null);
    setWalking(true);
    const provider = providerRef.current ?? createWebLocationTrackingProvider();
    providerRef.current = provider;
    void provider.startActiveTracking(
      (fix) => {
        const point: Position = [fix.lng, fix.lat];
        setHere(point);
        setWalkAccuracy(fix.accuracyMeters ?? null);
        if (fix.accuracyMeters === undefined || fix.accuracyMeters > WALK_MAX_ACCURACY_M) return;
        const waiting = live.current.pending;
        const last = waiting[waiting.length - 1];
        if (last && metresBetween(last, point) < WALK_STEP_M) return;
        const next = [...waiting, point];
        live.current = { ...live.current, pending: next };
        setPending(next);
        setDraftLine(next);
        setPreview(next.length >= 2 ? [...live.current.drawn, straightenTrace(next, WALK_TOLERANCE_M)] : null);
        if (!last) mapRef.current?.easeTo({ center: [point[0], point[1]], duration: 400 });
      },
      (reason) => {
        setWalking(false);
        setError(reason === "permission_revoked"
          ? "Location is switched off for Farm Return. Allow it in your phone's settings, or draw the fence with your finger."
          : "Your location stopped coming through. Press Done to keep the fence walked so far, or draw it with your finger.");
      },
    );
  }

  function done() {
    const points = walking ? straightenTrace(pending, WALK_TOLERANCE_M) : pending;
    if (walking) stopWalking();
    finishFence(points);
  }
  function undo() {
    setError(null);
    if (pending.length) {
      const next = pending.slice(0, -1);
      setPending(next);
      setDraftLine(next);
      setPreview(next.length >= 2 ? [...drawn, next] : null);
      return;
    }
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    setDrawn(previous);
    setPreview(null);
    setDraftLine([]);
    setSelected(null);
    setEvenBearing(null);
  }
  function deleteSelected() {
    if (selected === null) return;
    if (commit(drawn.filter((_, i) => i !== selected), "Another fence joins this one. Delete that one first.")) setEvenBearing(null);
  }
  function splitEvenly(bearing: number) {
    if (walking) stopWalking();
    if (commit(evenFencesAtBearing(field.polygon, evenCount, bearing), "This field can't be split evenly that way. Try turning the fences, or draw them.")) {
      setEvenBearing(bearing);
      setNames([]);
    }
  }
  function changeMode(next: Mode) {
    if (walking) stopWalking();
    setMode(next);
    setError(null);
    if (next === "draw") setSelected(null);
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

  const canUndo = pending.length > 0 || history.length > 0;
  const status = walking
    ? `Walking the fence${walkAccuracy !== null ? ` · GPS ±${Math.round(walkAccuracy)} m` : ""}${walkAccuracy !== null && walkAccuracy > WALK_MAX_ACCURACY_M ? " · waiting for a better signal" : ""}`
    : mode === "move"
      ? selected !== null ? "Drag a white dot to move the fence, or delete it below." : "Move the map with one finger. Tap a fence to change it."
      : pending.length === 1 ? "Tap the next point along the fence."
      : pending.length >= 2 ? "Keep tapping, or press Done."
      : "Drag your finger along the fence.";
  const modeButton = (value: Mode, label: string) => (
    <button type="button" onClick={() => changeMode(value)} aria-pressed={mode === value}
      className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 text-sm font-semibold ${mode === value ? "bg-fr-v2-forest text-white" : "bg-white text-fr-ink-900"}`}>
      {value === "draw" ? <PenLine className="size-4" aria-hidden /> : null}{label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-fr-v2-cream" role="dialog" aria-modal="true" aria-label={`Split ${field.name} into paddocks`}>
      <div className="flex items-center justify-between border-b border-fr-v2-cream-rule px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fr-green-700">Split into paddocks</p>
          <h2 className="mt-0.5 truncate font-display text-xl leading-none text-fr-ink-900">{field.name} · {formatHa(field.areaHa)}</h2>
        </div>
        <div className="flex shrink-0 items-center">
          <StepTipButton id={TIP_ID} tone="light" />
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full text-fr-ink-600"><X className="size-5" /></button>
        </div>
      </div>

      <div className="relative min-h-[42dvh] flex-1 bg-[#1a2e1e]">
        {mapboxConfigured ? <div ref={containerRef} className="h-full w-full" /> : (
          <p className="p-6 text-sm text-white/80">Mapping isn&apos;t configured on this deployment, so fences can&apos;t be drawn.</p>
        )}
        {mapboxConfigured ? (
          <div className="pointer-events-none absolute left-3 top-3 max-w-[75%] space-y-2 sm:max-w-[380px]">
            <StepTip id={TIP_ID}>
              Drag your finger along each fence and it straightens itself and joins the field edge. You can also tap point by point and press Done. Use two fingers to zoom.
            </StepTip>
            <p className="inline-block rounded-[10px] bg-black/60 px-3 py-2 text-xs leading-snug text-white" aria-live="polite">{status}</p>
          </div>
        ) : null}
      </div>

      <div className="max-h-[48dvh] overflow-y-auto border-t border-fr-v2-cream-rule px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
        <div className="flex overflow-hidden rounded-full border border-fr-v2-forest" role="group" aria-label="What one finger does on the map">
          {modeButton("draw", "Draw fences")}
          {modeButton("move", "Move map or change a fence")}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {pending.length >= 2 ? (
            <button type="button" onClick={done} className="flex min-h-11 items-center gap-1.5 rounded-full bg-fr-green-700 px-5 text-sm font-semibold text-white"><Check className="size-4" aria-hidden />Done</button>
          ) : null}
          <button type="button" onClick={undo} disabled={!canUndo} className="flex min-h-11 items-center gap-1.5 rounded-full border border-fr-v2-cream-rule bg-white px-4 text-sm font-semibold text-fr-ink-900 disabled:opacity-40"><RotateCcw className="size-4" aria-hidden />Undo</button>
          {selected !== null ? (
            <button type="button" onClick={deleteSelected} className="flex min-h-11 items-center gap-1.5 rounded-full border border-fr-risk bg-white px-4 text-sm font-semibold text-fr-risk"><Trash2 className="size-4" aria-hidden />Delete fence</button>
          ) : null}
          {walking ? (
            <button type="button" onClick={stopWalking} className="flex min-h-11 items-center gap-1.5 rounded-full border border-fr-v2-cream-rule bg-white px-4 text-sm font-semibold text-fr-ink-900">Stop walking</button>
          ) : (
            <button type="button" onClick={startWalking} className="flex min-h-11 items-center gap-1.5 rounded-full border border-fr-v2-cream-rule bg-white px-4 text-sm font-semibold text-fr-ink-900"><Footprints className="size-4" aria-hidden />Walk the fence</button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fr-ink-900">
          <Rows3 className="size-4 text-fr-ink-600" aria-hidden />
          <span>Or split evenly into</span>
          <select aria-label="Number of paddocks" value={evenCount} onChange={(e) => setEvenCount(Number(e.target.value))} className="min-h-10 rounded-[10px] border border-fr-v2-cream-rule bg-white px-2">
            {[2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" onClick={() => splitEvenly(evenBearing ?? shortestFenceBearing(field.polygon))} className="min-h-10 rounded-full border border-fr-v2-forest px-3 text-sm font-semibold text-fr-v2-forest">Split</button>
          {evenBearing !== null ? (
            <button type="button" onClick={() => splitEvenly((evenBearing + 45) % 180)} className="min-h-10 rounded-full border border-fr-v2-forest px-3 text-sm font-semibold text-fr-v2-forest">Turn the fences</button>
          ) : null}
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
        <button type="button" onClick={() => void save()} disabled={!split || saving || pending.length > 0}
          className="mt-3 min-h-12 w-full rounded-[12px] bg-fr-green-700 text-base font-semibold text-white disabled:opacity-50">
          {saving ? "Saving paddocks…" : split ? `Save ${pieces.length} paddocks` : "Save paddocks"}
        </button>
      </div>
    </div>
  );
}
