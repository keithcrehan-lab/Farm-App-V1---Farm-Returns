import { calculateNutrientPlan, resolveFieldSlurryAllocation } from "@/domain/nutrients";
import { blockedInsufficientEvidence, type EngineOutcome } from "@/domain/evidence";
import { currentSlurryCompositionByHousing, type SlurryComposition } from "@/domain/slurry-composition";
import { resolveFieldSlurryCompositionInput } from "@/domain/slurry-evidence-context";
import {
  buildSlurryRegulatoryContextFromRecords,
  plannedRegulatoryNeatSlurryForNutrientPlan,
  type BuildSlurryRegulatoryContextFromRecordsInput,
} from "@/domain/slurry-regulatory-context";
import { computeFarmGrasslandAggregates } from "@/orchestration/prompt/build-all";
import { isTillageField, hasNoRecordedLivestock } from "@/orchestration/prompt/fertiliser-recommendation";
import { purchaseStatusPresentation, type PurchaseStatusPresentation } from "@/lib/purchase-status-presentation";
import type { Farm, Field, LivestockGroup, NapComplianceCheck, NutrientPlan, SilagePlan, SlurryAllocation } from "@/domain/types";

/**
 * Farm Spatial V2 Phase 4 — the one client-side assembly of a field's
 * `calculateNutrientPlan` input, extracted unchanged from
 * `NutrientsPageClient.tsx` so the Nutrients screen and the Farm Spatial
 * field drawer / field nutrient plan consume the identical plan
 * (`docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` §6.1: never a second copy
 * of the input assembly). It computes no nutrient figure itself: every
 * number comes from `calculateNutrientPlan` and the existing gates
 * (`isTillageField`, `hasNoRecordedLivestock`, `purchaseStatusPresentation`).
 */
export interface FieldNutrientPlanInput {
  farm: Farm;
  field: Field;
  /** The farm's active fields (farm-wide grassland aggregates). */
  fields: readonly Field[];
  /** Every field including archived (regulatory context). */
  allFields: BuildSlurryRegulatoryContextFromRecordsInput["fields"];
  livestockGroups: LivestockGroup[];
  slurryAllocations: readonly SlurryAllocation[];
  slurryCompositionRecords: readonly SlurryComposition[];
  housing: BuildSlurryRegulatoryContextFromRecordsInput["housing"];
  slurryAllocationRecords: BuildSlurryRegulatoryContextFromRecordsInput["allocationRecords"];
  neatSlurryEvidenceRecords: BuildSlurryRegulatoryContextFromRecordsInput["neatSlurryEvidenceRecords"];
  spreadableAreaRecords: BuildSlurryRegulatoryContextFromRecordsInput["spreadableAreaRecords"];
  slurryOriginEvidenceRecords: BuildSlurryRegulatoryContextFromRecordsInput["slurryOriginEvidenceRecords"];
  /** A failed re-read left the cached regulatory/slurry-plan records stale. */
  regulatoryEvidenceStale: boolean;
  /** The field's silage plan, when one exists (same source as the caller). */
  silagePlan: SilagePlan | undefined;
  /** Calendar date (`YYYY-MM-DD`) the regulatory context is built as of. */
  asOfDate: string;
}

export interface FieldNutrientPlanResult {
  /** The displayed (silage-inclusive when a silage plan exists) plan. */
  plan: NutrientPlan;
  /** The grazing-only plan the server recomputes and "Plan this application" is seeded from. */
  grazingOnlyPlan: NutrientPlan;
  slurryAllocation: SlurryAllocation | undefined;
  /** `plan.napCompliance`, or blocked while regulatory evidence is stale. */
  displayedNapCompliance: EngineOutcome<NapComplianceCheck>;
  grazingOnlyNapCompliance: EngineOutcome<NapComplianceCheck>;
  tillage: boolean;
  noLivestock: boolean;
  /** Whether the plan's requirement/organic/product figures may be shown at all. */
  showFertiliserRecommendation: boolean;
  grazingOnlyPurchase: PurchaseStatusPresentation;
  canPlanFertiliserApplication: boolean;
}

