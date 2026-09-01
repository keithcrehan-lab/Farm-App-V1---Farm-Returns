"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * One shared overlay primitive for every "contextual overlay" the v1.1
 * spec calls for — Expanded Prompt, Gate/Constraint detail and Ask AI all
 * say "overlay or bottom sheet so the farmer does not lose their place in
 * the world" (§7's Ask AI rule, echoed for Expanded Prompt in §8 and
 * Gate/Constraint in §12). Built once here and reused by each of them
 * (`ExpandedPromptSheet`, `AskAIOverlay`, ...) rather than each screen
 * growing its own near-identical modal — `CLAUDE.md`'s "never create a
 * visually similar duplicate of an existing component" applied to this
 * checkpoint's own new components, not just the pre-existing ones.
 *
 * No portal (no portal-capable dependency in this app yet, and every real
 * call site today renders this from inside `(app)/layout.tsx`'s own DOM
 * subtree, which is already effectively page-root) — a fixed-position
 * overlay works the same as one for this app's real, single-page-at-a-time
 * navigation model.
 *
 * Mobile: slides up from the bottom, matching the reference mock-ups'
 * bottom-sheet treatment. Desktop: a centred panel — `design-system.md`'s
 * "one product, two compositions" rule applied to this new pattern too.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Overrides the auto-generated heading id when a caller wants to
   * supply its own heading markup instead of this component's default
   * `<h2>` (see `ExpandedPromptSheet`, which renders its own richer
   * header). When omitted, `title` is rendered as the accessible name. */
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Codex audit MEDIUM (round 1): the first version focused the panel and
  // handled Escape, but never trapped Tab/Shift+Tab — a keyboard user
  // could tab straight past the last (or first) focusable control inside
  // the sheet into the page behind it, a real modal-dialog violation
  // (WAI-ARIA APG's dialog pattern), not just a missing nicety.
  function focusableElements(): HTMLElement[] {
    const panel = panelRef.current;
    if (!panel) return [];
    // No visibility (`offsetParent`) filter — jsdom's test environment
    // never computes real layout, so that check would silently make this
    // trap a no-op under every test (`offsetParent` is always `null`
    // there) while still working by accident in a real browser; every
    // real caller of `Sheet` today renders a static set of always-visible
    // controls inside it, so the plain selector is accurate for this
    // component's actual current usage.
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = focusableElements();
      if (focusable.length === 0) {
        // Nothing focusable inside (a transient render) — keep focus from
        // ever escaping to the page behind by re-focusing the panel
        // itself rather than letting Tab fall through.
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="fixed inset-0 bg-fr-ink-900/40"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-t-fr-card border border-fr-border bg-fr-surface p-5 shadow-fr-card",
          "lg:max-w-lg lg:rounded-fr-card",
        )}
      >
        {labelledBy ? null : (
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-title text-fr-ink-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-fr-ink-400 hover:bg-fr-surface-alt hover:text-fr-ink-600"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
