"use client";

/**
 * Today / Living farm world — Farm Return Next v1.1, canonical screen #1
 * (`FARM_RETURN_NEXT_SPEC_v1_1.md` §4/§8, reference `media/image2.png`).
 *
 * Today Control Room V1 (2026-09-19) — the satellite map is now the
 * dominant operational canvas, not a header image with cards stacked
 * underneath it. Desktop: a compact opportunity rail
 * (`TodayControlRoomRail`) overlays the map's right edge and a compact
 * priority HUD (`TodayPriorityHud`) sits along its bottom edge, both
 * glass-over-photo, both reusing the exact same real
 * `TodayOpportunity[]`/`TodayPriorityCounts` data the rest of this
 * checkpoint's work already produces — no new aggregation, no new
 * priority rule, nothing recomputed. Mobile: the map stays the main
 * visual with only a compact priority strip below it; the full rail
 * lives in a collapsible bottom `Sheet` instead of a permanent overlay
 * (a fixed right-hand rail would either overflow or crowd out the photo
 * on a narrow viewport). Selecting a category sets a real focus state
 * that both opens the existing `TodayOpportunitySheet` drill-down AND
 * highlights that category's own real `affectedFieldIds` on the map
 * (`MapHero`'s new `highlightedFieldIds`/`dimUnhighlighted`/
 * `fitHighlightedFields` props) — membership only, never a field-level
 * priority claim (see the map wiring below and `MapHero.tsx`'s own doc
 * comment on those props).
 *
 * Strict Visual Reproduction phase (2026-09-03): `image2.png` is still
 * this screen's own literal composition/interaction-hierarchy reference
 * for the parts the control-room brief didn't ask to change — the top
 * greeting/identity, the ambient weather+closed-period strip, and the
 * real-time GPS-proximity cards all stay exactly as that phase
 * established them, re-themed into the approved light system.
 *
 * Real Prompts only — every `Prompt` this page can show comes from one of
 * the four already-shipped, already-audited producers in
 * `src/orchestration/prompt/*.ts`, run against this farm's real `Field[]`
 * (`useFields()`, the same client store every V1 screen already reads).
 * No server fetch, no new backend: these producers are pure functions.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Radar, Settings, Sprout } from "lucide-react";
import { MapHero } from "@/components/farm/MapHero";
import { WeatherHeroChip } from "@/components/farm/WeatherHeroChip";
import { NearbyFieldCard } from "@/components/farm/NearbyFieldCard";
import { GpsActivityCandidateCard } from "@/components/farm/GpsActivityCandidateCard";
import { useOneShotPosition } from "@/lib/location/use-one-shot-position";
import { Sheet } from "@/components/ui/Sheet";
import { PromptListRow } from "@/components/next/PromptCard";
import { ExpandedPromptSheet } from "@/components/next/ExpandedPromptSheet";
import { TodayOpportunitySheet } from "@/components/next/TodayOpportunityCard";
import { TodayControlRoomRail } from "@/components/next/TodayControlRoomRail";
import { TodayPriorityHud } from "@/components/next/TodayPriorityHud";
import { AskAIButton } from "@/components/next/AskAI";
import { WhatMattersPilotCard } from "@/components/next/WhatMattersPilotCard";
import { evaluateWhatMattersPilot, confirmWhatMattersPilotCondition, type WhatMattersPilotActionResult, type WhatMattersPilotCandidateContext } from "@/app/actions/what-matters-pilot";
import type { WhatMattersPilotResult } from "@/domain/what-matters-presentation";
import type { FarmerConfirmationCode, FarmerDeclarationEvidence } from "@/domain/slurry-actionability-policy";
import { useFarm, useFields, useHousingList, useIsRealMode, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";
import { buildAllRealPrompts } from "@/orchestration/prompt/build-all";
import { selectPrimaryPrompt, selectSecondaryPrompts } from "@/orchestration/prompt/select-primary";
import { SPREADING_WINDOW_PROMPT_KIND } from "@/orchestration/prompt/spreading-window";
import { countTodayPriorities } from "@/orchestration/prompt/today-priority";
import {
  buildTodayOpportunities,
  type TodayOpportunity,
  type TodayOpportunityCategory,
  type TodayOpportunityFieldRow,
} from "@/orchestration/prompt/today-opportunities";
import { getFarmLimeRequirementAction } from "@/app/actions/fertiliser-plan";
import { buildFarmSlurryStorageOverview } from "@/domain/slurry-storage";
import type { Prompt } from "@/orchestration/prompt";
import type { FarmLimeRequirement } from "@/domain/fertiliser-plan";

export default function TodayPage() {
  const farm = useFarm();
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const housingList = useHousingList();
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

  // Farm-Topic Notification Aggregation V1 — Lime has no `Prompt`
  // producer yet (`buildAllRealPrompts` doesn't fan it out), so its own
  // opportunity builder (`today-opportunities.ts`'s `buildLimeOpportunity`)
  // needs the same real `FarmLimeRequirement` this page's own Lime
  // notification surfaces — fetched here directly, reusing the identical
  // server action and `isRealMode` gating `FarmLimeRequirementCard`
  // (still used, unchanged, on the Nutrients screen) already established,
  // never a second lime calculation.
  const [limeRequirement, setLimeRequirement] = useState<FarmLimeRequirement | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting for a real isRealMode change, mirrors FarmLimeRequirementCard's own identical pattern.
    setLimeRequirement(undefined);
    if (!isRealMode) return;
    let cancelled = false;
    getFarmLimeRequirementAction().then(
      (value) => {
        if (!cancelled) setLimeRequirement(value);
      },
      (error: unknown) => {
        console.error("[TodayPage] getFarmLimeRequirementAction failed:", error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isRealMode]);

  // What Matters pilot — Phase 5 -> 7/7.1 -> 8 -> 11A -> 11B ->
  // SLURRY_ACTIONABILITY_POLICY_IE_V1 -> Phase 10 -> Phase 9, wired live
  // (`src/app/actions/what-matters-pilot.ts`, real farm data, real Met
  // Éireann weather, real persisted CSO price evidence). This is now the
  // ONLY source for the "What matters now" recommendation slot below —
  // `selectPrimaryPrompt`/`primaryPrompt` (still computed further down for
  // the map's own selected-field default and the unrelated Ask AI context
  // fact) no longer drives it. A thrown/failed evaluation resolves to an
  // honest "unable to verify" message, never a silent fallback to
  // `primaryPrompt` — see the action's own header comment.
  const [pilotState, setPilotState] = useState<{
    result: WhatMattersPilotResult;
    evaluatedAt: string;
    declarations: FarmerDeclarationEvidence[];
    candidateContext: Record<string, WhatMattersPilotCandidateContext>;
  } | null>(null);
  const [pilotError, setPilotError] = useState<string | null>(null);
  const [pilotLoading, setPilotLoading] = useState(false);

  function applyPilotResult(res: WhatMattersPilotActionResult) {
    if (res.status === "ok") {
      setPilotError(null);
      setPilotState({ result: res.result, evaluatedAt: res.evaluatedAt, declarations: res.declarations, candidateContext: res.candidateContext });
    } else {
      // Honest failure state -- never a fallback to the legacy Prompt
      // selector (brief: "Better to show 'Unable to verify a
      // recommendation right now' than produce an unaudited
      // recommendation").
      setPilotError(res.message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one real, explicit server evaluation per mount (same sanctioned "synchronize with an external system" pattern this file's own `mounted`/`greetingText` effects already use above), not derivable state.
    setPilotLoading(true);
    evaluateWhatMattersPilot().then((res) => {
      if (cancelled) return;
      setPilotLoading(false);
      applyPilotResult(res);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePilotConfirm(code: FarmerConfirmationCode, value: boolean) {
    if (!pilotState || pilotState.result.kind !== "needs_confirmation") return;
    const candidate = pilotState.result.candidate;
    const context = pilotState.candidateContext[candidate.recordId];
    if (!context) return;
    setPilotLoading(true);
    const res = await confirmWhatMattersPilotCondition({
      evaluatedAt: pilotState.evaluatedAt,
      priorDeclarations: pilotState.declarations,
      opportunityRecordId: candidate.recordId,
      boundAssessmentId: context.assessmentId,
      evaluatedActionId: context.evaluatedActionId,
      fieldId: context.fieldId,
      conditionCode: code,
      value,
    });
    setPilotLoading(false);
    applyPilotResult(res);
  }

  function pilotFieldName(): string | undefined {
    if (!pilotState) return undefined;
    const result = pilotState.result;
    const candidate = result.kind === "none" ? null : result.candidate;
    if (!candidate) return undefined;
    return pilotState.candidateContext[candidate.recordId]?.fieldName;
  }

  function handlePilotViewDetails() {
    if (!pilotState || pilotState.result.kind !== "actionable") return;
    const context = pilotState.candidateContext[pilotState.result.candidate.recordId];
    if (context) router.push(`/fields?field=${context.fieldId}`);
  }

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
  // Today Control Room V1 — this sheet is now a secondary, de-emphasised
  // affordance (a small text link, not the former large clickable
  // tracker tile — see the render below) rather than the primary way
  // into Today's own field-level detail, since the new rail's own
  // farm-topic-opportunity -> field-breakdown -> evidence hierarchy now
  // covers Slurry/Lime/Fertiliser/Soil directly. Kept, not removed: it's
  // still the one real place `commonage_status`/`local_buffer_override`
  // Prompts (real Prompt kinds outside the four aggregated categories)
  // are reachable at all.
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  // Today Control Room V1 — mobile's own collapsible bottom sheet for
  // the opportunity rail (section 9 of this checkpoint's brief: "do NOT
  // squeeze a permanent right rail over the map... collapsible bottom
  // sheet/drawer"), reusing the exact same `TodayControlRoomRail` rows
  // the desktop map overlay renders, just inside `Sheet`'s own existing
  // mobile "slides up from bottom" behaviour instead of a new drawer.
  const [railSheetOpen, setRailSheetOpen] = useState(false);

  const [openPrompt, setOpenPrompt] = useState<Prompt | undefined>(undefined);
  const fieldNameFor = (prompt: Prompt | undefined) => fields.find((f) => f.id === prompt?.fieldId)?.name;

  const mappedFields = fields.filter((f) => f.polygon);

  // Real farm-wide spreading-calendar aggregate — the reference's
  // ambient-strip "Dry / Good conditions" segment has no honest
  // equivalent (no real farm-wide ground-conditions verdict exists);
  // this is the one additional real ambient fact this app actually has.
  // Also now the one real source for the chemical-fertiliser
  // restriction fact, kept explicit and separate from field-level
  // nutrient status (product decision, 2026-09-19) — the closed-period
  // logic itself (`checkClosedPeriodCalendar`) is untouched.
  const spreadingPrompts = allPrompts.filter((p) => p.kind === SPREADING_WINDOW_PROMPT_KIND);
  const chemicalSpreadingPrompts = spreadingPrompts.filter((p) => p.inputsSnapshot?.material !== "organic_fertiliser_other_than_FYM");
  const slurrySpreadingPrompts = spreadingPrompts.filter((p) => p.inputsSnapshot?.material === "organic_fertiliser_other_than_FYM");
  const calendarOpenCount = chemicalSpreadingPrompts.filter((p) => p.basis.status === "OK").length;
  const slurryOpenCount = slurrySpreadingPrompts.filter((p) => p.basis.status === "OK").length;
  const chemicalFertiliserAmbientStatus =
    mounted && chemicalSpreadingPrompts.length > 0
      ? calendarOpenCount === 0
        ? "Chemical fertiliser · Closed period"
        : `Chemical fertiliser · Open ${calendarOpenCount}/${chemicalSpreadingPrompts.length}`
      : undefined;
  // Today Opportunity Priority Engine V1 — the same real, already-computed
  // fact as the chip/summary text above, as a plain boolean the priority
  // engine's own Fertiliser `blocked` situation reads directly (see
  // `today-opportunities.ts`'s `buildFertiliserOpportunity`), rather than
  // re-parsing the display string.
  const chemicalFertiliserClosed = mounted && chemicalSpreadingPrompts.length > 0 && calendarOpenCount === 0;
  const slurryAmbientStatus =
    mounted && slurrySpreadingPrompts.length > 0
      ? slurryOpenCount === 0
        ? "Slurry · Closed period"
        : `Slurry · Open ${slurryOpenCount}/${slurrySpreadingPrompts.length}`
      : undefined;

  // Real farm-wide slurry tank storage (`src/domain/slurry-storage.ts`,
  // pure arithmetic over already-loaded `Housing[]`/`SlurryAllocation[]`
  // — no new fetch) — the one real "volume available" figure the Slurry
  // opportunity rail row can honestly show, and only when the farm has
  // real storage records at all (`totalCapacityM3 > 0`, checked inside
  // the builder itself).
  const slurryStorage = useMemo(() => buildFarmSlurryStorageOverview(housingList, slurryAllocations), [housingList, slurryAllocations]);

  // Farm-Topic Notification Aggregation V1 (2026-09-19) — the ONE place
  // Today's farm-topic notifications are built: at most one
  // `TodayOpportunity` per category (Slurry, Lime, Fertiliser, Soil),
  // aggregating real, already-canonical downstream outputs, never
  // recomputing a scientific/regulatory figure of its own. The rail, the
  // HUD, and the map's own focus highlight all read this exact same
  // array — never independently-derived copies.
  const todayOpportunities = useMemo(
    () =>
      mounted
        ? buildTodayOpportunities({
            allPrompts,
            fields,
            limeRequirement,
            slurryStorage,
            slurryAmbientStatus,
            chemicalFertiliserAmbientStatus,
            chemicalFertiliserClosed,
          })
        : [],
    [mounted, allPrompts, fields, limeRequirement, slurryStorage, slurryAmbientStatus, chemicalFertiliserAmbientStatus, chemicalFertiliserClosed],
  );
  const priorityCounts = useMemo(() => countTodayPriorities(todayOpportunities.map((o) => o.priority)), [todayOpportunities]);
  const [openOpportunity, setOpenOpportunity] = useState<TodayOpportunity | undefined>(undefined);
  // Today Control Room V1 — which category is currently "focused": drives
  // both the rail's own selected-row emphasis and the map's real
  // `highlightedFieldIds` (below). A real, disclosed toggle, not a
  // fabricated field-level priority — see `MapHero.tsx`'s own doc
  // comment on `highlightedFieldIds` for why that distinction matters.
  const [focusedCategory, setFocusedCategory] = useState<TodayOpportunityCategory | undefined>(undefined);
  const focusedOpportunity = todayOpportunities.find((o) => o.category === focusedCategory);

  function selectOpportunity(opportunity: TodayOpportunity) {
    if (focusedCategory === opportunity.category) {
      // Clicking the already-focused row again clears the focus — a
      // real, deliberate toggle, matching the rail row's own
      // `aria-pressed` state.
      setFocusedCategory(undefined);
      setOpenOpportunity(undefined);
      return;
    }
    setFocusedCategory(opportunity.category);
    setOpenOpportunity(opportunity);
  }

  function closeOpportunity() {
    setOpenOpportunity(undefined);
    setFocusedCategory(undefined);
  }

  // Today Map Priority Semantics Correction (2026-09-19): a farm-topic
  // opportunity's own priority answers "how important is Slurry for the
  // farm today?" — a genuinely different question from "which specific
  // field should be dealt with first?", and this app has no real,
  // scientifically-backed FIELD-level ranking yet. Every field marker is
  // deliberately plain/neutral until a real field-level priority model
  // exists — HIGH/MEDIUM/LOW/VERY_LOW stay canonical only for the
  // farm-level HUD/rail/sheet, never repainted onto individual fields.
  // `highlightedFieldIds` (below, Today Control Room V1) is a genuinely
  // different, real concept — "this field belongs to the focused
  // opportunity" — deliberately carries no colour/priority meaning of
  // its own (`MapHero`'s own doc comment on that prop).
  const fieldTone = () => "neutral" as const;
  const fieldStatusLabel = () => undefined;

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
      {/* Today Control Room V1 (2026-09-19): the map is the dominant
          operational canvas on every breakpoint — top-left identity,
          top ambient status strip, a desktop-only right rail
          (`TodayControlRoomRail`, real farm-topic opportunities) and a
          bottom HUD (`TodayPriorityHud`, real priority counts) all live
          as compact glass-over-photo overlays, `lg:pr-*` reserving the
          rail's own width so the left-column content never runs under
          it. Nothing here is a large floating card — every overlay
          element is a small row/pill, matching this checkpoint's own
          "information by exception, compact until selected" direction. */}
      <div className="relative -mx-4 -mt-4 lg:mx-0 lg:mt-0 lg:overflow-hidden lg:rounded-fr-card lg:shadow-fr-card">
        <MapHero
          fields={fields}
          getTone={fieldTone}
          getStatusLabel={fieldStatusLabel}
          onSelectField={(fieldId) => router.push(`/fields?field=${fieldId}`)}
          selectedFieldId={primaryPrompt?.fieldId}
          compactNeighbourLabels
          // Today Control Room V1 — real category-focus membership only
          // (see `MapHero.tsx`'s own doc comment): the currently focused
          // opportunity's own real `affectedFieldIds`, softening every
          // other real mapped field and (opt-in) fitting the camera to
          // just that set. `undefined` (no category focused) leaves the
          // map at its normal, unfocused default.
          highlightedFieldIds={focusedOpportunity?.affectedFieldIds}
          dimUnhighlighted
          fitHighlightedFields
          center={farm.location.centroid}
          userPosition={position}
          plain
          className="h-[100dvh] min-h-[560px] lg:h-[600px]"
        >
          <div className="absolute inset-0 z-10 flex flex-col justify-between overflow-y-auto bg-gradient-to-b from-black/45 via-transparent to-transparent p-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-6 lg:pr-[352px]">
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
                  calendar openness), merged into one cohesive pill.
                  Unchanged by this checkpoint. */}
              <div className="flex max-w-fit items-center gap-2 rounded-full border border-white/20 bg-fr-green-900/45 px-3 py-1.5 backdrop-blur-sm">
                <WeatherHeroChip centroid={farm.location.centroid} bare />
                {chemicalFertiliserAmbientStatus ? (
                  <>
                    <span className="h-3 w-px shrink-0 bg-white/25" />
                    <span className="whitespace-nowrap text-xs font-medium text-white">{chemicalFertiliserAmbientStatus}</span>
                  </>
                ) : null}
                {slurryAmbientStatus ? (
                  <>
                    <span className="h-3 w-px shrink-0 bg-white/25" />
                    <span className="whitespace-nowrap text-xs font-medium text-white">{slurryAmbientStatus}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <GpsActivityCandidateCard fields={fields} />
              <NearbyFieldCard fields={fields} position={position} onOpen={(fieldId) => router.push(`/fields?field=${fieldId}`)} />

              {/* Today Control Room V1 — the compact bottom HUD (section
                  6 of this checkpoint's brief): real farm-level priority
                  counts, never field counts, same source
                  (`priorityCounts`) as everywhere else on this screen.
                  Shown on every breakpoint — it's a slim pill, not a
                  rail, so it doesn't need a `lg:`-only gate. */}
              {mounted && mappedFields.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <TodayPriorityHud counts={priorityCounts} variant="overlay" />
                  {/* Section 7 — the reserved working-window/weather
                      area: only real, already-available data (this
                      farm's own weather chip already shows current
                      conditions above), honestly labelled as not yet
                      built out into a real forecast timeline rather than
                      fabricating slurry/trafficability suitability. */}
                  <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-fr-ink-900/55 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-sm">
                    <Radar className="size-3 shrink-0" />
                    Working window · Forecast view coming soon
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Today Control Room V1 — the desktop-only right rail
              (section 1/2 of this checkpoint's brief). `pointer-events-none`
              on the wrapper (its own empty space must not block the map
              underneath), `pointer-events-auto` on the real content —
              the same overlay-hit-testing pattern the ambient strip
              above already relies on implicitly (it has real content
              filling its own bounds, so this only matters here because
              the rail's own column is taller than its content). */}
          <div className="pointer-events-none absolute inset-y-0 right-0 z-20 hidden w-[336px] flex-col gap-3 overflow-y-auto p-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-6 lg:flex">
            <div className="pointer-events-auto flex flex-col gap-3">
              {!mounted || (pilotLoading && !pilotState) ? (
                <div className="animate-pulse rounded-fr-card border border-white/15 bg-fr-ink-900/40 px-3 py-2.5">
                  <div className="h-3 w-32 rounded bg-white/20" />
                </div>
              ) : pilotError ? (
                <div className="rounded-fr-card border border-white/15 bg-fr-ink-900/55 px-3 py-2.5 backdrop-blur-sm">
                  <p className="text-xs text-white/80">Unable to verify a recommendation right now.</p>
                </div>
              ) : pilotState ? (
                <WhatMattersPilotCard result={pilotState.result} fieldName={pilotFieldName()} onViewDetails={handlePilotViewDetails} onConfirm={handlePilotConfirm} variant="dark" />
              ) : null}

              {mounted && todayOpportunities.length > 0 ? (
                <TodayControlRoomRail opportunities={todayOpportunities} selectedCategory={focusedCategory} onSelectOpportunity={selectOpportunity} variant="overlay" />
              ) : null}

              {mounted && secondaryFeedPrompts.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSecondaryOpen(true)}
                  className="self-start text-[11px] font-semibold text-white/70 underline decoration-white/30 underline-offset-2"
                >
                  View all today&apos;s items →
                </button>
              ) : null}

              {/* Desktop's own Ask AI affordance — the mobile section
                  below the map (`lg:hidden`) has its own; without this,
                  desktop would silently lose the capability entirely
                  once the rail replaced the old below-map card stack. */}
              <div className="flex justify-end">
                <AskAIButton context={askAIContext} />
              </div>
            </div>
          </div>
        </MapHero>
      </div>

      {/* Mobile/tablet only — the map stays the main visual (above), and
          this normal-flow section below it stays intentionally light:
          "What matters now" (reused as-is, already mobile-optimised),
          a compact priority strip that opens the same rail data in a
          bottom `Sheet`, and Ask AI. The desktop rail/HUD overlays above
          are `lg:`-only; this section is `lg:hidden` — never both at
          once. */}
      <div className="mt-4 flex flex-col gap-3 lg:hidden">
        {!mounted || (pilotLoading && !pilotState) ? (
          <div className="animate-pulse rounded-fr-card bg-fr-surface p-5 shadow-fr-card">
            <div className="h-5 w-40 rounded bg-fr-surface-alt" />
            <div className="mt-3 h-4 w-full rounded bg-fr-surface-alt" />
          </div>
        ) : pilotError ? (
          <div className="rounded-fr-card border border-fr-border bg-fr-surface p-5 shadow-fr-card">
            <p className="text-sm text-fr-ink-600">Unable to verify a recommendation right now.</p>
          </div>
        ) : pilotState ? (
          <WhatMattersPilotCard result={pilotState.result} fieldName={pilotFieldName()} onViewDetails={handlePilotViewDetails} onConfirm={handlePilotConfirm} variant="light" />
        ) : null}

        {mounted && mappedFields.length > 0 ? (
          <button
            type="button"
            onClick={() => setRailSheetOpen(true)}
            className="flex items-center justify-between gap-2 rounded-fr-card border border-fr-border bg-fr-surface px-3 py-2.5 shadow-fr-card"
          >
            <TodayPriorityHud counts={priorityCounts} variant="surface" />
            <ChevronRight className="size-4 shrink-0 text-fr-ink-400" />
          </button>
        ) : null}

        <div className="flex justify-end">
          <AskAIButton context={askAIContext} />
        </div>
      </div>

      {/* Today Control Room V1 — mobile's own collapsible bottom sheet
          for the same real opportunity rail the desktop overlay renders
          (section 9's own "no permanent right rail on mobile" rule). */}
      <Sheet open={railSheetOpen} onClose={() => setRailSheetOpen(false)} title="Today's opportunities">
        <div className="flex flex-col gap-3">
          <TodayControlRoomRail
            opportunities={todayOpportunities}
            selectedCategory={focusedCategory}
            onSelectOpportunity={(opportunity) => {
              setRailSheetOpen(false);
              selectOpportunity(opportunity);
            }}
            variant="surface"
          />
          {secondaryFeedPrompts.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setRailSheetOpen(false);
                setSecondaryOpen(true);
              }}
              className="self-start text-xs font-semibold text-fr-green-700"
            >
              View all today&apos;s items →
            </button>
          ) : null}
        </div>
      </Sheet>

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

      {/* Farm-Topic Notification Aggregation V1 — the FARM-LEVEL
          OPPORTUNITY -> FIELD BREAKDOWN -> SCIENTIFIC EVIDENCE hierarchy:
          a rail row opens this sheet's field breakdown; a field row
          either navigates to its own real Field Detail screen, or (for
          Slurry/Fertiliser/Soil, which have a real underlying `Prompt` —
          Lime doesn't yet) opens `ExpandedPromptSheet` below for that
          field's own real evidence, nested on top rather than replacing
          this sheet. Rendered BEFORE `ExpandedPromptSheet` in the DOM
          deliberately — every `Sheet` instance shares the same `z-50`,
          so when both are open at once, the one rendered later here is
          the one that visually sits on top; `ExpandedPromptSheet` must
          win that stack whenever it's nested inside this one. */}
      <TodayOpportunitySheet
        opportunity={openOpportunity}
        open={Boolean(openOpportunity)}
        onClose={closeOpportunity}
        onOpenField={(fieldId) => {
          closeOpportunity();
          router.push(`/fields?field=${fieldId}`);
        }}
        onViewEvidence={(row: TodayOpportunityFieldRow) => {
          if (row.sourcePrompt) setOpenPrompt(row.sourcePrompt);
        }}
      />

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
