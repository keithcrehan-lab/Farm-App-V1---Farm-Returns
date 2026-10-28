"use client";

import Link from "next/link";
import { Sheet } from "@/components/ui/Sheet";
import { moreNavItems, type NavItem } from "./nav-items";

/**
 * Mobile "More" bottom-nav slot — every pre-cutover screen
 * (`nav-items.ts`'s own header comment explains why these are relocated,
 * not removed). Desktop renders the same `moreNavItems` list behind
 * `DesktopSidebar`'s own compact "More" disclosure rather than a sheet.
 */
export function MoreSheet({ open, onClose, items = moreNavItems }: { open: boolean; onClose: () => void; items?: readonly NavItem[] }) {
  return (
    <Sheet open={open} onClose={onClose} title="More">
      <nav aria-label="More" className="flex flex-col">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className="flex items-center gap-3 border-t border-fr-border py-3 text-sm font-medium text-fr-ink-900 first:border-t-0"
          >
            <item.icon className="size-5 text-fr-ink-600" />
            {item.label}
          </Link>
        ))}
      </nav>
    </Sheet>
  );
}
