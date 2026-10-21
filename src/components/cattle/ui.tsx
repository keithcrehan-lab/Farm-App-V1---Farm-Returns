"use client";

/**
 * Cattle C10 — the small visual vocabulary of the cattle reference
 * experience (Farm Spatial V2 tokens). Hierarchy comes from type, space and
 * rules; a container appears only where containment means something (the
 * record sheet, a "Why?" panel). Every state carries a text label, so no
 * meaning depends on colour alone, and unknown has its own hollow mark —
 * never a green tick.
 */

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { DisplayState, DisplayTone } from "@/domain/cattle/presentation";
import styles from "./cattle.module.css";

export const TONE_TEXT: Record<DisplayTone, string> = {
  good: "text-fr-v2-forest",
  neutral: "text-fr-v2-graphite",
  info: "text-fr-v2-cobalt",
  attention: "text-fr-v2-harvest-ink",
  risk: "text-[#b23a2b]",
  unknown: "text-fr-v2-muted",
  conflict: "text-fr-v2-clay",
  review: "text-fr-v2-cobalt",
};

/** The glyph: filled for resolved states, hollow / dashed for unknown, split for conflict, square for review. */
export function StateGlyph({ tone, className = "" }: { tone: DisplayTone; className?: string }) {
  const base = `inline-block h-2.5 w-2.5 shrink-0 ${className}`;
  if (tone === "unknown") return <span aria-hidden className={`${base} rounded-full border-[1.5px] border-dashed border-fr-v2-muted`} />;
  if (tone === "conflict") return <span aria-hidden className={`${base} rounded-full bg-[linear-gradient(90deg,var(--fr-v2-clay)_50%,transparent_50%)] ring-[1.5px] ring-fr-v2-clay ring-inset`} />;
  if (tone === "review") return <span aria-hidden className={`${base} rounded-[2px] border-[1.5px] border-fr-v2-cobalt`} />;
  const fill: Record<DisplayTone, string> = {
    good: "bg-fr-v2-forest",
    neutral: "bg-fr-v2-graphite/70",
    info: "bg-fr-v2-cobalt",
    attention: "bg-fr-v2-harvest",
    risk: "bg-[#b23a2b]",
    unknown: "",
    conflict: "",
    review: "",
  };
  return <span aria-hidden className={`${base} rounded-full ${fill[tone]}`} />;
}

export function StateLabel({ state, className = "", detail = false }: { state: DisplayState; className?: string; detail?: boolean }) {
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${TONE_TEXT[state.tone]}`} data-state={state.code}>
        <StateGlyph tone={state.tone} />
        {state.label}
      </span>
      {detail && state.detail ? <span className="mt-0.5 text-sm text-fr-v2-muted">{state.detail}</span> : null}
    </span>
  );
}

export function SectionHeading({ id, title, aside }: { id?: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-fr-v2-rule pt-5">
      <h2 id={id} className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fr-v2-muted">
        {title}
      </h2>
      {aside}
    </div>
  );
}

export function Metric({ label, value, unit, state, caption, emphasis = false, flashKey }: { label: string; value: string | null; unit: string | null; state: DisplayState; caption: string | null; emphasis?: boolean; flashKey?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-fr-v2-muted">{label}</div>
      {value !== null ? (
        <div key={flashKey ?? value} className={`mt-1 flex items-baseline gap-1 tabular-nums text-fr-v2-graphite ${styles.settle}`}>
          <span className={emphasis ? "text-[44px] font-semibold leading-none tracking-tight" : "text-[30px] font-semibold leading-none tracking-tight"}>{value}</span>
          {unit ? <span className="text-base text-fr-v2-muted">{unit}</span> : null}
        </div>
      ) : (
        <div className="mt-2">
          <StateLabel state={state} detail />
        </div>
      )}
      {value !== null && caption ? <div className="mt-1.5 text-sm text-fr-v2-muted">{caption}</div> : null}
      {value !== null && state.tone !== "neutral" ? <StateLabel state={state} className="mt-1" /> : null}
    </div>
  );
}

export function DemoNotice({ children }: { children?: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 border-l-2 border-fr-v2-harvest bg-fr-v2-harvest-tint/60 px-3 py-2 text-[13px] text-fr-v2-charcoal" role="note">
      <span className="font-semibold">Demonstration herd.</span>
      <span>{children ?? "Synthetic animals run through the real cattle engine. Nothing you do here is saved; a reload starts again."}</span>
    </p>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-fr-v2-forest hover:underline">
      <span aria-hidden>←</span> {label}
    </Link>
  );
}

/** Progressive disclosure ("Why?") — a real button, never hover-only. */
export function Disclosure({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-fr-v2-forest">
        <span aria-hidden className={`inline-block transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
          ›
        </span>
        {label}
      </button>
      {open ? (
        <div id={id} className={`pb-2 ${styles.settle}`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Bottom sheet (mobile) / centred panel (desktop). Escape and the scrim close it; focus moves in and back. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input") ?? ref.current?.querySelector<HTMLElement>("button, [tabindex]");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className={`absolute inset-0 bg-fr-v2-graphite/40 ${styles.scrim}`} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`relative w-full max-w-lg rounded-t-[20px] bg-fr-v2-paper px-5 pb-8 pt-3 shadow-fr-v2-drawer lg:rounded-[14px] lg:pb-6 ${styles.sheetIn}`}>
        <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-fr-v2-rule lg:hidden" />
        <h2 id={titleId} className="text-lg font-semibold text-fr-v2-graphite">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Pending({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-fr-v2-muted" role="status" aria-live="polite">
      <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-fr-v2-teal motion-reduce:animate-none" />
      {label}
    </span>
  );
}

export const cattleStyles = styles;
