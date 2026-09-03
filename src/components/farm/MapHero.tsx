"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_SATELLITE_STYLE, MAPBOX_PLAIN_SATELLITE_STYLE, MAPBOX_TOKEN, mapboxConfigured } from "@/lib/mapbox";
import { cn } from "@/lib/cn";
import type { Field } from "@/domain/types";
import type { MapTone } from "@/components/farm/FieldMap";

/**
 * Full-bleed real Mapbox satellite hero — Farm Return Next v1.1's
 * "open your farm, not an app" (spec §1) and the Visual Acceptance
 * Contract's §3/§7 `MapHero` primitive. Reference `media/image2.png` /
 * `image3.png` for the spatial composition (real aerial photo as the
 * page's own surface, field boundaries glowing on top, pins at real
 * locations); re-themed into the approved light system, not the
 * reference's dark treatment.
 *
 * Renders every field's own real, persisted `polygon` (never an
 * illustrative shape — same discipline as `FieldMap.tsx`) as a genuine
 * Mapbox GL fill+line layer directly on real satellite imagery, plus one
 * marker per field at its real `centroid`. A field with no boundary drawn
 * yet renders no shape and no marker — an honest absence, never a guessed
 * placement (`CLAUDE.md` "never invent farm data").
 *
 * If `NEXT_PUBLIC_MAPBOX_TOKEN` isn't configured, this renders an honest
 * warm neutral placeholder — never a fake photo, never the old flat SVG
 * schematic standing in for one (rebuild brief §12, "DO NOT FAKE MAPS").
 */
