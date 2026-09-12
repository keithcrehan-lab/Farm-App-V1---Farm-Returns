import "server-only";

/**
 * Fertiliser Vertical V1, Checkpoint 2 — Laboratory Evidence
 * orchestration. `docs/product/farm-return-next-v1.1/
 * SOIL_SAMPLING_ARCHITECTURE.md`'s `CompositeSample -> LabResult ->
 * SoilInterpretation` link, wired at its far end into the *existing*,
 * unmodified `Field.fertility` pipeline every real nutrient calculation
 * already reads (`calculateNutrientPlan`, `src/domain/nutrients.ts`) —
 * so a lab result entered through this new evidence chain reaches
 * Checkpoint 3's already-built, already-audited nutrient-requirement/
 * regulatory/product-allocation engine with zero changes to that engine.
 *
 * Reuses, never duplicates: `addSoilTestToField`
 * (`src/lib/farm-data/soil.ts`) is the exact same function the legacy
 * manual Soil-screen entry already calls — one real path from "a
 * farmer's real soil evidence" to "Field.fertility", not two that could
 * quietly diverge.
 */
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { getJobSessionById } from "@/lib/farm-data/job-sessions";
import { insertLabResult, getLabResultForSession, type NewLabResultInput } from "@/lib/farm-data/lab-results";
import { insertSoilInterpretation, getCurrentSoilInterpretationForLabResult } from "@/lib/farm-data/soil-interpretations";
import { addSoilTestToField } from "@/lib/farm-data/soil";
import { interpretLabResult } from "@/domain/soil-interpretation";
import type { Field } from "@/domain/types";
import type { LabResultRecord, SoilInterpretationRecord } from "@/lib/farm-data/mappers";

export interface RecordLabResultInput {
  /** Client-generated once, at submission time. */
  id: string;
  jobSessionId: string;
  laboratory: string;
  labReportRef: string;
  analysisDate: string;
  ph: number;
  pMgL: number;
  kMgL: number;
  mgMgL?: number;
  organicMatterPct?: number;
  limeRequirementTHa?: number;
  sourceDocumentRef?: string;
}

export interface RecordLabResultResult {
  labResult: LabResultRecord;
  interpretation: SoilInterpretationRecord;
  field: Field;
}

/**
 * Records a real laboratory result for an already-confirmed
 * CompositeSample, computes its real interpretation, and applies it to
 * the field's own real `fertility` — in that order, so a failure partway
 * through never leaves an interpretation with no underlying LabResult,
 * or a Field updated from a LabResult that was never actually
 * persisted.
 */
export async function recordLabResultForCompositeSample(input: RecordLabResultInput): Promise<RecordLabResultResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("recordLabResultForCompositeSample: no real farm for the current session");

  const session = await getJobSessionById(farm.id, input.jobSessionId);
  if (!session) {
    throw new Error(`recordLabResultForCompositeSample: session ${input.jobSessionId} not found for this farm`);
  }
  if (session.activityType !== "soil_sampling") {
    throw new Error(`recordLabResultForCompositeSample: session ${input.jobSessionId} is not a soil sampling session`);
  }
  // A LabResult attaches to a real, confirmed CompositeSample — never to
  // a still-in-progress or merely-finished-but-unconfirmed session
  // (campaign chain order: CompositeSample must exist before a lab
  // result can be associated with it).
  if (session.status !== "confirmed_actual") {
    throw new Error(
      `recordLabResultForCompositeSample: session ${input.jobSessionId} is "${session.status}" — a lab result can only attach to a confirmed composite sample`,
    );
  }
  if (!session.primaryFieldId) {
    throw new Error(`recordLabResultForCompositeSample: session ${input.jobSessionId} has no real field`);
  }

  const existing = await getLabResultForSession(farm.id, input.jobSessionId);
  if (existing) {
    throw new Error(`recordLabResultForCompositeSample: session ${input.jobSessionId} already has a lab result — a CompositeSample can have at most one`);
  }

  const fields = await listFieldsForFarm(farm.id);
  const field = fields.find((f) => f.id === session.primaryFieldId);
  if (!field) {
    throw new Error(`recordLabResultForCompositeSample: field ${session.primaryFieldId} not found on the current session's farm`);
  }

  const now = new Date().toISOString();
  const labResultInput: NewLabResultInput = {
    id: input.id,
    farmId: farm.id,
    jobSessionId: input.jobSessionId,
    fieldId: field.id,
    laboratory: input.laboratory,
    labReportRef: input.labReportRef,
    analysisDate: input.analysisDate,
    ph: input.ph,
    pMgL: input.pMgL,
    kMgL: input.kMgL,
    mgMgL: input.mgMgL,
    organicMatterPct: input.organicMatterPct,
    limeRequirementTHa: input.limeRequirementTHa,
    sourceDocumentRef: input.sourceDocumentRef,
    enteredAt: now,
  };
  const labResult = await insertLabResult(labResultInput);

  const interpretation = interpretLabResult({
    labResultId: labResult.id,
    pMgL: labResult.pMgL,
    kMgL: labResult.kMgL,
    pH: labResult.ph,
    plannedUse: field.plannedUse?.value,
    organicCarbonStatus: field.mappedSoil?.organicCarbonStatus,
    limeRequirementTHa: labResult.limeRequirementTHa,
    now,
  });
  const interpretationRecord = await insertSoilInterpretation({
    id: globalThis.crypto.randomUUID(),
    farmId: farm.id,
    fieldId: field.id,
    interpretation,
  });

  const updatedField = await addSoilTestToField(field.id, {
    sampleDate: labResult.analysisDate,
    laboratory: labResult.laboratory,
    sampleRef: labResult.labReportRef,
    p: labResult.pMgL,
    k: labResult.kMgL,
    pH: labResult.ph,
    ...(labResult.limeRequirementTHa !== undefined ? { limeRequirement: labResult.limeRequirementTHa } : {}),
    ...(labResult.mgMgL !== undefined ? { mg: labResult.mgMgL } : {}),
    ...(labResult.organicMatterPct !== undefined ? { organicMatterPct: labResult.organicMatterPct } : {}),
    compositeSampleId: session.id,
    labResultId: labResult.id,
  });

  return { labResult, interpretation: interpretationRecord, field: updatedField };
}

export interface CompositeSampleLabStatus {
  labResult?: LabResultRecord;
  interpretation?: SoilInterpretationRecord;
}

/** Real, current lab/interpretation status for one CompositeSample —
 * used by the UI to show "awaiting lab result" vs. the real result. */
export async function getLabStatusForCompositeSample(farmId: string, jobSessionId: string): Promise<CompositeSampleLabStatus> {
  const labResult = await getLabResultForSession(farmId, jobSessionId);
  if (!labResult) return {};
  const interpretation = await getCurrentSoilInterpretationForLabResult(farmId, labResult.id);
  return { labResult, ...(interpretation ? { interpretation } : {}) };
}
