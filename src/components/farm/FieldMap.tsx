"use client";

import { cn } from "@/lib/cn";
import type { StatusTone } from "@/lib/status";
import type { Field } from "@/domain/types";
import { FIELD_SHAPES } from "./field-shapes";

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

/**
 * Shared satellite-style field map — used by the Dashboard hero card and
 * the Fields page. One component so both surfaces render fields at the
 * same position with the same visual language (design-system.md "Map":
 * "selectable persistent field state").
 *
 * Phase 1 placeholder: illustrative polygons (field-shapes.ts), not a live
 * MapLibre/Mapbox layer — see docs/product-requirements.md § open
 * questions.
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

  return (
    <div
      className={cn(
        "relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-[#3c5c3f] to-[#25381f]",
        className,
      )}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {fields.map((field) => {
          const shape = FIELD_SHAPES[field.id];
          if (!shape) return null;
          const tone = getTone(field);
          const selected = field.id === selectedFieldId;
          return (
            <polygon
              key={field.id}
              points={shape.points}
              strokeWidth={selected ? 2.4 : 1.2}
              className={cn(toneFill[tone], interactive && "cursor-pointer transition-[stroke-width]")}
              onClick={onSelectField ? () => onSelectField(field.id) : undefined}
            />
          );
        })}
      </svg>
      {fields.map((field) => {
        const shape = FIELD_SHAPES[field.id];
        if (!shape) return null;
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
            style={{ left: `${shape.labelX}%`, top: `${shape.labelY}%` }}
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
    </div>
  );
}
