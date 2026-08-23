"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { mobileNavItems } from "./nav-items";

/** Persistent 5-tab bottom nav — mobile only (design-system.md "Density"). */
export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-fr-border bg-fr-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Primary"
    >
      {mobileNavItems.map((item) => {
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
    </nav>
  );
}
