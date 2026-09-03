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
 * Meadow" (needs real GPS permission/geofencing, Vertical C's own scope).
 * Neither is faked in the meantime — they're simply absent rather than
 * represented by a placeholder or a sample-data stand-in.
 *
 * Visual Alignment / UI Rebuild (2026-09-03), Phase V1: the bounded
 * `FarmMapCard`/flat-SVG `FieldMap` hero is replaced by `MapHero` — a
 * real full-bleed Mapbox satellite surface using each field's own real
 * `polygon`/`centroid`, matching every approved reference's map-as-hero
 * composition instead of a schematic diagram in a card. The greeting
 * (`MobileGreetingHeader`, still used by `/dashboard`) and a compact
 * farm-level `WeatherHeroChip` (new — same real
 * `/api/weather/observations` pipeline as `CurrentConditionsCard`, at the
 * farm's own centroid) now live as overlays on that surface. No domain
 * logic changed — same real Prompts, same real fields, same real weather
 * endpoint, only where/how they're presented.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Sprout } from "lucide-react";
import { MapHero } from "@/components/farm/MapHero";
import { WeatherHeroChip } from "@/components/farm/WeatherHeroChip";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PromptCard, PromptListRow } from "@/components/next/PromptCard";
import { ExpandedPromptSheet } from "@/components/next/ExpandedPromptSheet";
import { AskAIButton } from "@/components/next/AskAI";
import { useFarm, useFields, useIsRealMode } from "@/store/farm-store";
import { buildAllRealPrompts } from "@/orchestration/prompt/build-all";
import { selectPrimaryPrompt, selectSecondaryPrompts } from "@/orchestration/prompt/select-primary";
import type { Prompt } from "@/orchestration/prompt";
import { promptStatusTone } from "@/lib/status";

