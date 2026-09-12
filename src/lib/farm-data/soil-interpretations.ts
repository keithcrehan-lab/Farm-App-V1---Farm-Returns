import "server-only";

/**
 * Fertiliser Vertical V1, Checkpoint 2 — real persistence for
 * `SoilInterpretation` (`docs/product/farm-return-next-v1.1/
 * SOIL_SAMPLING_ARCHITECTURE.md`). Requires
 * `supabase/migrations/20260913010000_soil_interpretations.sql`
 * applied.
 *
 * Insert-only, versioned — never updated. See that migration's own doc
 * comment for why "the most recent row is the current interpretation"
 * is the whole contract; no separate "is current" flag exists.
 */
import { createClient } from "@/lib/supabase/server";
import { rowToSoilInterpretation, type SoilInterpretationRecord } from "./mappers";
import type { SoilInterpretationRow } from "./row-types";
import type { SoilInterpretation } from "@/domain/soil-interpretation";

export interface NewSoilInterpretationInput {
  /** Client-generated once, at computation time. */
  id: string;
  farmId: string;
  fieldId: string;
  interpretation: SoilInterpretation;
}

/**
 * Inserts one real interpretation run. Not retry-safe by content
 * comparison like `insertLabResult`/`insertSoilCoreObservation` — a
 * genuine retry of the exact same `id` is idempotent by construction
 * (the database's own primary key uniqueness), but this function
 * intentionally does not special-case a `23505` conflict into a silent
 * "return the existing row": a caller computing a fresh interpretation
 * should get a real error, not an old interpretation's content, if its
 * own generated id happens to collide.
 */
export async function insertSoilInterpretation(input: NewSoilInterpretationInput): Promise<SoilInterpretationRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("soil_interpretations")
    .insert({
      id: input.id,
      farm_id: input.farmId,
      lab_result_id: input.interpretation.labResultId,
      field_id: input.fieldId,
      methodology_version: input.interpretation.methodologyVersion,
      p_index_status: input.interpretation.pIndexOutcome.status,
      p_index_value: input.interpretation.pIndex,
      p_index_conservative_treatment: input.interpretation.pIndexConservativeTreatment,
      k_index_value: input.interpretation.kIndex,
      ph: input.interpretation.pH,
      lime_requirement_t_ha: input.interpretation.limeRequirementTHa ?? null,
      crop_group: input.interpretation.cropGroup,
      soil_material: input.interpretation.soilMaterial,
      calculated_at: input.interpretation.calculatedAt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToSoilInterpretation(data as SoilInterpretationRow);
}

/** The current interpretation for a LabResult — the most recently
 * calculated row. `null` when none has ever been computed for it yet. */
export async function getCurrentSoilInterpretationForLabResult(farmId: string, labResultId: string): Promise<SoilInterpretationRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("soil_interpretations")
    .select("*")
    .eq("farm_id", farmId)
    .eq("lab_result_id", labResultId)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSoilInterpretation(data as SoilInterpretationRow) : null;
}

/** Every real interpretation ever computed for a LabResult, oldest
 * first — for reproducibility/audit (campaign "historical
 * interpretations must remain reproducible"), not for normal display. */
export async function listSoilInterpretationsForLabResult(farmId: string, labResultId: string): Promise<SoilInterpretationRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("soil_interpretations")
    .select("*")
    .eq("farm_id", farmId)
    .eq("lab_result_id", labResultId)
    .order("calculated_at", { ascending: true });
  if (error) throw error;
  return (data as SoilInterpretationRow[]).map(rowToSoilInterpretation);
}
