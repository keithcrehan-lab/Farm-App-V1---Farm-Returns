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
  flyToSelection = false,
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
  /** Codex audit round 1 (Phase V2, Farm/Field exploration): "selecting
   * a field only updates the list/drawer; the map does not zoom into or
   * visually centre that field." When true, a `selectedFieldId` change
   * flies the camera to that field's real bounds — the Farm/Field
   * exploration screen's own real tap-to-select behaviour. Today passes
   * `selectedFieldId` purely for visual emphasis (which field a Prompt
   * concerns) and deliberately leaves this false — the map shouldn't
   * jump around every time the leading Prompt changes. */
  flyToSelection?: boolean;
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
          // Codex audit round 5 (Phase V1): boundaries should be visually
          // subordinate to the pin markers now carrying the real place/
          // status information — a faint tint rather than a strong fill.
          "fill-opacity": 0.2,
        },
      });
      map.addLayer({
        id: "fr-field-line",
        type: "line",
        source: "fr-fields",
        paint: {
          "line-color": [
            "match",
            ["get", "tone"],
            ...Object.entries(toneColor).flatMap(([tone, color]) => [tone, color]),
            "#ffffff",
          ],
          "line-width": ["case", ["==", ["get", "fieldId"], selectedFieldId ?? ""], 2.5, 1.5],
          "line-opacity": ["case", ["==", ["get", "fieldId"], selectedFieldId ?? ""], 0.9, 0.75],
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

    // Codex audit round 1 (Phase V2): the selected-field boundary
    // emphasis was baked into `fr-field-line`/`fr-field-fill`'s paint
    // *once*, inside the mount effect's `map.on("load", ...)` callback
    // above — real for whatever field was selected at first load, but
    // frozen after that: a later selection change updated markers (this
    // effect already re-runs) but never touched the boundary layers'
    // own paint, so the "selected" field's boundary silently stopped
    // matching the real selection. `setPaintProperty` re-applies both
    // layers' selection-dependent paint every time this effect runs
    // (a no-op if the layers don't exist yet, e.g. before the map's own
    // "load" has fired for the very first time).
    if (map.getLayer("fr-field-line")) {
      map.setPaintProperty("fr-field-line", "line-width", [
        "case",
        ["==", ["get", "fieldId"], selectedFieldId ?? ""],
        3.5,
        1.5,
      ]);
      map.setPaintProperty("fr-field-line", "line-opacity", [
        "case",
        ["==", ["get", "fieldId"], selectedFieldId ?? ""],
        0.95,
        0.7,
      ]);
    }
    if (map.getLayer("fr-field-fill")) {
      map.setPaintProperty("fr-field-fill", "fill-opacity", [
        "case",
        ["==", ["get", "fieldId"], selectedFieldId ?? ""],
        0.34,
        0.16,
      ]);
    }

    markersRef.current.forEach((m) => m.remove());
    const toneBg: Record<MapTone, string> = {
      good: "#2E7D4F",
      attention: "#D98324",
      risk: "#C0362C",
      info: "#2563AC",
      neutral: "#667085",
      silage: "#8BA23A",
    };
    markersRef.current = mappedFields.map((field) => {
      const tone = getTone(field);
      const selected = field.id === selectedFieldId;
      const statusLabel = getStatusLabel?.(field);
      const shortName = field.name.replace(" Field", "");

      // Codex audit round 5 (Phase V1): a full-width text pill sitting on
      // the boundary read as "a GIS annotation," not "a place." A real
      // map pin instead — a small colour-coded dot at the exact
      // centroid, with the name/status as a much smaller caption below
      // it, closer to how every reference image marks a place.
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", statusLabel ? `${field.name} — ${statusLabel}` : field.name);
      el.className = "flex flex-col items-center gap-1 transition-transform";
      if (selected) el.style.transform = "scale(1.22)";

      const dot = document.createElement("span");
      dot.className = "block size-[18px] rounded-full border-[3px] border-white shadow-md";
      dot.style.backgroundColor = toneBg[tone];
      el.appendChild(dot);

      const caption = document.createElement("span");
      caption.className = cn(
        "rounded-full px-2 py-1 text-[11px] font-semibold text-white shadow-sm",
        selected ? "opacity-100" : "opacity-90",
      );
      caption.style.backgroundColor = toneBg[tone];
      caption.textContent = statusLabel ? `${shortName} · ${statusLabel}` : shortName;
      el.appendChild(caption);

      if (onSelectField) el.addEventListener("click", () => onSelectField(field.id));
      return new mapboxgl.Marker({ element: el, anchor: "top" }).setLngLat(field.centroid).addTo(map);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getTone/onSelectField are inline closures from the caller; re-running per render (rather than gating on a stable identity) is the correct behaviour here, not a bug — it's what keeps a Prompt-driven tone change reflected immediately.
  }, [fields, selectedFieldId]);

  // Codex audit round 1 (Phase V2, Farm/Field exploration): real
  // tap-to-select needs a real camera response, not just a list/drawer
  // update elsewhere on the page — flies to the selected field's own
  // real polygon bounds. Opt-in (`flyToSelection`) so Today's own
  // visual-emphasis-only use of `selectedFieldId` never triggers
  // unwanted camera movement.
  useEffect(() => {
    if (!flyToSelection) return;
    const map = mapRef.current;
    const field = mappedFields.find((f) => f.id === selectedFieldId);
    if (!map || !field) return;
    const ring = field.polygon.coordinates[0] ?? [];
    if (ring.length === 0) return;
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 80, maxZoom: 18, duration: 600 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mappedFields is derived fresh every render from the fields prop; keying on selectedFieldId (and the map/flyToSelection refs) is what actually determines whether this should re-fly, not a new array identity for the same real field set.
  }, [selectedFieldId, flyToSelection]);

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
