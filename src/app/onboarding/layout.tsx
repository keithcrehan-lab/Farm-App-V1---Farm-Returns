/**
 * Onboarding shell: full-bleed, so the farm's real satellite map is the workspace from the first screen (the
 * onboarding panel and Farm Return mark sit over it). No sidebar yet — there's no farm to navigate around.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-fr-v2-forest-deep">{children}</div>;
}