export default function TodayPage() {
  const farm = useFarm();
  const fields = useFields();
  const isRealMode = useIsRealMode();
  const router = useRouter();

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

  // Same post-mount hydration-safety pattern as the retired
  // MobileGreetingHeader this replaces (see its own doc comment) — the
  // server and the client's first paint must render identical text, so
  // the real time-of-day greeting is only computed once mounted.
  const [greetingText, setGreetingText] = useState("Hello");
  useEffect(() => {
    const hour = new Date().getHours();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above.
    setGreetingText(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  }, []);

  const allPrompts = useMemo(() => {
    if (!mounted) return [];
    return buildAllRealPrompts(farm, fields, new Date().toISOString());
  }, [mounted, farm, fields]);

  const primaryPrompt = useMemo(() => selectPrimaryPrompt(allPrompts), [allPrompts]);
  const secondaryPrompts = useMemo(() => selectSecondaryPrompts(allPrompts), [allPrompts]);
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  const [openPrompt, setOpenPrompt] = useState<Prompt | undefined>(undefined);
  const fieldNameFor = (prompt: Prompt | undefined) => fields.find((f) => f.id === prompt?.fieldId)?.name;

  // Codex audit round 1 (Phase V1): a map marker's tone should read the
  // field's own genuine current status, not a land-use category (that's
  // Farm/Field exploration's own real use for `landUseTone` — Today is
  // about what needs attention right now). Reuses the exact same
  // ranking `selectPrimaryPrompt` already applies farm-wide, scoped to
  // one field's own real Prompts — no second priority scheme invented.
  const fieldTone = (fieldId: string) => {
    const leading = selectPrimaryPrompt(allPrompts.filter((p) => p.fieldId === fieldId));
    return leading ? promptStatusTone(leading.basis.status) : "neutral";
  };

  const askAIContext = {
    screen: "Today",
    facts: {
      Farm: farm.name,
      Fields: String(fields.length),
      // Phase C (contextual Ask AI completeness, 2026-09-03):
      // `selectPrimaryPrompt` can genuinely rank a non-OK Prompt highest
      // (a `LEGAL_PROHIBITION` outranks a routine `OK` Prompt by design —
      // `select-primary.ts`'s own header comment), so this fact's real
      // evidence tier only exists when `basis.status === "OK"` — the
      // same narrowing `ExpandedPromptSheet.tsx`'s own equivalent fix
      // uses, never a tier fabricated for a Prompt that doesn't have one.
      ...(primaryPrompt
        ? {
            "Leading prompt":
              primaryPrompt.basis.status === "OK"
                ? { value: primaryPrompt.title, evidenceState: primaryPrompt.basis.evidenceState }
                : primaryPrompt.title,
          }
        : {}),
    },
  };

  return (
    <>
      {/* Today / living farm world — the physical farm is the hero, not a
          header-then-cards dashboard (Visual Acceptance Contract §1/§2,
          spec §8 reference media/image2.png). Full-bleed real Mapbox
          satellite surface with real field boundaries/pins; the
          greeting, real farm-level weather and Ask AI live as light
          overlays on top of it, not a separate header block above it.
          Breaks out of the page's own gutter padding
          (AppShell's `<main>`, `layout.tsx`) on mobile so the photo runs
          truly edge-to-edge; restrained rounded corners return on
          desktop, where the shell's content column already has margin. */}
      <div className="relative -mx-4 -mt-4 lg:mx-0 lg:mt-0 lg:overflow-hidden lg:rounded-fr-card lg:shadow-fr-card">
        <MapHero
          fields={fields}
          getTone={(field) => fieldTone(field.id)}
          onSelectField={(fieldId) => router.push(`/fields?field=${fieldId}`)}
          center={farm.location.centroid}
          plain
          className="h-[52vh] min-h-[360px] lg:h-[420px]"
        >
          {/* Everything lives in the top scrim, deliberately — the map's
              own bottom edge stays clear so the floating "What matters
              now" card below (`-mt-8` in the wrapper below) overlaps a
              plain photo, never a second overlay's own content (a real
              layout bug caught in Phase V1's own first screenshot:
              docs/visual-audit/rebuild/v1-today/). */}
          <div className="absolute inset-x-0 top-0 flex flex-col gap-2.5 bg-gradient-to-b from-black/55 via-black/15 to-transparent p-4 pt-[max(env(safe-area-inset-top),1rem)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/80">
                  <Sprout className="size-4" />
                  Farm Return
                </span>
                <h1 className="font-display text-2xl leading-tight text-white drop-shadow-sm">
                  {greetingText}, {farm.ownerName}
                </h1>
              </div>
              <AskAIButton
                context={askAIContext}
                className="shrink-0 border-white/25 bg-black/35 text-white backdrop-blur-sm hover:bg-black/45"
              />
            </div>
            <div className="flex items-center gap-2">
              <WeatherHeroChip centroid={farm.location.centroid} />
              <span className="rounded-full border border-white/25 bg-black/35 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                {fields.length} {fields.length === 1 ? "field" : "fields"} mapped
              </span>
            </div>
          </div>
        </MapHero>
      </div>

      <div className="relative z-10 -mt-8 flex flex-col gap-4 px-0.5 lg:mt-6">
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

        {/* Codex audit round 1 (Phase V1): a fully-expanded 5-row list
            here read as a conventional stacked-card feed, competing with
            the one "What matters now" action above it (dashboard drift:
            HIGH). Collapsed by default — one strongest action stays the
            dominant thing on the screen; everything else is a single
            tap of progressive disclosure away, not pre-expanded. */}
        {mounted && secondaryPrompts.length > 0 ? (
          <Card className={secondaryOpen ? undefined : "p-0"}>
            {secondaryOpen ? (
              <>
                <CardHeader>
                  <CardTitle>Also worth a look</CardTitle>
                  <button type="button" onClick={() => setSecondaryOpen(false)} className="text-xs font-medium text-fr-ink-600">
                    Hide
                  </button>
                </CardHeader>
                <div>
                  {secondaryPrompts.slice(0, 5).map((p) => (
                    <PromptListRow key={p.id} prompt={p} onViewDetails={() => setOpenPrompt(p)} />
                  ))}
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSecondaryOpen(true)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span className="text-sm font-medium text-fr-ink-900">
                  {secondaryPrompts.length} other {secondaryPrompts.length === 1 ? "thing" : "things"} worth a look
                </span>
                <ChevronDown className="size-4 text-fr-ink-400" />
              </button>
            )}
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
