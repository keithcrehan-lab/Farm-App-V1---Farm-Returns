"use client";

import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared pieces for the Farm Return auth screens (create account, sign in), in the Farm/Fields language: serif
 * heading, mono labels, cream inputs with a forest focus, one deep-forest primary action. No cards, no marketing.
 */
export const authInputClass =
  "mt-1.5 min-h-12 w-full border border-fr-v2-cream-rule bg-white px-3 text-[16px] text-fr-v2-graphite placeholder:text-fr-v2-muted/70 focus:border-fr-v2-forest focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fr-v2-forest";

export function AuthHeading({ title, lead }: { title: string; lead: string | null }) {
  return (
    <>
      <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.015em] text-fr-v2-graphite">{title}</h1>
      {lead ? <p className="mt-3 text-[15px] leading-snug text-fr-v2-charcoal">{lead}</p> : null}
    </>
  );
}

export function AuthField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fr-v2-muted">
      {label}
      {children}
      {hint ? <span className="mt-1.5 block font-sans text-[12px] normal-case tracking-normal text-fr-v2-muted">{hint}</span> : null}
    </label>
  );
}

export function AuthSubmit({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-12 w-full items-center justify-between gap-3 bg-fr-v2-forest-deep px-4 text-[15px] font-semibold text-white transition-colors duration-[160ms] hover:bg-fr-v2-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fr-v2-forest disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
    >
      {pending ? pendingLabel : label}
      <ArrowRight className="size-4" aria-hidden />
    </button>
  );
}

export function AuthMessage({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={tone === "error" ? "border-l-[3px] border-fr-v2-clay bg-fr-v2-clay-tint px-3 py-2.5 text-sm text-fr-v2-graphite" : "border-l-[3px] border-fr-v2-forest bg-white px-3 py-2.5 text-sm text-fr-v2-graphite"}>
      {children}
    </p>
  );
}
