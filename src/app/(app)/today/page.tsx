"use client";

/**
 * Farm — Farm + Fields redesign (2026-10-27,
 * `docs/design/farm-fields-high-fidelity-reference.md`). The real map is
 * the page: farm identity top-left, compact utilities top-right, the four
 * lenses (Current / Grass / Nutrients / Conditions — Soil now sits inside
 * Nutrients) bottom-centre, and a selected field coming forward on a deep
 * forest panel with a straw selection rule. The What Matters summary and
 * the farm-topic rail no longer sit on or beneath the map: they are one
 * quiet "What matters" disclosure away (same producers, same state, same
 * map focus behaviour), and `/what-matters` keeps the full view.
 *
 * Earlier: Farm Spatial V2 shell (Phase 2, 2026-10-07;
 * `design/farm-spatial-v2/DESIGN_CONTRACT.md`,
 * `docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` §11). This route is the
 * primary-nav "Farm" screen: the real map is the dominant canvas with the
 * farm identity, the five-lens control and the persistent object rail.
 * The What Matters pilot and farm-topic rail moved off the map into a
 * plane beneath it on desktop. Every producer below is unchanged; the
 * historical notes that follow still describe them.
 *
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
import { MapHero } from "@/components/farm/MapHero";
import { FarmLensControl } from "@/components/farm-spatial/FarmLensControl";
import { FarmLensContext } from "@/components/farm-spatial/FarmLensContext";
import { FarmObjectRail } from "@/components/farm-spatial/FarmObjectRail";
import { FarmFieldDrawer } from "@/components/farm-spatial/FarmFieldDrawer";
import { FARM_LENS_MARKER_COLOR, FIELD_SELECTION_COLOR, farmFieldLensView, parseFarmSpatialReturn } from "@/lib/farm-spatial-field-lens";
import { farmFieldSelectionView } from "@/lib/farm-field-selection";
import { useFieldNutrientPlan } from "@/lib/use-field-nutrient-plan";
import { fieldNutrientPlanView } from "@/lib/field-nutrient-plan-presentation";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { DEFAULT_FARM_LENS, farmLensById, type FarmLensId } from "@/lib/farm-spatial-lenses";
import { calculateActiveFarmAreaHa, calculateFarmObjectRailCounts, calculateFarmSetupProgress } from "@/domain/farm-stats";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { FarmConditionsControl } from "@/components/farm-spatial/FarmConditionsControl";
import { farmConditionsSummary, spreadingCalendarEntry, spreadingCalendarStatusLine } from "@/lib/farm-conditions-summary";
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
import { WhatMattersPilotCard, ContractorCostRateInput } from "@/components/next/WhatMattersPilotCard";
import { useWhatMattersPilot } from "@/components/next/useWhatMattersPilot";
import { useFarm, useFields, useHousingList, useIsRealMode, useLivestockGroups, useSlurryAllocations, useSlurryCompositionRecords } from "@/store/farm-store";
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
import { buildSlurryPlanningEntry } from "@/domain/slurry-allocation-plan";
import type { Prompt } from "@/orchestration/prompt";
import type { FarmLimeRequirement } from "@/domain/fertiliser-plan";

export default function TodayPage() {
  const farm = useFarm();
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const slurryCompositionRecords = useSlurryCompositionRecords();
  const housingList = useHousingList();
  const isRealMode = useIsRealMode();
  const router = useRouter();
  const position = useOneShotPosition();
  // Real count of fields MapHero actually draws (only ones with a real
  // `polygon` get a boundary/pin — see its own doc comment) — never
  // `fields.length`, which would call an unmapped field "mapped".
  const mappedFieldCount = fields.filter((f) => f.polygon).length;
  // Farm Spatial V2 identity line: say which count is shown ("mapped"
  // vs total active), never call an unmapped field mapped.
  const fieldCountLabel =
    mappedFieldCount === fields.length
      ? `${mappedFieldCount} ${mappedFieldCount === 1 ? "field" : "fields"} mapped`
      : `${mappedFieldCount} of ${fields.length} fields mapped`;
  const farmAreaHa = useMemo(() => calculateActiveFarmAreaHa(fields), [fields]);
  const objectRailCounts = useMemo(
    () => calculateFarmObjectRailCounts(calculateFarmSetupProgress(fields, livestockGroups, housingList)),
    [fields, livestockGroups, housingList],
  );

  // Farm Spatial V2 — the active lens. Pure UI state: switching lens
  // changes the contextual caption only, never the camera or any value.
  const [lens, setLens] = useState<FarmLensId>(DEFAULT_FARM_LENS);
  const activeLens = farmLensById(lens);

  // Farm Spatial V2 Phase 3 — the field the farmer selected on the map
  // (object-before-form). Only a real mapped field can be selected; if it
  // is unmapped or archived the selection simply resolves to nothing and
  // the drawer falls away. Tapping the selected field again, tapping open
  // ground, the drawer's close button or Escape all deselect.
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>(undefined);
  const selectedField = fields.find((f) => f.id === selectedFieldId && f.polygon);
  const reducedMotion = usePrefersReducedMotion();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  function toggleSelectedField(fieldId: string) {
    setSelectedFieldId((current) => (current === fieldId ? undefined : fieldId));
  }

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
    // Farm Spatial V2 Phase 4 — returning from a field nutrient plan
    // (`farmSpatialReturnHref`) restores its lens and field selection. Read
    // once post-mount (the URL is an external system); an id that isn't a
    // real mapped field still resolves to no selection.
    const restored = parseFarmSpatialReturn(window.location.search);
    if (restored.lens) setLens(restored.lens);
    if (restored.fieldId) setSelectedFieldId(restored.fieldId);
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
    return buildAllRealPrompts(farm, fields, livestockGroups, slurryAllocations, new Date().toISOString(), slurryCompositionRecords);
  }, [mounted, farm, fields, livestockGroups, slurryAllocations, slurryCompositionRecords]);

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

  // What Matters pilot — the one shared client state (`useWhatMattersPilot`, Pilot Integration P4), also used by the
  // dedicated What Matters screen. This is the ONLY source for the "What matters now" slot below; a failed evaluation
  // is an honest "unable to verify", never a fallback to `primaryPrompt`.
  const { pilotState, pilotError, pilotLoading, contractorRateError, handlePilotConfirm, handleSaveContractorCostRate, pilotFieldName, handlePilotViewDetails } = useWhatMattersPilot();

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
  // Farm + Fields redesign — the What Matters summary, farm topics and Ask
  // AI live in one quiet disclosure over the map instead of on/under it.
  const [briefOpen, setBriefOpen] = useState(false);

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
  const chemicalProhibitedCount = chemicalSpreadingPrompts.filter((p) => p.basis.status === "LEGAL_PROHIBITION").length;
  const slurryProhibitedCount = slurrySpreadingPrompts.filter((p) => p.basis.status === "LEGAL_PROHIBITION").length;
  // Farm Home visual refresh v1 — one formatter for the calendar wording,
  // shared by the compact conditions control and every existing consumer
  // of the ambient status lines below.
  const chemicalAssessedCount = chemicalSpreadingPrompts.length;
  const slurryAssessedCount = slurrySpreadingPrompts.length;
  const calendar = useMemo(() => {
    const chemical = mounted
      ? spreadingCalendarEntry({ id: "chemical", label: "Chemical fertiliser", openCount: calendarOpenCount, prohibitedCount: chemicalProhibitedCount, assessedCount: chemicalAssessedCount })
      : undefined;
    const slurry = mounted ? spreadingCalendarEntry({ id: "slurry", label: "Slurry", openCount: slurryOpenCount, prohibitedCount: slurryProhibitedCount, assessedCount: slurryAssessedCount }) : undefined;
    return {
      summary: farmConditionsSummary([chemical, slurry]),
      chemicalLine: spreadingCalendarStatusLine(chemical),
      slurryLine: spreadingCalendarStatusLine(slurry),
    };
  }, [mounted, calendarOpenCount, chemicalProhibitedCount, chemicalAssessedCount, slurryOpenCount, slurryProhibitedCount, slurryAssessedCount]);
  const conditionsSummary = calendar.summary;
  const chemicalFertiliserAmbientStatus = calendar.chemicalLine;
  // Today Opportunity Priority Engine V1 — the same real, already-computed
  // fact as the chip/summary text above, as a plain boolean the priority
  // engine's own Fertiliser `blocked` situation reads directly (see
  // `today-opportunities.ts`'s `buildFertiliserOpportunity`), rather than
  // re-parsing the display string.
  const chemicalFertiliserClosed = mounted && chemicalSpreadingPrompts.length > 0 && calendarOpenCount === 0;
  const slurryAmbientStatus = calendar.slurryLine;
  // Conditions lens context — the same real calendar facts as the
  // ambient strip, never a new suitability verdict.
  const conditionsFacts = [chemicalFertiliserAmbientStatus, slurryAmbientStatus].filter((f): f is string => Boolean(f));

  // Real farm-wide slurry tank storage (`src/domain/slurry-storage.ts`,
  // pure arithmetic over already-loaded `Housing[]`/`SlurryAllocation[]`
  // — no new fetch) — the one real "volume available" figure the Slurry
  // opportunity rail row can honestly show, and only when the farm has
  // real storage records at all (`totalCapacityM3 > 0`, checked inside
  // the builder itself).
  const slurryStorage = useMemo(() => buildFarmSlurryStorageOverview(housingList, slurryAllocations), [housingList, slurryAllocations]);

  // Slurry planning entry: slurry in storage, spreading open on real
  // fields, and no persisted allocation for What Matters to evaluate (the
  // server's own count) -> offer to create a real spreading plan instead
  // of claiming an opportunity nothing has valued yet.
  const slurryPlanningEntry = mounted
    ? buildSlurryPlanningEntry({ plannedSlurryFieldCount: pilotState?.plannedSlurryFieldCount, openSlurryFieldCount: slurryOpenCount, storage: slurryStorage })
    : undefined;

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
  //
  // Farm Spatial V2 Phase 3: the active lens adds its own real marker text
  // (e.g. a recorded P/K index, pH or field use) and one uniform domain
  // colour for every pin. Uniform colour carries no per-field priority.
  const fieldTone = () => "neutral" as const;
  const lensViewContext = { slurryAllocations, conditionsFacts };
  const fieldStatusLabel = (field: (typeof fields)[number]) => farmFieldLensView(lens, field, lensViewContext).markerLabel;
  const selectedFieldView = selectedField ? farmFieldLensView(lens, selectedField, lensViewContext) : undefined;
  // The selected field's canonical nutrient plan (the shared assembly the
  // Nutrients screen uses), computed only for that one field, so its real
  // nutrient state and statutory gates can inform the panel on any lens.
  const selectedNutrientPlanResult = useFieldNutrientPlan(selectedField);
  const selectedNutrientPlanView = selectedNutrientPlanResult && selectedField ? fieldNutrientPlanView(selectedNutrientPlanResult, selectedField) : undefined;
  // The field's own leading Prompt from the same real producers — the one
  // current-state statement on the Current lens, never a new ranking.
  const selectedFieldPrompt = selectedField ? selectPrimaryPrompt(allPrompts.filter((p) => p.fieldId === selectedField.id)) : undefined;
  const selection =
    selectedField && selectedFieldView
      ? farmFieldSelectionView({
          lens,
          field: selectedField,
          lensView: selectedFieldView,
          nutrientPlan: selectedNutrientPlanView,
          leadingPrompt: selectedFieldPrompt,
          conditionsFacts,
          slurryAllocations,
        })
      : undefined;

  const askAIContext = {
    screen: "Farm",
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

  // The quiet What Matters summary — identical producers and handlers to
  // the former plane under the map, now inside the disclosure below.
  const whatMattersSummary =
    !mounted || (pilotLoading && !pilotState) ? (
      <div className="animate-pulse py-2" aria-busy="true">
        <div className="h-4 w-40 bg-fr-v2-cream-rule" />
        <div className="mt-3 h-3 w-full bg-fr-v2-cream-rule/70" />
      </div>
    ) : pilotError ? (
      <p className="text-sm text-fr-v2-muted">Unable to verify a recommendation right now.</p>
    ) : pilotState ? (
      <>
        <WhatMattersPilotCard result={pilotState.result} fieldName={pilotFieldName()} onViewDetails={handlePilotViewDetails} onConfirm={handlePilotConfirm} missingSlurryDetails={pilotState.missingSlurryDetails} multiSourceSlurryFieldIds={pilotState.multiSourceSlurryFieldIds} slurryPlanningEntry={slurryPlanningEntry} disabled={pilotLoading} variant="light" />
        {/* One-time setup only: once a contractor rate is on record (from
            this evaluation or an already-persisted one seen on load), this
            row disappears for good here -- editing later happens elsewhere
            (brief: "Do not add Edit on Today"). */}
        {!pilotState.contractorRatePerHa ? (
          <ContractorCostRateInput onSave={handleSaveContractorCostRate} disabled={pilotLoading} variant="light" currentRatePerHa={pilotState.contractorRatePerHa} error={contractorRateError} />
        ) : null}
        {/* Pilot P4: Farm keeps the summary; the fuller view (with its evidence) is What Matters. */}
        <Link href="/what-matters" className="self-start text-xs font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-2">
          Open What Matters →
        </Link>
      </>
    ) : null;

  const farmTopicCount = mounted ? todayOpportunities.length : 0;

  return (
    <>
      {/* Farm + Fields redesign: the map is the page. Overlays: identity
          (top-left), compact utilities (top-right: Fields list, What
          matters, conditions), GPS cards and the lens caption
          (bottom-left, stepping aside while a field is selected), the
          selected-field panel rising above the lens switcher, and the
          lens switcher (bottom-centre). Two local scrims carry legibility
          so the aerial imagery stays clear across the farm. Desktop keeps
          the quiet object rail beside the map; mobile places it under it.
          `data-farm-workspace` runs the map edge to edge beside the
          navigation (see `AppShell`). */}
      <section data-farm-workspace className="-mx-4 -mt-4 lg:mx-0 lg:mt-0 lg:grid lg:grid-cols-[minmax(0,1fr)_112px] lg:overflow-hidden">
        <div className="relative min-w-0">
          <MapHero
            fields={fields}
            getTone={fieldTone}
            getStatusLabel={fieldStatusLabel}
            // A tap selects the field in place; its workspace stays one
            // link away inside the selected-field panel.
            onSelectField={toggleSelectedField}
            onMapBackgroundClick={() => setSelectedFieldId(undefined)}
            // Only the farmer's own selection is emphasised — a leading
            // Prompt never pre-selects a field in straw.
            selectedFieldId={selectedField?.id}
            selectionColor={FIELD_SELECTION_COLOR}
            // Only a farmer's own selection moves the camera, never a lens
            // change. Bottom padding keeps the field clear of the rising
            // panel, and the zoom cap keeps neighbours in frame.
            flyToSelection={Boolean(selectedField)}
            flyToPadding={isDesktop ? { top: 140, bottom: 110, left: 470, right: 60 } : { top: 150, bottom: 500, left: 32, right: 32 }}
            flyToMaxZoom={16}
            flyToDuration={reducedMotion ? 0 : 320}
            compactNeighbourLabels
            // Every mapped field keeps its real name on the map (bare
            // text, no status or colour claim) plus the active lens's real
            // marker text.
            neighbourNameLabels
            neighbourDetailLabels
            markerAccentColor={FARM_LENS_MARKER_COLOR[lens]}
            markerContentKey={lens}
            // Real category-focus membership only (see `MapHero.tsx`): the
            // focused farm topic's own real `affectedFieldIds`, softening
            // every other mapped field and fitting the camera to that set.
            // A selected field takes over the highlight so its neighbours
            // recede (dimmed, never hidden); the camera is then owned by
            // `flyToSelection`. A lens change never touches the camera.
            highlightedFieldIds={selectedField ? [selectedField.id] : focusedOpportunity?.affectedFieldIds}
            dimUnhighlighted
            fitHighlightedFields={!selectedField}
            center={farm.location.centroid}
            userPosition={position}
            plain
            // Keep the whole farm clear of the identity, utilities and
            // lens switcher: a wide left margin beside the desktop identity.
            fitPadding={(width) => (width >= 860 ? { top: 120, bottom: 110, left: 380, right: 60 } : { top: 250, bottom: 190, left: 24, right: 120 })}
            className="h-[calc(100dvh-0.5rem)] min-h-[600px] lg:h-dvh lg:min-h-[640px]"
          >
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
              <div aria-hidden className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_70%_100%_at_0%_0%,rgba(10,14,11,0.55),transparent_72%)]" />
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/50 via-black/12 to-transparent" />

              <div className="relative flex flex-col gap-4 p-4 pt-[max(env(safe-area-inset-top),1.25rem)] sm:flex-row sm:items-start sm:justify-between lg:px-9 lg:pt-8">
                <div className="pointer-events-auto min-w-0 [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
                  <p className={cn("text-[10.5px] font-semibold uppercase tracking-[0.18em]", activeLens.kickerClassName)}>Farm Return · {activeLens.label}</p>
                  <h1 className="mt-2 max-w-[16ch] text-balance font-display text-[34px] leading-[0.98] tracking-[-0.02em] text-white lg:text-[56px]">{farm.name}</h1>
                  <p className="mt-3 font-mono text-[12px] tabular-nums tracking-[0.01em] text-white/90" data-farm-identity-measure>
                    {fieldCountLabel}
                    {farmAreaHa !== null ? ` · ${formatNumber(farmAreaHa, 1)} ha` : ""}
                  </p>
                  <p className={cn("mt-1 text-xs text-white/65", selectedField && "max-sm:hidden")}>
                    {greetingText}, {farm.ownerName}
                  </p>
                </div>

                {/* Compact utilities only: the Fields companion list, the
                    quiet What matters disclosure, and the real station
                    weather + spreading-calendar control (with Settings). */}
                {/* On a phone the utilities step aside while a field is
                    selected, so the field stays visible above its panel. */}
                <div className={cn("pointer-events-auto flex min-w-0 flex-wrap items-start gap-1 self-start sm:shrink-0 sm:justify-end", selectedField && "max-sm:hidden")}>
                  <Link
                    href="/fields"
                    className="flex h-9 items-center rounded-fr-v2-control bg-fr-v2-shell/72 px-3 text-xs font-medium text-white shadow-[0_2px_10px_rgba(0,0,0,0.18)] backdrop-blur-md transition-colors duration-[160ms] hover:bg-fr-v2-shell/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
                  >
                    Fields list
                  </Link>
                  <button
                    type="button"
                    onClick={() => setBriefOpen(true)}
                    aria-haspopup="dialog"
                    data-what-matters-trigger
                    className="flex h-9 items-center gap-2 rounded-fr-v2-control bg-fr-v2-shell/72 px-3 text-xs font-medium text-white shadow-[0_2px_10px_rgba(0,0,0,0.18)] backdrop-blur-md transition-colors duration-[160ms] hover:bg-fr-v2-shell/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
                  >
                    What matters
                    {farmTopicCount > 0 ? (
                      <span className="font-mono text-[11px] tabular-nums text-fr-v2-straw" aria-label={`${farmTopicCount} farm ${farmTopicCount === 1 ? "topic" : "topics"}`}>
                        {farmTopicCount}
                      </span>
                    ) : null}
                  </button>
                  <FarmConditionsControl centroid={farm.location.centroid} summary={conditionsSummary} ready={mounted} />
                </div>
              </div>

              <div className="relative flex flex-col">
                {/* With a field selected the panel carries the lens
                    information, so the farm-wide caption and GPS cards
                    step aside rather than stacking under it. */}
                <div className={cn("flex flex-col gap-3 px-4 pb-3 transition-opacity duration-[180ms] motion-reduce:transition-none lg:px-9 lg:pb-4", selectedField && "invisible opacity-0")}>
                  <div className="pointer-events-auto flex max-w-md flex-col gap-2">
                    <GpsActivityCandidateCard fields={fields} />
                    <NearbyFieldCard fields={fields} position={position} onOpen={(fieldId) => router.push(`/fields?field=${fieldId}`)} />
                  </div>
                  <div className="pointer-events-auto">
                    <FarmLensContext lensId={lens} facts={lens === "conditions" ? conditionsFacts : undefined} />
                  </div>
                </div>
                <div className="relative">
                  {/* The selected field comes forward, attached to the map
                      above the lens switcher — never a full-screen modal. */}
                  <div className="absolute inset-x-0 bottom-full px-2 pb-2 sm:px-3 lg:left-9 lg:right-auto lg:w-[400px] lg:px-0 lg:pb-3">
                    <FarmFieldDrawer field={selectedField} lensId={lens} selection={selection} onClose={() => setSelectedFieldId(undefined)} />
                  </div>
                  <div className="flex justify-center px-2 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:px-3 lg:pb-6">
                    <div className="pointer-events-auto w-full sm:w-auto">
                      <FarmLensControl value={lens} onChange={setLens} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </MapHero>
        </div>

        <FarmObjectRail counts={objectRailCounts} livestockGroups={livestockGroups} housing={housingList} />
      </section>

      {/* What matters — the What Matters pilot summary (T7/T25), the
          farm-topic rail with its priority counts and secondary feed, and
          Ask AI (T8/T9/T11/T14/T17/T24), progressively disclosed rather
          than competing with the map. Selecting a topic closes this panel
          so the map can show that topic's real fields. */}
      <Sheet
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        title="What matters"
        placement="side"
        panelClassName="bg-fr-v2-cream border-fr-v2-cream-rule lg:rounded-none lg:border-l-[3px] lg:border-y-0 lg:border-r-0 lg:border-l-fr-v2-gold"
      >
        <div className="flex flex-col gap-8" data-what-matters-brief>
          <section aria-label="What Matters" className="flex min-w-0 flex-col gap-3">
            {whatMattersSummary}
          </section>

          <section aria-labelledby="farm-topics-heading" className="flex min-w-0 flex-col gap-3 border-t border-fr-v2-cream-rule pt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 id="farm-topics-heading" className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-muted">
                Farm topics
              </h3>
              <AskAIButton context={askAIContext} />
            </div>
            {/* Priority counts only for a farm with mapped fields (T27). */}
            {mounted && mappedFields.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <TodayPriorityHud counts={priorityCounts} variant="surface" />
              </div>
            ) : null}
            {mounted && todayOpportunities.length > 0 ? (
              <TodayControlRoomRail
                opportunities={todayOpportunities}
                selectedCategory={focusedCategory}
                onSelectOpportunity={(opportunity) => {
                  setBriefOpen(false);
                  setSelectedFieldId(undefined);
                  selectOpportunity(opportunity);
                }}
                variant="surface"
              />
            ) : null}
            {mounted && secondaryFeedPrompts.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setBriefOpen(false);
                  setSecondaryOpen(true);
                }}
                className="self-start text-xs font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-2"
              >
                View all today&apos;s items →
              </button>
            ) : null}
          </section>
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
          a topic row opens this sheet's field breakdown; a field row
          either navigates to its own real field workspace, or (for
          Slurry/Fertiliser/Soil, which have a real underlying `Prompt` —
          Lime doesn't yet) opens `ExpandedPromptSheet` below for that
          field's own real evidence, nested on top rather than replacing
          this sheet. Rendered BEFORE `ExpandedPromptSheet` in the DOM
          deliberately — every `Sheet` instance shares the same `z-50`,
          so the one rendered later visually sits on top. */}
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
