import { cn } from "@/lib/cn";
import { formatHa } from "@/lib/format";
import type { Field } from "@/domain/types";

/**
 * Satellite-style thumbnail placeholder — no live mapping-provider tiles
 * yet (docs/product-requirements.md § open questions), so this is a
 * textured gradient card standing in for the real aerial crop, carrying
 * just the name + area exactly like the reference field-list thumbnails.
 */
export function FieldThumbnail({ field, className }: { field: Field; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-[#5a7a4e] via-[#3c5c3f] to-[#25381f] p-3",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_55%)]" />
      <p className="relative text-sm font-bold leading-tight text-white">{field.name}</p>
      <p className="relative text-xs text-white/80">{formatHa(field.areaHa)}</p>
    </div>
  );
}
