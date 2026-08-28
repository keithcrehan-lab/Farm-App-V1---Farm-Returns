import { Sprout } from "lucide-react";

/** Shared green Farm Return brand mark — `DesktopSidebar`'s icon, reused
 * at chrome-free entry points ((auth), onboarding) so it isn't redrawn
 * per screen. */
export function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-9 items-center justify-center rounded-fr-control bg-fr-green-900 text-white">
        <Sprout className="size-5" />
      </span>
      <span className="text-lg font-semibold tracking-tight text-fr-ink-900">Farm Return</span>
    </div>
  );
}
