import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOnboardingStatusForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { HOME_ROUTE } from "@/lib/home-route";
import { onboardingStage } from "@/lib/onboarding";
import { OnboardingWorkspace, type OnboardingField } from "@/components/onboarding/OnboardingWorkspace";

export const metadata = { title: "Set up your farm · Farm Return" };

/**
 * Map-led first-farm onboarding. The stage is read from what already exists — no farm (find and establish it), a farm
 * without a field (map the first one), a farm with a field but not finished (choose where to go next), or finished
 * (never shown onboarding again). So a farmer who leaves part-way resumes where they stopped, and nothing is created
 * twice: the farm is one-per-user in the database and every write resolves the farm server-side.
 */
export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) {
    // Demonstration mode has no account or farm to set up.
    redirect(HOME_ROUTE);
  }
  const status = await getOnboardingStatusForCurrentUser();
  // Active fields only: an archived field isn't one of the farm's fields any more.
  const fields = status ? (await listFieldsForFarm(status.farm.id)).filter((f) => !f.archivedAt) : [];
  const mapped: OnboardingField[] = fields.flatMap((f) => (f.polygon ? [{ id: f.id, name: f.name, polygon: f.polygon }] : []));
  const stage = onboardingStage({ hasFarm: status !== null, completed: status?.completed ?? false, fieldCount: fields.length });
  if (stage === "DONE") redirect(HOME_ROUTE);
  return <OnboardingWorkspace stage={stage} farm={status?.farm ?? null} fields={mapped} />;
}
