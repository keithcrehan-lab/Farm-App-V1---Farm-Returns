import { cn } from "@/lib/cn";
import { formatHa } from "@/lib/format";
import { isValidBoundaryPolygon } from "@/domain/field-boundary";
import { buildProjection } from "@/components/farm/FieldMap";
import type { Field } from "@/domain/types";

/**
 * Real field-boundary thumbnail — reuses `FieldMap.tsx`'s own bounding-box
 * projection (`buildProjection`, the same fit-and-centre-with-padding logic
 * the Dashboard hero/Fields page map already uses) and `field-boundary.ts`'s
 * own `isValidBoundaryPolygon` check, rather than a second, duplicated
 * geometry renderer. Falls back to the original plain textured tile
 * (no live mapping-provider tiles yet — docs/product-requirements.md §
 * open questions) whenever a field has no real, valid mapped boundary yet
 * — an honest "not mapped" absence, never a guessed shape.
 */
export function FieldThumbnail({ field, className }: { field: Field; className?: string }) {
  const polygon = field.polygon && isValidBoundaryPolygon(field.polygon) ? field.polygon : undefined;
  const projection = polygon ? buildProjection([polygon]) : null;
  const ring = polygon?.coordinates[0] ?? [];

  return (
    <div
      className={cn(
        "relative flex shrink-0 flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-[#3c5c3f] to-[#25381f] p-3",
        className,
      )}
    >
      {projection ? (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <polygon
            points={ring.map((pos) => projection.project(pos).join(",")).join(" ")}
            className="fill-white/10 stroke-white/85"
            strokeWidth={1.75}
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_55%)]" />
      )}
      {/* Bottom-left overlay — a dark scrim under the text keeps it
          readable wherever the boundary outline/fill happens to sit. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/55 to-transparent" />
      <p className="relative text-sm font-bold leading-tight text-white">{field.name}</p>
      <p className="relative text-xs text-white/80">{formatHa(field.areaHa)}</p>
    </div>
  );
}
