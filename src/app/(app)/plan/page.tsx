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
 */
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PromptListRow } from "@/components/next/PromptCard";
import { ExpandedPromptSheet } from "@/components/next/ExpandedPromptSheet";
import { AskAIButton } from "@/components/next/AskAI";
import { useFarm, useFields, useIsRealMode } from "@/store/farm-store";
import { buildAllRealPrompts } from "@/orchestration/prompt/build-all";
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
    // Plan shows every real opportunity, not just the one Today already
    // led with (`selectPrimaryPrompt`/`selectSecondaryPrompts` are for
    // picking a single lead card, not this screen's full list) — a
    // simple, stable, real ordering: earliest-built first.
    const all = buildAllRealPrompts(farm, fields, new Date().toISOString());
    return [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [mounted, farm, fields]);

  const [openPrompt, setOpenPrompt] = useState<Prompt | undefined>(undefined);
  const fieldNameFor = (prompt: Prompt | undefined) => fields.find((f) => f.id === prompt?.fieldId)?.name;

  const askAIContext = { screen: "Plan", facts: { Farm: farm.name, Opportunities: String(opportunities.length) } };

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3 lg:hidden">
        <div>
          <h1 className="text-title text-fr-ink-900">Plan</h1>
          <p className="text-sm text-fr-ink-600">What&apos;s ahead</p>
        </div>
        <AskAIButton context={askAIContext} />
      </div>
      {/* Codex audit MEDIUM (round 3): desktop needs a real Ask AI
          affordance too — see Today's own identical fix. */}
      <PageHeader title="Plan" subtitle="What's ahead" actions={<AskAIButton context={askAIContext} />} />

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Planned work</CardTitle>
          </CardHeader>
          <p className="text-sm text-fr-ink-600">
            No jobs are scheduled yet — accepting a Prompt below records a decision, but this build doesn&apos;t yet turn one
            into a dated, trackable job (see Records for what has been decided so far).
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Genuine opportunities</CardTitle>
          </CardHeader>
          {!mounted ? (
            <div className="animate-pulse py-2">
              <div className="h-4 w-full rounded bg-fr-surface-alt" />
            </div>
          ) : opportunities.length === 0 ? (
            <p className="py-6 text-center text-sm text-fr-ink-400">
              {fields.length === 0 ? "Map a field to start seeing real opportunities here." : "Nothing to review right now."}
            </p>
          ) : (
            <div>
              {opportunities.map((p) => (
                <PromptListRow key={p.id} prompt={p} onViewDetails={() => setOpenPrompt(p)} />
              ))}
            </div>
          )}
        </Card>
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
