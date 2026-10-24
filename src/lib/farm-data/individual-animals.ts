import "server-only";

/**
 * Real Mode Completion Phase 12 — individual animal detail foundation.
 * Optional layer under a livestock group — see `IndividualAnimal`'s own
 * header comment in `src/domain/types.ts`.
 *
 * Requires `supabase/migrations/20260828040000_individual_animals.sql` to
 * be applied to the live project — new schema, not part of the prior
 * migrations. Every query here will fail (a real, honest Postgres error
 * — "relation does not exist" — not a silently wrong result) until that
 * migration is applied; documented in `docs/real-mode-completion/BUILD_LOG.md`
 * Phase 12 rather than assumed already live.
 */
import { createClient } from "@/lib/supabase/server";
import type { IndividualAnimal, LivestockCategory, WeightObservation } from "@/domain/types";
import { rowToIndividualAnimal, rowToWeightObservation } from "./mappers";
import type { LivestockIndividualRow, WeightObservationRow } from "./row-types";

export async function listIndividualAnimalsForFarm(farmId: string): Promise<IndividualAnimal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("livestock_individuals")
    .select("*")
    .eq("farm_id", farmId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data as LivestockIndividualRow[]).map(rowToIndividualAnimal);
}

export interface NewIndividualAnimalInput {
  groupId?: string;
  tagNumber?: string;
  category: LivestockCategory;
  sex?: "male" | "female";
  breed?: string;
  dateOfBirth?: string;
  goalStatus?: string;
  notes?: string;
}

export async function createIndividualAnimal(farmId: string, input: NewIndividualAnimalInput): Promise<IndividualAnimal> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("livestock_individuals")
    .insert({
      farm_id: farmId,
      group_id: input.groupId ?? null,
      tag_number: input.tagNumber ?? null,
      category: input.category,
      sex: input.sex ?? null,
      breed: input.breed ?? null,
      date_of_birth: input.dateOfBirth ?? null,
      goal_status: input.goalStatus ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  return rowToIndividualAnimal(data as LivestockIndividualRow);
}

export async function listWeightObservationsForFarm(farmId: string): Promise<WeightObservation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("livestock_weight_observations")
    .select("*")
    .eq("farm_id", farmId)
    .order("observed_date", { ascending: true });
  if (error) throw error;

  return (data as WeightObservationRow[]).map(rowToWeightObservation);
}

/**
 * This function itself performs no ownership check that `animalId`
 * actually belongs to `farmId` — that would look like a cross-farm gap in
 * isolation (a Farm A session could pass a Farm B `animalId` here and, by
 * this function's own code alone, have it accepted). It is not one: the
 * database enforces it independently and unconditionally, regardless of
 * what any caller checks — `livestock_weight_observations_check_same_farm`
 * (`supabase/migrations/20260828070000_cross_farm_integrity.sql`, a
 * `before insert or update` trigger, `VALIDATED_DEV` — live on Farm
 * Return V1 Dev) rejects any insert whose `animal_id` does not belong to
 * `farm_id`. Flagged as a CRITICAL by an overnight-run Codex audit
 * (`docs/farm-return-next/audit-logs/20260831T204350Z.md`) that inspected
 * this file and `20260828040000_individual_animals.sql` (the table's
 * *original* migration, which indeed has no such check) without also
 * finding the later `20260828070000` migration that added it — reviewed,
 * confirmed a false positive against the actual live schema, not fixed
 * (there is nothing here to fix: the real protection already exists one
 * layer down, exactly where `CLAUDE.md`'s "never assume application code
 * is the only writer" says it should).
 */
export async function addWeightObservation(
  farmId: string,
  animalId: string,
  weightKg: number,
  observedDate: string,
  source: string,
): Promise<WeightObservation> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("livestock_weight_observations")
    .insert({ farm_id: farmId, animal_id: animalId, weight_kg: weightKg, observed_date: observedDate, source })
    .select("*")
    .single();
  if (error) throw error;

  return rowToWeightObservation(data as WeightObservationRow);
}

