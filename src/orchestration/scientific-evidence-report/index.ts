import "server-only";

/**
 * Fertiliser Vertical V1, Checkpoint 4 — Scientific Evidence Report.
 *
 * The one genuinely new entity `SOIL_SAMPLING_ARCHITECTURE.md`'s frozen
 * object model reserves for this checkpoint:
 *
 *   Field -> SamplingPlan -> SamplingZone -> SamplingSession
 *     -> CompositeSample -> LabResult -> SoilInterpretation
 *       -> NutrientRequirement -> ProductAllocation -> FertiliserPlan
 *         -> Actual -> ScientificEvidenceReport
 *
 * Every link before `ScientificEvidenceReport` already exists and is
 * already independently audited (Checkpoints 1-3, and the pre-existing
 * Fertiliser Vertical campaign for Plan/Actual). This module builds no
 * new science and persists nothing — it is a pure, read-only assembly of
 * one CompositeSample's own full evidence chain from those existing,
 * unmodified sources, so the report a farmer sees or exports is provably
 * the same real numbers already shown on every other real screen, never
 * a second, independently-derived copy of them.
 *
 * Deliberately scoped to ONE CompositeSample (identified by its
 * `jobSessionId`) and the ONE field it belongs to — not a farm-wide
 * rollup (the farm-wide Purchase Requirement, Checkpoint 3 item E,
 * already exists as its own screen and is cross-referenced, not
 * duplicated, here).
 */
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { getJobSessionById } from "@/lib/farm-data/job-sessions";
import { getCurrentActualForJobSession } from "@/lib/farm-data/job-actuals";
import { getDecisionById, listDecisionsForFarm } from "@/lib/farm-data/decisions";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import { buildCompositeSampleView, type CompositeSampleView } from "@/orchestration/soil-sampling";
import { getLabStatusForCompositeSample, type CompositeSampleLabStatus } from "@/orchestration/lab-result";
import { getFieldRemainingFertiliserRequirement } from "@/orchestration/fertiliser-plan";
import { recomputePromptByKind } from "@/orchestration/prompt/recompute";
import { FERTILISER_RECOMMENDATION_PROMPT_KIND, type FertiliserRecommendationSummary } from "@/orchestration/prompt/fertiliser-recommendation";
import { computeFarmGrasslandAggregates } from "@/orchestration/prompt/build-all";
import { calculateNutrientPlan, resolveFieldSlurryAllocation } from "@/domain/nutrients";
import type { NutrientPlan } from "@/domain/types";

export const SCIENTIFIC_EVIDENCE_REPORT_VERSION = "scientific_evidence_report_v1.0.0";

export interface ScientificEvidenceReportError {
  status: "not_found" | "not_a_soil_sample" | "not_confirmed";
  reasonCode: string;
}

/**
 * Codex-auditable identity block — every figure below is reproducible
 * from these real, farm-scoped source rows alone, at the stated
 * `generatedAt` instant (a later farmer edit to livestock/slurry/field
 * evidence, or a newer soil test, can legitimately change what a fresh
 * report for the same sample would show — this is a snapshot, not a
 * permanently pinned value; see `fertilityBasisNote` below).
 */
