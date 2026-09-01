"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { primaryNavItems, moreNavIcon as MoreIcon } from "./nav-items";
import { MoreSheet } from "./MoreSheet";

/** Persistent 5-slot bottom nav — mobile only (design-system.md
 * "Density"). Farm Return Next v1.1 cutover: Today/Farm/Plan/Records
 * (`primaryNavItems`) plus a "More" slot for every earlier screen
 * (`MoreSheet`) — see `nav-items.ts`'s own header comment. */
export function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-fr-border bg-fr-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Primary"
      >
        {primaryNavItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                active ? "text-fr-green-700" : "text-fr-ink-400",
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
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-fr-ink-400"
        >
          <MoreIcon className="size-5" />
          More
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
