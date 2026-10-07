"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapPinned } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { FieldIdentityRow } from "@/components/farm/FieldIdentityRow";
import { SoilProfileCard } from "@/components/farm/SoilProfileCard";
import { FertilityAssumptionsCard } from "@/components/farm/FertilityAssumptionsCard";
import { NutrientRequirementCard } from "@/components/farm/NutrientRequirementCard";
import { NapComplianceCard } from "@/components/farm/NapComplianceCard";
import { OrganicNutrientsCard } from "@/components/farm/OrganicNutrientsCard";
import { PurchasedFertiliserCard } from "@/components/farm/PurchasedFertiliserCard";
import { RemainingFertiliserRequirementCard } from "@/components/farm/RemainingFertiliserRequirementCard";
import { FarmFertiliserPurchaseRequirementCard } from "@/components/farm/FarmFertiliserPurchaseRequirementCard";
import { FarmLimeRequirementCard } from "@/components/farm/FarmLimeRequirementCard";
import { FertiliserPlanSheet } from "@/components/farm/FertiliserPlanSheet";
import { getMatchablePlanForFieldAction, type MatchablePlanResult } from "@/app/actions/fertiliser-plan";
import { mockSilagePlans } from "@/data/mock-farm";
import {
  useAllFieldsIncludingArchived,
  useFarm,
  useFields,
  useHousingList,
  useIsRealMode,
  useLivestockGroups,
  useNeatSlurryEvidenceRecords,
  useRegulatoryEvidenceFreshness,
  useSlurryAllocationRecords,
  useSlurryAllocations,
  useSlurryCompositionRecords,
  useSpreadableAreaRecords,
  useSlurryOriginEvidenceRecords,
  useSlurryPlanFreshness,
} from "@/store/farm-store";
import { buildSlurryRateAllocation } from "@/domain/slurry-rate-allocation";
import { SlurryDiagnosticCard } from "@/components/farm/SlurryDiagnosticCard";
import { promptForSpreadingWindow } from "@/orchestration/prompt/spreading-window";
import { sanitiseRecommendedProduct } from "@/orchestration/prompt/fertiliser-recommendation";
import { buildFieldNutrientPlan } from "@/orchestration/fertiliser-plan/field-nutrient-plan";
import { cn } from "@/lib/cn";

/**
 * Real Mode Completion Phase 9 — a real new farm can have zero fields (or
 * zero mapped/soil-tested fields), and this page previously did
 * `if (!field) return null` — a silent blank page, not an honest empty
 * state (the same class of bug already fixed on Housing/Silage in the
 * prior session). Also gained real `?field=<id>` deep-linking so
 * `FieldDrawer`'s new "Open in Nutrients" link (Phase 9) lands on the
 * right field instead of whichever one happens to be first.
 */
