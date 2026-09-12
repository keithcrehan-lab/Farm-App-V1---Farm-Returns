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

/**
 * Deliberately excludes `calculatedAt` — Codex audit HIGH (round 3 of
 * this checkpoint's own audit, 2026-09-12) asked why a retry's own
 * verify-before-trust comparison doesn't include it. It's excluded on
 * purpose, not overlooked: a genuine resumed retry legitimately
 * recomputes `interpretLabResult` at a fresh `now`, so its own
 * `calculatedAt` *always* differs from the original successful attempt's
 * — including it here would make every real, honest retry fail this
 * comparison as "different content." `calculatedAt` records *when this
 * specific attempt ran*, not *which underlying computation it
 * represents* (that identity is exactly the other fields this function
 * does compare — same lab result, same methodology version, same
 * derived indices). It no longer controls which row is "current" either
 * — see `getCurrentSoilInterpretationForLabResult`'s own doc comment for
 * why that now orders by `created_at` (server-assigned) instead.
 */
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

/**
 * The current interpretation for a LabResult — the most recently
 * *inserted* row (`created_at`, server-assigned `default now()`).
 * `null` when none has ever been computed for it yet.
 *
 * Codex audit HIGH (round 3 of this checkpoint's own audit, 2026-09-12):
 * the original version ordered by `calculated_at`, a value the *client*
 * supplies (`interpretLabResult`'s own `now` input) — an authenticated
 * client with a shape-valid-but-fabricated row (see this function's own
 * doc comment below on the accepted, disclosed residual risk) could set
 * that field to an artificially recent value specifically to win this
 * ordering. `created_at` cannot be client-supplied at all (the column
 * has no insert grant beyond its own `default now()` — every insert in
 * this schema relies on the database's own clock for it), closing that
 * specific manipulation.
 *
 * **What this does NOT close, disclosed honestly rather than implied**:
 * `authenticated` retains a direct `insert` grant on this table (RLS
 * below) — an authenticated farmer can still insert a second, later,
 * shape-valid-but-fabricated interpretation for their own real
 * LabResult (a different `methodology_version` avoids
 * `soil_interpretations_lab_result_methodology_unique` entirely), which
 * would then genuinely become "the current interpretation" this reader
 * returns. This is the exact same class of already-disclosed, already-
 * accepted, whole-app risk `job_actuals_check_same_farm`'s own header
 * comment documents for every other jsonb-typed provenance/derived-value
 * column in this schema ("an authenticated client can act on their own
 * farm's data via direct REST, bypassing this app's own server code
 * entirely... not a new or worse exposure than what already existed").
 * Closing it fully would require either `SECURITY DEFINER` (a real
 * defense-in-depth regression this schema's own history already tried
 * and reverted once, see `20260902030000_confirm_job_session_actual_atomic.sql`'s
 * header comment) or a genuinely different, whole-app privileged-write-
 * path decision — not something this one checkpoint's persistence
 * module should close unilaterally.
 */
export async function getCurrentSoilInterpretationForLabResult(farmId: string, labResultId: string): Promise<SoilInterpretationRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("soil_interpretations")
    .select("*")
    .eq("farm_id", farmId)
    .eq("lab_result_id", labResultId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSoilInterpretation(data as SoilInterpretationRow) : null;
}

/** Every real interpretation ever computed for a LabResult, oldest
 * insert first — for reproducibility/audit (campaign "historical
 * interpretations must remain reproducible"), not for normal display.
 * Ordered by `created_at` for the same reason
 * `getCurrentSoilInterpretationForLabResult` is — see that function's
 * own doc comment. */
export async function listSoilInterpretationsForLabResult(farmId: string, labResultId: string): Promise<SoilInterpretationRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("soil_interpretations")
    .select("*")
    .eq("farm_id", farmId)
    .eq("lab_result_id", labResultId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as SoilInterpretationRow[]).map(rowToSoilInterpretation);
}