export interface ScientificEvidenceReport {
  reportVersion: string;
  generatedAt: string;
  farm: { id: string; name: string };
  field: { id: string; name: string; areaHa: number; lpisRef?: string; centroid: [number, number] };
  compositeSample: CompositeSampleView;
  labStatus: CompositeSampleLabStatus;
  /**
   * True when this specific CompositeSample's own LabResult is still the
   * field's real, currently-active fertility evidence
   * (`field.fertility.verifiedTest.compositeSampleId === compositeSample.jobSessionId`).
   * False means a newer soil test has since superseded it — the
   * `nutrientPlan` below reflects the field's CURRENT evidence, which is
   * real and correct, but is no longer solely this sample's own
   * evidence; disclosed explicitly rather than left implicit.
   */
  isCurrentFertilityBasis: boolean;
  /**
   * The field's real, current nutrient decision chain (requirement, net
   * requirement, regulatory constraints, product allocation) — grazing
   * basis only (`silage: undefined`), the same scope
   * `getFarmFertiliserDemand`'s own farm-wide aggregation already
   * documents and discloses; absent when this field's own real evidence
   * (fertility, silage-plan, livestock) cannot currently support a real
   * calculation — see `nutrientPlanUnavailableReason` in that case.
   */
  nutrientPlan?: NutrientPlan;
  nutrientPlanUnavailableReason?: string;
  /** kg/ha figures above, multiplied out to this field's real areaHa —
   * "kg/field", the campaign's own explicitly named step in the chain.
   * Absent whenever `nutrientPlan` is. */
  productAllocationKgField?: { product: string; totalKg: number }[];
  /** The real, currently-recommended Prompt (if this field is currently
   * recommendable) — carries the same `FertiliserRecommendationSummary`
   * a farmer would be offered to Plan today, for cross-reference against
   * any already-accepted Plan below. */
  currentRecommendation?: FertiliserRecommendationSummary;
  /** Every real, accepted `fertiliser_recommendation` Decision (Plan) on
   * record for this field — not just the most recent, so a report can
   * show the full real planning history, never only the latest. */
  acceptedPlans: DecisionRecord[];
  /** Real requirement/confirmed-applied/remaining kg/ha for this field
   * this season, and the same `applicationsWithUnknownComposition`/
   * `applicationsExcludedMultiField`/`truncated` disclosures the
   * Nutrients screen's own `RemainingFertiliserRequirementCard` already
   * shows — reused verbatim, never re-derived. */
  fieldFertiliserStatus:
    | { status: "not_applicable" }
    | { status: "blocked"; reasonCode: string }
    | {
        status: "ok";
        requirementKgHa: { n: number; p: number; k: number };
        confirmedAppliedKgHa?: { n: number; p: number; k: number };
        remainingKgHa?: { n: number; p: number; k: number };
        confirmedApplications: number;
        applicationsWithUnknownComposition: number;
        applicationsExcludedMultiField: number;
        truncated: boolean;
      };
}

/**
 * Assembles the real evidence chain for one CompositeSample. Never
 * fabricates a missing link — a field, session, or decision this
 * farmer's own farm does not actually own returns a real error, never a
 * partial report presented as complete.
 */