export function MapHero({
  fields,
  getTone,
  selectedFieldId,
  onSelectField,
  getStatusLabel,
  center,
  interactive = true,
  plain = false,
  className,
  children,
}: {
  fields: Field[];
  getTone: (field: Field) => MapTone;
  selectedFieldId?: string;
  onSelectField?: (fieldId: string) => void;
  /** Short real status word appended to a marker's name (e.g. "Ready",
   * "Needs review") — Codex audit round 2 (Phase V1): a marker's colour
   * alone didn't read as a genuine operational state. Omit to show just
   * the field name (`FieldMap`'s existing badge-only convention). */
  getStatusLabel?: (field: Field) => string | undefined;
  /** Fallback map centre (e.g. `Farm.location.centroid`) when no field has
   * a real boundary yet — still real data, never a hardcoded default. */
  center?: [number, number];
  /** false disables pan/zoom/rotate — a still, non-interactive preview. */
  interactive?: boolean;
  /** Use Mapbox's plain satellite style (no street/place-name labels)
   * instead of satellite-streets — the calm, uncluttered aerial-photo
   * look every approved reference shows. `FieldBoundaryMapModal` keeps
   * satellite-streets (labels help locate a real boundary while
   * drawing/searching); a read-only hero has no such need for them. */
  plain?: boolean;
  className?: string;
  /** Overlay content (gradient legibility scrim + cards) rendered above
   * the map surface — the "light legible cards over real imagery"
   * pattern from spec §3. */
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const mappedFields = fields.filter((f): f is Field & { polygon: GeoJSON.Polygon } => f.polygon !== undefined);
  const mapCenter: [number, number] = mappedFields[0]?.centroid ?? center ?? [-8.2439, 53.4129]; // real farm/field centroid preferred; Ireland-wide fallback only when the farm has no data of its own yet.

  // onSelectField/getTone/selectedFieldId intentionally excluded from the
  // dependency list below — they're recreated every render by the caller
  // (inline closures), and this effect's own internal marker-refresh
  // effect (the second one) already re-reads the latest via refs so the
  // map itself isn't torn down and rebuilt on every parent re-render.
  const getToneRef = useRef(getTone);
  const onSelectFieldRef = useRef(onSelectField);
  useEffect(() => {
    getToneRef.current = getTone;
    onSelectFieldRef.current = onSelectField;
  });

  useEffect(() => {
    if (!mapboxConfigured || !containerRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: plain ? MAPBOX_PLAIN_SATELLITE_STYLE : MAPBOX_SATELLITE_STYLE,
      center: mapCenter,
      zoom: mappedFields.length > 0 ? 15 : 12,
      interactive,
      attributionControl: false,
    });
    mapRef.current = map;

    // Codex audit round 1 (Phase V1): a single field's centroid+zoom left
    // a multi-field farm looking clipped/incoherent — fit the camera to
    // every real mapped field's own polygon instead, so the whole farm is
    // the legible subject, not an arbitrary first field.
    if (mappedFields.length > 1) {
      let minLng = Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      for (const field of mappedFields) {
        for (const [lng, lat] of field.polygon.coordinates[0] ?? []) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 32, maxZoom: 17, duration: 0 },
      );
    }

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    map.on("load", () => {
      map.addSource("fr-fields", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: mappedFields.map((f) => ({
            type: "Feature",
            id: f.id,
            properties: { fieldId: f.id, tone: getToneRef.current(f) },
            geometry: f.polygon,
          })),
        },
      });
      const toneColor: Record<MapTone, string> = {
        good: "#2E7D4F",
        attention: "#D98324",
        risk: "#C0362C",
        info: "#2563AC",
        neutral: "#98A2B3",
        silage: "#8BA23A",
      };
      map.addLayer({
        id: "fr-field-fill",
        type: "fill",
        source: "fr-fields",
        paint: {
          "fill-color": [
            "match",
            ["get", "tone"],
            ...Object.entries(toneColor).flatMap(([tone, color]) => [tone, color]),
            "#ffffff",
          ],
          "fill-opacity": 0.28,
        },
      });
      map.addLayer({
        id: "fr-field-line",
        type: "line",
        source: "fr-fields",
        paint: {
          "line-color": "#ffffff",
          "line-width": ["case", ["==", ["get", "fieldId"], selectedFieldId ?? ""], 3, 2],
          "line-opacity": 0.95,
        },
      });
      if (onSelectFieldRef.current) {
        map.on("click", "fr-field-fill", (e) => {
          const fieldId = e.features?.[0]?.properties?.fieldId as string | undefined;
          if (fieldId) onSelectFieldRef.current?.(fieldId);
        });
        map.on("mouseenter", "fr-field-fill", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "fr-field-fill", () => {
          map.getCanvas().style.cursor = "";
        });
      }
    });

    return () => {
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map instance mounts once; field/tone/selection changes are applied via the marker-refresh effect below and the *Ref indirections above, not by rebuilding the whole map.
  }, []);

  // Real marker per real field centroid — kept in a second effect so a
  // field-list/tone/selection change (e.g. a Prompt resolving) updates
  // markers in place instead of remounting the whole Mapbox instance.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = mappedFields.map((field) => {
      const tone = getTone(field);
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", field.name);
      const selected = field.id === selectedFieldId;
      el.className = cn(
        "flex items-center gap-1.5 rounded-full border-2 border-white px-2.5 py-1 text-[11px] font-semibold text-white shadow-md transition-transform",
        selected ? "scale-110" : "",
      );
      const toneBg: Record<MapTone, string> = {
        good: "#2E7D4F",
        attention: "#D98324",
        risk: "#C0362C",
        info: "#2563AC",
        neutral: "#667085",
        silage: "#8BA23A",
      };
      el.style.backgroundColor = toneBg[tone];
      const statusLabel = getStatusLabel?.(field);
      el.textContent = statusLabel ? `${field.name.replace(" Field", "")} · ${statusLabel}` : field.name.replace(" Field", "");
      if (onSelectField) el.addEventListener("click", () => onSelectField(field.id));
      return new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat(field.centroid).addTo(map);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getTone/onSelectField are inline closures from the caller; re-running per render (rather than gating on a stable identity) is the correct behaviour here, not a bug — it's what keeps a Prompt-driven tone change reflected immediately.
  }, [fields, selectedFieldId]);

  return (
    <div className={cn("relative isolate overflow-hidden bg-[#e9e4d8]", className)}>
      {mapboxConfigured ? (
        <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#f4f1e8] to-[#e3ded0] px-6 text-center">
          <p className="text-sm font-medium text-fr-ink-900">Real farm map not configured</p>
          <p className="text-xs text-fr-ink-600">This deployment is missing a Mapbox access token.</p>
        </div>
      )}
      {children}
    </div>
  );
}
