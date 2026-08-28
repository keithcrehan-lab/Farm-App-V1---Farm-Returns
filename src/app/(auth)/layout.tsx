import { Sprout } from "lucide-react";

/**
 * Real Farm V1 Phase 2 — unauthenticated shell. Deliberately not the
 * AppShell (no sidebar/bottom-nav, no farm in scope yet) — same green
 * brand mark as `DesktopSidebar`, centred single-column card.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-fr-surface-alt px-4 py-12">
      <div className="mb-8 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-fr-control bg-fr-green-900 text-white">
          <Sprout className="size-5" />
        </span>
        <span className="text-lg font-semibold tracking-tight text-fr-ink-900">Farm Return</span>
      </div>
      <div className="w-full max-w-sm rounded-fr-card border border-fr-border bg-fr-surface p-6 shadow-fr-card">
        {children}
      </div>
    </div>
  );
}
