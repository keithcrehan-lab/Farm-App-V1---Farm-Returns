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
import { listSlurryAllocationRecordsForFarm, listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { listSlurryCompositionRecordsForFarm } from "@/lib/farm-data/slurry-composition";
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { loadSlurryRegulatoryContextForFarm } from "@/lib/farm-data/regulatory-evidence";
import { plannedRegulatoryNeatSlurryForNutrientPlan } from "@/domain/slurry-regulatory-context";
import { currentSlurryCompositionByHousing, type SlurryComposition } from "@/domain/slurry-composition";
import { resolveFieldSlurryCompositionInput } from "@/domain/slurry-evidence-context";
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
import type { PlannedManureOriginFact } from "@/domain/slurry-origin-evidence";
import { interpretLabResult } from "@/domain/soil-interpretation";
import { activeFields, type Farm, type Field, type LivestockGroup, type NutrientPlan, type SlurryAllocation } from "@/domain/types";

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
  /**
   * Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
   * F6/F10) — present only for a report built from a real GPS-guided
   * soil sampling session (`buildScientificEvidenceReport`). Absent for
   * a report built from the legacy/manual "Add soil test" entry
   * (`buildScientificEvidenceReportForField`) — that path has no real
   * composite sample to describe, and never fabricates one; see
   * `manualEntry` below for what it shows instead.
   */
  compositeSample?: CompositeSampleView;
  /**
   * Present only for the legacy/manual entry path — the exact same real
   * `SoilTest` fields `SoilFieldCard`'s own "View test" sheet already
   * shows (`field.fertility.verifiedTest`), copied through verbatim
   * (never re-derived, never a second independently-typed model of a
   * lab result) so the report's own "Laboratory result" section can
   * render this path's real values instead of falsely claiming no lab
   * result was recorded.
   */
  manualEntry?: {
    sampleRef: string;
    sampleDate: string;
    laboratory: string;
    pH: number;
    p: number;
    k: number;
    mg?: number;
    organicMatterPct?: number;
    limeRequirement?: number;
  };
  labStatus: CompositeSampleLabStatus;
  /**
   * Codex audit HIGH (round 1): a plain boolean here conflated two
   * materially different real states under "false" — a genuinely newer
   * soil test (guided or legacy/manual) superseding this sample, and a
   * field whose active evidence simply carries no `compositeSampleId`
   * at all (every legacy/manually-entered test — `compositeSampleId` is
   * an additive, optional field only guided sampling ever sets). The
   * previous version inferred "superseded" from the ID mismatch alone,
   * which is not proof of anything about time order — a three-state
   * result, established from real dated provenance
   * (`verifiedTest.sampleDate` vs this sample's own `sampleDate`), never
   * from an ID mismatch alone:
   * - `"current"`: this exact sample's LabResult is still the field's
   *   real, active fertility evidence.
   * - `"superseded_by_newer_test"`: the field's active evidence is a
   *   REAL, LATER-DATED test (guided or legacy) — a genuine claim,
   *   backed by comparing real sample dates, never merely a different id.
   * - `"unknown"`: no active fertility evidence at all, or the active
   *   evidence's own date cannot establish it as genuinely later —
   *   never asserted as "superseded" without real dated proof.
   * `nutrientPlan` below always reflects the field's CURRENT evidence
   * regardless of this status, which is real and correct either way;
   * this field only discloses how that evidence relates to this specific
   * sample.
   */
  fertilityBasisStatus: "current" | "superseded_by_newer_test" | "unknown";
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
  /** Campaign B — where the field's planned slurry came from, exactly as
   * the canonical regulatory context resolved it for `nutrientPlan`
   * (`plannedManureOriginByField`): when known, the declaration's own
   * status, source, capture time and record id — separate from the
   * neat-volume provenance `calculateNutrientPlan` carries — so an
   * Art. 17(8) exclusion can be traced to the declaration supporting it;
   * otherwise the missing/conflicting reason, never an assumed origin.
   * Several contributing plans list each declaration's provenance in
   * `contributingDeclarations`.
   * Absent for an archived field (no current plan). */
  plannedManureOrigin?: PlannedManureOriginFact;
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
  /** Codex audit HIGH (round 1): `listDecisionsForFarm`'s own real
   * farm-wide read caps at `MAX_DECISION_HISTORY_ROWS` — a farm with
   * more decisions than that could have an older real accepted plan for
   * THIS field silently excluded from `acceptedPlans` above before this
   * report's own field filter ever runs, while the doc comment above
   * claimed "every real" plan. True whenever that farm-wide read hit its
   * cap, so `acceptedPlans` may understate the truth — the same
   * `truncated` disclosure every other farm-wide read in this programme
   * already carries, never silently presented as complete. */
  acceptedPlansTruncated: boolean;
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
 * Codex audit HIGH (round 1) — see `fertilityBasisStatus`'s own doc
 * comment above for the full reasoning. Never infers "superseded" from
 * an id mismatch alone; only from a real, later `verifiedTest.sampleDate`
 * than this sample's own `sampleDate`.
 */
function resolveFertilityBasisStatus(
  field: Pick<Field, "fertility">,
  jobSessionId: string,
  thisSampleDate: string,
): ScientificEvidenceReport["fertilityBasisStatus"] {
  const verifiedTest = field.fertility.verifiedTest;
  if (!verifiedTest) return "unknown";
  if (verifiedTest.compositeSampleId === jobSessionId) return "current";
  const activeDateMs = new Date(verifiedTest.sampleDate).getTime();
  const thisDateMs = new Date(thisSampleDate).getTime();
  if (Number.isFinite(activeDateMs) && Number.isFinite(thisDateMs) && activeDateMs > thisDateMs) {
    return "superseded_by_newer_test";
  }
  return "unknown";
}

/**
 * Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
 * F6/F10) — the real evidence-chain sections common to BOTH a GPS-guided
 * report (`buildScientificEvidenceReport`) and a legacy/manual-entry
 * report (`buildScientificEvidenceReportForField`): the field's real
 * current nutrient decision chain, its real currently-recommendable
 * Prompt, its real accepted plan history, and its real requirement/
 * confirmed/remaining kg/ha field status. Extracted once so neither
 * report path can silently diverge from the other on how these are
 * computed — every one of these calls is the exact same real,
 * already-audited function either path already used independently
 * before this extraction.
 */
async function buildFieldEvidenceSections(
  farm: Farm,
  field: Field,
  fields: readonly Field[],
  livestockGroups: LivestockGroup[],
  slurryAllocations: readonly SlurryAllocation[],
  slurryCompositionRecords: readonly SlurryComposition[],
  now: string,
): Promise<
  Pick<
    ScientificEvidenceReport,
    | "nutrientPlan"
    | "nutrientPlanUnavailableReason"
    | "plannedManureOrigin"
    | "productAllocationKgField"
    | "currentRecommendation"
    | "acceptedPlans"
    | "acceptedPlansTruncated"
    | "fieldFertiliserStatus"
  >
> {
  // Codex audit round 5 HIGH — a report for a since-archived TARGET
  // field (legitimately resolvable for historical review, per the
  // `activeFields` doc comment below) must never compute or expose a
  // "current" nutrient plan/recommendation/remaining-requirement for
  // that field — every one of those is already excluded from this
  // farm's real active calculations everywhere else, so presenting one
  // here would be actionable-looking current planning for a field that
  // no longer participates in any of them. The real HISTORICAL sections
  // (`acceptedPlans`/`acceptedPlansTruncated` — past decisions genuinely
  // made while the field was active) are unaffected; this only
  // suppresses the "current" half of this function's own work.
  if (field.archivedAt) {
    const { decisions: allDecisions, truncated: acceptedPlansTruncated } = await listDecisionsForFarm(farm.id);
    const acceptedPlans = allDecisions.filter(
      (d) => d.calculationKind === "fertiliser_recommendation" && d.fieldId === field.id && d.outcome === "accepted",
    );
    return {
      nutrientPlan: undefined,
      nutrientPlanUnavailableReason: "This field is archived — a current nutrient plan is not available for it.",
      productAllocationKgField: undefined,
      currentRecommendation: undefined,
      acceptedPlans,
      acceptedPlansTruncated,
      fieldFertiliserStatus: { status: "blocked", reasonCode: "FIELD_ARCHIVED" },
    };
  }

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2) — the caller's own field lookup may deliberately still use the
  // full field list (e.g. so a farmer can open a real past evidence
  // report for a field they've since archived), but the *current*
  // stocking-rate/grassland-area denominator the "current" NutrientPlan
  // is computed from must never be inflated by an archived field's real
  // area, the same rule every other farm-wide aggregation in this app
  // now applies.
  const { farmGrasslandAreaHa, nonGrassPct } = computeFarmGrasslandAggregates(activeFields(fields));
  const slurryAllocation = resolveFieldSlurryAllocation(slurryAllocations, field.id);
  // Campaign A audit HIGH: the same recorded composition (and conflict
  // blocker) `recomputePromptByKind` resolves below — never silently the
  // national-average DM%.
  const compositionInput = resolveFieldSlurryCompositionInput(slurryAllocations, field.id, currentSlurryCompositionByHousing(slurryCompositionRecords));
  // Campaign B live evidence wiring: the field's planned neat slurry from
  // the canonical regulatory context (persisted neat-slurry records, current
  // record selected by the domain). Absent unless established, so the
  // statutory ledger stays blocked; slurry origin comes only from explicit
  // declarations on the planned spreadings, loaded by the same loader, and
  // otherwise the NAP check stays blocked on it
  // (`plannedRegulatoryNeatSlurryForNutrientPlan`).
  const [housing, allocationRecords] = await Promise.all([listHousingForFarm(farm.id), listSlurryAllocationRecordsForFarm(farm.id)]);
  const { context: regulatoryContext } = await loadSlurryRegulatoryContextForFarm(farm.id, {
    fields,
    housing,
    allocationRecords,
    compositionRecords: slurryCompositionRecords,
    livestockGroups,
    asOfDate: now.slice(0, 10),
  });

  const nutrientPlan = calculateNutrientPlan({
    field,
    farmGrasslandAreaHa,
    livestockGroups,
    slurryAllocation,
    nonGrassPct,
    pBuildUpCompliance: farm.pBuildUpCompliance?.value,
    asOfDate: now,
    slurryComposition: compositionInput.composition,
    slurryCompositionUnresolved: compositionInput.unresolved,
    plannedRegulatoryNeatSlurry: plannedRegulatoryNeatSlurryForNutrientPlan(regulatoryContext, field.id, slurryAllocation),
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
    allFields: activeFields(fields),
    livestockGroups,
    slurryAllocations,
    slurryCompositionRecords,
    now,
  });
  const currentRecommendation = prompt.basis.status === "OK" ? (prompt.basis.value as FertiliserRecommendationSummary) : undefined;

  const { decisions: allDecisions, truncated: acceptedPlansTruncated } = await listDecisionsForFarm(farm.id);
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
    nutrientPlan: nutrientPlanAvailable ? nutrientPlan : undefined,
    nutrientPlanUnavailableReason: nutrientPlanAvailable ? undefined : nutrientPlan.requirement.source,
    plannedManureOrigin: regulatoryContext.plannedManureOriginByField[field.id],
    productAllocationKgField,
    currentRecommendation,
    acceptedPlans,
    acceptedPlansTruncated,
    fieldFertiliserStatus,
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

  const [fields, livestockGroups, slurryAllocations, slurryCompositionRecords, decision, labStatus] = await Promise.all([
    listFieldsForFarm(farm.id),
    listLivestockGroupsForFarm(farm.id),
    listSlurryAllocationsForFarm(farm.id),
    listSlurryCompositionRecordsForFarm(farm.id),
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

  const fertilityBasisStatus = resolveFertilityBasisStatus(field, jobSessionId, compositeSample.sampleDate);
  const now = new Date().toISOString();
  const sections = await buildFieldEvidenceSections(farm, field, fields, livestockGroups, slurryAllocations, slurryCompositionRecords, now);

  return {
    reportVersion: SCIENTIFIC_EVIDENCE_REPORT_VERSION,
    generatedAt: now,
    farm: { id: farm.id, name: farm.name },
    field: { id: field.id, name: field.name, areaHa: field.areaHa, lpisRef: field.lpisRef, centroid: field.centroid },
    compositeSample,
    labStatus,
    fertilityBasisStatus,
    ...sections,
  };
}

/**
 * Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
 * F6/F10) — the same Scientific Evidence Report, reachable from the
 * legacy/manual "Add soil test" workflow instead of a GPS-guided
 * composite sample. Never requires a farmer to fabricate GPS sampling
 * or a new composite to explain an existing laboratory-based
 * recommendation — this reads the field's own real, already-saved
 * `verifiedTest` (`SoilFieldCard`'s own "View test" record) directly,
 * and recomputes its real interpretation the same "never trust a
 * persisted derived value, recompute from raw evidence" way
 * `getLabStatusForCompositeSample` already does for the GPS path
 * (`interpretLabResult`, unmodified — no second interpretation engine).
 */
export async function buildScientificEvidenceReportForField(fieldId: string): Promise<ScientificEvidenceReport | ScientificEvidenceReportError> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: "not_found", reasonCode: "NO_REAL_FARM_FOR_CURRENT_SESSION" };

  const fields = await listFieldsForFarm(farm.id);
  const field = fields.find((f) => f.id === fieldId);
  if (!field) return { status: "not_found", reasonCode: "FIELD_NOT_FOUND_ON_THIS_FARM" };
  // Codex audit round 3 HIGH — unlike the GPS-guided path (which reviews
  // one specific PAST composite sample and may legitimately need to
  // resolve a since-archived field for historical record purposes, see
  // Checkpoint A's own `activeFields` doc comment), this entry point has
  // no historical anchor at all — it exists purely to explain a field's
  // CURRENT active recommendation. Generating a live nutrient plan/
  // recommendation for an archived field (already excluded from every
  // real farm-wide calculation) would be actionable-looking current
  // planning for a field that no longer participates in any of them.
  // Rejected outright, never silently rendered as if still current.
  if (field.archivedAt) return { status: "not_found", reasonCode: "FIELD_ARCHIVED" };

  const verifiedTest = field.fertility.verifiedTest;
  if (!verifiedTest) return { status: "not_confirmed", reasonCode: "NO_REAL_SOIL_TEST_ON_FILE" };

  const [livestockGroups, slurryAllocations, slurryCompositionRecords] = await Promise.all([
    listLivestockGroupsForFarm(farm.id),
    listSlurryAllocationsForFarm(farm.id),
    listSlurryCompositionRecordsForFarm(farm.id),
  ]);
  const now = new Date().toISOString();

  const interpretation = interpretLabResult({
    labResultId: verifiedTest.labResultId ?? verifiedTest.sampleRef,
    pMgL: verifiedTest.p,
    kMgL: verifiedTest.k,
    pH: verifiedTest.pH,
    plannedUse: field.plannedUse?.value,
    organicCarbonStatus: field.mappedSoil?.organicCarbonStatus,
    limeRequirementTHa: verifiedTest.limeRequirement,
    now,
  });

  const sections = await buildFieldEvidenceSections(farm, field, fields, livestockGroups, slurryAllocations, slurryCompositionRecords, now);

  return {
    reportVersion: SCIENTIFIC_EVIDENCE_REPORT_VERSION,
    generatedAt: now,
    farm: { id: farm.id, name: farm.name },
    field: { id: field.id, name: field.name, areaHa: field.areaHa, lpisRef: field.lpisRef, centroid: field.centroid },
    manualEntry: {
      sampleRef: verifiedTest.sampleRef,
      sampleDate: verifiedTest.sampleDate,
      laboratory: verifiedTest.laboratory,
      pH: verifiedTest.pH,
      p: verifiedTest.p,
      k: verifiedTest.k,
      ...(verifiedTest.mg !== undefined ? { mg: verifiedTest.mg } : {}),
      ...(verifiedTest.organicMatterPct !== undefined ? { organicMatterPct: verifiedTest.organicMatterPct } : {}),
      ...(verifiedTest.limeRequirement !== undefined ? { limeRequirement: verifiedTest.limeRequirement } : {}),
    },
    labStatus: { interpretation },
    // This IS the field's own real active test by construction (read
    // directly from `field.fertility.verifiedTest`) — always "current"
    // for this report path, never inferred.
    fertilityBasisStatus: "current",
    ...sections,
  };
}
