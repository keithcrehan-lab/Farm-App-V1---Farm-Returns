"use client";

import { cn } from "@/lib/cn";
import { FARM_LENSES, MAP_LENS_IDS, MAP_LENS_LABEL, type FarmLensId } from "@/lib/farm-spatial-lenses";

/**
 * The map view switch: Grass (the map's normal view) or Soil (lime, P and K)
 * (product owner, 2026-11-12: the four-tab row was mostly empty or repeated
 * other controls). A small two-way switch floating over the photo. Switching
 * only changes what the map shows: the caller never moves the camera on a
 * switch (IMPLEMENTATION_MAP §5). The active view is marked by its domain-colour
 * rule and full-strength text, never a filled button (Phase 02B).
 */
export function FarmLensControl({ value, onChange }: { value: FarmLensId; onChange: (lens: FarmLensId) => void }) {
  const lenses = FARM_LENSES.filter((lens) => MAP_LENS_IDS.includes(lens.id));
  return (
    <div
      role="group"
      aria-label="Farm lens"
      className="inline-grid grid-cols-2 rounded-fr-v2-control bg-fr-v2-shell/72 px-0.5 shadow-[0_2px_12px_rgba(0,0,0,0.2)] backdrop-blur-md"
    >
      {lenses.map((lens) => {
        const active = lens.id === value;
        return (
          <button
            key={lens.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(lens.id)}
            className={cn(
              "relative min-h-10 min-w-0 truncate px-3.5 py-2.5 text-[12px] font-semibold tracking-[0.01em] transition-colors duration-[160ms] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white motion-reduce:transition-none sm:text-[13px]",
              active ? "text-white" : "text-white/58 hover:text-white",
            )}
          >
            {MAP_LENS_LABEL[lens.id] ?? lens.label}
            <span
              aria-hidden
              data-lens-rule
              className={cn(
                "absolute inset-x-3.5 bottom-1 h-[2px] rounded-full transition-opacity duration-[160ms] motion-reduce:transition-none",
                lens.accentClassName,
                active ? "opacity-100" : "opacity-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
