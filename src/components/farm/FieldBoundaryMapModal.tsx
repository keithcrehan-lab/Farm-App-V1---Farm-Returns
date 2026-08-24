"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";
import { RotateCcw, Save, TriangleAlert, X } from "lucide-react";
import { IRELAND_BBOX, MAPBOX_SATELLITE_STYLE, MAPBOX_TOKEN, mapboxConfigured } from "@/lib/mapbox";
import { formatHa } from "@/lib/format";
import { computeBoundaryGeometry, isValidBoundaryPolygon } from "@/domain/field-boundary";

/**
 * Real field-boundary capture: search an area (Mapbox Geocoder) → the map
 * pans/zooms there → trace the field's boundary on real satellite imagery
 * (Mapbox GL Draw) → save. `onSave` receives the real drawn polygon; the
 * caller (FieldDrawer's "Edit Field") is responsible for persisting it via
 * `setFieldBoundary`, which derives `centroid`/`areaHa` from it for real —
 * see field-boundary.ts's doc comment.
 *
 * Closes `docs/product-requirements.md`'s "Mapping provider account" open
 * question. If `NEXT_PUBLIC_MAPBOX_TOKEN` isn't configured, shows an
 * honest "not configured" state instead of crashing or rendering a broken
 * map — same convention as this app's weather UNAVAILABLE states.
 */
export function FieldBoundaryMapModal({
  fieldName,
  initialCentroid,
  initialPolygon,
  onSave,
  onClose,
}: {
  fieldName: string;
  initialCentroid: [number, number];
  initialPolygon?: GeoJSON.Polygon;
  onSave: (polygon: GeoJSON.Polygon) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [hasDrawing, setHasDrawing] = useState(Boolean(initialPolygon));
  const [error, setError] = useState<string | null>(null);
  const [previewAreaHa, setPreviewAreaHa] = useState<number | null>(null);

  useEffect(() => {
    if (!mapboxConfigured || !containerRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_SATELLITE_STYLE,
      center: initialCentroid,
      zoom: 16,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Mapbox measures the container's size at construction time, which —
    // inside this modal's flex layout — can still be mid-transition (e.g.
    // its final flex-1 height hasn't settled on the very first paint),
    // producing a canvas frozen at a stale/small size. A ResizeObserver
    // catches every subsequent real size change (including the initial
    // settle), not just one; ro.disconnect() on cleanup below.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: initialPolygon ? "simple_select" : "draw_polygon",
    });
    drawRef.current = draw;
    map.addControl(draw, "top-left");

    const geocoder = new MapboxGeocoder({
      accessToken: MAPBOX_TOKEN,
      // @mapbox/mapbox-gl-geocoder's types expect the full `typeof
      // import("mapbox-gl")` CJS namespace shape, which @types/mapbox-gl's
      // default-export type doesn't fully declare (missing a handful of
      // named exports this app never uses, e.g. CanvasSource) — a known
      // gap between the two packages' type declarations, not a real
      // runtime mismatch (mapbox-gl's actual default export is the same
      // object as its module namespace).
      mapboxgl: mapboxgl as unknown as typeof import("mapbox-gl"),
      bbox: IRELAND_BBOX,
      marker: false,
      placeholder: "Search a townland, address or eircode…",
    });
    map.addControl(geocoder, "top-left");

    const syncFromDraw = () => {
      const all = draw.getAll();
      setHasDrawing(all.features.length > 0);
      setError(null);
      const last = all.features[all.features.length - 1];
      if (last && last.geometry.type === "Polygon" && isValidBoundaryPolygon(last.geometry)) {
        setPreviewAreaHa(computeBoundaryGeometry(last.geometry).areaHa);
      } else {
        setPreviewAreaHa(null);
      }
    };

    map.on("load", () => {
      if (initialPolygon) {
        draw.add(initialPolygon);
        syncFromDraw();
      }
    });
    map.on("draw.create", syncFromDraw);
    map.on("draw.update", syncFromDraw);
    map.on("draw.delete", syncFromDraw);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map/draw/geocoder instances are created once per modal open, not re-synced on prop changes; re-running this on every centroid tick would tear down and rebuild the whole map.
  }, []);

  function handleSave() {
    const draw = drawRef.current;
    if (!draw) return;
    const all = draw.getAll();
    if (all.features.length === 0) {
      setError("Draw a boundary before saving — use the polygon tool (top left) to trace the field.");
      return;
    }
    const last = all.features[all.features.length - 1];
    if (last.geometry.type !== "Polygon" || !isValidBoundaryPolygon(last.geometry)) {
      setError("This boundary isn't a valid shape — delete it and redraw.");
      return;
    }
    onSave(last.geometry);
  }

  function handleClearDrawing() {
    drawRef.current?.deleteAll();
    setHasDrawing(false);
    setPreviewAreaHa(null);
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50" role="dialog" aria-modal="true" aria-label={`Map ${fieldName}`}>
      <div className="flex items-center justify-between border-b border-fr-border bg-fr-surface px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-fr-ink-900">Map {fieldName}</h2>
          <p className="text-xs text-fr-ink-600">Search an area, then trace the field boundary on the satellite image.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-fr-ink-600 hover:bg-fr-surface-alt"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="relative flex-1 bg-[#1a2e1e]">
        {mapboxConfigured ? (
          // h-full/w-full, not absolute+inset-0: Mapbox GL JS force-sets
          // `position: relative` on whatever container element it's given
          // (an inline style it applies itself, overriding this className)
          // — depending on absolute positioning to fill the flex parent
          // silently breaks the moment Mapbox does that, collapsing this
          // div to zero height. Percentage sizing against the parent's
          // real flex-resolved height (set on `mapArea` above) works
          // regardless of what position Mapbox ends up setting.
          <div ref={containerRef} className="h-full w-full" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-fr-surface-alt p-6 text-center">
            <TriangleAlert className="size-6 text-fr-attention" />
            <p className="text-sm font-medium text-fr-ink-900">Real field mapping isn&apos;t configured</p>
            <p className="max-w-sm text-xs text-fr-ink-600">
              This deployment is missing a Mapbox access token (<code>NEXT_PUBLIC_MAPBOX_TOKEN</code>) — satellite
              imagery, search and boundary drawing all need one to work.
            </p>
          </div>
        )}
      </div>

      {mapboxConfigured ? (
        <div className="flex flex-col gap-2 border-t border-fr-border bg-fr-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3 text-sm">
            {previewAreaHa !== null ? (
              <span className="font-medium text-fr-ink-900">{formatHa(previewAreaHa)}</span>
            ) : (
              <span className="text-fr-ink-400">No boundary drawn yet</span>
            )}
            {error ? <span className="flex items-center gap-1 text-xs text-fr-risk"><TriangleAlert className="size-3.5" />{error}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            {hasDrawing ? (
              <button
                type="button"
                onClick={handleClearDrawing}
                className="flex items-center gap-1.5 rounded-fr-control border border-fr-border px-3 py-2 text-sm font-medium text-fr-ink-600"
              >
                <RotateCcw className="size-4" />
                Redraw
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasDrawing}
              className="flex items-center gap-1.5 rounded-fr-control bg-fr-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Save className="size-4" />
              Save boundary
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-fr-border bg-fr-surface px-4 py-3 text-right sm:px-6">
          <button type="button" onClick={onClose} className="rounded-fr-control border border-fr-border px-4 py-2 text-sm font-medium text-fr-ink-600">
            Close
          </button>
        </div>
      )}
    </div>
  );
}
