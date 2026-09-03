"use client";

/**
 * Plan — Farm Return Next v1.1, canonical screen #5 (§4/§9): "Review
 * Today / Tomorrow / This week, planned jobs, genuine opportunities and
 * windows... Separate committed planned work from genuine
 * opportunities/suggestions... Avoid a generic calendar-first
 * implementation."
 *
 * This build has no real scheduled/dated job anywhere in the app yet —
 * `jobs` (`supabase/migrations/20260829000000_orchestration_foundation.sql`)
 * has no date/window column at all, and no screen creates a `jobs` row
 * for any of the four real Prompt kinds Today surfaces (see
 * `ExpandedPromptSheet`'s own doc comment). A Day/Week/Month tab control
 * with nothing real to show per tab would be exactly the "placeholder
 * content that makes a mock-up look complete" §19 explicitly says not to
 * build — so this screen ships only the half that's real today:
 * "genuine opportunities" (every real Prompt, via the same
 * `buildAllRealPrompts` Today uses) plus an honest, explicit empty state
 * for "planned work", not a fake calendar shell.
 *
 * Visual Alignment Phase V3 (2026-09-03): `media/image1.png`'s own Plan
 * panel is a literal colour/composition reference for this exact screen
 * (§0's "image1 is the only image whose colour treatment is canonical" —
 * and, uniquely among the six references, image1 shows Plan itself, not
 * just a mood board). Restyled from two stacked equal-weight bordered
 * `Card`s (the Visual Acceptance Contract's own avoid-list item) into
 * one continuous flow with plain uppercase section labels
 * (`FarmSectionHeading`, matching image1's "PLANNED WORK"/"OPPORTUNITIES"
 * labels) — no new behaviour, no Day/Week/Month tabs invented (still no
 * real dated data to filter by), same real Prompts, same honest empty
 * state text.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Flag } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { WeatherHeroChip } from "@/components/farm/WeatherHeroChip";
import { FarmSectionHeading } from "@/components/next/FarmSectionHeading";
import { PromptListRow } from "@/components/next/PromptCard";
import { ExpandedPromptSheet } from "@/components/next/ExpandedPromptSheet";
import { AskAIButton } from "@/components/next/AskAI";
import { useFarm, useFields, useIsRealMode } from "@/store/farm-store";
import { buildAllRealPrompts } from "@/orchestration/prompt/build-all";
import { selectPrimaryPrompt, selectSecondaryPrompts } from "@/orchestration/prompt/select-primary";
import { promptStatusTone } from "@/lib/status";
import type { Prompt } from "@/orchestration/prompt";

export default function PlanPage() {
  const farm = useFarm();
  const fields = useFields();
  const isRealMode = useIsRealMode();

  // Same post-mount deferral as Today, and for the identical reason — see
  // that page's own doc comment on `mounted`.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Same sanctioned post-mount flag as Today's identical effect — see
    // that page's own comment for the full reasoning.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above.
    setMounted(true);
  }, []);

  const opportunities = useMemo(() => {
    if (!mounted) return [];
    return buildAllRealPrompts(farm, fields, new Date().toISOString());
  }, [mounted, farm, fields]);

  // Strict Visual Reproduction phase (2026-09-03): image1.png's own Plan
  // panel leads with one featured callout ("Best spreading window") above
  // its plain list — `selectPrimaryPrompt` already existed for exactly
  // this "one strongest real Prompt, shown separately" shape (its own doc
  // comment names Plan's "genuine opportunities" section as the intended
  // second caller) but the previous phase's Plan never actually called
  // it, re-deriving its own flat sort instead. Wired in now: the featured
  // prompt is real (Today's own identical ranking, not a new one invented
  // for this screen) and `selectSecondaryPrompts` drops it from the list
  // below so it isn't shown twice.
  const featuredPrompt = useMemo(() => selectPrimaryPrompt(opportunities), [opportunities]);
  const secondaryOpportunities = useMemo(() => selectSecondaryPrompts(opportunities), [opportunities]);

  const [openPrompt, setOpenPrompt] = useState<Prompt | undefined>(undefined);
  const [visibleOpportunityCount, setVisibleOpportunityCount] = useState(5);
  const fieldNameFor = (prompt: Prompt | undefined) => fields.find((f) => f.id === prompt?.fieldId)?.name;

  const askAIContext = { screen: "Plan", facts: { Farm: farm.name, Opportunities: String(opportunities.length) } };
  const featuredTone = featuredPrompt ? promptStatusTone(featuredPrompt.basis.status) : undefined;

  return (
    <>
      {/* Codex audit round 4 (Strict Visual Reproduction, Plan): image1.png's
          own header shows a real weather fact beside the title — the same
          real farm-level pipeline `PageHeader`'s desktop bar now uses
          (its own fabricated-default fix), reused here for the mobile
          header this screen builds by hand rather than via `PageHeader`. */}
      <div className="mb-6 flex items-start justify-between gap-3 lg:hidden">
        <div>
          <h1 className="font-display text-title text-fr-ink-900">Plan</h1>
          <p className="text-sm text-fr-ink-600">What&apos;s ahead</p>
        </div>
        <WeatherHeroChip centroid={farm.location.centroid} light />
      </div>
      {/* Codex audit MEDIUM (round 3): desktop needs a real Ask AI
          affordance too — see Today's own identical fix. Desktop keeps
          Ask AI in `PageHeader`'s own `actions` slot, the established
          cross-screen convention (Records/Farm use the identical slot) —
          image1 has no desktop mockup to reproduce here, only mobile. */}
      <PageHeader title="Plan" subtitle="What's ahead" actions={<AskAIButton context={askAIContext} />} />

      <div className="flex flex-col gap-8">
        {/* Codex audit round 4 (Strict Visual Reproduction, Plan): image1's
            own Plan panel leads with one featured callout ("Best spreading
            window") above its plain list, not a flat, undifferentiated
            feed. `featuredPrompt` is the same real ranked Prompt Today's
            own primary card already uses — genuinely the single strongest
            real opportunity right now, not a duplicate invented for this
            screen's own visual hierarchy. */}
        {featuredPrompt ? (
          <button
            type="button"
            onClick={() => setOpenPrompt(featuredPrompt)}
            className="flex items-start gap-3 rounded-fr-card border border-fr-border bg-fr-surface-alt p-4 text-left shadow-fr-card"
          >
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: featuredTone === "risk" ? "#C0362C" : featuredTone === "attention" ? "#D98324" : "#2E7D4F",
              }}
            >
              <Flag className="size-4 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fr-ink-900">{featuredPrompt.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-fr-ink-600">{featuredPrompt.description}</p>
            </div>
          </button>
        ) : null}

        <section>
          <FarmSectionHeading>Planned work</FarmSectionHeading>
          {/* Codex audit round 1 (Phase V3): the original longer copy
              ("...but this build doesn't yet turn one into a dated,
              trackable job") read as implementation-focused rather than
              calm/operational. Shortened to the plain fact plus where to
              look next — the exact test-asserted lead phrase ("No jobs
              are scheduled yet") is unchanged. */}
          <div className="flex items-start gap-3 py-1">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-fr-ink-400" />
            <p className="text-sm text-fr-ink-600">
              No jobs are scheduled yet. Accepting a Prompt below records a real decision — see Records for what&apos;s
              been decided so far.
            </p>
          </div>
        </section>

        <section>
          <FarmSectionHeading>Genuine opportunities</FarmSectionHeading>
          {!mounted ? (
            <div className="animate-pulse py-2">
              <div className="h-4 w-full rounded bg-fr-surface-alt" />
            </div>
          ) : secondaryOpportunities.length === 0 ? (
            <p className="py-6 text-center text-sm text-fr-ink-400">
              {fields.length === 0
                ? "Map a field to start seeing real opportunities here."
                : featuredPrompt
                  ? "Nothing else to review right now."
                  : "Nothing to review right now."}
            </p>
          ) : (
            // Codex audit round 1 (Phase V3): an unbounded, fully-expanded
            // list of every real opportunity (this farm genuinely has 15)
            // "reads like an administrative queue" — grouped into one
            // restrained surface (not one card per row) with progressive
            // disclosure, same pattern Today's own secondary-Prompts list
            // already uses.
            <Card className="p-0">
              <div>
                {secondaryOpportunities.slice(0, visibleOpportunityCount).map((p) => (
                  <PromptListRow key={p.id} prompt={p} onViewDetails={() => setOpenPrompt(p)} />
                ))}
              </div>
              {secondaryOpportunities.length > visibleOpportunityCount ? (
                <button
                  type="button"
                  onClick={() => setVisibleOpportunityCount((n) => n + 5)}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-fr-border py-3 text-sm font-medium text-fr-green-700"
                >
                  Show {Math.min(5, secondaryOpportunities.length - visibleOpportunityCount)} more
                  <span className="text-fr-ink-400">({secondaryOpportunities.length - visibleOpportunityCount} left)</span>
                </button>
              ) : null}
            </Card>
          )}
        </section>

        {/* Reserves scroll room for the fixed Ask AI pill below — Plan's
            own real content (up to 16 real opportunities, "Show more"
            expandable) can genuinely grow past one screen, and image1's
            own pill reads as *persistent*, not something that scrolls
            away once a farmer expands the list. */}
        <div className="h-16 lg:hidden" aria-hidden="true" />
      </div>

      {/* Codex audit round 4 (Strict Visual Reproduction, Plan): image1's
          own Plan panel shows Ask AI as a persistent, full-width bottom
          pill, not a header action — the phase's accepted "every image1
          panel treats Ask AI this way" direction, applied here on mobile
          (desktop keeps the header slot above, its own established
          cross-screen convention with no image1 desktop mockup to follow
          instead). Fixed above the real bottom nav — same real-estate
          problem and same fix as Field detail's own persistent action. */}
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 px-4 lg:hidden">
        <AskAIButton context={askAIContext} className="w-full justify-center py-3 shadow-fr-card" />
      </div>

      <ExpandedPromptSheet
        open={Boolean(openPrompt)}
        onClose={() => setOpenPrompt(undefined)}
        prompt={openPrompt}
        fieldName={fieldNameFor(openPrompt)}
        canRecord={isRealMode}
      />
    </>
  );
}
