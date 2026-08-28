"use client";

import { cn } from "@/lib/cn";
import type { StatusTone } from "@/lib/status";
import type { Field } from "@/domain/types";

/**
 * Status tones plus the one land-use-only colour (silage) that doesn't map
 * to a status meaning — see globals.css's "Field-map land-use legend" note.
 */
export type MapTone = StatusTone | "silage";

const toneFill: Record<MapTone, string> = {
  good: "fill-fr-good/25 stroke-fr-good",
  attention: "fill-fr-attention/25 stroke-fr-attention",
  risk: "fill-fr-risk/25 stroke-fr-risk",
  info: "fill-fr-info/25 stroke-fr-info",
  neutral: "fill-fr-ink-400/15 stroke-fr-ink-400",
  silage: "fill-fr-map-silage/25 stroke-fr-map-silage",
};

const toneBadge: Record<MapTone, string> = {
  good: "bg-fr-good text-white",
  attention: "bg-fr-attention text-white",
  risk: "bg-fr-risk text-white",
  info: "bg-fr-info text-white",
  neutral: "bg-fr-ink-400 text-white",
  silage: "bg-fr-map-silage text-white",
};

/** Padding around the projected bounding box, in viewBox units (0-100), so
 * a field boundary never touches the map's edge. */
const PROJECTION_PADDING = 8;

interface Projection {
  project: (position: GeoJSON.Position) => [number, number];
}

/**
 * Real bounding-box projection of every mapped field's actual polygon onto
 * the shared 0-100 SVG viewBox — geographic lng/lat, not an illustrative
 * hand-placed shape (see this file's own history: `field-shapes.ts`, four
 * hardcoded polygons keyed by the four Phase 1 mock field ids, silently
 * rendered nothing for any real Supabase-backed field). Latitude is
 * flipped (SVG y grows downward, latitude grows northward). A single-point
 * or degenerate bounding box (one field, or every field at the same spot)
 * falls back to centring everything rather than dividing by zero.
 */
function buildProjection(polygons: GeoJSON.Polygon[]): Projection | null {
  const allPositions = polygons.flatMap((p) => p.coordinates[0] ?? []);
  if (allPositions.length === 0) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of allPositions) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const lngSpan = maxLng - minLng || 1;
  const latSpan = maxLat - minLat || 1;
  const usable = 100 - PROJECTION_PADDING * 2;

  return {
    project: ([lng, lat]) => {
      const x = PROJECTION_PADDING + ((lng - minLng) / lngSpan) * usable;
      const y = PROJECTION_PADDING + (1 - (lat - minLat) / latSpan) * usable;
      return [x, y];
    },
  };
}

/**
 * Shared field map — used by the Dashboard hero card and the Fields page.
 * Renders each field's own real, persisted `polygon` (Codex remediation
 * Priority 7 — the canonical geometry drives every surface, not a
 * duplicated illustrative shape), projected to fit whatever set of fields
 * is passed in. A field with no `polygon` yet (not mapped) renders no
 * shape and no label — an honest "not mapped" absence, not a guessed
 * placement.
 */
export function FieldMap({
  fields,
  getTone,
  renderBadge,
  selectedFieldId,
  onSelectField,
  className,
}: {
  fields: Field[];
  getTone: (field: Field) => MapTone;
  renderBadge?: (field: Field) => React.ReactNode;
  selectedFieldId?: string;
  onSelectField?: (fieldId: string) => void;
  className?: string;
}) {
  const interactive = Boolean(onSelectField);
  const mappedFields = fields.filter((f): f is Field & { polygon: GeoJSON.Polygon } => f.polygon !== undefined);
  const projection = buildProjection(mappedFields.map((f) => f.polygon));

  return (
    <div
      className={cn(
        "relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-[#3c5c3f] to-[#25381f]",
        className,
      )}
    >
      {projection ? (
        <>
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            {mappedFields.map((field) => {
              const ring = field.polygon.coordinates[0] ?? [];
              const points = ring.map((pos) => projection.project(pos).join(",")).join(" ");
              const tone = getTone(field);
              const selected = field.id === selectedFieldId;
              return (
                <polygon
                  key={field.id}
                  points={points}
                  strokeWidth={selected ? 2.4 : 1.2}
                  className={cn(toneFill[tone], interactive && "cursor-pointer transition-[stroke-width]")}
                  onClick={onSelectField ? () => onSelectField(field.id) : undefined}
                />
              );
            })}
          </svg>
          {mappedFields.map((field) => {
            const [labelX, labelY] = projection.project(field.centroid);
            const tone = getTone(field);
            const selected = field.id === selectedFieldId;
            const Tag = interactive ? "button" : "div";
            return (
              <Tag
                key={field.id}
                type={interactive ? "button" : undefined}
                onClick={onSelectField ? () => onSelectField(field.id) : undefined}
                className={cn(
                  "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1",
                  interactive && "cursor-pointer",
                )}
                style={{ left: `${labelX}%`, top: `${labelY}%` }}
              >
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-medium text-white",
                    selected ? "bg-fr-green-700" : "bg-black/40",
                  )}
                >
                  {field.name.replace(" Field", "")}
                </span>
                {renderBadge ? (
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-[11px] font-bold shadow",
                      toneBadge[tone],
                    )}
                  >
                    {renderBadge(field)}
                  </span>
                ) : null}
              </Tag>
            );
          })}
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-sm font-medium text-white">No mapped field boundaries yet</p>
          <p className="text-xs text-white/60">Add a field and draw its boundary to see it here.</p>
        </div>
      )}
    </div>
  );
}
