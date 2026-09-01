"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprout } from "lucide-react";
import { cn } from "@/lib/cn";
import { primaryNavItems, moreNavItems } from "./nav-items";
import { useFarm } from "@/store/farm-store";

/** Persistent dark-green left rail — desktop only (design-system.md).
 * Farm Return Next v1.1 cutover: `primaryNavItems`
 * (Today/Farm/Plan/Records) lead, every earlier screen
 * (`moreNavItems`) follows under its own "More" heading — desktop has
 * room to show both groups permanently rather than hiding the second one
 * behind mobile's `MoreSheet` (`nav-items.ts`'s own header comment). */
export function DesktopSidebar() {
  const pathname = usePathname();
  const farm = useFarm();

  function renderLink(item: (typeof primaryNavItems)[number]) {
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-fr-control px-3 py-2.5 text-sm font-medium transition-colors",
          active ? "bg-fr-green-700 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
        )}
        aria-current={active ? "page" : undefined}
      >
        <item.icon className="size-5" />
        {item.label}
      </Link>
    );
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-fr-green-900 px-4 py-6 text-white lg:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <Sprout className="size-6 text-fr-green-100" />
        <span className="text-lg font-semibold tracking-tight">Farm Return</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Primary">
        {primaryNavItems.map(renderLink)}
        <p className="mb-1 mt-5 px-3 text-label uppercase tracking-wide text-white/40">More</p>
        {moreNavItems.map(renderLink)}
      </nav>

      <div className="mt-4 flex items-center gap-3 rounded-fr-control px-3 py-2.5">
        <span className="flex size-9 items-center justify-center rounded-full bg-fr-green-700 text-sm font-semibold">
          {farm.ownerName[0]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{farm.ownerName}</p>
          <p className="truncate text-xs text-white/60">{farm.name}</p>
        </div>
      </div>
    </aside>
  );
}
