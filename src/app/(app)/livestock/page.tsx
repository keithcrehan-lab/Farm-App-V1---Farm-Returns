import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listIndividualAnimalsForFarm, listWeightObservationsForFarm } from "@/lib/farm-data/individual-animals";
import { LivestockPageClient } from "./LivestockPageClient";

export default async function LivestockPage() {
  if (!isSupabaseConfigured()) {
    return <LivestockPageClient farmId={null} individualAnimals={[]} weightObservations={[]} />;
  }

  const farm = await getFarmForCurrentUser();
  if (!farm) {
    return <LivestockPageClient farmId={null} individualAnimals={[]} weightObservations={[]} />;
  }

  // Real Mode Completion Phase 12 — requires migration
  // 20260828040000_individual_animals.sql applied to the live project;
  // fails open (empty list, not a crash) if it hasn't been yet, since a
  // missing table is a real Postgres error, not something this page
  // should surface as a broken screen for the rest of Livestock.
  let individualAnimals: Awaited<ReturnType<typeof listIndividualAnimalsForFarm>> = [];
  let weightObservations: Awaited<ReturnType<typeof listWeightObservationsForFarm>> = [];
  try {
    [individualAnimals, weightObservations] = await Promise.all([
      listIndividualAnimalsForFarm(farm.id),
      listWeightObservationsForFarm(farm.id),
    ]);
  } catch {
    // Migration not yet applied to this project — see this file's own
    // comment above and docs/real-mode-completion/BUILD_LOG.md Phase 12.
  }

  return <LivestockPageClient farmId={farm.id} individualAnimals={individualAnimals} weightObservations={weightObservations} />;
}