export async function buildScientificEvidenceReport(jobSessionId: string): Promise<ScientificEvidenceReport | ScientificEvidenceReportError> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: "not_found", reasonCode: "NO_REAL_FARM_FOR_CURRENT_SESSION" };

  const session = await getJobSessionById(farm.id, jobSessionId);
  if (!session) return { status: "not_found", reasonCode: "JOB_SESSION_NOT_FOUND" };
  if (session.activityType !== "soil_sampling") return { status: "not_a_soil_sample", reasonCode: "NOT_A_SOIL_SAMPLING_SESSION" };
  if (session.status !== "confirmed_actual") return { status: "not_confirmed", reasonCode: "SAMPLE_NOT_YET_CONFIRMED" };

  const actual = await getCurrentActualForJobSession(farm.id, jobSessionId);
  if (!actual || actual.completionType === "did_not_happen") return { status: "not_confirmed", reasonCode: "SAMPLE_NOT_YET_CONFIRMED" };

  const fieldId = session.primaryFieldId;
  if (!fieldId) return { status: "not_found", reasonCode: "SAMPLE_HAS_NO_REAL_FIELD" };

  const [fields, livestockGroups, slurryAllocations, decision, labStatus] = await Promise.all([
    listFieldsForFarm(farm.id),
    listLivestockGroupsForFarm(farm.id),
    listSlurryAllocationsForFarm(farm.id),
    getDecisionById(farm.id, session.decisionId),
    getLabStatusForCompositeSample(farm.id, jobSessionId),
  ]);

  const field = fields.find((f) => f.id === fieldId);
  if (!field) return { status: "not_found", reasonCode: "FIELD_NOT_FOUND_ON_THIS_FARM" };

  const payload = actual.payload as { samplingZoneId?: string; coreCount?: number; methodologyVersion?: string };
  const zoneAreaHa = typeof decision?.inputsSnapshot?.zoneAreaHa === "number" ? decision.inputsSnapshot.zoneAreaHa : undefined;
  const compositeSample = buildCompositeSampleView({
    jobSessionId: session.id,
    fieldId,
    samplingZoneId: payload.samplingZoneId ?? "",
    zoneAreaHa,
    coreCount: payload.coreCount ?? 0,
    methodologyVersion: payload.methodologyVersion ?? "",
    confirmedAt: actual.confirmedAt,
    hasLabResult: labStatus.labResult !== undefined,
  });

  const isCurrentFertilityBasis = field.fertility.verifiedTest?.compositeSampleId === jobSessionId;

  const { farmGrasslandAreaHa, nonGrassPct } = computeFarmGrasslandAggregates(fields);
  const slurryAllocation = resolveFieldSlurryAllocation(slurryAllocations, field.id);
  const now = new Date().toISOString();

  const nutrientPlan = calculateNutrientPlan({
    field,
    farmGrasslandAreaHa,
    livestockGroups,
    slurryAllocation,
    nonGrassPct,
    pBuildUpCompliance: farm.pBuildUpCompliance?.value,
    asOfDate: now,
    // Grazing basis only — same disclosed scope `getFarmFertiliserDemand`
    // (Checkpoint 3) already documents; this report does not attempt a
    // silage-specific calculation.
  });
  const nutrientPlanAvailable = nutrientPlan.requirement.status === "estimated";

  const productAllocationKgField = nutrientPlanAvailable
    ? nutrientPlan.purchasedProducts.map((p) => ({ product: p.name, totalKg: p.totalKg }))
    : undefined;

  const prompt = recomputePromptByKind({
    promptKind: FERTILISER_RECOMMENDATION_PROMPT_KIND,
    farm,
    field,
    allFields: fields,
    livestockGroups,
    slurryAllocations,
    now,
  });
  const currentRecommendation = prompt.basis.status === "OK" ? (prompt.basis.value as FertiliserRecommendationSummary) : undefined;

  const { decisions: allDecisions } = await listDecisionsForFarm(farm.id);
  const acceptedPlans = allDecisions.filter(
    (d) => d.calculationKind === "fertiliser_recommendation" && d.fieldId === field.id && d.outcome === "accepted",
  );

  let fieldFertiliserStatus: ScientificEvidenceReport["fieldFertiliserStatus"];
  if (prompt.basis.status === "NOT_APPLICABLE") {
    fieldFertiliserStatus = { status: "not_applicable" };
  } else if (prompt.basis.status !== "OK") {
    fieldFertiliserStatus = { status: "blocked", reasonCode: prompt.basis.reasonCode };
  } else {
    const recommendation = prompt.basis.value as FertiliserRecommendationSummary;
    const remaining = await getFieldRemainingFertiliserRequirement({
      farmId: farm.id,
      fieldId: field.id,
      requirementKgHa: recommendation.requirementKgHa,
      areaHa: field.areaHa,
      asOfDate: now,
    });
    fieldFertiliserStatus = {
      status: "ok",
      requirementKgHa: remaining.requirementKgHa,
      confirmedAppliedKgHa: remaining.confirmedAppliedKgHa,
      remainingKgHa: remaining.remainingKgHa,
      confirmedApplications: remaining.confirmedApplications,
      applicationsWithUnknownComposition: remaining.applicationsWithUnknownComposition,
      applicationsExcludedMultiField: remaining.applicationsExcludedMultiField,
      truncated: remaining.truncated,
    };
  }

  return {
    reportVersion: SCIENTIFIC_EVIDENCE_REPORT_VERSION,
    generatedAt: now,
    farm: { id: farm.id, name: farm.name },
    field: { id: field.id, name: field.name, areaHa: field.areaHa, lpisRef: field.lpisRef, centroid: field.centroid },
    compositeSample,
    labStatus,
    isCurrentFertilityBasis,
    nutrientPlan: nutrientPlanAvailable ? nutrientPlan : undefined,
    nutrientPlanUnavailableReason: nutrientPlanAvailable ? undefined : nutrientPlan.requirement.source,
    productAllocationKgField,
    currentRecommendation,
    acceptedPlans,
    fieldFertiliserStatus,
  };
}
