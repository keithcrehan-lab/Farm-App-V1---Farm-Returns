"use client";

/**
 * Plan: the farm's operations over time, built on one farm calendar.
 *
 * A permanent Up next card sits beside Today (agenda), Week (day strip,
 * with a Month grid toggle), Season (12-week activity swim lanes and now /
 * next / later) and Year (activity swim lanes) views. All read the same
 * entries: the farmer's own jobs, appointments, deadlines and seasons,
 * plus read-only entries the app already knows (statutory closed periods,
 * cattle production targets). Vet and contractor work shows its booking
 * status. The app's own Prompts appear in the Today view as dashed
 * suggestions the farmer can open or add to the calendar in one tap.
 */
import { useEffect, useMemo, useState } from "react";
import { FarmCalendar } from "@/components/plan/FarmCalendar";
import { PageHeader } from "@/components/shell/PageHeader";
import { WeatherHeroChip } from "@/components/farm/WeatherHeroChip";
import { ExpandedPromptSheet } from "@/components/next/ExpandedPromptSheet";
import { AskAIButton } from "@/components/next/AskAI";
import { useFarm, useFields, useIsRealMode, useLivestockGroups, useSlurryAllocations, useSlurryCompositionRecords } from "@/store/farm-store";
import { buildAllRealPrompts } from "@/orchestration/prompt/build-all";
import { selectPrimaryPrompt, selectSecondaryPrompts } from "@/orchestration/prompt/select-primary";
import type { Prompt } from "@/orchestration/prompt";
import { farmerReadableText } from "@/lib/farmer-readable-codes";
import { promptCategory, type CalendarSuggestion } from "@/domain/plan-views";
import {
  loadCattleProductionMilestonesAction,
  type CattleProductionMilestone,
} from "@/app/actions/cattle-group-production-plan";

export default function PlanPage() {
  const farm = useFarm();
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const slurryCompositionRecords = useSlurryCompositionRecords();
  const isRealMode = useIsRealMode();

  // Same post-mount deferral as Today, and for the identical reason — see
  // that page's own doc comment on `mounted`.
  const [mounted, setMounted] = useState(false);
  const [cattleMilestones, setCattleMilestones] = useState<CattleProductionMilestone[] | null>(isRealMode ? null : []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see Today's identical post-mount flag.
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isRealMode) return;
    let cancelled = false;
    void loadCattleProductionMilestonesAction().then((result) => {
      if (cancelled) return;
      setCattleMilestones(result.status === "ok" ? result.milestones : null);
    });
    return () => {
      cancelled = true;
    };
  }, [mounted, isRealMode]);

  const prompts = useMemo(() => {
    if (!mounted) return [];
    return buildAllRealPrompts(farm, fields, livestockGroups, slurryAllocations, new Date().toISOString(), slurryCompositionRecords);
  }, [mounted, farm, fields, livestockGroups, slurryAllocations, slurryCompositionRecords]);

  // Strongest Prompt first (Today's own ranking), then the rest.
  const ranked = useMemo(() => {
    const primary = selectPrimaryPrompt(prompts);
    return [...(primary ? [primary] : []), ...selectSecondaryPrompts(prompts)];
  }, [prompts]);

  const suggestions = useMemo<CalendarSuggestion[]>(() => ranked.map((p) => ({
    id: `prompt-${p.id}`,
    title: p.title,
    detail: farmerReadableText(p.description),
    category: promptCategory(p.kind, p.title),
    kind: "job",
    promptId: p.id,
  })), [ranked]);

  const [openPrompt, setOpenPrompt] = useState<Prompt | undefined>(undefined);
  const fieldNameFor = (prompt: Prompt | undefined) => fields.find((f) => f.id === prompt?.fieldId)?.name;
  const askAIContext = { screen: "Plan", facts: { Farm: farm.name, Suggestions: String(suggestions.length) } };

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-3 lg:hidden">
        <div>
          <h1 className="font-display text-title text-fr-ink-900">Plan</h1>
          <p className="text-sm text-fr-ink-600">What&apos;s ahead</p>
        </div>
        <WeatherHeroChip centroid={farm.location.centroid} light />
      </div>
      <PageHeader title="Plan" subtitle="What's ahead" actions={<AskAIButton context={askAIContext} />} />

      <FarmCalendar
        county={farm.location.county}
        fields={fields.map((f) => ({ id: f.id, name: f.name }))}
        milestones={cattleMilestones}
        signedIn={isRealMode}
        suggestions={suggestions}
        onOpenSuggestion={(s) => setOpenPrompt(prompts.find((p) => p.id === s.promptId))}
      />

      {/* Scroll room for the fixed Ask AI pill on mobile. */}
      <div className="h-20 lg:hidden" aria-hidden="true" />

      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 px-4 lg:hidden">
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