export function NutrientsPageClient() {
  const farm = useFarm();
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const slurryCompositionRecords = useSlurryCompositionRecords();
  const allFields = useAllFieldsIncludingArchived();
  const housing = useHousingList();
  const slurryAllocationRecords = useSlurryAllocationRecords();
  const neatSlurryEvidenceRecords = useNeatSlurryEvidenceRecords();
  const spreadableAreaRecords = useSpreadableAreaRecords();
  const slurryOriginEvidenceRecords = useSlurryOriginEvidenceRecords();
  const regulatoryEvidenceFreshness = useRegulatoryEvidenceFreshness();
  const slurryPlanFreshness = useSlurryPlanFreshness();
  const regulatoryEvidenceStale = regulatoryEvidenceFreshness === "stale" || slurryPlanFreshness === "stale";
  const isRealMode = useIsRealMode();
  const searchParams = useSearchParams();
  const requestedFieldId = searchParams.get("field") ?? undefined;
  const [planSheetOpen, setPlanSheetOpen] = useState(false);

  const field = fields.find((f) => f.id === requestedFieldId) ?? fields[0];

  // Codex audit HIGH (round 4) — a real, disclosed mitigation for
  // "the same live recommendation stays offerable after it's already
  // been planned" (campaign item 8's own "avoid... repeated duplicate
  // prompts" instruction): before a farmer taps "Plan this application"
  // again, check whether a real, unexecuted plan already exists for
  // this field, and disclose it rather than silently letting a second,
  // easily-forgotten duplicate get created. Deliberately does not block
  // a genuine second plan outright — item 15 explicitly requires
  // supporting split/multiple applications — only makes an existing one
  // visible so a farmer's choice to add another is informed, not
  // accidental. Reuses the same real, already-audited lookup GPS
  // matching uses, never a second competing query.
  const [existingPlan, setExistingPlan] = useState<MatchablePlanResult | undefined>(undefined);
  // Codex audit HIGH (round 19): `existingPlan === undefined` used to
  // conflate three materially different real states — not yet queried,
  // the lookup still in flight, and the lookup having genuinely failed
  // — and "Plan this application" rendered as a plain, always-enabled
  // button in every one of them, identical to the "none" case. A
  // farmer could open the sheet and persist a real, nuisance-duplicate
  // Decision during that window (or indefinitely, if the lookup kept
  // failing) — the exact same race shape round 13 fixed in
  // `GpsActivityCandidateCard` via its own `matchablePlanLoading`,
  // never applied here. Tracked separately so Confirm is only disabled
  // while a real answer is genuinely still pending, and a genuine
  // failure gets the identical honest "couldn't safely check"
  // disclosure the truncated/ambiguous case already uses — never an
  // indefinite block, since the underlying action isn't unsafe on its
  // own, only possibly redundant.
  const [existingPlanLoading, setExistingPlanLoading] = useState(false);
  const [existingPlanCheckFailed, setExistingPlanCheckFailed] = useState(false);
  // Codex audit MEDIUM (round 5): the first version only ever refetched
  // on a real field/mode change — immediately after a farmer's own
  // successful "Save my plan"/"Accept as recommended" submission, this
  // stayed stale (still "Plan this application", no disclosure of the
  // plan that just got created), letting the exact nuisance duplicate
  // this mitigation exists to discourage happen anyway. `onPlanned`
  // below now bumps this counter, included in the effect's own real
  // dependency list, to force a genuine refetch after every real save.
  const [planRefreshToken, setPlanRefreshToken] = useState(0);
  useEffect(() => {
    // Codex audit MEDIUM (round 15): this previously reset `existingPlan`
    // only when real mode turned off or the field list emptied entirely
    // — never on a plain field-to-field switch — so switching from a
    // field with no plan to one that already has one (or the reverse)
    // kept showing the PREVIOUS field's disclosure (and "Plan this
    // application" availability) until the new lookup resolved, and
    // indefinitely if it ever rejected. That stale window could let a
    // farmer open the plan sheet and save a real, nuisance-duplicate
    // plan for the new field before the disclosure caught up — exactly
    // what this mitigation (round 4) exists to discourage. Resetting
    // unconditionally here, for every real field/mode change, closes
    // both: nothing is claimed about the new field until its own real
    // lookup actually resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting for a real isRealMode/field change, not every render.
    setExistingPlan(undefined);
    setExistingPlanCheckFailed(false);
    if (!isRealMode || !field) {
      setExistingPlanLoading(false);
      return;
    }
    let cancelled = false;
    setExistingPlanLoading(true);
    getMatchablePlanForFieldAction(field.id).then(
      (result) => {
        if (!cancelled) {
          setExistingPlan(result);
          setExistingPlanLoading(false);
        }
      },
      (error: unknown) => {
        console.error("[NutrientsPageClient] getMatchablePlanForFieldAction failed:", error);
        if (!cancelled) {
          setExistingPlanCheckFailed(true);
          setExistingPlanLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on field?.id, not the whole `field` object —
    // `fields.find(...)` returns a new object reference on every render
    // even for the same logical field, which would otherwise refire
    // this on every unrelated store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealMode, field?.id, planRefreshToken]);

  if (!field) {
    return (
      <>
        <MobileDetailHeader title="Nutrient planner" backHref="/fields" />
        <PageHeader title="Fertiliser Plan" subtitle="N/P/K requirement, slurry offset, products and field cost" />
        <div className="flex flex-col items-center gap-3 rounded-fr-card border border-dashed border-fr-border py-12 text-center">
          <MapPinned className="size-8 text-fr-ink-400" />
          <p className="text-sm font-medium text-fr-ink-900">No fields yet</p>
          <p className="max-w-xs text-sm text-fr-ink-600">
            Add a field on the Fields screen to see a real nutrient plan for it.
          </p>
        </div>
      </>
    );
  }

  // Farm Spatial V2 Phase 4 — the plan input assembly (grassland
  // aggregates, slurry allocation and composition, the regulatory neat
  // slurry, the silage and grazing-only plans, the stale-evidence NAP
  // block and the tillage/livestock display gates) lives in the shared
  // `buildFieldNutrientPlan`, so the Farm Spatial field plan consumes the
  // identical plan rather than a second copy of this assembly.
  const {
    plan,
    grazingOnlyPlan,
    slurryAllocation,
    displayedNapCompliance,
    grazingOnlyNapCompliance,
    tillage,
    showFertiliserRecommendation,
    grazingOnlyPurchase,
    canPlanFertiliserApplication,
  } = buildFieldNutrientPlan({
    farm,
    field,
    fields,
    allFields,
    livestockGroups,
    slurryAllocations,
    slurryCompositionRecords,
    housing,
    slurryAllocationRecords,
    neatSlurryEvidenceRecords,
    spreadableAreaRecords,
    slurryOriginEvidenceRecords,
    regulatoryEvidenceStale,
    silagePlan: mockSilagePlans.find((p) => p.fieldId === field.id),
    asOfDate: new Date().toISOString().slice(0, 10),
  });

  // Fertiliser Vertical Completion, Increment 2d — the read-only planned
  // slurry evaluation over this same `plan` (canonical requirement, slurry
  // contribution, remaining requirement and excess). Evaluates the
  // farmer's planned rate only; no rate is selected (D2).
  const slurryEvaluation = buildSlurryRateAllocation({ plan, plannedUse: field.plannedUse?.value });

  // Fertiliser Vertical campaign, item 7 — "Is this planned application
  // currently well timed?" reuses the existing real, calendar-only
  // spreading-window gate (`promptForSpreadingWindow` — the same real
  // Prompt Today/Plan already fan out per field) rather than a new,
  // invented "spreading suitability" score. Computed here, client-side,
  // the same way Today/Plan already call the identical pure producer.
  const spreadingWindowPrompt = promptForSpreadingWindow(farm, field, "chemical_fertiliser", undefined, new Date().toISOString());

  // Slurry Closed-Period Wiring V1 — the same real, calendar-only
  // spreading-window gate as `spreadingWindowPrompt` immediately above,
  // called with slurry's own real legal material
  // (`organic_fertiliser_other_than_FYM`, S.I. 588/2025) instead of
  // chemical fertiliser's. `asOfDate` is this field's own real,
  // contributing `SlurryAllocation.applicationDate` when one has been
  // captured — the real intended application date, not the timing
  // classifier's `applicationDate` disclosure inside
  // `organicApplication.availableNutrientAssessment` (only present when
  // that assessment resolved OK) — else `undefined`, which
  // `promptForSpreadingWindow` itself resolves to today's real Irish
  // calendar date. Surfaced on `OrganicNutrientsCard` below, never a
  // duplicated/hand-rolled date check.
  const slurryClosedPeriodPrompt = promptForSpreadingWindow(
    farm,
    field,
    "organic_fertiliser_other_than_FYM",
    slurryAllocation?.applicationDate?.value,
    new Date().toISOString(),
  );

  return (
    <>
      <MobileDetailHeader title="Nutrient planner" backHref="/fields" />
      <PageHeader title="Fertiliser Plan" subtitle="N/P/K requirement, slurry offset, products and field cost" />

      {/* Field selector — the nutrient engine computes a real plan for
       * whichever field is picked (Phase 3: docs/product-requirements.md
       * exit gate "known test cases independently validated"), not just
       * the one field Phase 1's mock data hardcoded. */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto">
        {fields.map((f) => (
          <Link
            key={f.id}
            href={`/nutrients?field=${f.id}`}
            scroll={false}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              f.id === field.id
                ? "border-fr-green-700 text-fr-green-700"
                : "border-fr-border text-fr-ink-600",
            )}
          >
            {f.name}
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <FieldIdentityRow field={field} />
        <SoilProfileCard soil={field.mappedSoil} />
        <FertilityAssumptionsCard fieldId={field.id} fertility={field.fertility} />
        {showFertiliserRecommendation ? (
          <>
            <NutrientRequirementCard plan={plan} field={field} />
            <NapComplianceCard compliance={displayedNapCompliance} />
            <OrganicNutrientsCard
              organic={plan.organicApplication}
              fertilityEvidenceByNutrient={plan.fertilityEvidenceByNutrient}
              closedPeriod={{
                title: slurryClosedPeriodPrompt.title,
                description: slurryClosedPeriodPrompt.description,
                status: slurryClosedPeriodPrompt.basis.status,
              }}
            />
            <SlurryDiagnosticCard allocation={slurryEvaluation} />
            <PurchasedFertiliserCard
              products={plan.purchasedProducts}
              estimatedFieldCostEur={plan.estimatedFieldCostEur}
              requirement={plan.requirement}
              netRequirement={plan.netRequirement}
              deliveredKgHa={plan.deliveredKgHa}
              requirementProvisional={plan.requirementProvisional}
              purchaseStatus={plan.purchaseStatus}
            />
          </>
        ) : (
          // Codex audit CRITICAL (round 10): this app has no tillage
          // N/P/K table at all, and an empty livestockGroups read is
          // genuinely ambiguous between "confirmed zero" and "never
          // entered" — an honest disclosure here, never the fabricated
          // grassland requirement/purchased-product figures
          // `calculateNutrientPlan` would otherwise still compute.
          <div className="flex flex-col items-center gap-2 rounded-fr-card border border-dashed border-fr-border px-4 py-8 text-center">
            <p className="text-sm font-medium text-fr-ink-900">No fertiliser recommendation available</p>
            <p className="max-w-xs text-sm text-fr-ink-600">
              {tillage
                ? "This field is tillage — Farm Return has no fertiliser recommendation table for tillage ground."
                : "Add a livestock group on the Livestock screen to get a real fertiliser recommendation for this field."}
            </p>
          </div>
        )}
        {/* The planned slurry evaluation fails closed on its own
            (tillage: not evaluated; no livestock: requirement unknown),
            so it also renders where no recommendation is shown. */}
        {showFertiliserRecommendation ? null : <SlurryDiagnosticCard allocation={slurryEvaluation} />}

        {/* Fertiliser Vertical campaign, item 3/9 — "Plan this
            application": only offered once a real recommendation exists
            (fertilityEvidence OK and at least one real product) — there
            is nothing genuine to plan otherwise. Gated on the real
            grazing-only recommendation (see `grazingOnlyPlan`'s own
            comment above), not the silage-inclusive `plan` shown
            elsewhere on this screen — and, since round 6, also gated on
            the same real tillage/livestock-evidence checks the server
            itself now enforces (see `canPlanFertiliserApplication`'s own
            comment above). */}
        {canPlanFertiliserApplication ? (
          <>
            {existingPlanLoading ? (
              <p className="text-xs text-fr-ink-600">Checking whether you already have a planned application for this field…</p>
            ) : existingPlanCheckFailed ? (
              <p className="text-xs text-fr-ink-600">Farm Return couldn&apos;t safely check whether you already have a planned application for this field right now.</p>
            ) : existingPlan && existingPlan.status !== "none" ? (
              <p className="text-xs text-fr-ink-600">
                {existingPlan.status === "matched"
                  ? "You already have a planned application for this field."
                  : // Codex audit MEDIUM (round 13): `getMatchablePlanForFieldAction`
                    // returns "ambiguous" both for two-or-more genuine
                    // candidates AND whenever either underlying capped
                    // read truncated (Codex audit HIGH, round 1) — the
                    // latter can carry a `candidateCount` of 0 or 1, for
                    // which "more than one planned application" is a
                    // real, unsupported factual claim. Distinguished
                    // honestly rather than asserting a specific count
                    // this app cannot actually confirm.
                    existingPlan.candidateCount >= 2
                    ? "You already have more than one planned application for this field."
                    : "Farm Return couldn't safely check whether you already have a planned application for this field right now."}
              </p>
            ) : null}
            <button
              type="button"
              disabled={existingPlanLoading}
              onClick={() => setPlanSheetOpen(true)}
              className="rounded-full bg-fr-green-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {existingPlanLoading
                ? "Checking…"
                : existingPlan && existingPlan.status !== "none"
                  ? "Plan another application"
                  : "Plan this application"}
            </button>
          </>
        ) : null}

        {/* Fertiliser Vertical campaign, item 14 — real remaining
            requirement, once real confirmed applications exist. Renders
            nothing in demo mode (no real farm-scoped data to fetch) or
            when genuinely NOT_APPLICABLE. */}
        <RemainingFertiliserRequirementCard fieldId={field.id} canRecord={isRealMode} />

        {/* Fertiliser Vertical V1, Checkpoint 3 (item D/E) — farm-wide,
            not field-scoped: the real Purchase Requirement across every
            field, in tonnes. Does not change when a different field
            above is selected. */}
        <FarmFertiliserPurchaseRequirementCard canRecord={isRealMode} />

        {/* Grassland Fertiliser Pilot Completion, Checkpoint B (audit
            finding F5) — farm-wide, not field-scoped: the real lime
            requirement across every field, in tonnes, built only from
            each field's own already-saved laboratory lime figure. */}
        <FarmLimeRequirementCard canRecord={isRealMode} />
      </div>

      {canPlanFertiliserApplication ? (
        <FertiliserPlanSheet
          // Codex audit MEDIUM (round 1): without a key, switching the
          // selected field while the sheet remains mounted would keep
          // its own product/quantity state seeded from whichever field's
          // recommendation was live at the sheet's first render — a real
          // instance per field forces a fresh, correctly-seeded mount.
          key={field.id}
          open={planSheetOpen}
          onClose={() => setPlanSheetOpen(false)}
          fieldId={field.id}
          fieldName={field.name}
          recommendation={{
            fieldId: field.id,
            areaHa: field.areaHa,
            requirementKgHa: grazingOnlyPlan.requirement.value,
            // Codex audit CRITICAL (round 6): `grazingOnlyPlan.purchasedProducts`
            // is a real `FertiliserProduct[]` where every entry carries
            // its own mock `costEur` — sanitised here with the same
            // `sanitiseRecommendedProduct` `promptForFertiliserRecommendation`
            // itself uses, so this client-side recommendation (built
            // directly from `calculateNutrientPlan`, not through that
            // Prompt producer) never carries the mock figure either.
            products: grazingOnlyPlan.purchasedProducts.map(sanitiseRecommendedProduct),
            calculationVersion: grazingOnlyPlan.calculationVersion,
            // Codex audit HIGH (round 14): this sheet's own recommendation
            // is built directly from `calculateNutrientPlan`, not through
            // `promptForFertiliserRecommendation` — carries the same real
            // `napCompliance` outcome through so a plan accepted here is
            // never missing the regulatory-status field every other
            // caller of this type now provides.
            napCompliance: grazingOnlyNapCompliance,
            ...(grazingOnlyPurchase.kind === "products" && grazingOnlyPurchase.provisional ? { provisional: grazingOnlyPurchase.provisional } : {}),
          }}
          canRecord={isRealMode}
          onPlanned={() => {
            setPlanSheetOpen(false);
            // Codex audit MEDIUM (round 5): force a real refetch of
            // `existingPlan` so the "already planned" disclosure reflects
            // the plan that was just created, not a stale pre-save read.
            setPlanRefreshToken((n) => n + 1);
          }}
          timing={{ title: spreadingWindowPrompt.title, description: spreadingWindowPrompt.description }}
        />
      ) : null}
    </>
  );
}
