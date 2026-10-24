"use server";

/**
 * Pilot Integration P2 — the real (signed-in) Record Weight write. The ONLY real cattle write.
 *
 * Trust boundary: the argument is untrusted (a server function is reachable by direct POST). The farm is never
 * taken from it: it is resolved here from the authenticated user (`getFarmForCurrentUser`), the animal must be that
 * farm's (`getIndividualAnimalForFarm`, id AND farm), and the row is written with those trusted ids into the existing
 * `livestock_weight_observations` store (RLS + same-farm trigger underneath). The submission id makes a repeat of
 * the same submission return the row it already created (DECISIONS D13).
 *
 * Nothing is computed here: after the write, `/cattle` and `/livestock` are revalidated and re-read from Supabase,
 * and the frozen engines recompute everything (latest weight, gain, work) on that read.
 */

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { addWeightObservationIdempotent, getIndividualAnimalForFarm } from "@/lib/farm-data/individual-animals";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { REAL_WEIGHT_SOURCE, irelandCalendarDate, readRecordWeightRequest, refuse, type RecordWeightResult } from "@/server/cattle-real/record-weight";

export async function recordRealCattleWeight(raw: unknown): Promise<RecordWeightResult> {
  // Demonstration mode has no real store: its Record Weight stays in the browser session (never this action).
  if (!isSupabaseConfigured()) return refuse("DEMO_MODE");
  const read = readRecordWeightRequest(raw, irelandCalendarDate(new Date()));
  if (!read.ok) return refuse(read.reason);
  const req = read.request;
  try {
    const farm = await getFarmForCurrentUser();
    if (!farm) return refuse("NOT_SIGNED_IN");
    const animal = await getIndividualAnimalForFarm(farm.id, req.animalId);
    if (!animal) return refuse("ANIMAL_NOT_FOUND");
    const written = await addWeightObservationIdempotent({ id: req.requestId, farmId: farm.id, animalId: animal.id, weightKg: req.weightKg, observedDate: req.observedDate, source: REAL_WEIGHT_SOURCE });
    if (written.state === "CONFLICT") return refuse("DUPLICATE_CONFLICT");
    try {
      revalidatePath("/cattle", "layout");
      revalidatePath("/livestock");
    } catch (e) {
      // The weight IS saved; the client refreshes the route itself, so a revalidation failure doesn't undo or hide it.
      unstable_rethrow(e);
      console.error("[cattle] revalidation after a saved weight failed:", e);
    }
    return { ok: true, observationId: written.observation.id, replayed: written.state === "REPLAYED" };
  } catch (e) {
    unstable_rethrow(e);
    // The animal deleted between the check and the insert (foreign key): not found, nothing written.
    if ((e as { code?: unknown } | null)?.code === "23503") return refuse("ANIMAL_NOT_FOUND");
    console.error("[cattle] recording a weight failed:", e);
    return refuse("WRITE_FAILED");
  }
}
