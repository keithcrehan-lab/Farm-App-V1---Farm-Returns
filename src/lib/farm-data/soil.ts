import "server-only";

/**
 * Real Farm V1 Phase 3/4 — soil test persistence. Deliberately calls the
 * exact same `src/domain/nutrients.ts` classification functions
 * `src/store/farm-store.tsx`'s (mock-mode) `addSoilTest` action already
 * uses — P-Index statutory-boundary conservative handling, K-Index by
 * soil material, pH `verify()` chaining — so a real lab result is
 * classified identically regardless of whether it was entered through
 * onboarding (this file) or the existing Soil screen (once Phase 6 wires
 * that screen to call this same function instead of the mock action).
 * One classification path, not two that could quietly diverge.
 */
import { createClient } from "@/lib/supabase/server";
import { verify } from "@/domain/provenance";
import {
  cropGroupForFieldUse,
  kIndexFromMgL,
  pIndexFromMgL,
  resolvePIndexConservatively,
  soilMaterialForOrganicCarbonStatus,
} from "@/domain/nutrients";
import type { Field, SoilTest } from "@/domain/types";
import { rowToField } from "./mappers";
import type { FieldRow } from "./row-types";

export type NewSoilTestInput = Omit<SoilTest, "reportFileUrl">;

export async function addSoilTestToField(fieldId: string, input: NewSoilTestInput): Promise<Field> {
  const supabase = await createClient();

  const { data: existingRow, error: fetchError } = await supabase
    .from("fields")
    .select("*")
    .eq("id", fieldId)
    .single();
  if (fetchError) throw fetchError;
  const field = rowToField(existingRow as FieldRow);

  const source = `${input.laboratory} soil test`;
  const pIndexOutcome = pIndexFromMgL(input.p, cropGroupForFieldUse(field.plannedUse.value));
  const { index: pIndex, conservativeTreatment } = resolvePIndexConservatively(pIndexOutcome);
  const pIndexSource = conservativeTreatment
    ? `${source} — AMBIGUOUS_STATUTORY_BOUNDARY: raw ${input.p} mg/L falls in the literal statutory source gap; conservative P4 allowance treatment applied, not a literal classification (S.I. 588/2025)`
    : source;
  const kIndex = kIndexFromMgL(input.k, soilMaterialForOrganicCarbonStatus(field.mappedSoil.organicCarbonStatus));

  const fertility = {
    pIndex: verify(field.fertility.pIndex, pIndex, pIndexSource, { sourceDate: input.sampleDate }),
    kIndex: verify(field.fertility.kIndex, kIndex, source, { sourceDate: input.sampleDate }),
    pH: field.fertility.pH
      ? verify(field.fertility.pH, input.pH, source, { sourceDate: input.sampleDate })
      : { value: input.pH, status: "verified" as const, source, sourceDate: input.sampleDate },
    verifiedTest: input,
  };

  const { data, error } = await supabase.from("fields").update({ fertility }).eq("id", fieldId).select("*").single();
  if (error) throw error;

  return rowToField(data as FieldRow);
}
