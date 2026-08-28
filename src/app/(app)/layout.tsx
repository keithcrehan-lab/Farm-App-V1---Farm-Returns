import { redirect } from "next/navigation";
import { FarmProvider } from "@/store/farm-store";
import { AppShell } from "@/components/shell/AppShell";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getOnboardingStatusForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";

/**
 * Real Farm V1 Phase 2/4 — the signed-in application shell, split out of
 * the root layout so `(auth)` routes (sign-in/sign-up/...) render without
 * the sidebar/bottom-nav chrome or a farm in scope. Route-group segments
 * (`(app)`, `(auth)`) don't appear in the URL — `/dashboard` is unchanged.
 *
 * `src/proxy.ts` already redirects an unauthenticated request to
 * `/sign-in` before this layout renders, so this file focuses on chrome +
 * the farm data provider rather than repeating that check — Next.js's own
 * guidance is that proxy-level checks are defence in depth, not the only
 * gate, so the farm-scoped Server Actions added in Phase 3 independently
 * verify the session again before touching data.
 *
 * When Supabase is live, a signed-in farmer who hasn't *finished*
 * onboarding is sent to `/onboarding` (Real Mode Completion Phase 2/3 —
 * `onboarding_completed_at`, not just "does a farms row exist", so a
 * farmer who created a farm and left before finishing resumes onboarding
 * rather than landing in a half-empty dashboard). One who has gets the
 * real farm fetched here, server-side, and handed to `FarmProvider` as
 * `initialState` with `remote` — see that file's header comment for what
 * "remote mode" changes.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (isSupabaseConfigured()) {
    const status = await getOnboardingStatusForCurrentUser();
    if (!status || !status.completed) {
      redirect("/onboarding");
    }
    const { farm } = status;

    const [fields, livestockGroups, housing, slurryAllocations] = await Promise.all([
      listFieldsForFarm(farm.id),
      listLivestockGroupsForFarm(farm.id),
      listHousingForFarm(farm.id),
      listSlurryAllocationsForFarm(farm.id),
    ]);

    return (
      <FarmProvider remote initialState={{ farm, fields, livestockGroups, housing, slurryAllocations }}>
        <AppShell>{children}</AppShell>
      </FarmProvider>
    );
  }

  return (
    <FarmProvider>
      <AppShell>{children}</AppShell>
    </FarmProvider>
  );
}
