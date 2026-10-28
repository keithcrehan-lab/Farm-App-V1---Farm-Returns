"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { farmLensById, type FarmLensId } from "@/lib/farm-spatial-lenses";
import type { FarmFieldSelectionView, SelectionTone } from "@/lib/farm-field-selection";
import type { Field } from "@/domain/types";

/**
 * Farm + Fields redesign — the selected field coming forward from the map
 * (`docs/design/farm-fields-high-fidelity-reference.md` "Field selection —
 * signature interaction"). A deep forest surface with a thin straw/gold
 * rule, attached to the map rather than opened as a modal, so the rest of
 * the farm stays visible around it.
 *
 * Hierarchy, in order: large serif field name → technical area/use line →
 * one current-state statement → quiet next/planned context → one primary
 * action → deeper links. Everything shown is the caller's already-resolved
 * `FarmFieldSelectionView` (`farm-field-selection.ts`); this component
 * derives nothing. Unknown stays visibly unknown, never zero or clear.
 *
 * Motion: a short rise/fall (~240ms), removed under
 * `prefers-reduced-motion`. The last field stays rendered while the panel
 * falls away so the exit isn't a blank flash. Escape and the close button
 * both deselect; Escape is left to an open dialog when one is on top.
 */
export function FarmFieldDrawer({
  field,
  lensId,
  selection,
  onClose,
  className,
}: {
  field: Field | undefined;
  lensId: FarmLensId;
  selection: FarmFieldSelectionView | undefined;
  onClose: () => void;
  className?: string;
}) {
  const open = Boolean(field && selection);
  // Keep the last shown field/selection so the falling panel still has content.
  const [shown, setShown] = useState<{ field: Field; selection: FarmFieldSelectionView; lensId: FarmLensId } | undefined>(undefined);
  if (field && selection && (shown?.field !== field || shown.selection !== selection || shown.lensId !== lensId)) setShown({ field, selection, lensId });

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
      if (event.key !== "Escape") return;
      // A dialog over the map (What matters, Ask AI) owns Escape first.
      if (document.querySelector('[aria-modal="true"]')) return;
      onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [fieldId]);

  const content = shown;
  const lens = farmLensById(content?.lensId ?? lensId);

  return (
    <section
      aria-label={content ? `${content.field.name} field` : "Field"}
      aria-hidden={!open}
      inert={!open}
      data-field-drawer
      data-open={open ? "true" : "false"}
      className={cn(
        "w-full bg-fr-v2-forest-deep/[0.96] text-white shadow-[0_18px_40px_rgba(0,0,0,0.32)] transition-[transform,opacity] duration-[240ms] ease-[cubic-bezier(0.2,0.75,0.2,1)] motion-reduce:transition-none",
        open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        className,
      )}
    >
      {content ? (
        <div className="flex">
          <span aria-hidden data-selection-rule className="w-[3px] shrink-0 bg-fr-v2-gold" />
          <div className="min-w-0 flex-1 px-5 pb-5 pt-4">
            <div className="flex items-start justify-between gap-3">
              <p className="pt-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-fr-v2-straw">
                Selected field <span className="text-white/45">· {lens.label}</span>
              </p>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label={`Close ${content.field.name}`}
                className="-mr-2 -mt-1 flex size-9 shrink-0 items-center justify-center text-white/60 transition-colors duration-[160ms] hover:text-white focus-visible:outline-2 focus-visible:outline-fr-v2-straw motion-reduce:transition-none"
              >
                <X className="size-4" />
              </button>
            </div>
            <h2 className="mt-1 text-balance font-display text-[30px] leading-[1.02] tracking-[-0.015em]">{content.field.name}</h2>
            <p className="mt-2 font-mono text-[12px] tabular-nums text-white/70" data-selection-identity>
              {content.selection.area}
              {content.selection.useLine ? <span className="text-white/50"> · {content.selection.useLine}</span> : null}
            </p>

            <p data-selection-statement data-tone={content.selection.statement.tone} className={cn("mt-4 text-[15px] leading-snug", STATEMENT_TONE[content.selection.statement.tone])}>
              {content.selection.statement.tone === "blocked" ? <span className="mr-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fr-v2-clay-tint">Blocked</span> : null}
              {content.selection.statement.text}
            </p>

            {content.selection.context.length > 0 ? (
              <dl className="mt-4 border-t border-white/10 pt-3" data-selection-context>
                {content.selection.context.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-4 py-1">
                    <dt className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/50">{row.label}</dt>
                    <dd className={cn("min-w-0 text-right text-[13px] tabular-nums", ROW_TONE[row.tone])}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <Link
              href={content.selection.primaryAction.href}
              data-primary-action
              className="mt-4 flex min-h-11 w-full items-center justify-between gap-3 bg-fr-v2-cream px-4 text-sm font-semibold text-fr-v2-forest-deep transition-colors duration-[160ms] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fr-v2-straw motion-reduce:transition-none"
            >
              {content.selection.primaryAction.label}
              <ArrowRight className="size-4" />
            </Link>

            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {content.selection.secondaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-xs font-semibold text-white/75 underline decoration-white/25 underline-offset-[3px] transition-colors duration-[160ms] hover:text-white hover:decoration-fr-v2-straw motion-reduce:transition-none"
                >
                  {link.label}
                </Link>
              ))}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const STATEMENT_TONE: Record<SelectionTone, string> = {
  fact: "text-white",
  unknown: "text-white/70",
  blocked: "text-white",
};

const ROW_TONE: Record<SelectionTone, string> = {
  fact: "text-white/90",
  unknown: "italic text-white/50",
  blocked: "font-semibold text-fr-v2-clay-tint",
};
