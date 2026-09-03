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
  flyToPadding,
  glowSelection = false,
  compactNeighbourLabels = false,
  userPosition = null,
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
  /** Real Mapbox padding for the `flyToSelection` camera fit — either a
   * single number (uniform, the default) or a per-side object, so a
   * caller whose own overlay chrome is asymmetric (Field detail's own
   * taller top header+status-card area) can keep the selected field
   * centred in the space actually left clear, instead of a uniform
   * padding that visually crowds it toward one edge. */
  flyToPadding?: number | { top: number; bottom: number; left: number; right: number };
  /** Real Mapbox `line-blur` glow on the selected field's boundary
   * (media/image3.png's own literal "Field detail" composition) —
   * opt-in, since Today's whole-farm overview doesn't want a glow. */
  glowSelection?: boolean;
  /** Codex audit round 3 (Strict Visual Reproduction, Field detail):
   * every marker's own name+status label, fine on Today's whole-farm
   * overview (image2.png shows every pin fully labelled), "visually
   * covers more of the aerial surface than image3's compact numbered
   * pins" once a single field is the focus. When true, only the
   * selected field keeps its full label — every other real field shows
   * pin-only, its name/status still reachable via its own
   * `aria-label` and a tap (which selects it, revealing its label). */
  compactNeighbourLabels?: boolean;
  /** Real, one-shot browser geolocation fix (`useOneShotPosition`) — a
   * genuine "you are here" dot on the real photo, matching
   * media/image2.png's own literal composition. Omitted (no marker)
   * whenever permission is denied/unavailable — never a guessed or
   * centred-on-the-farm placeholder position. */
  userPosition?: { lat: number; lng: number } | null;
  className?: string;
  /** Overlay content (gradient legibility scrim + cards) rendered above
   * the map surface — the "light legible cards over real imagery"
   * pattern from spec §3. */
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const mappedFields = fields.filter((f): f is Field & { polygon: GeoJSON.Polygon } => f.polygon !== undefined);
  const mapCenter: [number, number] = mappedFields[0]?.centroid ?? center ?? [-8.2439, 53.4129]; // real farm/field centroid preferred; Ireland-wide fallback only when the farm has no data of its own yet.

  // onSelectField/getTone/selectedFieldId intentionally excluded from the
  // dependency list below — they're recreated every render by the caller
  // (inline closures), and this effect's own internal marker-refresh
  // effect (the second one) already re-reads the latest via refs so the
  // map itself isn't torn down and rebuilt on every parent re-render.
  const getToneRef = useRef(getTone);
  const onSelectFieldRef = useRef(onSelectField);
  // Final audit round 2 (Codex, base a3df614): the mount effect's own
  // `map.on("load", ...)` callback closed over `mappedFields` as of
  // whenever the mount effect itself ran — if a field is added/removed
  // *before* Mapbox's "load" event actually fires (a real race a slow
  // network/style load makes plausible), that callback would install a
  // now-stale initial field collection, and the marker-refresh effect's
  // own `setData` call earlier in the same window is a no-op (the
  // source doesn't exist yet). A ref always read fresh at the moment
  // "load" actually fires closes that gap.
  const mappedFieldsRef = useRef(mappedFields);
  // Same real race, same fix, for the selected-field paint baked in at
  // layer-creation time below (final audit round 3, Codex): Today
  // computes its leading Prompt (and therefore `selectedFieldId`) in a
  // post-mount effect, which can genuinely land before or after
  // Mapbox's own "load" fires — a closed-over `selectedFieldId` risked
  // creating the boundary layers with a stale selection.
  const selectedFieldIdRef = useRef(selectedFieldId);
  useEffect(() => {
    getToneRef.current = getTone;
    onSelectFieldRef.current = onSelectField;
    mappedFieldsRef.current = mappedFields;
    selectedFieldIdRef.current = selectedFieldId;
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
      // Final audit (Codex, base a3df614): `attributionControl: false`
      // removed Mapbox's required data-attribution text entirely — the
      // logo control alone (kept, matches FieldBoundaryMapModal's own
      // untouched default) doesn't satisfy that requirement. Left at
      // Mapbox's own default (enabled) here, same as every other real
      // Mapbox integration in this app.
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
          // mappedFieldsRef.current, not the closed-over `mappedFields`
          // — see this ref's own doc comment above for the real race it
          // closes (a field change between mount and "load" firing).
          features: mappedFieldsRef.current.map((f) => ({
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
          // Strict Visual Reproduction round 2 (Field detail, image3.png):
          // with glowSelection on, drop the tint further still so the
          // glowing edge itself — not the fill — reads as the dominant
          // selection cue, matching the reference's crisp luminous
          // outline over an otherwise untinted field.
          "fill-opacity": glowSelection ? 0.1 : 0.2,
        },
      });
      // Strict Visual Reproduction phase (Field detail, image3.png): the
      // reference's selected field carries a real glowing outline, not
      // just a thicker line. `line-blur` is a genuine Mapbox GL paint
      // property (not a CSS/image trick) — a soft, wide, blurred line
      // beneath the crisp one, visible only for the selected field
      // (opacity 0 elsewhere, real zero rendering cost) and only when
      // the caller opts in (`glowSelection` — Farm/Field exploration's
      // own zoomed-into-a-place context; Today's map-wide overview
      // doesn't want every screen glowing).
      if (glowSelection) {
        map.addLayer({
          id: "fr-field-glow",
          type: "line",
          source: "fr-fields",
          paint: {
            "line-color": [
              "match",
              ["get", "tone"],
              ...Object.entries(toneColor).flatMap(([tone, color]) => [tone, color]),
              "#ffffff",
            ],
            // Codex audit round 2 (Strict Visual Reproduction, Field
            // detail): the glow read as "subdued" next to image3's crisp
            // luminous edge — wider, blurrier and more opaque.
            "line-width": ["case", ["==", ["get", "fieldId"], selectedFieldIdRef.current ?? ""], 15, 0],
            "line-blur": 7,
            "line-opacity": ["case", ["==", ["get", "fieldId"], selectedFieldIdRef.current ?? ""], 0.8, 0],
          },
        });
      }
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
          "line-width": ["case", ["==", ["get", "fieldId"], selectedFieldIdRef.current ?? ""], 2.5, 1.5],
          "line-opacity": ["case", ["==", ["get", "fieldId"], selectedFieldIdRef.current ?? ""], 0.9, 0.75],
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
      map.setPaintProperty(
        "fr-field-fill",
        "fill-opacity",
        glowSelection
          ? ["case", ["==", ["get", "fieldId"], selectedFieldId ?? ""], 0.14, 0.1]
          : ["case", ["==", ["get", "fieldId"], selectedFieldId ?? ""], 0.34, 0.16],
      );
    }
    if (map.getLayer("fr-field-glow")) {
      map.setPaintProperty("fr-field-glow", "line-width", ["case", ["==", ["get", "fieldId"], selectedFieldId ?? ""], 15, 0]);
      map.setPaintProperty("fr-field-glow", "line-opacity", [
        "case",
        ["==", ["get", "fieldId"], selectedFieldId ?? ""],
        0.8,
        0,
      ]);
    }

    // Final audit (Codex, base a3df614): `fr-fields`' own GeoJSON data
    // was only ever set once, inside the mount effect's one-time "load"
    // handler — a field added/archived/re-boundaried after first load
    // (or a tone change from something other than selection, e.g. a
    // Prompt resolving) never reached the map's real polygons/fills at
    // all. `setData` keeps the source's real geometry and tones in sync
    // with the same `fields`/`getTone` this effect already re-runs on.
    const source = map.getSource("fr-fields") as { setData?: (data: GeoJSON.FeatureCollection) => void } | undefined;
    source?.setData?.({
      type: "FeatureCollection",
      features: mappedFields.map((f) => ({
        type: "Feature",
        id: f.id,
        properties: { fieldId: f.id, tone: getToneRef.current(f) },
        geometry: f.polygon,
      })),
    });

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

      // Strict Visual Reproduction phase (2026-09-03): media/image2.png's
      // own real pin marks a place with a colour-coded pin on one side
      // and a two-line bold-status/secondary-context label beside it
      // (horizontal pairing) — not a caption stacked underneath a dot
      // (the prior, composition-only interpretation). anchor: "left"
      // puts the real lng/lat at the pin's own left edge/vertical
      // centre, a small (~half the pin's own width) approximation in
      // exchange for a true horizontal pin+label reading, same
      // real-world precision tradeoff any icon-based map pin makes.
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", statusLabel ? `${field.name} — ${statusLabel}` : field.name);
      el.className = "flex items-center gap-1.5 transition-transform";
      if (selected) el.style.transform = "scale(1.15)";

      // Codex audit round 1 (Strict Visual Reproduction): "field markers
      // use small circular dots... they read more like map captions than
      // anchored places" — a real teardrop/pointer silhouette (the
      // classic rotated-square CSS pin) instead of a plain circle, its
      // own point aligned to the marker's anchor edge.
      const pin = document.createElement("span");
      pin.className = "relative block size-[26px] shrink-0";
      const pinShape = document.createElement("span");
      pinShape.className = "absolute inset-0 rounded-tl-full rounded-tr-full rounded-bl-full border-[2px] border-white shadow-md";
      pinShape.style.backgroundColor = toneBg[tone];
      pinShape.style.transform = "rotate(-45deg)";
      pin.appendChild(pinShape);
      el.appendChild(pin);

      if (!compactNeighbourLabels || selected) {
        const label = document.createElement("span");
        label.className = cn(
          "flex flex-col items-start rounded-lg px-2 py-1 text-left leading-tight shadow-sm",
          selected ? "opacity-100" : "opacity-90",
        );
        label.style.backgroundColor = toneBg[tone];
        if (statusLabel) {
          const bold = document.createElement("span");
          bold.className = "text-[11px] font-semibold text-white";
          bold.textContent = statusLabel;
          const secondary = document.createElement("span");
          secondary.className = "text-[10px] text-white/80";
          secondary.textContent = shortName;
          label.append(bold, secondary);
        } else {
          const bold = document.createElement("span");
          bold.className = "text-[11px] font-semibold text-white";
          bold.textContent = shortName;
          label.append(bold);
        }
        el.appendChild(label);
      }

      if (onSelectField) el.addEventListener("click", () => onSelectField(field.id));
      return new mapboxgl.Marker({ element: el, anchor: "left" }).setLngLat(field.centroid).addTo(map);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getTone/onSelectField are inline closures from the caller; re-running per render (rather than gating on a stable identity) is the correct behaviour here, not a bug — it's what keeps a Prompt-driven tone change reflected immediately.
  }, [fields, selectedFieldId, glowSelection, compactNeighbourLabels]);

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
      { padding: flyToPadding ?? 80, maxZoom: 18, duration: 600 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mappedFields is derived fresh every render from the fields prop; keying on selectedFieldId (and the map/flyToSelection refs) is what actually determines whether this should re-fly, not a new array identity for the same real field set.
  }, [selectedFieldId, flyToSelection]);

  // Real "you are here" dot (media/image2.png's own literal composition)
  // — a genuine one-shot browser geolocation fix, kept in its own effect
  // so a position update never rebuilds the whole field-marker array.
  // No marker at all when `userPosition` is null (denied/unavailable) —
  // never a guessed or farm-centred placeholder.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    if (!userPosition) return;

    const el = document.createElement("div");
    el.setAttribute("aria-label", "Your real current location");
    el.className = "relative flex size-4 items-center justify-center";
    el.innerHTML =
      '<span class="absolute inline-flex size-full animate-ping rounded-full bg-fr-info opacity-60"></span>' +
      '<span class="relative inline-flex size-3 rounded-full border-2 border-white bg-fr-info shadow-md"></span>';

    userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat([userPosition.lng, userPosition.lat])
      .addTo(map);

    return () => {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    };
  }, [userPosition]);

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
