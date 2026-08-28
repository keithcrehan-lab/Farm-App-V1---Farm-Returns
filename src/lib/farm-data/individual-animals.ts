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
