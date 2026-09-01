"use client";

/**
 * Today / Living farm world — Farm Return Next v1.1, canonical screen #1
 * (`FARM_RETURN_NEXT_SPEC_v1_1.md` §4/§8, reference `media/image2.png`,
 * restyled into the approved light system per §3's own note on that
 * reference: "colour treatment is superseded... implement these layouts
 * in the light theme").
 *
 * Replaces the Checkpoint-1 `export { default } from "../dashboard/page"`
 * placeholder (`BUILD_PLAN.md` Vertical B's real deliverable: "Today
 * content that actually differs from Dashboard — real Prompts"). `/dashboard`
 * itself is untouched and still fully reachable via "More" — nothing
 * approved is removed, only relocated (`nav-items.ts`'s own header
 * comment).
 *
 * Real Prompts only — every `Prompt` this page can show comes from one of
 * the four already-shipped, already-audited producers in
 * `src/orchestration/prompt/*.ts`, run against this farm's real `Field[]`
 * (`useFields()`, the same client store every V1 screen already reads).
 * No server fetch, no new backend: these producers are pure functions.
 *
 * What this screen deliberately does NOT yet show, and why (see
 * `docs/overnight/IMPLEMENTATION_MATRIX.md` for the tracked status of
 * each): a Ready/Active/To-confirm status strip (would need a real jobs
 * summary query — no page today fetches jobs client-side, `reports/page.tsx`
 * is the one server component that does); location-aware "near Back
 * Meadow" (needs real GPS permission/geofencing, Vertical C's own scope);
 * ambient live weather (this app's one real weather fetch is per-field,
 * `/api/weather/*`, not a farm-wide ambient summary yet). None of these
 * are faked in the meantime — they're simply absent rather than
 * represented by a placeholder or a sample-data stand-in.
 */
import { useEffect, useMemo, useState } from "react";
import { MobileGreetingHeader } from "@/components/farm/MobileGreetingHeader";
import { PageHeader } from "@/components/shell/PageHeader";
import { FarmMapCard } from "@/components/farm/FarmMapCard";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PromptCard, PromptListRow } from "@/components/next/PromptCard";
import { ExpandedPromptSheet } from "@/components/next/ExpandedPromptSheet";
import { AskAIButton } from "@/components/next/AskAI";
import { useFarm, useFields, useIsRealMode } from "@/store/farm-store";
import { buildAllRealPrompts } from "@/orchestration/prompt/build-all";
import { selectPrimaryPrompt, selectSecondaryPrompts } from "@/orchestration/prompt/select-primary";
import type { Prompt } from "@/orchestration/prompt";

export default function TodayPage() {
  const farm = useFarm();
  const fields = useFields();
  const isRealMode = useIsRealMode();

  // Every producer here reads the real wall clock for its own "as of
  // today" default (`spreading-window.ts`'s `todayInIreland`, etc.) —
  // computing that during the initial render would run once server-side
  // and once client-side, which can legitimately disagree (a different
  // day, or just a different instant) and would then make
  // selectPrimaryPrompt pick a different Prompt on each side, a real
  // hydration mismatch (not just mismatched text — a different DOM
  // subtree). Deferred to a post-mount effect, the same pattern
  // `MobileGreetingHeader` already uses for its own wall-clock read, so
  // the very first paint (both server and client) renders the loading
  // state below, and only a subsequent, client-only update computes the
  // real Prompts.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // One-time post-mount flag, the same sanctioned "synchronize with an
    // external system" exception `farm-store.tsx`'s localStorage
    // rehydration and `MobileGreetingHeader`'s wall-clock read already use
    // — see this file's own comment above on why this can't be plain
    // derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above.
    setMounted(true);
  }, []);

  const allPrompts = useMemo(() => {
    if (!mounted) return [];
    return buildAllRealPrompts(farm, fields, new Date().toISOString());
  }, [mounted, farm, fields]);

  const primaryPrompt = useMemo(() => selectPrimaryPrompt(allPrompts), [allPrompts]);
  const secondaryPrompts = useMemo(() => selectSecondaryPrompts(allPrompts), [allPrompts]);

  const [openPrompt, setOpenPrompt] = useState<Prompt | undefined>(undefined);
  const fieldNameFor = (prompt: Prompt | undefined) => fields.find((f) => f.id === prompt?.fieldId)?.name;

  return (
    <>
      <MobileGreetingHeader />
      <PageHeader title="Today" subtitle="What matters on your farm right now" />

      <div className="mb-4 flex justify-end lg:hidden">
        <AskAIButton
          context={{
            screen: "Today",
            facts: {
              Farm: farm.name,
              Fields: String(fields.length),
              ...(primaryPrompt ? { "Leading prompt": primaryPrompt.title } : {}),
            },
          }}
        />
      </div>

      <div className="flex flex-col gap-4">
        <FarmMapCard />

        {!mounted ? (
          <Card className="animate-pulse">
            <div className="h-5 w-40 rounded bg-fr-surface-alt" />
            <div className="mt-3 h-4 w-full rounded bg-fr-surface-alt" />
          </Card>
        ) : primaryPrompt ? (
          <PromptCard prompt={primaryPrompt} onViewDetails={() => setOpenPrompt(primaryPrompt)} />
        ) : (
          <Card>
            <p className="text-sm text-fr-ink-600">
              {fields.length === 0
                ? "Map a field to start seeing real Prompts here."
                : "Nothing needs your attention right now."}
            </p>
          </Card>
        )}

        {mounted && secondaryPrompts.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Also worth a look</CardTitle>
            </CardHeader>
            <div>
              {secondaryPrompts.slice(0, 5).map((p) => (
                <PromptListRow key={p.id} prompt={p} onViewDetails={() => setOpenPrompt(p)} />
              ))}
            </div>
          </Card>
        ) : null}
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
