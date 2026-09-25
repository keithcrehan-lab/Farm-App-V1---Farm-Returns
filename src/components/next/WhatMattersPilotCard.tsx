"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Flag, ChevronRight, Droplets } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatEur } from "@/lib/format";
import type { WhatMattersPilotResult } from "@/domain/what-matters-presentation";
import type { FarmerConfirmationCode } from "@/domain/slurry-actionability-policy";
import type { FieldMissingSlurryPlanningDetails } from "@/domain/what-matters-no-recommendation";
import { slurryDetailsHref } from "@/lib/slurry-details-link";
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

/** Farmer-facing copy for an empty result, keyed by the real reason code
 * (`what-matters-no-recommendation.ts`, plus the pilot action's own
 * `ECONOMIC_EVIDENCE_UNAVAILABLE`). Only a code with no more specific
 * explanation falls back to the generic lines below. */
const NO_RECOMMENDATION_COPY: Record<string, string> = {
  NO_CANDIDATE_DATA: "No planned slurry spreading has both an application method and date yet, so Farm Return can't value it.",
  NO_POSITIVE_ECONOMIC_OPPORTUNITY: "Your planned slurry spreading was checked, but none of it currently shows a net saving once spreading costs are included.",
  EXCLUDED_BY_ELIGIBILITY_RULE: "Your planned slurry spreading was checked, but none of it is currently eligible to be recommended.",
  OTHER_AUDITED_EXCLUSION: "Your planned slurry spreading was checked, but none of it passed Farm Return's recommendation checks.",
  MISSING_ECONOMIC_EVIDENCE: "Farm Return doesn't yet have the price or spreading-cost information needed to value your planned slurry spreading.",
  ECONOMIC_EVIDENCE_UNAVAILABLE: "Farm Return doesn't yet have the price or spreading-cost information needed to value your planned slurry spreading.",
  UNSUPPORTED_SCIENTIFIC_EVIDENCE: "Farm Return can't yet work out the nutrient value of your planned slurry spreading for the application method or timing you've chosen, so it can't value it.",
  INSUFFICIENT_EVIDENCE: "Farm Return doesn't yet have enough evidence to value your planned slurry spreading.",
};
/** "method and date" / "method" / "date" — only what is actually missing
 * across the farm's incomplete slurry plans. */
function missingSlurryDetailsPhrase(details: readonly FieldMissingSlurryPlanningDetails[]): string {
  const method = details.some((d) => d.missing.includes("method"));
  const date = details.some((d) => d.missing.includes("date"));
  if (method && date) return "planned spreading method and date";
  return method ? "planned spreading method" : "planned spreading date";
}
const NOTHING_NEEDS_ATTENTION_COPY = "Nothing currently needs your attention — check back once new evidence is available.";
const MORE_FIELD_INFORMATION_COPY = "More field information is needed before Farm Return can recommend spreading.";

