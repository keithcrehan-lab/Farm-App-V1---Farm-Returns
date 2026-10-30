"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { IRELAND_BBOX, MAPBOX_SATELLITE_STYLE, MAPBOX_TOKEN } from "@/lib/mapbox";

/**
 * Map-led onboarding canvas — the same real Mapbox satellite map the Farm screen uses, filling the screen. It shows
 * only what is real: the point the farmer is positioning (a fixed centre pin, drawn by the caller over the map's
 * padded centre) and, once saved, their own field boundaries. No parcels, shapes or ownership are guessed.
 */
export interface OnboardingMapHandle {
  flyTo: (center: [number, number], zoom: number) => void;
  center: () => [number, number];
}

const FIELDS_SOURCE = "onboarding-fields";
const PENDING_FIELD_SOURCE = "onboarding-pending-field";
/** Ireland with a margin, so the map can't wander off the island. */
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [IRELAND_BBOX[0] - 1.5, IRELAND_BBOX[1] - 1],
  [IRELAND_BBOX[2] + 1.5, IRELAND_BBOX[3] + 1],
];

function featureCollection(fields: readonly { id: string; polygon: GeoJSON.Polygon }[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: fields.map((f) => ({ type: "Feature", id: f.id, properties: {}, geometry: f.polygon })) };
}

function pendingFeature(polygon: GeoJSON.Polygon | null): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: polygon ? [{ type: "Feature", id: "pending-field", properties: { pending: true }, geometry: polygon }] : [],
  };
}

function polygonBounds(polygon: GeoJSON.Polygon): mapboxgl.LngLatBoundsLike | null {
  const ring = polygon.coordinates[0];
  if (!ring?.length) return null;
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const [lng, lat] of ring) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  return Number.isFinite(minLng) && Number.isFinite(minLat) && Number.isFinite(maxLng) && Number.isFinite(maxLat)
    ? [[minLng, minLat], [maxLng, maxLat]]
    : null;
}

export const OnboardingMap = forwardRef<
  OnboardingMapHandle,
  {
    initialCenter: [number, number];
    initialZoom: number;
    /** When provided, start with this radius fully visible in the usable map viewport. */
    initialRadiusKm?: number;
    fields: readonly { id: string; polygon: GeoJSON.Polygon }[];
    /** Boundary just drawn in onboarding but not saved yet. It remains visually distinct from saved fields. */
    pendingPolygon?: GeoJSON.Polygon | null;
    /** Map padding (px) so the centre pin and camera sit in the part of the map the panel doesn't cover. */
    padding: { top: number; bottom: number; left: number; right: number };
    /** The farmer moved the map themselves (drag / zoom / rotate), as opposed to a programmatic fly-to. */
    onUserMove: () => void;
  }
>(function OnboardingMap({ initialCenter, initialZoom, initialRadiusKm, fields, pendingPolygon = null, padding, onUserMove }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onUserMoveRef = useRef(onUserMove);
  const fieldsRef = useRef(fields);
  const pendingPolygonRef = useRef<GeoJSON.Polygon | null>(pendingPolygon);

  useEffect(() => {
    onUserMoveRef.current = onUserMove;
  }, [onUserMove]);

  useImperativeHandle(ref, () => ({
    flyTo: (center, zoom) => {
      const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      mapRef.current?.flyTo({ center, zoom, essential: false, duration: reduce ? 0 : 1400 });
    },
    center: () => {
      const c = mapRef.current?.getCenter();
      return c ? [c.lng, c.lat] : initialCenter;
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({ container: containerRef.current, style: MAPBOX_SATELLITE_STYLE, center: initialCenter, zoom: initialZoom, maxBounds: MAX_BOUNDS });
    mapRef.current = map;
    map.setPadding(padding);
    if (initialRadiusKm) {
      const latDelta = initialRadiusKm / 111.32;
      const lonScale = Math.max(0.2, Math.cos((initialCenter[1] * Math.PI) / 180));
      const lonDelta = initialRadiusKm / (111.32 * lonScale);
      map.fitBounds(
        [
          [initialCenter[0] - lonDelta, initialCenter[1] - latDelta],
          [initialCenter[0] + lonDelta, initialCenter[1] + latDelta],
        ],
        { padding, duration: 0 },
      );
    }
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("moveend", (e) => {
      if ((e as { originalEvent?: unknown }).originalEvent) onUserMoveRef.current();
    });
    map.on("load", () => {
      map.addSource(FIELDS_SOURCE, { type: "geojson", data: featureCollection(fieldsRef.current) });
      map.addLayer({ id: `${FIELDS_SOURCE}-fill`, type: "fill", source: FIELDS_SOURCE, paint: { "fill-color": "#e3c77e", "fill-opacity": 0.22 } });
      map.addLayer({ id: `${FIELDS_SOURCE}-line`, type: "line", source: FIELDS_SOURCE, paint: { "line-color": "#e3c77e", "line-width": 2.5 } });

      map.addSource(PENDING_FIELD_SOURCE, { type: "geojson", data: pendingFeature(pendingPolygonRef.current) });
      map.addLayer({
        id: `${PENDING_FIELD_SOURCE}-fill`,
        type: "fill",
        source: PENDING_FIELD_SOURCE,
        paint: { "fill-color": "#e3c77e", "fill-opacity": 0.3 },
      });
      map.addLayer({
        id: `${PENDING_FIELD_SOURCE}-line`,
        type: "line",
        source: PENDING_FIELD_SOURCE,
        paint: { "line-color": "#f1d98f", "line-width": 3.5, "line-dasharray": [1.4, 1] },
      });
    });
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(containerRef.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; later changes flow through the effects below (never a rebuild).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fieldsRef.current = fields;
    const source = mapRef.current?.getSource(FIELDS_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(featureCollection(fields));
  }, [fields]);

  useEffect(() => {
    pendingPolygonRef.current = pendingPolygon;
    const map = mapRef.current;
    const source = map?.getSource(PENDING_FIELD_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(pendingFeature(pendingPolygon));

    if (!map || !pendingPolygon) return;
    const bounds = polygonBounds(pendingPolygon);
    if (!bounds) return;

    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    map.fitBounds(bounds, {
      padding: {
        top: padding.top + 56,
        bottom: padding.bottom + 56,
        left: padding.left + 56,
        right: padding.right + 56,
      },
      maxZoom: 17,
      duration: reduce ? 0 : 700,
    });
  }, [pendingPolygon, padding]);

  useEffect(() => {
    mapRef.current?.setPadding(padding);
  }, [padding]);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" data-onboarding-map />;
});
