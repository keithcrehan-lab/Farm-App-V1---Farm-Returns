import { FarmProvider } from "@/store/farm-store";
import { AppShell } from "@/components/shell/AppShell";

/**
 * Real Farm V1 Phase 2 — the signed-in application shell, split out of the
 * root layout so `(auth)` routes (sign-in/sign-up/...) render without the
 * sidebar/bottom-nav chrome or a farm in scope. Route-group segments
 * (`(app)`, `(auth)`) don't appear in the URL — `/dashboard` is unchanged.
 *
 * `src/proxy.ts` already redirects an unauthenticated request to
 * `/sign-in` before this layout renders, so this file focuses on chrome +
 * the farm data provider rather than repeating that check — Next.js's own
 * guidance is that proxy-level checks are defence in depth, not the only
 * gate, so the farm-scoped Server Actions added in Phase 3 independently
 * verify the session again before touching data.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FarmProvider>
      <AppShell>{children}</AppShell>
    </FarmProvider>
  );
}
