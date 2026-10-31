"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { Save, Trash2, X } from "lucide-react";
import { bbox } from "@turf/turf";
import { MAPBOX_SATELLITE_STYLE, MAPBOX_TOKEN, mapboxConfigured } from "@/lib/mapbox";
import { calculateSpreadableAreaFromExclusions, type SpreadableAreaGeometryResult } from "@/domain/spreadable-area-geometry";
import { formatNonNegative } from "@/lib/format";

function ha(value: number) {
  return `${formatNonNegative(value, 2)} ha`;
}

const EMPTY_EXCLUSIONS: GeoJSON.Polygon[] = [];

export function SpreadableAreaExclusionMapModal({
  fieldName,
  fieldPolygon,
  initialExclusions,
  onSave,
  onClose,
}: {
  fieldName: string;
  fieldPolygon: GeoJSON.Polygon;
  initialExclusions?: GeoJSON.Polygon[];
  onSave: (result: SpreadableAreaGeometryResult) => void;
  onClose: () => void;
}) {
  const exclusions = initialExclusions ?? EMPTY_EXCLUSIONS;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [result, setResult] = useState(() => calculateSpreadableAreaFromExclusions(fieldPolygon, exclusions));

  useEffect(() => {
    if (!mapboxConfigured || !containerRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const b = bbox({ type: "Feature", properties: {}, geometry: fieldPolygon });
    const fieldBounds: [[number, number], [number, number]] = [[b[0], b[1]], [b[2], b[3]]];
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_SATELLITE_STYLE,
      bounds: fieldBounds,
      fitBoundsOptions: { padding: 70, duration: 0 },
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: exclusions.length ? "simple_select" : "draw_polygon",
    });
    drawRef.current = draw;
    map.addControl(draw, "top-left");

    function sync() {
      const polygons = (draw.getAll().features ?? [])
        .map((item) => item.geometry)
        .filter((geometry): geometry is GeoJSON.Polygon => geometry.type === "Polygon");
      setResult(calculateSpreadableAreaFromExclusions(fieldPolygon, polygons));
    }

    map.on("load", () => {
      map.addSource("spreadable-field", { type: "geojson", data: { type: "Feature", properties: {}, geometry: fieldPolygon } });
      map.addLayer({ id: "spreadable-field-fill", type: "fill", source: "spreadable-field", paint: { "fill-color": "#ffffff", "fill-opacity": 0.06 } });
      map.addLayer({ id: "spreadable-field-line", type: "line", source: "spreadable-field", paint: { "line-color": "#ffffff", "line-width": 2 } });
      // The field bounds are also supplied to the constructor above so the
      // map never opens at the Mapbox style's default camera while waiting
      // for this event. Re-fit once after the modal has its final layout,
      // because Mapbox computes camera padding from the container size.
      requestAnimationFrame(() => {
        map.resize();
        map.fitBounds(fieldBounds, { padding: 70, duration: 0 });
      });
      exclusions.forEach((polygon) => draw.add(polygon));
      sync();
    });
    map.on("draw.create", sync);
    map.on("draw.update", sync);
    map.on("draw.delete", sync);

    return () => {
      ro.disconnect();
      map.remove();
      drawRef.current = null;
    };
  }, [fieldPolygon, exclusions]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/55" role="dialog" aria-modal="true" aria-label={`Map no-spread areas for ${fieldName}`}>
      <header className="flex items-center justify-between border-b border-black/10 bg-fr-v2-cream px-4 py-3 sm:px-6">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-fr-v2-gold">Spreadable area</p>
          <h2 className="mt-0.5 text-lg font-semibold text-fr-v2-graphite">Draw the parts you can’t spread on</h2>
          <p className="mt-1 text-xs text-fr-v2-muted">The white outline is {fieldName}. Use the polygon tool to mark yards, scrub, buffer strips or any other no-spread area.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-full text-fr-v2-muted hover:bg-black/5"><X className="size-5" /></button>
      </header>

      <div className="relative flex-1 bg-fr-v2-forest-deep">
        {mapboxConfigured ? <div ref={containerRef} className="h-full w-full" /> : <div className="flex h-full items-center justify-center p-8 text-center text-sm text-white/80">Mapbox is not configured, so exclusions cannot be drawn here yet.</div>}
        <aside className="absolute bottom-4 left-4 z-10 w-[min(390px,calc(100%-2rem))] border-l-[3px] border-fr-v2-gold bg-fr-v2-forest-deep/95 p-4 text-white shadow-xl backdrop-blur-sm">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-fr-v2-straw">Calculated from your map</p>
          <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-white/55">Whole field</p><p className="mt-0.5 font-semibold tabular-nums">{ha(result.grossAreaHa)}</p></div>
            <div><p className="text-white/55">Excluded</p><p className="mt-0.5 font-semibold tabular-nums">{ha(result.excludedAreaHa)}</p></div>
            <div><p className="text-white/55">Spreadable</p><p className="mt-0.5 font-semibold tabular-nums text-fr-v2-straw">{ha(result.spreadableAreaHa)}</p></div>
          </div>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 bg-fr-v2-cream px-4 py-3 sm:px-6">
        <button type="button" onClick={() => drawRef.current?.deleteAll()} className="flex min-h-10 items-center gap-2 text-sm font-semibold text-fr-v2-muted"><Trash2 className="size-4" />Clear exclusions</button>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="min-h-10 rounded-fr-control border border-fr-v2-cream-rule px-4 text-sm font-semibold text-fr-v2-graphite">Cancel</button>
          <button type="button" onClick={() => onSave(result)} className="flex min-h-10 items-center gap-2 rounded-fr-control bg-fr-v2-forest-deep px-4 text-sm font-semibold text-white"><Save className="size-4" />Use {ha(result.spreadableAreaHa)}</button>
        </div>
      </footer>
    </div>
  );
}
