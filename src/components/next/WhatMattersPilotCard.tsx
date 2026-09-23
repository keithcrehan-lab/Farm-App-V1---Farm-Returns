"use client";

import { Flag, ChevronRight, Droplets } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatEur } from "@/lib/format";
import type { WhatMattersPilotResult } from "@/domain/what-matters-presentation";
import type { FarmerConfirmationCode } from "@/domain/slurry-actionability-policy";
import { CONFIRM_FIELD_TRAFFICABLE, CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, CONFIRM_NOT_FROZEN_OR_SNOW_COVERED } from "@/domain/slurry-actionability-policy";

/**
 * What Matters pilot presentation — the first real UI consumer of the
 * Economic Opportunity Engine's full audited chain (Phase 5 → 11B →
 * `SLURRY_ACTIONABILITY_POLICY_IE_V1` → Phase 10 → Phase 9).
 *
 * Live on `today/page.tsx` (What Matters On Today Page V1): it is now the
 * ONLY source for that screen's "What matters now" recommendation slot,
 * fed by the real server action `src/app/actions/what-matters-pilot.ts`
 * (real farm data, real Met Éireann weather, real persisted CSO price
 * evidence). The old `Prompt`/`select-primary.ts` path no longer drives
 * that slot — it remains in use elsewhere on the same page (the
 * opportunity rail, the map's selected-field default, Ask AI context),
 * which are a separate, unrelated concern this integration does not touch.
 *
 * Reuses `PromptCard`'s established visual language (rounded-fr-card,
 * shadow-fr-card, the light/dark variant split, the "What matters now"
 * eyebrow) rather than introducing a new card style.
 *
 * Confirmation flow (brief Part 3): renders ONLY the unresolved farmer
 * question(s) via `onConfirm`. It never flips its own display state to
 * "actionable" directly — the caller is expected to re-run the real
 * domain path (`evaluateSlurryActionability` → `buildWhatMattersPilotPresentation`)
 * with the farmer's new declaration and pass the freshly recomputed
 * `WhatMattersPilotResult` back in as a prop, exactly like every other
 * piece of state in this engine.
 */

const CONFIRMATION_COPY: Record<FarmerConfirmationCode, string> = {
  [CONFIRM_FIELD_TRAFFICABLE]: "Is this field currently trafficable for your slurry-spreading equipment?",
  [CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER]: "Is the field free of visible waterlogging or standing water?",
  [CONFIRM_NOT_FROZEN_OR_SNOW_COVERED]: "Is the ground free of frost or snow cover?",
};

export function WhatMattersPilotCard({
  result,
  fieldName,
  actionLabel,
  onViewDetails,
  onConfirm,
  variant = "light",
  className,
}: {
  result: WhatMattersPilotResult;
  /** Real `Field.name` — resolved by the caller, which already holds the
   * farm's Field records; this component never invents one. */
  fieldName?: string;
  actionLabel?: string;
  onViewDetails?: () => void;
  /** Called with the farmer's yes/no answer to exactly one unresolved
   * condition code. The caller is responsible for building a real
   * `FarmerDeclarationEvidence` and recomputing actionability through the
   * real domain path — this component performs no recalculation itself. */
  onConfirm?: (code: FarmerConfirmationCode, value: boolean) => void;
  variant?: "light" | "dark";
  className?: string;
}) {
  const light = variant === "light";
  const wrapperClass = cn(
    "relative overflow-hidden rounded-fr-card border shadow-fr-card",
    light ? "border-fr-border bg-fr-surface p-4 text-fr-ink-900" : "border-fr-green-700/15 bg-fr-green-900 p-5 text-white",
    className,
  );
  const eyebrowClass = cn("mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", light ? "text-fr-green-700" : "text-fr-green-100");
  const bodyMutedClass = light ? "text-fr-ink-600" : "text-white/70";

  if (result.kind === "none") {
    return (
      <div className={wrapperClass}>
        <span className={eyebrowClass}>
          <Flag className="size-3.5" />
          What matters now
        </span>
        <p className={cn("text-sm", bodyMutedClass)}>Nothing currently needs your attention — check back once new evidence is available.</p>
      </div>
    );
  }

  if (result.kind === "unknown") {
    return (
      <div className={wrapperClass}>
        <span className={eyebrowClass}>
          <Flag className="size-3.5" />
          What matters now
        </span>
        <p className={cn("text-sm", bodyMutedClass)}>More field information is needed before Farm Return can recommend spreading.</p>
      </div>
    );
  }

  if (result.kind === "blocked") {
    return (
      <div className={wrapperClass}>
        <span className={eyebrowClass}>
          <Flag className="size-3.5" />
          What matters now
        </span>
        <p className={cn("font-display leading-snug", light ? "text-base text-fr-ink-900" : "text-lg text-white")}>
          {fieldName ?? `Rank #${result.candidate.economicRank}`}
        </p>
        <p className={cn("text-sm", bodyMutedClass)}>Not currently recommended — {result.reasonCode.replaceAll("_", " ").toLowerCase()}.</p>
      </div>
    );
  }

  if (result.kind === "needs_confirmation") {
    return (
      <div className={wrapperClass}>
        <span className={eyebrowClass}>
          <Flag className="size-3.5" />
          One thing to confirm
        </span>
        {result.requiredConfirmations.map((code) => (
          <div key={code} className="mb-2 last:mb-0">
            <p className={cn("mb-2 text-sm font-medium", light ? "text-fr-ink-900" : "text-white")}>{CONFIRMATION_COPY[code]}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onConfirm?.(code, true)}
                className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", light ? "bg-fr-green-700 text-white" : "bg-white text-fr-green-900")}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => onConfirm?.(code, false)}
                className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold", light ? "border-fr-border text-fr-ink-900" : "border-white/30 text-white")}
              >
                No
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // result.kind === "actionable"
  const amountEur = formatEur(Number(result.candidate.amount.amount), true);
  return (
    <button type="button" onClick={onViewDetails} className={cn(wrapperClass, "block w-full text-left")}>
      <span className={eyebrowClass}>
        <Flag className="size-3.5" />
        What matters now
      </span>
      <p className={cn("font-display leading-snug", light ? "text-lg text-fr-ink-900" : "text-xl text-white")}>{actionLabel ?? (fieldName ? `Spread slurry on ${fieldName}` : `Spread slurry — rank #${result.candidate.economicRank}`)}</p>
      <p className={cn("mt-1 text-sm font-medium", light ? "text-fr-green-700" : "text-fr-green-100")}>{amountEur} expected economic benefit</p>
      {result.rainfallScore !== null ? (
        <p className={cn("mt-1 flex items-center gap-1 text-xs", bodyMutedClass)}>
          <Droplets className="size-3.5" />
          Rainfall Window {Math.round(Number(result.rainfallScore))}/100
        </p>
      ) : null}
      <ChevronRight className={cn("absolute right-4 top-4 size-4", bodyMutedClass)} />
    </button>
  );
}
