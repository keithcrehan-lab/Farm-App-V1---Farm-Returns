import { DesktopSidebar } from "./DesktopSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { SyncStatusBanner } from "./SyncStatusBanner";

/**
 * One product, two compositions (design-system.md "Responsive rule"):
 * mobile gets a bottom nav + single-column vertical scroll, desktop gets a
 * persistent left rail + multi-column content area. Same shell, same
 * children, different chrome — not a scaled-up mobile layout.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-fr-surface-alt">
      <DesktopSidebar />
      <main className="min-w-0 flex-1 px-4 pb-20 pt-4 lg:px-10 lg:pb-10 lg:pt-8">
        {/* Codex remediation Priority 5 — real database mutation failures
         * are surfaced here, once, for every screen (not per-form), since
         * every real-mode write already funnels through farm-store.tsx's
         * one `persistRemote`. */}
        <SyncStatusBanner />
        <div className="mx-auto w-full min-w-0 max-w-6xl">{children}</div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
