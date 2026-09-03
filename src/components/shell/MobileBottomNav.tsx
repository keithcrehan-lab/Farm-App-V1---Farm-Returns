"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { primaryNavItems, moreNavIcon as MoreIcon } from "./nav-items";
import { MoreSheet } from "./MoreSheet";

/** Routes whose primary surface is a full-bleed real photo/map — the
 * approved references (`media/image2.png`'s Today, `image3.png`'s Farm)
 * show the bottom nav as a floating dark-glass dock sitting on the
 * photo, not a flat light bar underneath it. Every other real screen
 * (Plan, Records, and every legacy screen) keeps the plain light bar,
 * matching `media/image1.png`'s own light-system nav treatment on the
 * screens it actually shows. A short, explicit route list here (not a
 * heuristic) — the nav has no way to know a page's own composition
 * otherwise, and guessing wrong would put a dark dock over a white page. */
const OVERLAY_ROUTES = new Set(["/today", "/fields"]);

/** Persistent 5-slot bottom nav — mobile only (design-system.md
 * "Density"). Farm Return Next v1.1 cutover: Today/Farm/Plan/Records
 * (`primaryNavItems`) plus a "More" slot for every earlier screen
 * (`MoreSheet`) — see `nav-items.ts`'s own header comment.
 *
 * Strict Visual Reproduction phase (2026-09-03): the light bar is the
 * default treatment; `OVERLAY_ROUTES` opts a full-bleed photo screen
 * into the floating dark-glass dock instead, literally matching the
 * approved references' own composition on those specific screens. */
export function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const overlay = OVERLAY_ROUTES.has(pathname);

  return (
    <>
      <nav
        className={cn(
          "fixed z-20 flex lg:hidden",
          overlay
            ? "inset-x-3 bottom-3 rounded-full border border-white/15 bg-fr-green-900/70 px-1 py-1 shadow-lg backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
            : "inset-x-0 bottom-0 border-t border-fr-border bg-fr-surface pb-[env(safe-area-inset-bottom)]",
        )}
        aria-label="Primary"
      >
        {primaryNavItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 text-[11px] font-medium",
                overlay
                  ? cn("rounded-full py-2", active ? "bg-white/15 text-white" : "text-white/70")
                  : cn("py-2.5", active ? "text-fr-green-700" : "text-fr-ink-400"),
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 text-[11px] font-medium",
            overlay ? "rounded-full py-2 text-white/70" : "py-2.5 text-fr-ink-400",
          )}
        >
          <MoreIcon className="size-5" />
          More
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
