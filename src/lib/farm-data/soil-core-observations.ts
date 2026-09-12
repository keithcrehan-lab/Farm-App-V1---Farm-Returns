import "server-only";

/**
 * Fertiliser Vertical V1, Checkpoint 1 — real persistence for
 * `CoreObservation` (`docs/product/farm-return-next-v1.1/
 * SOIL_SAMPLING_ARCHITECTURE.md`). Requires
 * `supabase/migrations/20260912000000_soil_core_observations.sql`
 * applied — see that migration's own header for the full contract and
 * disclosed not-yet-applied status. Every call here fails with a real,
 * honest Postgres permission/schema error until it's applied, not a
 * silently wrong result (the same disclosed-until-applied posture
 * `job-sessions.ts`/`decisions.ts` already document).
 *
 * Insert-only — there is no update/delete function here on purpose. A
 * recorded core is permanent field evidence (CLAUDE.md's "provenance is
 * permanent"), enforced independently at the database level (no
 * update/delete grant, see the migration).
 */
import { createClient } from "@/lib/supabase/server";
import { rowToSoilCoreObservation, type SoilCoreObservationRecord } from "./mappers";
import type { SoilCoreObservationRow } from "./row-types";
import { jsonValuesEqual } from "./json-equal";

export interface NewSoilCoreObservationInput {
  /** Client-generated once, at "Record core" time — the same offline-
   * first idempotency-key pattern every other table in this contract
   * uses, required because a core is recorded live in the field with
   * poor or no connectivity. */
  id: string;
  farmId: string;
  jobSessionId: string;
  fieldId: string;
  samplingZoneId: string;
  sequence: number;
  lat: number;
  lng: number;
  accuracyMeters?: number;
  recordedAt: string;
  methodologyVersion: string;
  deviationReason?: string;
}

function toComparableInput(input: NewSoilCoreObservationInput) {
  return {
    farmId: input.farmId,
    jobSessionId: input.jobSessionId,
    fieldId: input.fieldId,
    samplingZoneId: input.samplingZoneId,
    sequence: input.sequence,
    lat: input.lat,
    lng: input.lng,
    accuracyMeters: input.accuracyMeters ?? null,
    recordedAt: input.recordedAt,
    methodologyVersion: input.methodologyVersion,
    deviationReason: input.deviationReason ?? null,
  };
}

function toComparableRow(row: SoilCoreObservationRow) {
  return {
    farmId: row.farm_id,
    jobSessionId: row.job_session_id,
    fieldId: row.field_id,
    samplingZoneId: row.sampling_zone_id,
    sequence: row.sequence,
    lat: row.lat,
    lng: row.lng,
    accuracyMeters: row.accuracy_m,
    recordedAt: row.recorded_at,
    methodologyVersion: row.methodology_version,
    deviationReason: row.deviation_reason,
  };
}

/**
 * Inserts one recorded core. Retry-safe by `id` (an offline-queued
 * "Record core" submission retried after its first attempt actually
 * succeeded server-side returns the same row rather than erroring or
 * silently duplicating it) — mirrors `insertJobSession`'s exact pattern.
 * A conflict on `(job_session_id, sequence)` under a *different* id is
 * never silently resolved: it means two different core submissions
 * claim the same position in the walked route, which is a real client
 * bug, not a benign retry.
 */
export async function insertSoilCoreObservation(input: NewSoilCoreObservationInput): Promise<SoilCoreObservationRecord> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("soil_core_observations")
    .insert({
      id: input.id,
      farm_id: input.farmId,
      job_session_id: input.jobSessionId,
      field_id: input.fieldId,
      sampling_zone_id: input.samplingZoneId,
      sequence: input.sequence,
      lat: input.lat,
      lng: input.lng,
      accuracy_m: input.accuracyMeters ?? null,
      recorded_at: input.recordedAt,
      methodology_version: input.methodologyVersion,
      deviation_reason: input.deviationReason ?? null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: byId, error: byIdError } = await supabase.from("soil_core_observations").select("*").eq("id", input.id).maybeSingle();
      if (byIdError) throw byIdError;
      if (byId) {
        const existingRow = byId as SoilCoreObservationRow;
        if (!jsonValuesEqual(toComparableInput(input), toComparableRow(existingRow))) {
          throw new Error(
            `insertSoilCoreObservation: a core observation with id ${input.id} already exists with different content — refusing to silently return stale/mismatched data`,
          );
        }
        return rowToSoilCoreObservation(existingRow);
      }
      throw new Error(
        `insertSoilCoreObservation: sequence ${input.sequence} is already recorded for job session ${input.jobSessionId} under a different core id — refusing to silently overwrite the walked route order`,
      );
    }
    throw error;
  }

  return rowToSoilCoreObservation(data as SoilCoreObservationRow);
}

/** Ordered by the real walked sequence — the caller-facing "cores
 * recorded so far" list and route reconstruction both depend on this
 * order being the recording order, not insertion/arrival order (which
 * can differ once offline sync is involved). */
export async function listSoilCoreObservationsForSession(farmId: string, jobSessionId: string): Promise<SoilCoreObservationRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("soil_core_observations")
    .select("*")
    .eq("farm_id", farmId)
    .eq("job_session_id", jobSessionId)
    .order("sequence", { ascending: true });
  if (error) throw error;
  return (data as SoilCoreObservationRow[]).map(rowToSoilCoreObservation);
}
