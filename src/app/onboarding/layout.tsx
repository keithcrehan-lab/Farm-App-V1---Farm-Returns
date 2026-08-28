import { BrandMark } from "@/components/shell/BrandMark";

/**
 * Real Farm V1 Phase 4 — onboarding shell. Not the AppShell (no
 * sidebar/bottom-nav — there's no farm to navigate around yet) and wider
 * than the `(auth)` card (multi-field forms need the room).
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-fr-surface-alt px-4 py-8 lg:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6">
          <BrandMark />
        </div>
        {children}
      </div>
    </div>
  );
}
