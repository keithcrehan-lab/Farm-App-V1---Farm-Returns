"use client";

import { cn } from "@/lib/cn";
import { FARM_LENSES, type FarmLensId } from "@/lib/farm-spatial-lenses";

/**
 * Farm Spatial V2 — the five-lens control along the map's lower edge
 * (DESIGN_CONTRACT "Five lenses"; reference `.lensbar`). Switching lens
 * only changes contextual information: the caller must never move the
 * camera on a lens change (IMPLEMENTATION_MAP §5).
 *
 * Phase 02B (spatial shell visual refinement): not a segmented SaaS
 * control. Strong type; the active lens is marked by its own domain-colour
 * underline rule and full-strength text, never a filled rounded button.
 *
 * Farm Home visual refresh v1: a compact map mode switcher floating over
 * the photo rather than a full-width band — one restrained dark surface,
 * no dividers, every lens label still visible.
 */
export function FarmLensControl({ value, onChange }: { value: FarmLensId; onChange: (lens: FarmLensId) => void }) {
  return (
    <div
      role="group"
      aria-label="Farm lens"
      className="grid grid-cols-5 rounded-fr-v2-control bg-fr-v2-shell/72 px-0.5 shadow-[0_2px_12px_rgba(0,0,0,0.2)] backdrop-blur-md sm:inline-grid"
    >
      {FARM_LENSES.map((lens) => {
        const active = lens.id === value;
        return (
          <button
            key={lens.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(lens.id)}
            className={cn(
              "relative min-w-0 truncate px-0.5 pb-2.5 pt-2 text-[12px] font-semibold tracking-[0.01em] transition-colors duration-[160ms] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white motion-reduce:transition-none sm:px-3.5 sm:text-[13px]",
              active ? "text-white" : "text-white/58 hover:text-white",
            )}
          >
            {lens.label}
            <span
              aria-hidden
              data-lens-rule
              className={cn(
                "absolute inset-x-2 bottom-1 h-[2px] rounded-full transition-opacity duration-[160ms] motion-reduce:transition-none sm:inset-x-3.5",
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
