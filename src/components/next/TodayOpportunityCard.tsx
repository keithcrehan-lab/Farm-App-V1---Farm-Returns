"use client";

import { ChevronRight, Droplets, FlaskConical, Mountain, Sprout } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Pill } from "@/components/ui/StatusBadge";
import { toneClasses, type StatusTone } from "@/lib/status";
import { cn } from "@/lib/cn";
import type { TodayOpportunity, TodayOpportunityCategory, TodayOpportunityFieldRow } from "@/orchestration/prompt/today-opportunities";

/**
 * Farm-Topic Notification Aggregation V1 (2026-09-19) — the compact
 * "control room, not a feed" card for one farm-level `TodayOpportunity`
 * (`today-opportunities.ts`), and its accompanying drill-down `Sheet`.
 * Reuses this app's existing tone vocabulary (`StatusTone`/`toneClasses`,
 * the same one the priority tracker tile's own dots use) and the
 * existing `Sheet`/`Pill` primitives — no new visual language.
 *
 * Progressive hierarchy the brief asks for: FARM-LEVEL OPPORTUNITY (this
 * card) -> FIELD BREAKDOWN (`TodayOpportunitySheet`'s own field rows) ->
 * SCIENTIFIC EVIDENCE ("View scientific basis", which reuses the
 * existing `ExpandedPromptSheet` for the field's own real `Prompt` —
 * never a new evidence box built here). Only fields whose category has a
 * real `Prompt` producer (Slurry/Fertiliser/Soil) carry that link —
 * Lime has none yet (`today-opportunities.ts`'s own doc comment), so its
 * rows honestly omit it rather than fabricate one.
 *
 * Today Map Notification Visual Hierarchy V1 (2026-09-19) — Priority
 * Colour Reference: HIGH=red, MEDIUM=amber, LOW=green, VERY_LOW=muted
 * grey, everywhere priority is shown (tracker tile, this card/sheet, the
 * map's own field markers in `today/page.tsx`). `toneForTodayPriority`
 * and `PRIORITY_DOT_BG` below are the one shared source for that mapping
 * — never a second, independently-tuned colour scheme.
 */
const CATEGORY_ICON: Record<TodayOpportunityCategory, React.ComponentType<{ className?: string }>> = {
  slurry: Droplets,
  lime: Mountain,
  fertiliser: FlaskConical,
  soil: Sprout,
};

export function toneForTodayPriority(priority: TodayOpportunity["priority"]): StatusTone {
  switch (priority) {
    case "HIGH":
      return "risk";
    case "MEDIUM":
      return "attention";
    case "LOW":
      return "good";
    case "VERY_LOW":
      return "neutral";
  }
}

/** The same small coloured-dot system everywhere priority appears —
 * reused directly (not re-derived) by the tracker tile's own segments
 * and the map's per-field markers. */
export const PRIORITY_DOT_BG: Record<StatusTone, string> = {
  good: "bg-fr-good",
  attention: "bg-fr-attention",
  risk: "bg-fr-risk",
  info: "bg-fr-info",
  neutral: "bg-fr-ink-400",
};

export function TodayOpportunityCard({ opportunity, onOpen }: { opportunity: TodayOpportunity; onOpen: () => void }) {
  const Icon = CATEGORY_ICON[opportunity.category];
  const tone = toneForTodayPriority(opportunity.priority);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-2 rounded-fr-card border border-fr-border bg-fr-surface p-4 text-left shadow-fr-card"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", toneClasses[tone].bg, toneClasses[tone].text)}>
            <Icon className="size-3.5" />
          </span>
          <span className="text-sm font-semibold text-fr-ink-900">{opportunity.categoryLabel}</span>
        </div>
        <Pill tone={tone}>
          <span className={cn("size-1.5 rounded-full", PRIORITY_DOT_BG[tone])} />
          {opportunity.priorityLabel}
        </Pill>
      </div>

      <p className="text-sm font-medium text-fr-ink-900">{opportunity.headline}</p>
      {opportunity.summary ? <p className="text-xs text-fr-ink-600">{opportunity.summary}</p> : null}

      {opportunity.metrics.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {opportunity.metrics.map((metric) => (
            <span key={metric.label} className="text-xs text-fr-ink-600">
              <span className="font-semibold text-fr-ink-900">{metric.value}</span> {metric.label}
            </span>
          ))}
        </div>
      ) : null}

      <span className="mt-1 inline-flex items-center gap-1 self-end text-xs font-semibold text-fr-green-700">
        Review {opportunity.categoryLabel.toLowerCase()} plan
        <ChevronRight className="size-3.5" />
      </span>
    </button>
  );
}

export function TodayOpportunitySheet({
  opportunity,
  open,
  onClose,
  onOpenField,
  onViewEvidence,
}: {
  opportunity: TodayOpportunity | undefined;
  open: boolean;
  onClose: () => void;
  /** Navigates to that field's own Field Detail screen — the brief's own
   * "allow field row to open Field Detail" requirement. */
  onOpenField: (fieldId: string) => void;
  /** Opens the existing `ExpandedPromptSheet` for a field row's own real
   * `Prompt` — only called for rows that actually carry one
   * (`row.sourcePrompt`). */
  onViewEvidence?: (row: TodayOpportunityFieldRow) => void;
}) {
  if (!opportunity) return null;
  const tone = toneForTodayPriority(opportunity.priority);
  return (
    <Sheet open={open} onClose={onClose} title={opportunity.categoryLabel}>
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Pill tone={tone}>
              <span className={cn("size-1.5 rounded-full", PRIORITY_DOT_BG[tone])} />
              {opportunity.priorityLabel}
            </Pill>
            <span className="text-xs text-fr-ink-600">
              {opportunity.affectedFieldCount} {opportunity.affectedFieldCount === 1 ? "field" : "fields"}
            </span>
          </div>
          <p className="font-display mt-1.5 text-lg text-fr-ink-900">{opportunity.headline}</p>
          {opportunity.summary ? <p className="text-sm text-fr-ink-600">{opportunity.summary}</p> : null}
        </div>

        {opportunity.metrics.length > 0 ? (
          <div className="flex flex-wrap gap-4 rounded-fr-control border border-fr-border bg-fr-surface-alt p-3">
            {opportunity.metrics.map((metric) => (
              <div key={metric.label}>
                <p className="text-label uppercase tracking-wide text-fr-ink-600">{metric.label}</p>
                <p className="text-sm font-semibold text-fr-ink-900">{metric.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div>
          <p className="mb-1 text-label uppercase tracking-wide text-fr-ink-600">Field breakdown</p>
          <div className="flex flex-col">
            {opportunity.fields.map((row) => (
              <div key={row.fieldId} className="border-t border-fr-border py-3 first:border-t-0">
                <button type="button" onClick={() => onOpenField(row.fieldId)} className="flex w-full items-center gap-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fr-ink-900">{row.fieldName}</p>
                    <p className="line-clamp-2 text-xs text-fr-ink-600">{row.detail}</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-fr-ink-400" />
                </button>
                {row.sourcePrompt && onViewEvidence ? (
                  <button type="button" onClick={() => onViewEvidence(row)} className="mt-1 text-xs font-semibold text-fr-green-700">
                    View scientific basis →
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
