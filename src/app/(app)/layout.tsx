import { redirect } from "next/navigation";
import { FarmProvider } from "@/store/farm-store";
import { AppShell } from "@/components/shell/AppShell";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";

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
 * When Supabase is live, a signed-in farmer with no farm row yet is sent
 * to `/onboarding` instead of a dashboard full of someone else's mock
 * data (Phase 5's "real users must not inherit the prototype farm's
 * sample data"). `FarmProvider` itself still seeds the Phase 1 mock farm
 * either way — reading the real farm/fields/etc. into it is Phase 6, once
 * onboarding has had a chance to prove the write path end-to-end.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (isSupabaseConfigured()) {
    const farm = await getFarmForCurrentUser();
    if (!farm) {
      redirect("/onboarding");
    }
  }

  return (
    <FarmProvider>
      <AppShell>{children}</AppShell>
    </FarmProvider>
  );
}
