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
 *
 * Codex audit round 6 CRITICAL — `fertility` (including its own real
 * `previous` history chain, Checkpoint B's own "never overwritten, never
 * truncated" contract) is persisted with a read-modify-write of the
 * whole JSON column. Two genuinely concurrent submissions for the same
 * field (a double-submit, or two real devices entering results close
 * together) could each read the same starting `fertility`, independently
 * compute their own updated chain, and the second `update` silently
 * overwrite the first — permanently losing one real laboratory result
 * with no error, no conflict surfaced. Fixed with real optimistic
 * concurrency: every write is conditioned on the field's own `updated_at`
 * (already refreshed by this table's existing `fields_set_updated_at`
 * trigger on every real update — no new migration needed) still matching
 * the value just read; a losing write matches zero rows and retries from
 * a fresh read rather than clobbering the winner.
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
import { resolveSoilTestChain, type NewSoilTestInput } from "@/domain/soil-test-history";
import type { Field, SoilFertility } from "@/domain/types";
import { rowToField } from "./mappers";
import type { FieldRow } from "./row-types";

export type { NewSoilTestInput };

/** Bounded — a real, if astronomically unlikely, string of concurrent
 * losing writes must still terminate with a clear, honest error rather
 * than retrying forever. */
const MAX_CONCURRENT_WRITE_RETRIES = 5;

export async function addSoilTestToField(fieldId: string, input: NewSoilTestInput): Promise<Field> {
  const supabase = await createClient();

  for (let attempt = 1; attempt <= MAX_CONCURRENT_WRITE_RETRIES; attempt++) {
    const { data: existingRow, error: fetchError } = await supabase
      .from("fields")
      .select("*")
      .eq("id", fieldId)
      .single();
    if (fetchError) throw fetchError;
    const row = existingRow as FieldRow;
    const field = rowToField(row);

    // Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
    // F4; Codex audit round 1 HIGH) — real chronological ordering, never
    // entry order: a backfilled OLDER real result must not silently
    // demote a genuinely newer, already-active test out of `fertility`'s
    // own current pIndex/kIndex/pH. See `resolveSoilTestChain`'s own doc
    // comment for the real regression this replaced.
    const { head: verifiedTest, inputBecameActive } = resolveSoilTestChain(field.fertility.verifiedTest, input);

    let fertility: SoilFertility;
    if (!inputBecameActive) {
      // `input` was inserted into history, not made active — the field's
      // real current pIndex/kIndex/pH must keep reflecting the genuinely
      // newer test already on file, untouched.
      fertility = { ...field.fertility, verifiedTest };
    } else {
      const source = `${input.laboratory} soil test`;
      // A field can get a soil test before its planned use is ever set
      // (boundary-first creation — Codex remediation Priority 6). When
      // absent, `pIndexFromMgL` falls back to its own already-documented
      // "grassland" default rather than this call site guessing a crop
      // group of its own.
      const pIndexOutcome = pIndexFromMgL(input.p, field.plannedUse ? cropGroupForFieldUse(field.plannedUse.value) : undefined);
      const { index: pIndex, conservativeTreatment } = resolvePIndexConservatively(pIndexOutcome);
      const pIndexSource = conservativeTreatment
        ? `${source} — AMBIGUOUS_STATUTORY_BOUNDARY: raw ${input.p} mg/L falls in the literal statutory source gap; conservative P4 allowance treatment applied, not a literal classification (S.I. 588/2025)`
        : source;
      const kIndex = kIndexFromMgL(input.k, soilMaterialForOrganicCarbonStatus(field.mappedSoil?.organicCarbonStatus));

      fertility = {
        pIndex: verify(field.fertility.pIndex, pIndex, pIndexSource, { sourceDate: input.sampleDate }),
        kIndex: verify(field.fertility.kIndex, kIndex, source, { sourceDate: input.sampleDate }),
        pH: field.fertility.pH
          ? verify(field.fertility.pH, input.pH, source, { sourceDate: input.sampleDate })
          : { value: input.pH, status: "verified" as const, source, sourceDate: input.sampleDate },
        verifiedTest,
      };
    }

    // The real optimistic-concurrency guard: only applies if `updated_at`
    // is still exactly what was just read. `.maybeSingle()` (never
    // `.single()`, which throws on zero rows) so a lost race is a real,
    // handled outcome — `data === null` — never an unhandled exception.
    const { data, error } = await supabase
      .from("fields")
      .update({ fertility })
      .eq("id", fieldId)
      .eq("updated_at", row.updated_at)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (data) return rowToField(data as FieldRow);

    // Lost the race — another real write landed between our read and
    // this write. Retry from a fresh read; never silently overwrite the
    // winner, never silently drop this real submission either.
  }

  throw new Error(
    `addSoilTestToField: field ${fieldId} was updated by another real submission ${MAX_CONCURRENT_WRITE_RETRIES} times in a row while trying to apply this soil test — please retry.`,
  );
}
