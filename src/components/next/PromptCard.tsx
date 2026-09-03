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
 *
 * `variant="light"` (Codex audit rounds 3-4, Phase V1 Today: "remains
 * predominantly dark and tactical despite the required light, warm
 * system") — a white/warm card floating on real map imagery, matching
 * spec §3's own "light legible cards over real imagery" pattern, instead
 * of this card's original dark-green treatment. `variant="dark"` (the
 * default) is unchanged — Plan's own use of this card isn't part of this
 * rebuild phase yet.
 */
export function PromptCard({
  prompt,
  onViewDetails,
  variant = "dark",
  className,
}: {
  prompt: Prompt;
  onViewDetails: () => void;
  variant?: "dark" | "light";
  className?: string;
}) {
  const light = variant === "light";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-fr-card border shadow-fr-card",
        light ? "border-fr-border bg-fr-surface p-4 text-fr-ink-900" : "border-fr-green-700/15 bg-fr-green-900 p-5 text-white",
        className,
      )}
    >
      <span
        className={cn(
          "mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
          light ? "text-fr-green-700" : "text-fr-green-100",
        )}
      >
        <Flag className="size-3.5" />
        What matters now
      </span>
      <p className={cn("font-display leading-snug", light ? "text-lg text-fr-ink-900" : "text-xl text-white")}>{prompt.title}</p>
      {/* Codex audit rounds 5-6 (Phase V1): every description length or
          clamp tried on the light variant still visibly truncated real
          regulatory copy mid-phrase — the description is dropped from
          this compact overlay entirely (title + one CTA, matching how
          little text the reference's own "what matters now" card
          actually carries); the full text is one tap away in the real
          Expanded Prompt sheet. The dark variant (Plan) is unchanged. */}
      {light ? null : <p className="mt-1.5 line-clamp-3 text-sm text-white/70">{prompt.description}</p>}
      <button
        type="button"
        onClick={onViewDetails}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full text-sm font-semibold",
          light ? "mt-3 bg-fr-green-700 px-3.5 py-2 text-white" : "mt-4 bg-fr-green-100 px-4 py-2.5 text-fr-green-900",
        )}
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
