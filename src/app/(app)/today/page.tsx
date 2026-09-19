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
 *   counts (Nutrient action/Review/Fert. closed) — genuinely real data,
 *   not the reference's own (unbuilt) job-lifecycle counts, which this app
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
import { GpsActivityCandidateCard } from "@/components/farm/GpsActivityCandidateCard";
import { FarmLimeRequirementCard } from "@/components/farm/FarmLimeRequirementCard";
import { useOneShotPosition } from "@/lib/location/use-one-shot-position";
import { Sheet } from "@/components/ui/Sheet";
import { PromptCard, PromptListRow } from "@/components/next/PromptCard";
import { ExpandedPromptSheet } from "@/components/next/ExpandedPromptSheet";
import { AskAIButton } from "@/components/next/AskAI";
import { useFarm, useFields, useIsRealMode, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";
import { buildAllRealPrompts } from "@/orchestration/prompt/build-all";
import { selectPrimaryPrompt, selectSecondaryPrompts } from "@/orchestration/prompt/select-primary";
import { SPREADING_WINDOW_PROMPT_KIND } from "@/orchestration/prompt/spreading-window";
import { FERTILISER_RECOMMENDATION_PROMPT_KIND } from "@/orchestration/prompt/fertiliser-recommendation";
import type { Prompt } from "@/orchestration/prompt";
import { promptStatusTone } from "@/lib/status";

export default function TodayPage() {
  const farm = useFarm();
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
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
    return buildAllRealPrompts(farm, fields, livestockGroups, slurryAllocations, new Date().toISOString());
  }, [mounted, farm, fields, livestockGroups, slurryAllocations]);

  const primaryPrompt = useMemo(() => selectPrimaryPrompt(allPrompts), [allPrompts]);
  const secondaryPrompts = useMemo(() => selectSecondaryPrompts(allPrompts), [allPrompts]);
  // Product decision (2026-09-19): `selectSecondaryPrompts` (unchanged,
  // still shared, still correct for its own `STATUS_RANK` — see its own
  // header) ranks every field's chemical-fertiliser closed-period
  // `LEGAL_PROHIBITION` Prompt above every other kind. With one such
  // Prompt per field, a farm with several fields can fill this sheet's
  // own five-item cap entirely with repeats of the identical farm-wide
  // "closed period" fact — crowding out every other real Prompt,
  // including the field's own real nutrient recommendation, which would
  // otherwise have no way to surface here for as long as chemical
  // fertiliser stays closed (mid-Sep - Jan/Feb most years). This keeps
  // exactly one representative closed-period entry (the real
  // restriction stays visible, never hidden) and lets every other real
  // Prompt kind fill the remaining slots — a presentation-only feed
  // composition local to this screen, never touching the shared
  // ranking `select-primary.ts` other screens (e.g. Plan) still rely on
  // unmodified.
  // Slurry Closed-Period Wiring V1: `spreadingPrompts` (below) now carries
  // TWO real materials per field (chemical fertiliser and, newly, slurry's
  // own `organic_fertiliser_other_than_FYM`) — the crowding-control
  // dedup above originally keyed only on `kind`/`status`, which, unchanged,
  // would now dedupe the two materials' closed-period entries against each
  // other (e.g. keeping only whichever material's first closed entry
  // happens to sort first, silently dropping the other material's real
  // restriction from this sheet entirely). Generalised to key on the real
  // `inputsSnapshot.material` too, so each material still gets its own one
  // representative entry — for the pre-existing chemical-fertiliser-only
  // case this reduces to byte-identical prior behaviour.
  const secondaryFeedPrompts = useMemo(() => {
    const firstClosedIndexByMaterial = new Map<string, number>();
    secondaryPrompts.forEach((p, index) => {
      if (p.kind === SPREADING_WINDOW_PROMPT_KIND && p.basis.status === "LEGAL_PROHIBITION") {
        const material = typeof p.inputsSnapshot?.material === "string" ? p.inputsSnapshot.material : "unknown";
        if (!firstClosedIndexByMaterial.has(material)) firstClosedIndexByMaterial.set(material, index);
      }
    });
    return secondaryPrompts.filter((p, index) => {
      if (p.kind === SPREADING_WINDOW_PROMPT_KIND && p.basis.status === "LEGAL_PROHIBITION") {
        const material = typeof p.inputsSnapshot?.material === "string" ? p.inputsSnapshot.material : "unknown";
        return firstClosedIndexByMaterial.get(material) === index;
      }
      return true;
    });
  }, [secondaryPrompts]);
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  const [openPrompt, setOpenPrompt] = useState<Prompt | undefined>(undefined);
  const fieldNameFor = (prompt: Prompt | undefined) => fields.find((f) => f.id === prompt?.fieldId)?.name;

  // Product decision (2026-09-19): a field's map marker/tone must never
  // again read as one generic legal "Restricted" status for the whole
  // field. The prior version here used `selectPrimaryPrompt` across
  // EVERY Prompt kind for the field, and that shared ranking
  // (`select-primary.ts`'s own `STATUS_RANK`, unchanged, still correct
  // for the single farm-wide "what matters now" card below) always puts
  // `LEGAL_PROHIBITION` first — so during the chemical-fertiliser
  // closed period (currently in force nationwide, 15 Sep onward, see
  // `closed-period-calendar.ts`), literally every field's marker read
  // "Restricted", silently suppressing that same field's real,
  // already-computed nutrient recommendation underneath it.
  //
  // The marker now reads the field's own `fertiliser_recommendation`
  // Prompt specifically (`FERTILISER_RECOMMENDATION_PROMPT_KIND`) —
  // real output of the canonical `calculateNutrientPlan` engine
  // (`src/domain/nutrients.ts`), computed once in `buildAllRealPrompts`
  // and only read here, never recalculated. This Prompt kind can never
  // itself be `LEGAL_PROHIBITION` (`fertiliser-recommendation.ts`'s own
  // producer never emits that status), so the marker is now genuinely
  // free to show the field's real nutrient priority/evidence-gap
  // state (agronomic need) even while chemical fertiliser is closed
  // (current spreading eligibility — a separate fact). The chemical-
  // fertiliser closed-period fact itself is preserved exactly (nothing
  // about `checkClosedPeriodCalendar`/`checkSpreadingWindowGate`
  // changed) and surfaced separately below — as its own farm-wide fact
  // (the ambient strip) and its own strip segment — never folded back
  // into this per-field tone.
  const fieldNutrientPrompt = (fieldId: string) =>
    allPrompts.find((p) => p.fieldId === fieldId && p.kind === FERTILISER_RECOMMENDATION_PROMPT_KIND);
  const fieldTone = (fieldId: string) => {
    const prompt = fieldNutrientPrompt(fieldId);
    // `promptStatusTone` is the same shared, generic status->tone map
    // `select-primary.ts`'s sibling screens already use — reused as-is,
    // just applied to a differently, more narrowly, scoped Prompt.
    return prompt ? promptStatusTone(prompt.basis.status) : "neutral";
  };
  const fieldStatusLabel = (fieldId: string) => {
    const prompt = fieldNutrientPrompt(fieldId);
    if (!prompt) return undefined;
    switch (prompt.basis.status) {
      // Wording correction (2026-09-19): "Opportunity" could read as
      // "you may spread now" — this label is purely AGRONOMIC NEED
      // (the nutrient engine's own recommendation), never CURRENT
      // SPREADING ELIGIBILITY (that's the separate chemical-fertiliser
      // closed-period fact, "Fert. closed"/"Chemical fertiliser ·
      // Closed period", unchanged). No logic changed, copy only.
      case "OK":
        return "Nutrient priority";
      case "BLOCKED_INSUFFICIENT_EVIDENCE":
        return "Review needed";
      // Neither of these can actually occur for a fertiliser-recommendation
      // Prompt today (see its own producer) — handled only so this
      // switch stays exhaustive against the full, shared
      // `EngineOutcome` status union if that ever changes.
      case "LEGAL_PROHIBITION":
      case "AMBIGUOUS":
      case "UNKNOWN":
        return "Review needed";
      case "NOT_APPLICABLE":
        return undefined;
    }
  };

  // Strict Visual Reproduction phase — the reference's bottom "2 Ready
  // jobs / 1 Active job / 2 To confirm jobs" strip has no real
  // equivalent (this app has no real client-side jobs-summary query —
  // see this file's own header comment). Real per-field nutrient-
  // recommendation tone counts fill the same visual slot honestly: how
  // many real fields currently have a genuine nutrient priority or
  // need review (missing soil/livestock evidence) — legal restriction
  // is a separate, farm-wide fact (below), never blended back into
  // these two counts (product decision, 2026-09-19).
  const mappedFields = fields.filter((f) => f.polygon);
  const fieldTones = mounted ? mappedFields.map((f) => fieldTone(f.id)) : [];
  const readyCount = fieldTones.filter((t) => t === "good").length;
  const reviewCount = fieldTones.filter((t) => t === "attention").length;

  // Real farm-wide spreading-calendar aggregate — the reference's
  // ambient-strip "Dry / Good conditions" segment has no honest
  // equivalent (no real farm-wide ground-conditions verdict exists);
  // this is the one additional real ambient fact this app actually has.
  // Also now the one real source for the chemical-fertiliser
  // restriction fact, kept explicit and separate from field-level
  // nutrient status (product decision, 2026-09-19) — the closed-period
  // logic itself (`checkClosedPeriodCalendar`) is untouched.
  // Slurry Closed-Period Wiring V1 — `buildAllRealPrompts` now emits TWO
  // real `spreading_window` Prompts per field (chemical fertiliser and
  // slurry's own real `organic_fertiliser_other_than_FYM` category, S.I.
  // 588/2025, its own distinct closed-period dates —
  // `closed-period-calendar.ts`). Split by each Prompt's own real
  // `inputsSnapshot.material` (never by array position/count) so the two
  // materials' counts stay genuinely independent, exactly mirroring the
  // pre-existing chemical-fertiliser computation below rather than a
  // hand-rolled variant. `!== "organic_fertiliser_other_than_FYM"` (not
  // `=== "chemical_fertiliser"`) so a Prompt with no `material` recorded
  // at all falls to the chemical-fertiliser bucket — the identical,
  // byte-for-byte behaviour this computation already had before slurry's
  // Prompt existed.
  const spreadingPrompts = allPrompts.filter((p) => p.kind === SPREADING_WINDOW_PROMPT_KIND);
  const chemicalSpreadingPrompts = spreadingPrompts.filter((p) => p.inputsSnapshot?.material !== "organic_fertiliser_other_than_FYM");
  const slurrySpreadingPrompts = spreadingPrompts.filter((p) => p.inputsSnapshot?.material === "organic_fertiliser_other_than_FYM");
  const calendarOpenCount = chemicalSpreadingPrompts.filter((p) => p.basis.status === "OK").length;
  const chemicalFertiliserRestrictedCount = chemicalSpreadingPrompts.filter((p) => p.basis.status === "LEGAL_PROHIBITION").length;
  const slurryOpenCount = slurrySpreadingPrompts.filter((p) => p.basis.status === "OK").length;
  const slurryRestrictedCount = slurrySpreadingPrompts.filter((p) => p.basis.status === "LEGAL_PROHIBITION").length;

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
      {/* Today/Homepage notification-layout change (2026-09-19): the map
          is now the page's clean visual anchor — every large
          notification/status card that used to overlay it ("What
          matters now", the status-summary strip, farm lime requirement,
          Ask AI) now renders in normal page flow BELOW `</MapHero>`,
          never on top of the photo. What stays layered on the map
          itself is only: the compact greeting/settings header, the
          ambient weather + closed-period chip row (explicitly allowed
          to remain — see the brief — since it's a narrow strip, not a
          card that materially obscures the imagery), and the real-time
          GPS-proximity cards (`GpsActivityCandidateCard`/
          `NearbyFieldCard`), which stay because they're both small,
          purpose-built "glass over the photo" overlays that only ever
          render when a live GPS fix currently places the farmer near/at
          a field — a genuinely map-contextual, real-time fact, the same
          category as the "you are here" dot `MapHero` already draws —
          never the large, farm-wide, always-relevant notifications the
          brief asks to move out. */}
      <div className="relative -mx-4 -mt-4 lg:mx-0 lg:mt-0 lg:overflow-hidden lg:rounded-fr-card lg:shadow-fr-card">
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
          {/* One full-height flex column (justify-between): a compact
              top cluster (greeting + ambient strip) and a compact bottom
              cluster (live GPS-proximity cards only — see comment
              above), leaving the open photo with real pins visible
              everywhere in between, not a surface split by large cards. */}
          <div className="absolute inset-0 z-10 flex flex-col justify-between overflow-y-auto bg-gradient-to-b from-black/45 via-transparent to-transparent p-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-6">
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
                  file's own header comment. Kept as a compact map
                  overlay (brief's own explicit allowance) rather than
                  moved below — it's a narrow strip, not a card, and
                  doesn't materially obscure the photo. */}
              <div className="flex max-w-fit items-center gap-2 rounded-full border border-white/20 bg-fr-green-900/45 px-3 py-1.5 backdrop-blur-sm">
                <WeatherHeroChip centroid={farm.location.centroid} bare />
                {mounted && chemicalSpreadingPrompts.length > 0 ? (
                  <>
                    <span className="h-3 w-px shrink-0 bg-white/25" />
                    {/* Product decision (2026-09-19): named explicitly as
                        "Chemical fertiliser" — the prior "Calendar open"
                        wording didn't say which material or activity it
                        covered, and this is now the one place on Today
                        that fact lives (no longer implied by every
                        field's own marker). Real data, unchanged
                        computation — see `chemicalSpreadingPrompts`/
                        `calendarOpenCount` above. */}
                    <span className="whitespace-nowrap text-xs font-medium text-white">
                      {calendarOpenCount === 0
                        ? "Chemical fertiliser · Closed period"
                        : `Chemical fertiliser · Open ${calendarOpenCount}/${chemicalSpreadingPrompts.length}`}
                    </span>
                  </>
                ) : null}
                {/* Slurry Closed-Period Wiring V1 — the real, distinct
                    statutory closed-period fact for slurry (organic
                    fertiliser other than farmyard manure), the same
                    "Chemical fertiliser · Open X/Y" pattern above applied
                    to its own real, independently-computed Prompt set —
                    "Slurry" is this app's established farmer-facing
                    relabelling of the raw
                    `organic_fertiliser_other_than_FYM` material string
                    (`MATERIAL_LABEL` in `spreading-window.ts` keeps the
                    longer regulatory wording for its own Prompt copy;
                    this ambient chip follows the same shortening
                    convention "Chemical fertiliser" already established
                    here for the sibling material). Never merged into the
                    chemical-fertiliser counts above. */}
                {mounted && slurrySpreadingPrompts.length > 0 ? (
                  <>
                    <span className="h-3 w-px shrink-0 bg-white/25" />
                    <span className="whitespace-nowrap text-xs font-medium text-white">
                      {slurryOpenCount === 0
                        ? "Slurry · Closed period"
                        : `Slurry · Open ${slurryOpenCount}/${slurrySpreadingPrompts.length}`}
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            {/* Bottom cluster — real, live GPS-proximity cards only (see
                this file's own header comment on why these two, and
                only these two, stay on the map). Each renders nothing of
                its own when it has no real candidate/nearby field right
                now, so this cluster is simply absent most of the time,
                leaving the photo fully clean. */}
            <div className="flex flex-col gap-2">
              <GpsActivityCandidateCard fields={fields} />
              <NearbyFieldCard fields={fields} position={position} onOpen={(fieldId) => router.push(`/fields?field=${fieldId}`)} />
            </div>
          </div>
        </MapHero>
      </div>

      {/* Below the map — every notification/status card the map used to
          carry, in the brief's own stated priority order: 1) "What
          matters now", 2) the real status-summary strip, 3) supporting
          notifications (farm lime requirement), then a secondary Ask AI
          affordance. Same `flex flex-col gap-4` vertical-stack spacing
          every other screen's own card list already uses (e.g.
          `NutrientsPageClient.tsx`) — no new spacing convention
          introduced. The two status-strip/prompt surfaces below are
          restyled from their old "glass over dark photo" treatment to
          this app's ordinary light `Card` surface
          (`border-fr-border bg-fr-surface shadow-fr-card`, the same
          tokens `FarmLimeRequirementCard`'s own `Card` already uses) —
          necessary because they no longer sit on top of imagery; no new
          colours or components, only the existing light-surface system
          every other screen's cards already use. */}
      <div className="mt-4 flex flex-col gap-4 lg:mt-6">
        {!mounted ? (
          <div className="animate-pulse rounded-fr-card bg-fr-surface p-5 shadow-fr-card">
            <div className="h-5 w-40 rounded bg-fr-surface-alt" />
            <div className="mt-3 h-4 w-full rounded bg-fr-surface-alt" />
          </div>
        ) : primaryPrompt ? (
          <PromptCard prompt={primaryPrompt} onViewDetails={() => setOpenPrompt(primaryPrompt)} variant="light" />
        ) : (
          <div className="rounded-fr-card border border-fr-border bg-fr-surface p-5 shadow-fr-card">
            <p className="text-sm text-fr-ink-600">
              {fields.length === 0 ? "Map a field to start seeing real Prompts here." : "Nothing needs your attention right now."}
            </p>
          </div>
        )}

        {mounted && mappedFields.length > 0 ? (
          // Product decision (2026-09-19), wording corrected 2026-09-19:
          // explicit that only chemical fertiliser is restricted here —
          // the first two counts are this field's real nutrient-
          // recommendation status (see `fieldTone`/`fieldStatusLabel`
          // above), AGRONOMIC NEED, a genuinely separate fact from the
          // chemical-fertiliser closed period, which is CURRENT
          // SPREADING ELIGIBILITY. Copy-only correction: "Ready"/
          // "opportunity" could read as "you may spread now" — no logic,
          // ranking, calculation or data source changed.
          <button
            type="button"
            onClick={() => setSecondaryOpen(true)}
            aria-label={`${readyCount} fields with a nutrient priority, ${reviewCount} needing review, ${chemicalFertiliserRestrictedCount} with chemical fertiliser currently restricted, ${slurryRestrictedCount} with slurry currently restricted — see details`}
            className="flex items-center rounded-fr-card border border-fr-border bg-fr-surface py-3 shadow-fr-card"
          >
            <span className="flex flex-1 flex-col items-center gap-0.5 border-r border-fr-border text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-fr-ink-900">
                <span className="size-2.5 rounded-full bg-fr-good" />
                {readyCount}
              </span>
              <span className="text-[11px] text-fr-ink-600">Nutrient action</span>
            </span>
            <span className="flex flex-1 flex-col items-center gap-0.5 border-r border-fr-border text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-fr-ink-900">
                <span className="size-2.5 rounded-full bg-fr-attention" />
                {reviewCount}
              </span>
              <span className="text-[11px] text-fr-ink-600">Review</span>
            </span>
            <span className="flex flex-1 flex-col items-center gap-0.5 border-r border-fr-border text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-fr-ink-900">
                <span className="size-2.5 rounded-full bg-fr-risk" />
                {chemicalFertiliserRestrictedCount}
              </span>
              <span className="text-[11px] text-fr-ink-600">Fert. closed</span>
            </span>
            {/* Slurry Closed-Period Wiring V1 — the bottom status-strip's
                own real, distinct slurry segment, independent of the
                chemical-fertiliser one immediately to its left. Same
                real `spreading_window` Prompt kind, distinguished by its
                own `inputsSnapshot.material`
                (`slurrySpreadingPrompts`/`slurryRestrictedCount` above)
                — never added into or read from the chemical-fertiliser
                count. */}
            <span className="flex flex-1 flex-col items-center gap-0.5 text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-fr-ink-900">
                <span className="size-2.5 rounded-full bg-fr-risk" />
                {slurryRestrictedCount}
              </span>
              <span className="text-[11px] text-fr-ink-600">Slurry closed</span>
            </span>
            <ChevronRight className="mr-3 size-4 shrink-0 text-fr-ink-400" />
          </button>
        ) : null}

        {/* Product decision (2026-09-19): "Surface existing canonical
            lime requirement where available." Reuses the existing,
            already-audited `FarmLimeRequirementCard` verbatim (same
            `canRecord={isRealMode}` gate its one other real caller,
            `NutrientsPageClient.tsx`, already uses) — it fetches and
            computes nothing new; this page adds no lime logic of its
            own. */}
        <FarmLimeRequirementCard canRecord={isRealMode} />

        {/* Today/Homepage notification-layout change (2026-09-19): Ask
            AI moves out of the map overlay too — its own `askAIContext`
            (farm name/field count/leading-prompt title, built above) is
            ordinary farm-wide context, not map-specific data, so it has
            no principled reason to stay pinned to the photo now that the
            large cards it used to sit among have moved below. Dropped
            the old dark "glass over photo" className override in favour
            of `AskAIButton`'s own default light styling — the same
            styling every other screen's own Ask AI affordance already
            uses (e.g. `fields/page.tsx`, `plan/page.tsx`) — a secondary,
            bottom-positioned affordance in the page's own normal flow. */}
        <div className="flex justify-end">
          <AskAIButton context={askAIContext} />
        </div>
      </div>

      <Sheet open={secondaryOpen} onClose={() => setSecondaryOpen(false)} title="Also worth a look">
        <div>
          {secondaryFeedPrompts.slice(0, 5).map((p) => (
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
