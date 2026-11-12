"use client";

/**
 * Grass V2 guidance: the first-time three-step guide (Next tip, Got it, X), and
 * small help buttons beside unfamiliar terms. The guide is remembered on this
 * device once dismissed and can be reopened with "Show grass guide".
 */
import { useState, type ReactNode } from "react";
import { HelpCircle, X } from "lucide-react";
import { finishGrassGuide, useGrassSettings } from "@/lib/grass-settings";

const STEPS: Array<{ title: string; body: string }> = [
  { title: "Understand your grass", body: "Each bar is a field. Taller bars mean more grass cover. Wider bars are bigger fields." },
  { title: "Understand the red line", body: "The red line is the cover your cattle need, field by field, from what they eat, your grazing area and your rotation. Bars above it are ahead; bars below it are behind." },
  { title: "Explore your fields", body: "Tap a field to see its cover, when it was measured, the cattle in it and what you could do with it." },
];

export function GrassGuide() {
  const settings = useGrassSettings();
  const [step, setStep] = useState(0);
  if (settings.guideDone && !settings.guideOpen) return null;
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const close = () => { finishGrassGuide(); setStep(0); };
  return (
    <div role="dialog" aria-label="Grass guide" className="mb-4 border-l-[3px] border-fr-v2-straw bg-fr-v2-forest-deep px-4 py-3 text-white shadow-[0_6px_18px_rgba(0,0,0,0.18)]" data-grass-guide>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fr-v2-straw">Grass guide · {step + 1} of {STEPS.length}</p>
          <p className="mt-1 font-display text-lg leading-tight">{current.title}</p>
          <p className="mt-1 text-[13px] leading-snug text-white/85">{current.body}</p>
        </div>
        <button type="button" onClick={close} aria-label="Close grass guide" className="grid size-9 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        {!last ? (
          <button type="button" onClick={() => setStep((s) => s + 1)} className="min-h-9 px-3 text-xs font-semibold text-white/80 underline underline-offset-4 hover:text-white">Next tip</button>
        ) : null}
        <button type="button" onClick={close} className="min-h-9 bg-fr-v2-straw px-4 text-xs font-semibold text-fr-v2-forest-deep hover:bg-white">Got it</button>
      </div>
    </div>
  );
}

/** A small "?" beside a term; tapping it shows a one- or two-line explanation in place. */
export function HelpTip({ term, children }: { term: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`What is ${term}?`}
        className="ml-1 inline-grid size-5 place-items-center rounded-full align-[-3px] text-fr-v2-muted hover:text-fr-v2-forest"
      >
        <HelpCircle className="size-3.5" aria-hidden />
      </button>
      {open ? <span role="note" className="mt-1 block max-w-xs text-[11px] font-normal normal-case leading-snug tracking-normal text-fr-v2-muted">{children}</span> : null}
    </span>
  );
}
