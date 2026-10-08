"use client";

/**
 * Farm — Farm Spatial V2 shell (Phase 2, 2026-10-07;
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
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Radar } from "lucide-react";
import { MapHero } from "@/components/farm/MapHero";
import { FarmLensControl } from "@/components/farm-spatial/FarmLensControl";
import { FarmLensContext } from "@/components/farm-spatial/FarmLensContext";
import { FarmObjectRail } from "@/components/farm-spatial/FarmObjectRail";
import { FarmFieldDrawer } from "@/components/farm-spatial/FarmFieldDrawer";
import { FARM_LENS_MARKER_COLOR, farmFieldLensView, fieldNutrientPlanHref, parseFarmSpatialReturn } from "@/lib/farm-spatial-field-lens";
import { useFieldNutrientPlan } from "@/lib/use-field-nutrient-plan";
import { fieldNutrientPlanView } from "@/lib/field-nutrient-plan-presentation";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
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
import { evaluateWhatMattersPilot, confirmWhatMattersPilotCondition, saveFarmerContractorCostRate, type WhatMattersPilotActionResult, type WhatMattersPilotCandidateContext } from "@/app/actions/what-matters-pilot";
import type { WhatMattersPilotResult } from "@/domain/what-matters-presentation";
import type { FieldMissingSlurryPlanningDetails } from "@/domain/what-matters-no-recommendation";
import type { FarmerConfirmationCode, FarmerDeclarationEvidence } from "@/domain/slurry-actionability-policy";
import { useFarm, useFields, useHousingList, useIsRealMode, useLivestockGroups, useSlurryAllocations, useSlurryCompositionRecords, useSyncStatus } from "@/store/farm-store";
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
    contractorRatePerHa: string | null;
    candidateContext: Record<string, WhatMattersPilotCandidateContext>;
    missingSlurryDetails: FieldMissingSlurryPlanningDetails[];
    multiSourceSlurryFieldIds: string[];
    plannedSlurryFieldCount: number | undefined;
  } | null>(null);
  const [pilotError, setPilotError] = useState<string | null>(null);
  const [pilotLoading, setPilotLoading] = useState(false);
  // A failed *save* (validation/no-farm/DB-write/re-evaluation-after-write)
  // is kept separate from `pilotError`: the row stays visible with its own
  // reason rather than the whole What Matters section flipping to the
  // generic "unable to verify" state (one-time-setup UI brief).
  const [contractorRateError, setContractorRateError] = useState<string | null>(null);

  function applyPilotResult(res: WhatMattersPilotActionResult) {
    if (res.status === "ok") {
      setPilotError(null);
      setPilotState({ result: res.result, evaluatedAt: res.evaluatedAt, declarations: res.declarations, contractorRatePerHa: res.contractorRatePerHa, candidateContext: res.candidateContext, missingSlurryDetails: res.missingSlurryDetails ?? [], multiSourceSlurryFieldIds: res.multiSourceSlurryFieldIds ?? [], plannedSlurryFieldCount: res.plannedSlurryFieldCount });
    } else {
      // Honest failure state -- never a fallback to the legacy Prompt
      // selector (brief: "Better to show 'Unable to verify a
      // recommendation right now' than produce an unaudited
      // recommendation").
      setPilotError(res.message);
    }
  }

  // Farm-store edits persist fire-and-forget (`persistRemote`): a farmer
  // who adds spreading details on Fields and comes straight back here could
  // otherwise have Today evaluate before that write lands and show the
  // old "missing details" state. Evaluation waits for pending writes to
  // settle, runs once per mount, and runs again only when a further write
  // has actually succeeded since the last evaluation (`syncedCount` only
  // advances on success, including a banner retry) — so a failed save
  // followed by a successful retry re-reads the newly persisted data,
  // while a failure alone, or nothing changing, never re-evaluates.
  const { pendingCount: pendingFarmWrites, syncedCount: syncedFarmWrites } = useSyncStatus();
  const farmWritesPending = pendingFarmWrites > 0;
  const pilotEvaluatedAtSyncedCount = useRef<number | null>(null);
  // One request-ordering sequence shared by every call that produces What
  // Matters state (automatic evaluation, farmer confirmation, contractor-rate
  // save). Only the latest-started request may apply its response or clear
  // `pilotLoading` — e.g. an older confirmation that resolves after a
  // retry-triggered re-evaluation is discarded rather than restoring stale
  // state (Codex audit MEDIUM).
  const pilotEvaluationSeq = useRef(0);
  const pilotUnmounted = useRef(false);
  useEffect(() => {
    pilotUnmounted.current = false;
    return () => {
      pilotUnmounted.current = true;
    };
  }, []);
  function beginPilotRequest(): () => boolean {
    const seq = ++pilotEvaluationSeq.current;
    return () => !pilotUnmounted.current && seq === pilotEvaluationSeq.current;
  }

  useEffect(() => {
    if (pilotEvaluatedAtSyncedCount.current === syncedFarmWrites) return;
    // One real, explicit server evaluation per stable persisted state (same sanctioned "synchronize with an external system" pattern this file's own `mounted`/`greetingText` effects already use above), not derivable state.
    setPilotLoading(true);
    if (farmWritesPending) return;
    pilotEvaluatedAtSyncedCount.current = syncedFarmWrites;
    const isCurrent = beginPilotRequest();
    evaluateWhatMattersPilot().then(
      (res) => {
        if (!isCurrent()) return;
        setPilotLoading(false);
        applyPilotResult(res);
      },
      // Codex audit MEDIUM: a real Server Action call itself can reject
      // (transport/serialization/deployment failure), not just resolve
      // with the action's own already-caught `{status: "error"}` shape.
      // Without this handler that left the skeleton loading indefinitely
      // -- never the legacy Prompt fallback, but also never the honest
      // "unable to verify" message the brief requires.
      (error: unknown) => {
        if (!isCurrent()) return;
        console.error("[TodayPage] evaluateWhatMattersPilot rejected:", error);
        setPilotLoading(false);
        setPilotError("Unable to verify a recommendation right now.");
      },
    );
  }, [farmWritesPending, syncedFarmWrites]);

  async function handlePilotConfirm(code: FarmerConfirmationCode, value: boolean) {
    // Codex audit MEDIUM: without this guard, clicking a second Yes/No
    // (on either the same or a different required question) before the
    // first confirm round-trip resolves sends two requests that both
    // still carry the same `priorDeclarations` snapshot -- whichever
    // response lands last silently overwrites the other's freshly
    // recomputed result, and one real farmer declaration can be lost.
    // The domain layer itself never fabricates actionability either way;
    // this is purely a UI-level request-ordering fix, matched by the
    // `disabled` prop passed to `WhatMattersPilotCard` below.
    if (pilotLoading) return;
    if (!pilotState || pilotState.result.kind !== "needs_confirmation") return;
    const candidate = pilotState.result.candidate;
    const context = pilotState.candidateContext[candidate.recordId];
    if (!context) return;
    setPilotLoading(true);
    const isCurrent = beginPilotRequest();
    try {
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
      if (!isCurrent()) return;
      applyPilotResult(res);
    } catch (error: unknown) {
      // Same real Server Action rejection risk as the initial evaluation
      // effect above -- never leave the card stuck mid-confirmation.
      console.error("[TodayPage] confirmWhatMattersPilotCondition rejected:", error);
      if (!isCurrent()) return;
      setPilotError("Unable to verify a recommendation right now.");
    } finally {
      // A newer request owns `pilotLoading` once this one is superseded.
      if (isCurrent()) setPilotLoading(false);
    }
  }

  /** Same UI-level request-ordering guard as `handlePilotConfirm` — a real
   * domain recalculation, never a local cost toggle. Applies the one
   * entered rate to every real slurry action on this farm
   * (`saveFarmerContractorCostRate`'s own header). */
  async function handleSaveContractorCostRate(ratePerHa: string) {
    if (pilotLoading || !pilotState) return;
    setPilotLoading(true);
    setContractorRateError(null);
    const isCurrent = beginPilotRequest();
    try {
      const res = await saveFarmerContractorCostRate({
        evaluatedAt: pilotState.evaluatedAt,
        priorDeclarations: pilotState.declarations,
        ratePerHa,
      });
      if (!isCurrent()) return;
      if (res.status === "ok") {
        // Success: apply the freshly re-evaluated pilot state, which now
        // carries the persisted `contractorRatePerHa` -- the input row's
        // own render condition below hides it immediately as a result,
        // with no separate "hide" step needed.
        applyPilotResult(res);
      } else {
        // A real save failure (invalid rate / no farm / DB write / the
        // re-evaluation that follows it) -- keep the existing pilot state
        // and input row exactly as they were, and surface the reason next
        // to the input rather than replacing the whole section.
        setContractorRateError(res.message);
      }
    } catch (error: unknown) {
      console.error("[TodayPage] saveFarmerContractorCostRate rejected:", error);
      if (!isCurrent()) return;
      setContractorRateError("Unable to verify a recommendation right now.");
    } finally {
      if (isCurrent()) setPilotLoading(false);
    }
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
  // Farm Spatial V2 Phase 4 — the selected field's canonical nutrient plan
  // (the shared assembly the Nutrients screen uses), computed only for the
  // Nutrients lens and only for that one field.
  const selectedNutrientPlanResult = useFieldNutrientPlan(lens === "nutrients" ? selectedField : undefined);
  const selectedNutrientPlan = useMemo(
    () =>
      selectedNutrientPlanResult && selectedField
        ? { view: fieldNutrientPlanView(selectedNutrientPlanResult, selectedField), href: fieldNutrientPlanHref(selectedField.id) }
        : undefined,
    [selectedNutrientPlanResult, selectedField],
  );

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

  return (
    <>
      {/* Farm Spatial V2 shell (Phase 2): map + object rail. The real
          `MapHero` is the dominant canvas; desktop places the persistent
          object rail in its own column to the right of the map, mobile
          places it as a band directly under the map. Map overlays:
          identity (top-left), the compact conditions control (top-right),
          GPS/nearby field cards and the active lens caption (bottom-left),
          and the lens mode switcher (bottom-centre).

          Phase 02B (spatial shell visual refinement): no global veil over
          the photo. Two local scrims (behind the identity and behind the
          lower lens information) carry legibility, so the aerial imagery
          stays clearly visible across the middle of the farm.

          Farm Home visual refresh v1: the workspace runs edge to edge
          beside the navigation (`data-farm-workspace` drops the app
          shell's desktop gutters, see `AppShell`) and fills the viewport
          height, so the map owns the screen rather than sitting in a page.
          The former full-width weather/calendar strip is now the compact
          `FarmConditionsControl`; the lens band is a compact mode switcher. */}
      <section data-farm-workspace className="-mx-4 -mt-4 lg:mx-0 lg:mt-0 lg:grid lg:grid-cols-[minmax(0,1fr)_120px] lg:overflow-hidden">
        <div className="relative min-w-0">
          <MapHero
            fields={fields}
            getTone={fieldTone}
            getStatusLabel={fieldStatusLabel}
            // Phase 3 — a tap selects the field in place (drawer below);
            // Field detail stays one link away inside the drawer.
            onSelectField={toggleSelectedField}
            onMapBackgroundClick={() => setSelectedFieldId(undefined)}
            selectedFieldId={selectedField?.id ?? primaryPrompt?.fieldId}
            // Only a farmer's own selection moves the camera, never the
            // leading Prompt's preselection or a lens change. Bottom
            // padding keeps the field clear of the rising drawer, and the
            // zoom cap keeps neighbours in frame.
            flyToSelection={Boolean(selectedField)}
            flyToPadding={{ top: 120, bottom: 280, left: 48, right: 48 }}
            flyToMaxZoom={16.5}
            flyToDuration={reducedMotion ? 0 : 320}
            compactNeighbourLabels
            // Phase 02B — every mapped field keeps its real name on the
            // map (bare text, no status or colour claim) so fields read
            // as this farm's named fields, not anonymous polygons.
            neighbourNameLabels
            // Phase 3 — plus the active lens's real marker text.
            neighbourDetailLabels
            markerAccentColor={FARM_LENS_MARKER_COLOR[lens]}
            markerContentKey={lens}
            // Today Control Room V1 — real category-focus membership only
            // (see `MapHero.tsx`'s own doc comment): the currently focused
            // opportunity's own real `affectedFieldIds`, softening every
            // other real mapped field and (opt-in) fitting the camera to
            // just that set. `undefined` (no category focused) leaves the
            // map at its normal, unfocused default. A lens change never
            // touches the camera (IMPLEMENTATION_MAP §5).
            //
            // Phase 3 — a selected field takes over the highlight so its
            // neighbours recede (dimmed, never hidden); the camera is then
            // owned by `flyToSelection`.
            highlightedFieldIds={selectedField ? [selectedField.id] : focusedOpportunity?.affectedFieldIds}
            dimUnhighlighted
            fitHighlightedFields={!selectedField}
            center={farm.location.centroid}
            userPosition={position}
            plain
            className="h-[78dvh] min-h-[520px] lg:h-[max(600px,calc(100dvh-2.5rem))]"
          >
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
              <div aria-hidden className="absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_70%_100%_at_0%_0%,rgba(10,14,11,0.5),transparent_70%)]" />
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/45 via-black/12 to-transparent" />

              <div className="relative flex flex-col gap-3 p-4 pt-[max(env(safe-area-inset-top),1.25rem)] sm:flex-row sm:items-start sm:justify-between lg:px-7 lg:pt-6">
                <div className="pointer-events-auto min-w-0 [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
                  <p className={cn("text-[10.5px] font-semibold uppercase tracking-[0.16em]", activeLens.kickerClassName)}>
                    Farm Return · {activeLens.label}
                  </p>
                  <h1 className="mt-1.5 max-w-[18ch] text-balance font-display text-[32px] leading-[1.02] tracking-[-0.01em] text-white lg:text-[44px]">{farm.name}</h1>
                  <p className="mt-2 text-xs font-medium tabular-nums tracking-[0.01em] text-white/90">
                    {fieldCountLabel}
                    {farmAreaHa !== null ? ` · ${formatNumber(farmAreaHa, 1)} ha` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-white/70">
                    {greetingText}, {farm.ownerName}
                  </p>
                </div>

                {/* Farm Home visual refresh v1 — real station weather and
                    the real spreading-calendar restriction count (T3/T4),
                    with the detail one disclosure away. Settings sits
                    beside it at every width. */}
                <div className="pointer-events-auto min-w-0 self-start sm:shrink-0">
                  <FarmConditionsControl centroid={farm.location.centroid} summary={conditionsSummary} ready={mounted} />
                </div>
              </div>

              <div className="relative flex flex-col">
                {/* With a field selected the drawer carries the lens
                    information, so the farm-wide caption and GPS cards
                    step aside rather than stacking under it. */}
                <div className={cn("flex flex-col gap-3 px-4 pb-3 transition-opacity duration-[180ms] motion-reduce:transition-none lg:px-7 lg:pb-4", selectedField && "invisible opacity-0")}>
                  <div className="pointer-events-auto flex max-w-md flex-col gap-2">
                    <GpsActivityCandidateCard fields={fields} />
                    <NearbyFieldCard fields={fields} position={position} onOpen={(fieldId) => router.push(`/fields?field=${fieldId}`)} />
                  </div>
                  <div className="pointer-events-auto">
                    <FarmLensContext lensId={lens} facts={lens === "conditions" ? conditionsFacts : undefined} />
                  </div>
                </div>
                <div className="relative">
                  {/* Phase 3 field drawer — rises from the lens band, attached
                      to the map, never a full-screen modal. */}
                  <div className="absolute inset-x-0 bottom-full overflow-hidden lg:left-7 lg:right-auto lg:w-96">
                    <FarmFieldDrawer field={selectedField} lensId={lens} view={selectedFieldView} nutrientPlan={selectedNutrientPlan} onClose={() => setSelectedFieldId(undefined)} />
                  </div>
                  <div className="flex justify-center px-2 pb-3 sm:px-3 lg:pb-5">
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

      {/* Desktop plane under the map — the What Matters pilot (T7/T25)
          and the farm-topic opportunity rail, priority counts, secondary
          feed and Ask AI (T8/T9/T11/T14/T17/T24) moved off the map so the
          map stays the dominant, uncluttered surface. Asymmetric columns
          and a rule, not a card grid. Mobile keeps its own section below
          (`lg:hidden`); never both at once. */}
      <section className="hidden gap-10 px-10 pb-10 pt-8 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          {!mounted || (pilotLoading && !pilotState) ? (
            <div className="animate-pulse py-2">
              <div className="h-4 w-40 rounded bg-fr-surface" />
              <div className="mt-3 h-3 w-full rounded bg-fr-surface" />
            </div>
          ) : pilotError ? (
            <p className="text-sm text-fr-ink-600">Unable to verify a recommendation right now.</p>
          ) : pilotState ? (
            <>
              <WhatMattersPilotCard result={pilotState.result} fieldName={pilotFieldName()} onViewDetails={handlePilotViewDetails} onConfirm={handlePilotConfirm} missingSlurryDetails={pilotState.missingSlurryDetails} multiSourceSlurryFieldIds={pilotState.multiSourceSlurryFieldIds} slurryPlanningEntry={slurryPlanningEntry} disabled={pilotLoading} variant="light" />
              {/* One-time setup only: once a contractor rate is on
                  record (from this evaluation or an already-persisted
                  one seen on load), this row disappears for good on
                  this screen -- editing later happens elsewhere, not
                  here (brief: "Do not add Edit on Today"). */}
              {!pilotState.contractorRatePerHa ? (
                <ContractorCostRateInput onSave={handleSaveContractorCostRate} disabled={pilotLoading} variant="light" currentRatePerHa={pilotState.contractorRatePerHa} error={contractorRateError} />
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fr-v2-muted">Farm topics</p>
            <AskAIButton context={askAIContext} />
          </div>
          {/* Priority counts and the honest working-window placeholder,
              only for a farm with mapped fields (T27). */}
          {mounted && mappedFields.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <TodayPriorityHud counts={priorityCounts} variant="surface" />
              <span className="flex items-center gap-1.5 text-[11px] text-fr-v2-muted">
                <Radar className="size-3 shrink-0" />
                Working window · Forecast view coming soon
              </span>
            </div>
          ) : null}
          {mounted && todayOpportunities.length > 0 ? (
            <TodayControlRoomRail opportunities={todayOpportunities} selectedCategory={focusedCategory} onSelectOpportunity={selectOpportunity} variant="surface" />
          ) : null}
          {mounted && secondaryFeedPrompts.length > 0 ? (
            <button
              type="button"
              onClick={() => setSecondaryOpen(true)}
              className="self-start text-xs font-semibold text-fr-v2-forest underline decoration-fr-v2-rule underline-offset-2"
            >
              View all today&apos;s items →
            </button>
          ) : null}
        </div>
      </section>

      {/* Mobile/tablet only — the map and object rail stay the main
          visual (above); this normal-flow section stays intentionally
          light: "What matters now", a compact priority strip that opens
          the same rail data in a bottom `Sheet`, and Ask AI. */}
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
          <>
            <WhatMattersPilotCard result={pilotState.result} fieldName={pilotFieldName()} onViewDetails={handlePilotViewDetails} onConfirm={handlePilotConfirm} missingSlurryDetails={pilotState.missingSlurryDetails} multiSourceSlurryFieldIds={pilotState.multiSourceSlurryFieldIds} slurryPlanningEntry={slurryPlanningEntry} disabled={pilotLoading} variant="light" />
            {!pilotState.contractorRatePerHa ? (
              <ContractorCostRateInput onSave={handleSaveContractorCostRate} disabled={pilotLoading} variant="light" currentRatePerHa={pilotState.contractorRatePerHa} error={contractorRateError} />
            ) : null}
          </>
        ) : null}

        {mounted && mappedFields.length > 0 ? (
          <button
            type="button"
            onClick={() => setRailSheetOpen(true)}
            className="flex items-center justify-between gap-2 rounded-fr-v2-row border border-fr-v2-rule bg-fr-surface px-3 py-2.5"
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
