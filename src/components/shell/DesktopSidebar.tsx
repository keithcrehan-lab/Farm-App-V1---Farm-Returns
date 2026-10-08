"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Sprout } from "lucide-react";
import { cn } from "@/lib/cn";
import { primaryNavItems, moreNavItems, moreNavIcon as MoreIcon } from "./nav-items";
import { useFarm } from "@/store/farm-store";

/** Persistent dark-green left rail — desktop only (design-system.md).
 * `primaryNavItems` (Farm Spatial V2: Farm/What Matters/Plan/Market/
 * Finance) stay visible. Phase 02B (spatial shell visual refinement):
 * every earlier screen (`moreNavItems`) sits behind one compact "More"
 * disclosure instead of a permanently expanded second list, so the rail
 * supports the Farm map rather than reading as an admin sidebar. Nothing
 * is removed: opening More lists every `moreNavItems` destination, the
 * same list mobile's `MoreSheet` renders. While the current route is one
 * of those destinations, the closed More button names it so the farmer
 * can still see where they are.
 *
 * Farm Home visual refresh v1: the rail recedes behind the Farm workspace —
 * deep forest graphite instead of bright green, lower-contrast inactive
 * items, a slim forest marker (not a bright block) for the current
 * destination, and no separator rules. */
export function DesktopSidebar() {
  const pathname = usePathname();
  const farm = useFarm();
  const [moreOpen, setMoreOpen] = useState(false);
  const activeMoreItem = moreNavItems.find((item) => item.href === pathname);

  function renderLink(item: (typeof primaryNavItems)[number], onNavigate?: () => void) {
    const active = pathname === item.href;
    if (item.placeholderNote) {
      // Approved destination with no route yet (`nav-items.ts`).
      return (
        <span
          key={item.href}
          aria-disabled="true"
          title={item.placeholderNote}
          className="flex cursor-not-allowed items-center gap-2.5 rounded-fr-v2-row px-2.5 py-2 text-[13px] font-medium text-white/30"
        >
          <item.icon className="size-4" />
          {item.label}
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-white/30">Soon</span>
        </span>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "relative flex items-center gap-2.5 rounded-fr-v2-row px-2.5 py-2 text-[13px] font-medium transition-colors duration-[160ms] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/70 motion-reduce:transition-none",
          active ? "bg-white/[0.06] text-white" : "text-white/50 hover:bg-white/[0.04] hover:text-white/85",
        )}
        aria-current={active ? "page" : undefined}
      >
        {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-fr-green-100/80" /> : null}
        <item.icon className={cn("size-4", active ? "opacity-100" : "opacity-75")} />
        {item.label}
      </Link>
    );
  }

  return (
    <aside className="hidden w-48 shrink-0 flex-col bg-fr-v2-shell px-3 py-5 text-white lg:flex print:hidden">
      <div className="mb-6 flex items-center gap-2 px-2.5">
        <Sprout className="size-[18px] text-fr-green-100/80" strokeWidth={1.75} />
        <span className="text-[14px] font-semibold tracking-tight text-white/90">Farm Return</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Primary">
        {primaryNavItems.map((item) => renderLink(item))}

        <div className="mt-4">
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            aria-controls={moreOpen ? "desktop-more-nav" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-fr-v2-row px-2.5 py-2 text-left text-[13px] font-medium transition-colors duration-[160ms] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/70 motion-reduce:transition-none",
              activeMoreItem && !moreOpen ? "bg-white/[0.06] text-white" : "text-white/50 hover:bg-white/[0.04] hover:text-white/85",
            )}
          >
            <MoreIcon className="size-4 opacity-75" />
            <span className="min-w-0 flex-1 truncate">
              More
              {activeMoreItem && !moreOpen ? (
                <>
                  {" "}
                  <span className="text-white/50">· {activeMoreItem.label}</span>
                </>
              ) : null}
            </span>
            <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-[160ms] motion-reduce:transition-none", moreOpen && "rotate-180")} />
          </button>
          {moreOpen ? (
            <div id="desktop-more-nav" role="group" aria-label="More" className="mt-0.5 flex flex-col gap-0.5">
              {moreNavItems.map((item) => renderLink(item, () => setMoreOpen(false)))}
            </div>
          ) : null}
        </div>
      </nav>

      <div className="mt-3 flex items-center gap-2.5 px-2.5 pt-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white/85">
          {farm.ownerName[0]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-white/80">{farm.ownerName}</p>
          <p className="truncate text-[11px] text-white/45">{farm.name}</p>
        </div>
      </div>
    </aside>
  );
}
