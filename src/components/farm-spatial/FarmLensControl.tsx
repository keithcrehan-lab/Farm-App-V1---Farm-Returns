"use client";

import { cn } from "@/lib/cn";
import { FARM_LENSES, type FarmLensId } from "@/lib/farm-spatial-lenses";

/**
 * Farm Spatial V2 — the five-lens segmented control that sits on the map
 * (DESIGN_CONTRACT "Five lenses"; reference `.lensbar`). Switching lens
 * only changes contextual information: the caller must never move the
 * camera on a lens change (IMPLEMENTATION_MAP §5). Each active lens takes
 * its own domain colour, so the control is not uniformly green.
 */
export function FarmLensControl({ value, onChange }: { value: FarmLensId; onChange: (lens: FarmLensId) => void }) {
  return (
    <div
      role="group"
      aria-label="Farm lens"
      className="grid grid-cols-5 gap-0.5 rounded-fr-v2-control border border-white/10 bg-fr-v2-glass p-1 shadow-fr-v2-overlay backdrop-blur-sm"
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
              "min-w-0 truncate rounded-[6px] px-1 py-2 text-[11px] font-semibold transition-colors duration-[160ms] motion-reduce:transition-none sm:text-xs lg:py-2.5",
              active ? lens.activeClassName : "text-white/75 hover:bg-white/10 hover:text-white",
            )}
          >
            {lens.label}
          </button>
        );
      })}
    </div>
  );
}
