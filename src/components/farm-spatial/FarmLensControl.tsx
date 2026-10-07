"use client";

import { cn } from "@/lib/cn";
import { FARM_LENSES, type FarmLensId } from "@/lib/farm-spatial-lenses";

/**
 * Farm Spatial V2 — the five-lens control along the map's lower edge
 * (DESIGN_CONTRACT "Five lenses"; reference `.lensbar`). Switching lens
 * only changes contextual information: the caller must never move the
 * camera on a lens change (IMPLEMENTATION_MAP §5).
 *
 * Phase 02B (spatial shell visual refinement): an architectural band, not
 * a segmented SaaS control. A thin top rule, hairline dividers and strong
 * type; the active lens is marked by its own domain-colour underline rule
 * and full-strength text, never a filled rounded button.
 */
export function FarmLensControl({ value, onChange }: { value: FarmLensId; onChange: (lens: FarmLensId) => void }) {
  return (
    <div
      role="group"
      aria-label="Farm lens"
      className="grid grid-cols-5 divide-x divide-white/10 border-t border-white/20 bg-fr-v2-graphite/75 backdrop-blur-sm"
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
              "relative min-w-0 truncate px-1 pb-3 pt-2.5 text-[12px] font-semibold tracking-[0.01em] transition-colors duration-[160ms] motion-reduce:transition-none sm:text-[13px] lg:pb-3.5 lg:pt-3",
              active ? "text-white" : "text-white/60 hover:text-white",
            )}
          >
            {lens.label}
            <span
              aria-hidden
              data-lens-rule
              className={cn(
                "absolute inset-x-0 bottom-0 h-[3px] transition-opacity duration-[160ms] motion-reduce:transition-none",
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
