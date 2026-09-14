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
    <div className="flex min-h-screen bg-fr-surface-alt print:block print:min-h-0 print:bg-white">
      {/* Fertiliser Vertical V1, Checkpoint 4 — additive, CSS-only:
       * `print:hidden` on every navigation/chrome element so any screen
       * (the new Scientific Evidence Report included) prints its own real
       * content cleanly, without the sidebar/bottom-nav/banner around it.
       * Nothing here changes on-screen behaviour. */}
      <DesktopSidebar />
      <main className="min-w-0 flex-1 px-4 pb-20 pt-4 lg:px-10 lg:pb-10 lg:pt-8 print:p-0">
        {/* Codex remediation Priority 5 — real database mutation failures
         * are surfaced here, once, for every screen (not per-form), since
         * every real-mode write already funnels through farm-store.tsx's
         * one `persistRemote`. */}
        <SyncStatusBanner />
        <div className="mx-auto w-full min-w-0 max-w-6xl print:max-w-none">{children}</div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