export function buildFieldNutrientPlan(input: FieldNutrientPlanInput): FieldNutrientPlanResult {
  const { farm, field, fields, livestockGroups, slurryAllocations, silagePlan } = input;
  // Net grassland area (grazing + silage, tillage excluded) and real
  // non-grass eligible % — the shared `computeFarmGrasslandAggregates`, the
  // same figure the server-side `fertiliser_recommendation` recompute uses.
  const { farmGrasslandAreaHa, nonGrassPct } = computeFarmGrasslandAggregates(fields);
  // Codex audit HIGH (round 31): never a bare `.find()` — see
  // `resolveFieldSlurryAllocation`'s own doc comment.
  const slurryAllocation = resolveFieldSlurryAllocation(slurryAllocations, field.id);
  // Campaign A (A2.2): composition resolved per contributing store.
  const compositionInput = resolveFieldSlurryCompositionInput(slurryAllocations, field.id, currentSlurryCompositionByHousing(input.slurryCompositionRecords));
  // Campaign B live evidence wiring — the planned neat slurry from the
  // canonical regulatory context over the persisted records.
  const regulatoryContext = buildSlurryRegulatoryContextFromRecords({
    fields: input.allFields,
    housing: input.housing,
    allocationRecords: input.slurryAllocationRecords,
    compositionRecords: input.slurryCompositionRecords,
    livestockGroups,
    asOfDate: input.asOfDate,
    neatSlurryEvidenceRecords: input.neatSlurryEvidenceRecords,
    spreadableAreaRecords: input.spreadableAreaRecords,
    slurryOriginEvidenceRecords: input.slurryOriginEvidenceRecords,
  });
  // A stale cache never backs a statutory verdict.
  const plannedRegulatoryNeatSlurry = input.regulatoryEvidenceStale
    ? undefined
    : plannedRegulatoryNeatSlurryForNutrientPlan(regulatoryContext, field.id, slurryAllocation);

  const plan = calculateNutrientPlan({
    field,
    farmGrasslandAreaHa,
    livestockGroups,
    slurryAllocation,
    nonGrassPct,
    // Codex audit HIGH (round 14): the farmer's recorded Article 17(6) evidence.
    pBuildUpCompliance: farm.pBuildUpCompliance?.value,
    slurryComposition: compositionInput.composition,
    slurryCompositionUnresolved: compositionInput.unresolved,
    plannedRegulatoryNeatSlurry,
    silage: silagePlan
      ? {
          cutNumber: silagePlan.cutNumber,
          expectedYieldTDMha: silagePlan.expectedYieldTDMha.value,
          intendedUse: silagePlan.intendedUse,
          // V3 fix (audit conflict #5): the sale-route NAP ceiling needs
          // written evidence of sale, not just intendedUse.
          saleEvidence: silagePlan.saleEvidence ? { hasWrittenEvidence: silagePlan.saleEvidence.value.hasWrittenEvidence } : undefined,
        }
      : undefined,
  });

  // Codex audit CRITICAL (round 4): planning is seeded only from the
  // grazing-only recommendation the server recomputes (`silage: undefined`).
  const grazingOnlyPlan = silagePlan
    ? calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation, nonGrassPct, pBuildUpCompliance: farm.pBuildUpCompliance?.value, slurryComposition: compositionInput.composition, slurryCompositionUnresolved: compositionInput.unresolved, plannedRegulatoryNeatSlurry })
    : plan;

  // Campaign B closure audit HIGH: while stale, no NAP verdict is shown or carried.
  const staleNapCompliance = input.regulatoryEvidenceStale
    ? blockedInsufficientEvidence<NapComplianceCheck>("REGULATORY_EVIDENCE_STALE", ["a successful re-read of this farm's slurry plan and regulatory evidence"])
    : undefined;

  // Codex audit CRITICAL (rounds 6/10) and HIGH (round 24): tillage has no
  // requirement table and an empty herd is ambiguous — the display itself is
  // gated, except that silage N/P/K never depends on livestock.
  const tillage = isTillageField(field);
  const noLivestock = hasNoRecordedLivestock(livestockGroups);
  const grazingOnlyPurchase = purchaseStatusPresentation(grazingOnlyPlan.purchaseStatus, grazingOnlyPlan.requirementProvisional);

  return {
    plan,
    grazingOnlyPlan,
    slurryAllocation,
    displayedNapCompliance: staleNapCompliance ?? plan.napCompliance,
    grazingOnlyNapCompliance: staleNapCompliance ?? grazingOnlyPlan.napCompliance,
    tillage,
    noLivestock,
    showFertiliserRecommendation: !tillage && (!noLivestock || silagePlan !== undefined),
    grazingOnlyPurchase,
    // Session 2b: only an engine-sized blend can be planned.
    canPlanFertiliserApplication:
      !tillage &&
      !noLivestock &&
      grazingOnlyPlan.fertilityEvidence.status === "OK" &&
      grazingOnlyPurchase.kind === "products" &&
      grazingOnlyPlan.purchasedProducts.length > 0,
  };
}
