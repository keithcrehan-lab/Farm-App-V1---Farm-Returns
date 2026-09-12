import "server-only";

/**
 * Fertiliser Vertical V1, Checkpoint 2 — real persistence for
 * `SoilInterpretation` (`docs/product/farm-return-next-v1.1/
 * SOIL_SAMPLING_ARCHITECTURE.md`). Requires
 * `supabase/migrations/20260913010000_soil_interpretations.sql`
 * applied.
 *
 * Insert-only, versioned — never updated. This table is a real,
 * permanent **audit trail**, not a trusted "current value" source —
 * `authenticated` has an unrestricted `insert` grant, so no column on a
 * persisted row here (including server-timestamped ones) can be trusted
 * to distinguish a genuine interpretation from a client-fabricated one.
 * The one real caller needing a displayable interpretation
 * (`getLabStatusForCompositeSample`, `src/orchestration/lab-result/index.ts`)
 * never reads this table at all; see that function's own doc comment
 * and `getCurrentSoilInterpretationForLabResult`'s below for the full
 * account (Codex audit CRITICAL, rounds 2-4 of this checkpoint's own
 * audit, 2026-09-12).
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
 * derived indices). `calculatedAt`/`created_at` no longer control
 * anything a real caller trusts either way — see
 * `getCurrentSoilInterpretationForLabResult`'s own doc comment for why
 * this table's ordering was never a safe proxy for "genuine" in the
 * first place, `created_at` (client-suppliable via this table's
 * unrestricted `insert` grant, despite its `default now()`) included.
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
 * The most recently inserted `soil_interpretations` row for a LabResult
 * — a real, permanent **audit-trail read**, never a trusted "current
 * value" source. `null` when none has ever been computed for it yet.
 *
 * **Do not use this function's return value as a trusted derived value
 * for display or any further calculation.** Codex audit CRITICAL
 * (rounds 2, 3, AND 4 of this checkpoint's own audit, 2026-09-12 — the
 * same structural problem found three consecutive times from different
 * angles, this campaign's own explicit "make a structural correction,
 * not another patch" trigger): `authenticated` has a genuinely
 * unrestricted `insert` grant on this table (RLS below), which means a
 * client can set *every* column, including `created_at`, to whatever it
 * likes — no ordering key (`calculated_at`, tried round 3; `created_at`,
 * tried round 3 and re-broken by round 4's own correct rejection) can
 * make "the most recent row" a trustworthy proxy for "the real,
 * correctly-derived interpretation," because there is no column in this
 * row a client cannot forge. Re-deriving the classification in a SQL
 * trigger to verify it would duplicate `pIndexFromMgL`/`kIndexFromMgL`
 * outside `src/domain/` — exactly the "never duplicate a domain
 * calculation" rule (`CLAUDE.md`) this schema's own `job_actuals`
 * precedent already establishes as the wrong direction for this class
 * of problem.
 *
 * **The real fix lives at the only genuinely safe layer: the reader.**
 * `getLabStatusForCompositeSample`
 * (`src/orchestration/lab-result/index.ts`) — the one real caller that
 * needs "the current interpretation" for something a farmer sees —
 * never calls this function at all; it recomputes `interpretLabResult`
 * fresh from the real `lab_results` row every time, the same "recompute
 * from raw evidence, never trust a derived cache" principle
 * `Field.fertility` (the actual, trusted source every downstream
 * calculation reads) already embodies. This function, and
 * `listSoilInterpretationsForLabResult` below, exist only for a genuine
 * historical **audit trail** — a future caller (e.g. Checkpoint 4's
 * evidence report, showing "this is what this app itself computed and
 * when") must independently verify a row's content against a fresh
 * `interpretLabResult` computation before presenting it as authoritative,
 * exactly as this module's own `insertSoilInterpretation` already does
 * at write time.
 */
export async function getCurrentSoilInterpretationForLabResult(farmId: string, labResultId: string): Promise<SoilInterpretationRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("soil_interpretations")
    .select("*")
    .eq("farm_id", farmId)
    .eq("lab_result_id", labResultId)
    // `id` as a secondary sort key — Codex audit MEDIUM (round 4): two
    // rows inserted in the same transaction can share an identical
    // `created_at` (Postgres's `now()` is transaction-stable), which
    // would otherwise make `.limit(1)` pick an unspecified one. `id` is
    // a client-generated UUID with no ordering meaning of its own, but
    // it makes this query's result deterministic across repeated reads
    // — real value only for this function's genuine audit-trail purpose
    // (see this function's own doc comment: its result is never trusted
    // as "the current value" regardless of which row this tie-break
    // happens to surface).
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSoilInterpretation(data as SoilInterpretationRow) : null;
}

/** Every real interpretation ever computed for a LabResult, oldest
 * insert first — a real, permanent audit trail (campaign "historical
 * interpretations must remain reproducible"), never a trusted "current
 * value" source — see `getCurrentSoilInterpretationForLabResult`'s own
 * doc comment for why. */
export async function listSoilInterpretationsForLabResult(farmId: string, labResultId: string): Promise<SoilInterpretationRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("soil_interpretations")
    .select("*")
    .eq("farm_id", farmId)
    .eq("lab_result_id", labResultId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data as SoilInterpretationRow[]).map(rowToSoilInterpretation);
}
