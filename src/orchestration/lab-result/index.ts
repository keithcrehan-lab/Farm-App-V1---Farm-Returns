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

/** Every numeric field a LabResult carries, checked for real finiteness
 * before anything is persisted or interpreted (Codex audit HIGH, round 1
 * of this checkpoint's own audit, 2026-09-12): a directly invoked Server
 * Action could otherwise submit `NaN`/`Infinity` — Postgres's own
 * `double precision` ordering treats `NaN` as *greater than* every other
 * value for comparison purposes (non-standard IEEE754 behaviour specific
 * to Postgres), so this migration's own `>= 0` CHECK constraints do not
 * reliably reject it; `pIndexFromMgL(NaN)`/`kIndexFromMgL(NaN)` would
 * both silently fall through their bounds checks to Index 4. Application-
 * layer validation is the real, effective guard here, not the database. */
function assertFiniteLabValues(input: RecordLabResultInput): void {
  const checks: [string, number | undefined][] = [
    ["ph", input.ph],
    ["pMgL", input.pMgL],
    ["kMgL", input.kMgL],
    ["mgMgL", input.mgMgL],
    ["organicMatterPct", input.organicMatterPct],
    ["limeRequirementTHa", input.limeRequirementTHa],
  ];
  for (const [name, value] of checks) {
    if (value !== undefined && !Number.isFinite(value)) {
      throw new Error(`recordLabResultForCompositeSample: ${name} must be a real, finite number — received ${value}`);
    }
  }
  if (input.ph <= 0 || input.ph >= 14) throw new Error(`recordLabResultForCompositeSample: ph must be between 0 and 14 — received ${input.ph}`);
  if (input.pMgL < 0) throw new Error(`recordLabResultForCompositeSample: pMgL must be non-negative — received ${input.pMgL}`);
  if (input.kMgL < 0) throw new Error(`recordLabResultForCompositeSample: kMgL must be non-negative — received ${input.kMgL}`);
  if (input.mgMgL !== undefined && input.mgMgL < 0) throw new Error(`recordLabResultForCompositeSample: mgMgL must be non-negative — received ${input.mgMgL}`);
  if (input.organicMatterPct !== undefined && (input.organicMatterPct < 0 || input.organicMatterPct > 100)) {
    throw new Error(`recordLabResultForCompositeSample: organicMatterPct must be between 0 and 100 — received ${input.organicMatterPct}`);
  }
  if (input.limeRequirementTHa !== undefined && input.limeRequirementTHa < 0) {
    throw new Error(`recordLabResultForCompositeSample: limeRequirementTHa must be non-negative — received ${input.limeRequirementTHa}`);
  }
}

/** True when an already-persisted `LabResult` carries exactly the same
 * real values this submission claims — the resumability check below
 * (Codex audit HIGH, round 1) must never silently continue past a
 * genuinely *different* lab result under the same session id. */
function labResultMatchesInput(existing: LabResultRecord, input: RecordLabResultInput): boolean {
  return (
    existing.laboratory === input.laboratory &&
    existing.labReportRef === input.labReportRef &&
    existing.analysisDate === input.analysisDate &&
    existing.ph === input.ph &&
    existing.pMgL === input.pMgL &&
    existing.kMgL === input.kMgL &&
    (existing.mgMgL ?? null) === (input.mgMgL ?? null) &&
    (existing.organicMatterPct ?? null) === (input.organicMatterPct ?? null) &&
    (existing.limeRequirementTHa ?? null) === (input.limeRequirementTHa ?? null) &&
    (existing.sourceDocumentRef ?? null) === (input.sourceDocumentRef ?? null)
  );
}

/**
 * Records a real laboratory result for an already-confirmed
 * CompositeSample, computes its real interpretation, and applies it to
 * the field's own real `fertility`.
 *
 * Codex audit HIGH (round 1 of this checkpoint's own audit, 2026-09-12):
 * the original version rejected outright whenever a `LabResult` already
 * existed for this session — safe against a genuine duplicate
 * submission, but it also meant a real, transient failure between this
 * function's three writes (insert LabResult; compute+insert
 * SoilInterpretation; apply to `Field.fertility`) could permanently
 * strand a sample with no way to complete the remaining steps: any retry
 * hit the same "already exists" rejection at step one. Each step is now
 * independently resumable — a retry with the *same real values* picks up
 * wherever the previous attempt actually got to, never re-inserting (an
 * immutable table would reject that anyway) and never silently
 * continuing past a genuinely *different* resubmission for the same
 * session (`labResultMatchesInput` above). This is optimistic
 * resumability, not a database transaction — no cross-table atomicity is
 * claimed, only that no real state this function itself can observe is
 * ever left permanently unreachable.
 */
export async function recordLabResultForCompositeSample(input: RecordLabResultInput): Promise<RecordLabResultResult> {
  assertFiniteLabValues(input);

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

  const fields = await listFieldsForFarm(farm.id);
  const field = fields.find((f) => f.id === session.primaryFieldId);
  if (!field) {
    throw new Error(`recordLabResultForCompositeSample: field ${session.primaryFieldId} not found on the current session's farm`);
  }

  const now = new Date().toISOString();
  let labResult = await getLabResultForSession(farm.id, input.jobSessionId);
  if (labResult) {
    if (!labResultMatchesInput(labResult, input)) {
      throw new Error(`recordLabResultForCompositeSample: session ${input.jobSessionId} already has a different lab result — a CompositeSample can have at most one`);
    }
  } else {
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
    labResult = await insertLabResult(labResultInput);
  }

  let interpretationRecord = await getCurrentSoilInterpretationForLabResult(farm.id, labResult.id);
  if (!interpretationRecord) {
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
    interpretationRecord = await insertSoilInterpretation({
      id: globalThis.crypto.randomUUID(),
      farmId: farm.id,
      fieldId: field.id,
      interpretation,
    });
  }

  // Safe to call even on a resumed attempt where this step already
  // succeeded: `addSoilTestToField` (`src/lib/farm-data/soil.ts`) always
  // applies the exact same real, already-persisted `labResult` values —
  // re-verifying an unchanged value is the same "farmer re-confirms
  // their own evidence" case the legacy manual Soil-screen entry already
  // tolerates, never a silent overwrite with different data.
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
