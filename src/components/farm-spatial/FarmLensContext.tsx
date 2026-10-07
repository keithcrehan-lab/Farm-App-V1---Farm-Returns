import Link from "next/link";
import { cn } from "@/lib/cn";
import { farmLensById, type FarmLensId } from "@/lib/farm-spatial-lenses";

/**
 * Farm Spatial V2 — the active lens's caption over the map (reference
 * "Requirement · organic nutrients · fertiliser" label): what the lens
 * covers, an honest note for any element with no production source yet,
 * and links to the existing real screens for detail. `facts` are real,
 * already-computed strings the caller passes in (e.g. the spreading
 * calendar status on Conditions) — this component never derives a value.
 */
export function FarmLensContext({ lensId, facts = [] }: { lensId: FarmLensId; facts?: readonly string[] }) {
  const lens = farmLensById(lensId);
  return (
    <div className="flex max-w-full flex-col items-start gap-1.5" aria-live="polite">
      <p className="flex items-stretch overflow-hidden rounded-[4px] bg-fr-v2-glass text-xs font-semibold text-white shadow-fr-v2-overlay backdrop-blur-sm">
        <span aria-hidden className={cn("w-1 shrink-0", lens.accentClassName)} />
        <span className="px-2.5 py-1.5">{lens.caption}</span>
      </p>
      {facts.length > 0 ? (
        <p className="rounded-[4px] bg-fr-v2-glass px-2.5 py-1 text-[11px] text-white/90 backdrop-blur-sm">{facts.join(" · ")}</p>
      ) : null}
      {lens.unavailableNote ? (
        <p className="rounded-[4px] bg-fr-v2-glass px-2.5 py-1 text-[11px] text-white/70 backdrop-blur-sm">{lens.unavailableNote}</p>
      ) : null}
      {lens.links.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {lens.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-[4px] bg-white/92 px-2.5 py-1 text-[11px] font-semibold text-fr-v2-graphite shadow-fr-v2-overlay transition-colors duration-[160ms] hover:bg-white motion-reduce:transition-none"
            >
              {link.label} →
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
