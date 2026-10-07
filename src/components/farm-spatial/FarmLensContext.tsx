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
 *
 * Phase 02B (spatial shell visual refinement): one compact editorial
 * block — a domain-colour rule beside a heading, one supporting line, an
 * optional factual line and plain text links — rather than a stack of
 * separate dark pills. Legibility over the photo comes from the map's own
 * local lower scrim and a text shadow, not a container.
 */
export function FarmLensContext({ lensId, facts = [] }: { lensId: FarmLensId; facts?: readonly string[] }) {
  const lens = farmLensById(lensId);
  return (
    <div className="flex max-w-md items-stretch gap-3 [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]" aria-live="polite" data-lens-context>
      <span aria-hidden className={cn("w-[3px] shrink-0", lens.accentClassName)} />
      <div className="min-w-0 py-0.5">
        <p className="text-[13px] font-semibold leading-snug text-white">{lens.caption}</p>
        {facts.length > 0 ? <p className="mt-1 text-xs font-medium leading-snug text-white/90 tabular-nums">{facts.join(" · ")}</p> : null}
        {lens.unavailableNote ? <p className="mt-1 text-xs leading-snug text-white/72">{lens.unavailableNote}</p> : null}
        {lens.links.length > 0 ? (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {lens.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs font-semibold text-white underline decoration-white/40 underline-offset-[3px] transition-colors duration-[160ms] hover:decoration-white motion-reduce:transition-none"
              >
                {link.label} →
              </Link>
            ))}
          </p>
        ) : null}
      </div>
    </div>
  );
}
