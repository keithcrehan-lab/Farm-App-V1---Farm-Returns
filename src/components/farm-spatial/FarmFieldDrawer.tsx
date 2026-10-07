"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { farmLensById, type FarmLensId } from "@/lib/farm-spatial-lenses";
import type { FarmFieldLensView } from "@/lib/farm-spatial-field-lens";
import type { Field } from "@/domain/types";

/**
 * Farm Spatial V2 Phase 3 — the contextual field drawer that rises from
 * the map's lower edge when a real mapped field is selected
 * (object-before-form). It stays attached to the map so the farm keeps
 * its spatial context: no full-screen modal. Identity is the field's real
 * name and polygon-derived area; everything else is the active lens's
 * already-resolved `FarmFieldLensView` (`farm-spatial-field-lens.ts`).
 * This component derives nothing.
 *
 * Motion: ~280ms rise/fall, collapsed to no transition under
 * `prefers-reduced-motion`. The last field stays rendered while the
 * drawer falls away so the exit isn't a blank flash. Escape and the close
 * button both deselect.
 */
export function FarmFieldDrawer({
  field,
  lensId,
  view,
  onClose,
}: {
  field: Field | undefined;
  lensId: FarmLensId;
  view: FarmFieldLensView | undefined;
  onClose: () => void;
}) {
  const open = Boolean(field && view);
  // Keep the last shown field/view so the falling drawer still has content.
  const [shown, setShown] = useState<{ field: Field; view: FarmFieldLensView } | undefined>(undefined);
  if (field && view && (shown?.field !== field || shown.view !== view)) setShown({ field, view });

  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const fieldId = field?.id;
  useEffect(() => {
    if (!fieldId) return;
    closeRef.current?.focus({ preventScroll: true });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [fieldId]);

  const lens = farmLensById(lensId);
  const content = shown;

  return (
    <section
      aria-label={content ? `${content.field.name} field` : "Field"}
      aria-hidden={!open}
      inert={!open}
      data-field-drawer
      data-open={open ? "true" : "false"}
      className={cn(
        "w-full border-t border-white/15 bg-fr-v2-graphite/90 text-white backdrop-blur-md transition-[transform,opacity] duration-[280ms] ease-out motion-reduce:transition-none lg:max-w-sm lg:rounded-t-[4px] lg:border-x",
        open ? "pointer-events-auto translate-y-0 opacity-100" :"pointer-events-none translate-y-full opacity-0",
      )}
    >
      {content ? (
        <div className="flex">
          <span aria-hidden className={cn("w-[3px] shrink-0 transition-colors duration-[180ms] motion-reduce:transition-none", lens.accentClassName)} />
          <div className="min-w-0 flex-1 px-4 pb-4 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={cn("text-[11px] font-bold uppercase tracking-[0.14em]", lens.kickerClassName)}>{lens.label}</p>
                <h2 className="mt-0.5 truncate font-display text-2xl leading-tight">{content.field.name}</h2>
                <p className="text-xs font-semibold tabular-nums text-white/75">{formatNumber(content.field.areaHa, 2)} ha</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label={`Close ${content.field.name}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-[2px] text-white/75 transition-colors duration-[160ms] hover:bg-white/10 hover:text-white motion-reduce:transition-none"
              >
                <X className="size-4" />
              </button>
            </div>

            {content.view.facts.length > 0 ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/10 pt-3">
                {content.view.facts.map((fact, index) => (
                  <div key={`${fact.label}-${index}`} className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-[0.08em] text-white/60">{fact.label}</dt>
                    <dd className={cn("text-sm font-semibold tabular-nums", fact.missing ? "text-white/60" : "text-white")}>
                      {fact.value}
                      {fact.basis ? <span className="ml-1.5 text-[11px] font-medium text-white/60">{fact.basis}</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {content.view.unavailableNote ? <p className="mt-3 text-xs leading-snug text-white/70">{content.view.unavailableNote}</p> : null}

            {content.view.links.length > 0 ? (
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                {content.view.links.map((link) => (
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
      ) : null}
    </section>
  );
}
