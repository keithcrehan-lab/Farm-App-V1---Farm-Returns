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
import { jsonValuesEqual } from "./json-equal";

export interface NewSoilInterpretationInput {
  /** Client-generated once, at computation time. */
  id: string;
  farmId: string;
  fieldId: string;
  interpretation: SoilInterpretation;
}

function toComparableInput(input: NewSoilInterpretationInput) {
  return {
    farmId: input.farmId,
    fieldId: input.fieldId,
    labResultId: input.interpretation.labResultId,
    methodologyVersion: input.interpretation.methodologyVersion,
    pIndexStatus: input.interpretation.pIndexOutcome.status,
    pIndexValue: input.interpretation.pIndex,
    pIndexConservativeTreatment: input.interpretation.pIndexConservativeTreatment,
    kIndexValue: input.interpretation.kIndex,
    ph: input.interpretation.pH,
    limeRequirementTHa: input.interpretation.limeRequirementTHa ?? null,
    cropGroup: input.interpretation.cropGroup,
    soilMaterial: input.interpretation.soilMaterial,
  };
}

function toComparableRow(row: SoilInterpretationRow) {
  return {
    farmId: row.farm_id,
    fieldId: row.field_id,
    labResultId: row.lab_result_id,
    methodologyVersion: row.methodology_version,
    pIndexStatus: row.p_index_status,
    pIndexValue: row.p_index_value,
    pIndexConservativeTreatment: row.p_index_conservative_treatment,
    kIndexValue: row.k_index_value,
    ph: row.ph,
    limeRequirementTHa: row.lime_requirement_t_ha,
    cropGroup: row.crop_group,
    soilMaterial: row.soil_material,
  };
}

/**
 * Inserts one real interpretation run — retry-safe against
 * `soil_interpretations_lab_result_methodology_unique`
 * (`lab_result_id`, `methodology_version`), the real, structural "at
 * most one interpretation per LabResult per methodology version"
 * enforcement (`20260913010000_soil_interpretations.sql`'s own header
 * comment).
 *
 * Codex audit CRITICAL (round 2 of this checkpoint's own audit,
 * 2026-09-12): the caller previously trusted whatever row already
 * existed for a LabResult outright, with no check that its own values
 * actually match what `interpretLabResult` would genuinely compute —
 * `authenticated` has a direct `insert` grant on this table (RLS below),
 * so a row reaching it any other way could carry fabricated P/K indices
 * a real re-derivation would never produce, and this app's own screens
 * would display them as if real. A conflict here is now resolved the
 * same way `insertLabResult`/`insertSoilCoreObservation` already treat
 * theirs: fetch the row actually occupying that key, and only ever
 * return it if its content genuinely matches this call's own real,
 * freshly-computed input — never a blind "it already exists, trust it".
 * A genuine mismatch throws rather than silently accepting or
 * "correcting" the untrusted row (this table's own unique constraint
 * means a second, corrective insert under the identical methodology
 * version could never succeed anyway — surfacing the conflict honestly
 * is the only safe option).
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

  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: fetchError } = await supabase
        .from("soil_interpretations")
        .select("*")
        .eq("lab_result_id", input.interpretation.labResultId)
        .eq("methodology_version", input.interpretation.methodologyVersion)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (existing) {
        const existingRow = existing as SoilInterpretationRow;
        if (!jsonValuesEqual(toComparableInput(input), toComparableRow(existingRow))) {
          throw new Error(
            `insertSoilInterpretation: an interpretation already exists for lab result ${input.interpretation.labResultId} (methodology ${input.interpretation.methodologyVersion}) with different content — refusing to trust or silently overwrite it`,
          );
        }
        return rowToSoilInterpretation(existingRow);
      }
    }
    throw error;
  }

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
