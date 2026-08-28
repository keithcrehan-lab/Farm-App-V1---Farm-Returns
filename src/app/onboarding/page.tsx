import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOnboardingStatusForCurrentUser } from "@/lib/farm-data/farms";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./OnboardingWizard";

/**
 * Real Mode Completion Phase 2/3 — real resumability, not just a redirect.
 *
 * Previously: no farm -> show onboarding from scratch; any farm at all ->
 * redirect straight to `/dashboard`, even if the farmer had never finished
 * (no livestock captured, no explicit "done"). That meant leaving
 * onboarding after the Farm step silently skipped the rest of it forever,
 * and refreshing/reopening the tab had no way to resume where you left
 * off — the "Back-button data-loss issue" the brief names, one level up
 * from the in-session Back button itself (see `OnboardingWizard.tsx`'s
 * own header comment for the in-session half of the fix).
 *
 * Now: a real `farms.onboarding_completed_at` flag (migration
 * `20260828030000_onboarding_completion.sql`) distinguishes "has a farm"
 * from "finished onboarding". Three real states, not two:
 *   - no farm yet -> start at the Farm step.
 *   - a farm but not completed -> resume at the Livestock step, with the
 *     real farm and any livestock groups already added loaded in, not
 *     re-asked for.
 *   - completed -> redirect into the app, unchanged.
 */
export default async function OnboardingPage() {
  let suggestedOwnerName = "";

  if (isSupabaseConfigured()) {
    const status = await getOnboardingStatusForCurrentUser();

    if (status?.completed) {
      redirect("/dashboard");
    }

    if (status && !status.completed) {
      const livestockGroups = await listLivestockGroupsForFarm(status.farm.id);
      return <OnboardingWizard suggestedOwnerName={status.farm.ownerName} resumeFarm={status.farm} resumeLivestockGroups={livestockGroups} />;
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    suggestedOwnerName = user?.email?.split("@")[0] ?? "";
  }

  return <OnboardingWizard suggestedOwnerName={suggestedOwnerName} resumeFarm={null} resumeLivestockGroups={[]} />;
}
