import "server-only";

/**
 * Fertiliser Vertical V1, Checkpoint 2 — real persistence for
 * `LabResult` (`docs/product/farm-return-next-v1.1/
 * SOIL_SAMPLING_ARCHITECTURE.md`). Requires
 * `supabase/migrations/20260913000000_lab_results.sql` applied — see
 * that migration's own header for the full contract and disclosed
 * not-yet-applied status.
 *
 * Insert-only — no update/delete function here on purpose. A lab result
 * is permanent measured evidence (CLAUDE.md's "provenance is
 * permanent"), enforced independently at the database level.
 */
import { createClient } from "@/lib/supabase/server";
import { rowToLabResult, type LabResultRecord } from "./mappers";
import type { LabResultRow } from "./row-types";
import { jsonValuesEqual } from "./json-equal";

export interface NewLabResultInput {
  /** Client-generated once, at submission time — same offline-first
   * idempotency-key pattern every table in this contract uses. */
  id: string;
  farmId: string;
  jobSessionId: string;
  fieldId: string;
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
  enteredAt: string;
}

function toComparableInput(input: NewLabResultInput) {
  return {
    farmId: input.farmId,
    jobSessionId: input.jobSessionId,
    fieldId: input.fieldId,
    laboratory: input.laboratory,
    labReportRef: input.labReportRef,
    analysisDate: input.analysisDate,
    ph: input.ph,
    pMgL: input.pMgL,
    kMgL: input.kMgL,
    mgMgL: input.mgMgL ?? null,
    organicMatterPct: input.organicMatterPct ?? null,
    limeRequirementTHa: input.limeRequirementTHa ?? null,
    sourceDocumentRef: input.sourceDocumentRef ?? null,
    enteredAt: input.enteredAt,
  };
}

function toComparableRow(row: LabResultRow) {
  return {
    farmId: row.farm_id,
    jobSessionId: row.job_session_id,
    fieldId: row.field_id,
    laboratory: row.laboratory,
    labReportRef: row.lab_report_ref,
    analysisDate: row.analysis_date,
    ph: row.ph,
    pMgL: row.p_mg_l,
    kMgL: row.k_mg_l,
    mgMgL: row.mg_mg_l,
    organicMatterPct: row.organic_matter_pct,
    limeRequirementTHa: row.lime_requirement_t_ha,
    sourceDocumentRef: row.source_document_ref,
    enteredAt: row.entered_at,
  };
}

/**
 * Inserts the one LabResult for a CompositeSample. Retry-safe by `id`
 * (mirrors `insertSoilCoreObservation`'s exact pattern). A conflict on
 * `job_session_id` under a *different* id is never silently resolved —
 * `lab_results_job_session_unique` is the real, structural enforcement
 * that a CompositeSample has at most one real LabResult; a second,
 * genuinely different submission for the same session is a client bug,
 * not a benign retry.
 */
export async function insertLabResult(input: NewLabResultInput): Promise<LabResultRecord> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lab_results")
    .insert({
      id: input.id,
      farm_id: input.farmId,
      job_session_id: input.jobSessionId,
      field_id: input.fieldId,
      laboratory: input.laboratory,
      lab_report_ref: input.labReportRef,
      analysis_date: input.analysisDate,
      ph: input.ph,
      p_mg_l: input.pMgL,
      k_mg_l: input.kMgL,
      mg_mg_l: input.mgMgL ?? null,
      organic_matter_pct: input.organicMatterPct ?? null,
      lime_requirement_t_ha: input.limeRequirementTHa ?? null,
      source_document_ref: input.sourceDocumentRef ?? null,
      entered_by: "farmer",
      entered_at: input.enteredAt,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: byId, error: byIdError } = await supabase.from("lab_results").select("*").eq("id", input.id).maybeSingle();
      if (byIdError) throw byIdError;
      if (byId) {
        const existingRow = byId as LabResultRow;
        if (!jsonValuesEqual(toComparableInput(input), toComparableRow(existingRow))) {
          throw new Error(
            `insertLabResult: a lab result with id ${input.id} already exists with different content — refusing to silently return stale/mismatched data`,
          );
        }
        return rowToLabResult(existingRow);
      }
      throw new Error(
        `insertLabResult: job session ${input.jobSessionId} already has a different lab result — a CompositeSample can have at most one LabResult`,
      );
    }
    throw error;
  }

  return rowToLabResult(data as LabResultRow);
}

export async function getLabResultForSession(farmId: string, jobSessionId: string): Promise<LabResultRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("lab_results").select("*").eq("farm_id", farmId).eq("job_session_id", jobSessionId).maybeSingle();
  if (error) throw error;
  return data ? rowToLabResult(data as LabResultRow) : null;
}

/** A generous, disclosed-truncation cap — same reasoning as every other
 * farm-scoped list reader in this schema. */
export const MAX_LAB_RESULTS_PER_FIELD = 500;

export interface FieldLabResultsResult {
  labResults: LabResultRecord[];
  truncated: boolean;
}

export async function listLabResultsForField(farmId: string, fieldId: string): Promise<FieldLabResultsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lab_results")
    .select("*")
    .eq("farm_id", farmId)
    .eq("field_id", fieldId)
    .order("analysis_date", { ascending: false })
    .limit(MAX_LAB_RESULTS_PER_FIELD + 1);
  if (error) throw error;
  const rows = data as LabResultRow[];
  const truncated = rows.length > MAX_LAB_RESULTS_PER_FIELD;
  return { labResults: rows.slice(0, MAX_LAB_RESULTS_PER_FIELD).map(rowToLabResult), truncated };
}
