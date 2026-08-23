"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, MoreHorizontal } from "lucide-react";

/**
 * "‹ Title ⋯" back header used by every mobile detail screen reached from
 * a list (Nutrient Planner, Housing & Slurry, Silage Planning, Livestock
 * Economics, Feed Optimiser) — see screen-specification.md. Desktop pages
 * use PageHeader instead.
 */
export function MobileDetailHeader({ title, backHref }: { title: string; backHref?: string }) {
  const router = useRouter();

  return (
    <header className="mb-4 flex items-center justify-between lg:hidden">
      {backHref ? (
        <Link
          href={backHref}
          className="flex size-9 items-center justify-center rounded-full bg-fr-surface-alt text-fr-ink-600"
          aria-label="Back"
        >
          <ChevronLeft className="size-5" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => router.back()}
          className="flex size-9 items-center justify-center rounded-full bg-fr-surface-alt text-fr-ink-600"
          aria-label="Back"
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      <h1 className="text-lg font-bold text-fr-green-700">{title}</h1>
      <button
        type="button"
        className="flex size-9 items-center justify-center rounded-full bg-fr-surface-alt text-fr-ink-600"
        aria-label="More options"
      >
        <MoreHorizontal className="size-5" />
      </button>
    </header>
  );
}
