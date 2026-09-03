"use client";

/**
 * Today / Living farm world — Farm Return Next v1.1, canonical screen #1
 * (`FARM_RETURN_NEXT_SPEC_v1_1.md` §4/§8, reference `media/image2.png`).
 *
 * Strict Visual Reproduction phase (2026-09-03): `image2.png` is now
 * treated as a literal composition/interaction-hierarchy reference, not
 * a mood board — its own dark colour treatment is still re-themed into
 * the approved light system (`image1.png`/spec §3), but its layout order
 * (greeting → ambient status → primary action → open map with real pins
 * → location-aware card → status summary, floating dark bottom nav) is
 * reproduced structurally, not reinterpreted. See
 * `docs/visual-audit/STRICT_VISUAL_ALIGNMENT_REPORT.md` for the
 * before/after and Codex visual-audit history.
 *
 * Real Prompts only — every `Prompt` this page can show comes from one of
 * the four already-shipped, already-audited producers in
 * `src/orchestration/prompt/*.ts`, run against this farm's real `Field[]`
 * (`useFields()`, the same client store every V1 screen already reads).
 * No server fetch, no new backend: these producers are pure functions.
 *
 * Two elements this screen's own history once called permanently out of
 * scope are now real, for real reasons (not fabricated to match a
 * screenshot):
 * - The location-aware "near <field>" card (`NearbyFieldCard`) needed a
 *   one-shot `LocationTrackingProvider.getCurrentPosition()` fix, not a
 *   full GPS Job Session — that capability already existed, audited, for
 *   Vertical C's *continuous* tracking; this reuses it for a single real
 *   fix instead.
 * - The bottom "status summary" strip reads real per-field Prompt tone
 *   counts (Ready/Needs review/Restricted) — genuinely real data, not
 *   the reference's own (unbuilt) job-lifecycle counts, which this app
 *   has no real query for yet (`docs/farm-return-next/BLOCKERS.md`).
 *
 * What is still deliberately absent, and why: a real farm-wide "ground
 * conditions"/"crop status" ambient fact — this app has no real,
 * evidenced domain calculation for either (the closest is a per-field
 * "Spreading suitability: Under validation" state, not a farm-wide
 * verdict) — never fabricated to fill the reference's third ambient
 * segment.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Settings, Sprout } from "lucide-react";
import { MapHero } from "@/components/farm/MapHero";
import { WeatherHeroChip } from "@/components/farm/WeatherHeroChip";
import { NearbyFieldCard } from "@/components/farm/NearbyFieldCard";
import { useOneShotPosition } from "@/lib/location/use-one-shot-position";
import { Sheet } from "@/components/ui/Sheet";
import { PromptCard, PromptListRow } from "@/components/next/PromptCard";
import { ExpandedPromptSheet } from "@/components/next/ExpandedPromptSheet";
import { AskAIButton } from "@/components/next/AskAI";
import { useFarm, useFields, useIsRealMode } from "@/store/farm-store";
import { buildAllRealPrompts } from "@/orchestration/prompt/build-all";
import { selectPrimaryPrompt, selectSecondaryPrompts } from "@/orchestration/prompt/select-primary";
import { SPREADING_WINDOW_PROMPT_KIND } from "@/orchestration/prompt/spreading-window";
import type { Prompt } from "@/orchestration/prompt";
import { promptStatusTone } from "@/lib/status";

export default function TodayPage() {
  const farm = useFarm();
  const fields = useFields();
  const isRealMode = useIsRealMode();
  const router = useRouter();
  const position = useOneShotPosition();
  // Real count of fields MapHero actually draws (only ones with a real
  // `polygon` get a boundary/pin — see its own doc comment) — never
  // `fields.length`, which would call an unmapped field "mapped".
  const mappedFieldCount = fields.filter((f) => f.polygon).length;

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
  const leadingFieldPrompt = (fieldId: string) => selectPrimaryPrompt(allPrompts.filter((p) => p.fieldId === fieldId));
  const fieldTone = (fieldId: string) => {
    const leading = leadingFieldPrompt(fieldId);
    return leading ? promptStatusTone(leading.basis.status) : "neutral";
  };
  const fieldStatusLabel = (fieldId: string) => {
    const leading = leadingFieldPrompt(fieldId);
    if (!leading) return undefined;
    switch (leading.basis.status) {
      case "LEGAL_PROHIBITION":
        return "Restricted";
      case "OK":
        return "Opportunity";
      case "AMBIGUOUS":
      case "UNKNOWN":
        return "Needs review";
      case "BLOCKED_INSUFFICIENT_EVIDENCE":
      case "NOT_APPLICABLE":
        return undefined;
    }
  };

  // Strict Visual Reproduction phase — the reference's bottom "2 Ready
  // jobs / 1 Active job / 2 To confirm jobs" strip has no real
  // equivalent (this app has no real client-side jobs-summary query —
  // see this file's own header comment). Real per-field Prompt-tone
  // counts fill the same visual slot honestly: how many real fields
  // currently have a genuine opportunity, need review, or are legally
  // restricted right now.
  const mappedFields = fields.filter((f) => f.polygon);
  const fieldTones = mounted ? mappedFields.map((f) => fieldTone(f.id)) : [];
  const readyCount = fieldTones.filter((t) => t === "good").length;
  const reviewCount = fieldTones.filter((t) => t === "attention").length;
  const restrictedCount = fieldTones.filter((t) => t === "risk").length;

  // Real farm-wide spreading-calendar aggregate — the reference's
  // ambient-strip "Dry / Good conditions" segment has no honest
  // equivalent (no real farm-wide ground-conditions verdict exists);
  // this is the one additional real ambient fact this app actually has.
  const spreadingPrompts = allPrompts.filter((p) => p.kind === SPREADING_WINDOW_PROMPT_KIND);
  const calendarOpenCount = spreadingPrompts.filter((p) => p.basis.status === "OK").length;

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
      <div className="relative -mx-4 -mb-20 -mt-4 lg:mx-0 lg:mb-0 lg:mt-0 lg:overflow-hidden lg:rounded-fr-card lg:shadow-fr-card">
        <MapHero
          fields={fields}
          getTone={(field) => fieldTone(field.id)}
          getStatusLabel={(field) => fieldStatusLabel(field.id)}
          onSelectField={(fieldId) => router.push(`/fields?field=${fieldId}`)}
          selectedFieldId={primaryPrompt?.fieldId}
          center={farm.location.centroid}
          userPosition={position}
          plain
          className="h-[100dvh] min-h-[560px] lg:h-[600px]"
        >
          {/* Strict Visual Reproduction phase: one full-height flex column
              (justify-between) instead of two independently-positioned
              absolute top/bottom overlays — the reference's own real
              layout clusters content at the top and bottom, leaving the
              open photo with real pins visible in between, and this
              structure reproduces that literally rather than
              approximating it with fixed pixel offsets. */}
          <div className="absolute inset-0 z-10 flex flex-col justify-between overflow-y-auto bg-gradient-to-b from-black/45 via-transparent to-black/45 p-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-24">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/80">
                    <Sprout className="size-4" />
                    Farm Return
                  </span>
                  <h1 className="font-display text-2xl leading-tight text-white drop-shadow-sm">
                    {greetingText}, {farm.ownerName}
                  </h1>
                  <p className="mt-0.5 text-xs text-white/90 drop-shadow-sm">
                    {farm.name} · {mappedFieldCount} {mappedFieldCount === 1 ? "field" : "fields"} mapped
                  </p>
                </div>
                {/* Real, existing route — never a fabricated profile
                    photo; a generic settings affordance fills the
                    reference's own top-right icon slot. */}
                <Link
                  href="/settings"
                  aria-label="Settings"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/30 text-white backdrop-blur-sm"
                >
                  <Settings className="size-4" />
                </Link>
              </div>

              {/* Ambient status strip — real weather plus the one other
                  real farm-wide ambient fact this app has (spreading-
                  calendar openness), merged into one cohesive pill
                  (Codex audit round 1, Strict Visual Reproduction: two
                  detached pills read as split rather than the
                  reference's own single ambient strip). No fabricated
                  "ground conditions"/"crop status" segment — see this
                  file's own header comment. */}
              <div className="flex max-w-fit items-center gap-2 rounded-full border border-white/20 bg-fr-green-900/45 px-3 py-1.5 backdrop-blur-sm">
                <WeatherHeroChip centroid={farm.location.centroid} bare />
                {mounted && spreadingPrompts.length > 0 ? (
                  <>
                    <span className="h-3 w-px shrink-0 bg-white/25" />
                    <span className="whitespace-nowrap text-xs font-medium text-white">
                      Calendar open · {calendarOpenCount}/{spreadingPrompts.length}
                    </span>
                  </>
                ) : null}
              </div>

              {/* Primary action — the reference's own "What matters now"
                  card sits directly below the ambient strip, near the
                  top of the screen, not anchored to the bottom. */}
              {!mounted ? (
                <div className="animate-pulse rounded-fr-card bg-fr-surface p-5 shadow-fr-card max-w-[200px]">
                  <div className="h-5 w-40 rounded bg-fr-surface-alt" />
                  <div className="mt-3 h-4 w-full rounded bg-fr-surface-alt" />
                </div>
              ) : primaryPrompt ? (
                <PromptCard
                  prompt={primaryPrompt}
                  onViewDetails={() => setOpenPrompt(primaryPrompt)}
                  variant="light"
                  // Codex audit round 1 (Strict Visual Reproduction):
                  // opaque white read as heavier/brighter than the
                  // reference's own integrated-with-the-photo overlay
                  // feel — a touch of real transparency + blur keeps it
                  // legible while it still reads as part of the same
                  // surface as everything else floating on the photo.
                  className="max-w-[200px] bg-fr-surface/95 backdrop-blur-sm"
                />
              ) : (
                <div className="rounded-fr-card border border-fr-border bg-fr-surface p-5 shadow-fr-card max-w-[200px]">
                  <p className="text-sm text-fr-ink-600">
                    {fields.length === 0
                      ? "Map a field to start seeing real Prompts here."
                      : "Nothing needs your attention right now."}
                  </p>
                </div>
              )}
            </div>

            {/* Bottom cluster — real location-aware card (when genuinely
                near a real field), then the real status-summary strip,
                directly above the floating nav dock. */}
            <div className="flex flex-col gap-2">
              <NearbyFieldCard fields={fields} position={position} onOpen={(fieldId) => router.push(`/fields?field=${fieldId}`)} />

              {/* Strict Visual Reproduction phase: Ask AI moves from a
                  header affordance to a persistent, secondary, bottom-
                  positioned affordance — every media/image1.png panel
                  shows it just above the bottom nav, not in a page
                  header. Its own row, so the status strip below can be
                  full-width and evenly segmented like the reference's
                  own broad job-status strip, instead of splitting the
                  row with it. */}
              <div className="flex justify-end">
                <AskAIButton
                  context={askAIContext}
                  className="shrink-0 border-white/25 bg-fr-green-900/55 px-3 text-white backdrop-blur-md"
                />
              </div>

              {mounted && mappedFields.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSecondaryOpen(true)}
                  aria-label={`${readyCount} fields ready, ${reviewCount} to review, ${restrictedCount} restricted — see details`}
                  className="flex items-center rounded-full border border-white/15 bg-fr-green-900/55 py-3 text-white backdrop-blur-md"
                >
                  <span className="flex flex-1 flex-col items-center gap-0.5 border-r border-white/15 text-sm">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <span className="size-2.5 rounded-full bg-fr-good" />
                      {readyCount}
                    </span>
                    <span className="text-[11px] text-white/70">Ready</span>
                  </span>
                  <span className="flex flex-1 flex-col items-center gap-0.5 border-r border-white/15 text-sm">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <span className="size-2.5 rounded-full bg-fr-attention" />
                      {reviewCount}
                    </span>
                    <span className="text-[11px] text-white/70">Review</span>
                  </span>
                  <span className="flex flex-1 flex-col items-center gap-0.5 text-sm">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <span className="size-2.5 rounded-full bg-fr-risk" />
                      {restrictedCount}
                    </span>
                    <span className="text-[11px] text-white/70">Restricted</span>
                  </span>
                  <ChevronRight className="mr-3 size-4 shrink-0 text-white/70" />
                </button>
              ) : null}
            </div>
          </div>
        </MapHero>
      </div>

      <Sheet open={secondaryOpen} onClose={() => setSecondaryOpen(false)} title="Also worth a look">
        <div>
          {secondaryPrompts.slice(0, 5).map((p) => (
            <PromptListRow
              key={p.id}
              prompt={p}
              onViewDetails={() => {
                setSecondaryOpen(false);
                setOpenPrompt(p);
              }}
            />
          ))}
        </div>
      </Sheet>

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
