"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprout } from "lucide-react";
import { cn } from "@/lib/cn";
import { desktopNavItems } from "./nav-items";
import { mockFarm } from "@/data/mock-farm";

/** Persistent dark-green left rail — desktop only (design-system.md). */
export function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-fr-green-900 px-4 py-6 text-white lg:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <Sprout className="size-6 text-fr-green-100" />
        <span className="text-lg font-semibold tracking-tight">Farm Return</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1" aria-label="Primary">
        {desktopNavItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-fr-control px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-fr-green-700 text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white",
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 flex items-center gap-3 rounded-fr-control px-3 py-2.5">
        <span className="flex size-9 items-center justify-center rounded-full bg-fr-green-700 text-sm font-semibold">
          {mockFarm.ownerName[0]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{mockFarm.ownerName}</p>
          <p className="truncate text-xs text-white/60">{mockFarm.name}</p>
        </div>
      </div>
    </aside>
  );
}
