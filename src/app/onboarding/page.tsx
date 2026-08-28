import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./OnboardingWizard";

/**
 * Real Farm V1 Phase 4 — a signed-up farmer with no farm yet lands here
 * (see `src/app/(app)/layout.tsx`'s redirect once that check is wired in
 * Phase 6). A farmer who already has a farm is sent straight to the
 * dashboard instead — onboarding is a one-time flow; existing screens
 * (Settings, Fields, Livestock, Housing) cover "edit this later".
 */
export default async function OnboardingPage() {
  let suggestedOwnerName = "";

  if (isSupabaseConfigured()) {
    const existingFarm = await getFarmForCurrentUser();
    if (existingFarm) {
      redirect("/dashboard");
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    suggestedOwnerName = user?.email?.split("@")[0] ?? "";
  }

  return <OnboardingWizard suggestedOwnerName={suggestedOwnerName} />;
}