export function WhatMattersPilotCard({
  result,
  fieldName,
  actionLabel,
  onViewDetails,
  onConfirm,
  missingSlurryDetails = [],
  disabled = false,
  variant = "light",
  className,
}: {
  result: WhatMattersPilotResult;
  /** The server action's own `missingSlurryDetails` — fields whose planned
   * slurry spreading was skipped only for a missing method and/or date.
   * Non-empty turns the no-candidate message into a direct route to the
   * existing field editor; entering the details never promises a
   * recommendation, Today simply re-runs the real evaluation on return. */
  missingSlurryDetails?: readonly FieldMissingSlurryPlanningDetails[];
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
  /** True while the caller's own confirm round-trip is in flight —
   * disables the Yes/No buttons so a second click cannot fire a
   * concurrent request against a `priorDeclarations` snapshot that
   * doesn't yet include the first answer (Codex audit MEDIUM). */
  disabled?: boolean;
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

  if (result.kind === "none" && result.reasonCode === "NO_CANDIDATE_DATA" && missingSlurryDetails.length > 0) {
    return (
      <div className={wrapperClass}>
        <span className={eyebrowClass}>
          <Flag className="size-3.5" />
          What matters now
        </span>
        <p className={cn("font-display leading-snug", light ? "text-base text-fr-ink-900" : "text-lg text-white")}>Slurry opportunities found</p>
        <p className={cn("text-sm", bodyMutedClass)}>
          Farm Return needs the {missingSlurryDetailsPhrase(missingSlurryDetails)} before it can work out which opportunity is likely to give you the best return.
        </p>
        <Link
          href={slurryDetailsHref(missingSlurryDetails[0])}
          className={cn("mt-3 inline-flex items-center text-sm font-semibold", light ? "text-fr-green-700" : "text-white")}
        >
          Add spreading details
          <ChevronRight className="size-4" />
        </Link>
      </div>
    );
  }

  if (result.kind === "none") {
    return (
      <div className={wrapperClass}>
        <span className={eyebrowClass}>
          <Flag className="size-3.5" />
          What matters now
        </span>
        <p className={cn("text-sm", bodyMutedClass)}>{NO_RECOMMENDATION_COPY[result.reasonCode] ?? NOTHING_NEEDS_ATTENTION_COPY}</p>
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
        <p className={cn("text-sm", bodyMutedClass)}>{NO_RECOMMENDATION_COPY[result.reasonCode] ?? MORE_FIELD_INFORMATION_COPY}</p>
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
                disabled={disabled}
                onClick={() => onConfirm?.(code, true)}
                className={cn("rounded-full px-4 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50", light ? "bg-fr-green-700 text-white" : "bg-white text-fr-green-900")}
              >
                Yes
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onConfirm?.(code, false)}
                className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50", light ? "border-fr-border text-fr-ink-900" : "border-white/30 text-white")}
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
  // Hierarchy: action + field → expected net benefit → Rainfall Window
  // Score → one short explanation / details affordance. Presentation only —
  // every value below is read straight off the audited domain result.
  const amountEur = formatEur(Number(result.candidate.amount.amount), true);
  const statLabelClass = cn("text-[11px] font-medium uppercase tracking-wide", bodyMutedClass);
  const declaredRatePerHa =
    result.costAssumption !== null && result.costAssumption.input.status === "quantified" && result.costAssumption.declaration !== null
      ? result.costAssumption.declaration.ratePerHa
      : null;
  return (
    <button type="button" onClick={onViewDetails} className={cn(wrapperClass, "block w-full text-left")}>
      <span className={eyebrowClass}>
        <Flag className="size-3.5" />
        What matters now
      </span>
      <p className={cn("font-display leading-snug", light ? "text-lg text-fr-ink-900" : "text-xl text-white")}>{actionLabel ?? (fieldName ? `Spread slurry on ${fieldName}` : `Spread slurry — rank #${result.candidate.economicRank}`)}</p>
      <div className={cn("mt-3 flex items-end gap-5 border-t pt-3", light ? "border-fr-border" : "border-white/15")}>
        <div className="flex flex-col">
          <span className={cn("font-display text-2xl leading-none tabular-nums", light ? "text-fr-green-700" : "text-fr-green-100")}>{amountEur}</span>
          <span className={cn("mt-1", statLabelClass)}>Expected net benefit</span>
        </div>
        {result.rainfallScore !== null ? (
          <div className="flex flex-col">
            <span className={cn("flex items-center gap-1 text-base font-semibold leading-none tabular-nums", light ? "text-fr-ink-900" : "text-white")}>
              <Droplets className="size-3.5" />
              {Math.round(Number(result.rainfallScore))}/100
            </span>
            <span className={cn("mt-1", statLabelClass)}>Rainfall Window Score</span>
          </div>
        ) : null}
      </div>
      <span className={cn("mt-3 flex items-center justify-between gap-2 text-xs", bodyMutedClass)}>
        <span>{declaredRatePerHa !== null ? `Uses your €${declaredRatePerHa}/ha contractor cost — not a live quote.` : null}</span>
        <span className={cn("flex shrink-0 items-center font-semibold", light ? "text-fr-green-700" : "text-white")}>
          View field
          <ChevronRight className="size-3.5" />
        </span>
      </span>
    </button>
  );
}

/**
 * The smallest possible farmer-entered contractor-cost-rate capture UI
 * (brief: "Slurry spreading cost / € [120] / ha / Save"). Performs NO
 * economics itself — `onSave` is expected to call the real
 * `saveFarmerContractorCostRate` server action and recompute actionability
 * through the real domain path, exactly like `WhatMattersPilotCard`'s own
 * `onConfirm`. This component only captures and validates the raw text
 * input (a positive number) before handing it off.
 */
export function ContractorCostRateInput({
  onSave,
  disabled = false,
  variant = "light",
  className,
  currentRatePerHa = null,
  error = null,
}: {
  /** Called with the entered rate as a plain string (e.g. `"120"`) once
   * the farmer clicks Save. Validation of the exact decimal/positivity
   * rule happens in the real domain layer
   * (`createFarmerContractorCostDeclaration`) — this component only
   * blocks an obviously-empty or non-numeric-looking input. */
  onSave?: (ratePerHa: string) => void;
  disabled?: boolean;
  variant?: "light" | "dark";
  className?: string;
  /** The farm's currently persisted rate, if any — pre-fills the input so
   * a farmer sees/can replace their existing rate rather than a blank
   * field with no sign one is already on record. Arrives asynchronously
   * (after the page's own initial evaluation resolves), so the displayed
   * value is derived from it directly (never copied into local state via
   * an effect) but only while the farmer hasn't started typing their own
   * replacement value. */
  currentRatePerHa?: string | null;
  /** A real save failure's own message (from `saveFarmerContractorCostRate`'s
   * `{status:"error"}` branch, or a thrown transport rejection) — kept
   * separate from the page's general `pilotError` so a failed save leaves
   * this row visible with its own reason rather than replacing the whole
   * What Matters section with the generic "unable to verify" state. */
  error?: string | null;
}) {
  // `null` = the farmer hasn't touched this field yet -> display
  // `currentRatePerHa`. A non-null string is the farmer's own in-progress
  // edit, which always wins once they've started typing.
  const [editedValue, setEditedValue] = useState<string | null>(null);
  const value = editedValue ?? currentRatePerHa ?? "";
  const light = variant === "light";
  const canSave = !disabled && value.trim().length > 0 && Number.isFinite(Number(value)) && Number(value) > 0;
  // Codex audit LOW: desktop and mobile compositions both render this
  // component simultaneously (CSS visibility classes don't remove either
  // instance from the DOM) — a hardcoded id collided between them.
  const inputId = useId();

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-fr-card border px-3 py-2 text-sm",
          light ? "border-fr-border bg-fr-surface text-fr-ink-900" : "border-white/15 bg-fr-ink-900/55 text-white backdrop-blur-sm",
        )}
      >
        <label htmlFor={inputId} className={cn("shrink-0 font-medium", light ? "text-fr-ink-900" : "text-white")}>
          Slurry spreading cost
        </label>
        <span className={light ? "text-fr-ink-600" : "text-white/70"}>€</span>
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="Enter rate"
          value={value}
          disabled={disabled}
          onChange={(e) => setEditedValue(e.target.value)}
          className={cn(
            "w-20 rounded border bg-transparent px-2 py-1 text-right",
            light ? "border-fr-border text-fr-ink-900" : "border-white/30 text-white placeholder:text-white/40",
          )}
        />
        <span className={light ? "text-fr-ink-600" : "text-white/70"}>/ ha</span>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            if (!canSave) return;
            onSave?.(value.trim());
            // Back to deriving from the (about-to-be-updated) persisted
            // rate rather than holding this exact submitted string forever.
            setEditedValue(null);
          }}
          className={cn(
            "ml-auto shrink-0 rounded-full px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50",
            light ? "bg-fr-green-700 text-white" : "bg-white text-fr-green-900",
          )}
        >
          Save
        </button>
      </div>
      {error ? <p className={cn("px-1 text-xs", light ? "text-fr-risk" : "text-white/80")}>{error}</p> : null}
    </div>
  );
}
