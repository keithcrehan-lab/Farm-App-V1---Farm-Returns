"use client";

import { Flag, ChevronRight } from "lucide-react";
import type { Prompt } from "@/orchestration/prompt";
import { cn } from "@/lib/cn";

/**
 * Today's primary "What matters now" card (`FARM_RETURN_NEXT_SPEC_v1_1.md`
 * §8, reference `media/image2.png`) — restyled into the approved light
 * system (§3), not the dark reference's colour treatment. Renders exactly
 * one real `Prompt`; `TodayPageClient` is responsible for picking which
 * one via `selectPrimaryPrompt` (`src/orchestration/prompt/select-primary.ts`)
 * — this component never chooses among several itself.
 *
 * The reference mock-up's button says "Start job" — this build has no
 * real Act-stage job type wired to any of the four shipped Prompt kinds
 * yet (`docs/overnight/BLOCKERS.md`'s "GPS Job Mode/Confirm Actual
 * persistence" entry), so this card must not offer a button that implies
 * one gets created. "View details" opens the real Expanded Prompt sheet,
 * where a genuine Accept/Dismiss decision is recorded instead.
 */
export function PromptCard({ prompt, onViewDetails, className }: { prompt: Prompt; onViewDetails: () => void; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-fr-card border border-fr-green-700/15 bg-fr-green-900 p-5 text-white shadow-fr-card",
        className,
      )}
    >
      <span className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fr-green-100">
        <Flag className="size-3.5" />
        What matters now
      </span>
      <p className="font-display text-xl leading-snug text-white">{prompt.title}</p>
      <p className="mt-2 line-clamp-3 text-sm text-white/70">{prompt.description}</p>
      <button
        type="button"
        onClick={onViewDetails}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-fr-green-100 px-4 py-2.5 text-sm font-semibold text-fr-green-900"
      >
        View details
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/** Plan's "genuine opportunities" list / Today's "nothing else needs
 * attention" secondary prompts — a compact row variant of the same real
 * `Prompt`, reusing this file rather than a second near-identical card
 * (`CLAUDE.md`'s reuse rule). */
export function PromptListRow({ prompt, onViewDetails }: { prompt: Prompt; onViewDetails: () => void }) {
  return (
    <button
      type="button"
      onClick={onViewDetails}
      className="flex w-full items-center justify-between gap-3 border-t border-fr-border py-3 text-left first:border-t-0 first:pt-0"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-fr-ink-900">{prompt.title}</p>
        <p className="truncate text-xs text-fr-ink-600">{prompt.description}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-fr-ink-400" />
    </button>
  );
}