/**
 * Farm Return Next Checkpoint 2, Vertical D — a targeted single-row
 * lookup, added specifically for `act/index.ts`'s
 * `persistRecordWeightObservationAuditTrail` to verify a specific
 * observation exists before persisting a `decisions`/`jobs` audit trail
 * for it (Codex audit HIGH, `docs/farm-return-next/audit-logs/
 * 20260829T201312Z.md`: that function previously called
 * `listWeightObservationsForFarm` and searched the result locally —
 * correct in a test with a handful of rows, but PostgREST caps an
 * unbounded `select` at a default row limit (commonly 1000), so a farm
 * with enough observation history could have a just-inserted row fall
 * outside that page, making every subsequent action on that farm
 * silently report `auditTrailError` and never persist its real trace).
 * Filtering by both `id` and `farm_id` server-side, not just `id`, keeps
 * this call itself real cross-farm-safe — a caller can never learn
 * whether an id exists on a *different* farm from the shape of the
 * response.
 */
export async function getWeightObservationById(farmId: string, observationId: string): Promise<WeightObservation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("livestock_weight_observations")
    .select("*")
    .eq("farm_id", farmId)
    .eq("id", observationId)
    .maybeSingle();
  if (error) throw error;

  return data ? rowToWeightObservation(data as WeightObservationRow) : null;
}

/**
 * Pilot Integration P2 — a farm-scoped single-animal lookup (`id` AND `farm_id`, under RLS): the cattle Record
 * Weight action checks the animal is the signed-in farm's before writing. Another farm's id and an unknown id give
 * the same `null` — the response never says whether an id exists elsewhere.
 */
export async function getIndividualAnimalForFarm(farmId: string, animalId: string): Promise<IndividualAnimal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("livestock_individuals").select("*").eq("farm_id", farmId).eq("id", animalId).maybeSingle();
  if (error) throw error;
  return data ? rowToIndividualAnimal(data as LivestockIndividualRow) : null;
}

export type IdempotentWeightResult =
  | { state: "CREATED"; observation: WeightObservation }
  /** The same submission arrived again (double click, network or action retry): the row it already created. */
  | { state: "REPLAYED"; observation: WeightObservation }
  /** The id is already used by a row with different content (or one this farm can't see): nothing is written. */
  | { state: "CONFLICT" };

/**
 * Pilot Integration P2 (DECISIONS D13) — the same insert as `addWeightObservation`, made retry-safe by a
 * client-generated row `id` (the repository's offline-first idempotency-key pattern: `insertSoilCoreObservation`,
 * `insertJobSession`). A repeat of the same submission hits the primary key (`23505`) and returns the row it
 * created; the same id with different content, or an id this farm can't see, is a CONFLICT — never a silent
 * overwrite and never a second row. Same-farm integrity stays with RLS and the `*_check_same_farm` trigger.
 */
export async function addWeightObservationIdempotent(input: {
  id: string;
  farmId: string;
  animalId: string;
  weightKg: number;
  observedDate: string;
  source: string;
}): Promise<IdempotentWeightResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("livestock_weight_observations")
    .insert({ id: input.id, farm_id: input.farmId, animal_id: input.animalId, weight_kg: input.weightKg, observed_date: input.observedDate, source: input.source })
    .select("*")
    .single();
  if (!error) return { state: "CREATED", observation: rowToWeightObservation(data as WeightObservationRow) };
  if (error.code !== "23505") throw error;
  const existing = await getWeightObservationById(input.farmId, input.id);
  if (existing && existing.animalId === input.animalId && existing.weightKg === input.weightKg && existing.observedDate === input.observedDate && existing.source === input.source) {
    return { state: "REPLAYED", observation: existing };
  }
  return { state: "CONFLICT" };
}
