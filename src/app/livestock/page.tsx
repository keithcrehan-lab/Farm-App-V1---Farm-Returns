"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { LivestockHeroCard } from "@/components/farm/LivestockHeroCard";
import { LivestockGroupCard } from "@/components/farm/LivestockGroupCard";
import { mockLivestockGroups } from "@/data/mock-farm";
import { cn } from "@/lib/cn";

const LOCAL_TABS = ["Overview", "Groups"] as const;
type Tab = (typeof LOCAL_TABS)[number];

export default function LivestockPage() {
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <AppShell>
      <PageHeader title="Livestock" subtitle="Animal groups, numbers, weight/value and housing link" />
      <h1 className="mb-3 text-title text-fr-ink-900 lg:hidden">Livestock</h1>

      <div className="mb-4 flex gap-5 border-b border-fr-border">
        {LOCAL_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 pb-2.5 text-sm font-medium transition-colors",
              tab === t
                ? "border-fr-green-700 text-fr-green-700"
                : "border-transparent text-fr-ink-400 hover:text-fr-ink-600",
            )}
          >
            {t}
          </button>
        ))}
        {/* Housing is its own screen (spec: "contextual" route), not a tab panel */}
        <Link
          href="/housing"
          className="border-b-2 border-transparent pb-2.5 text-sm font-medium text-fr-ink-400 hover:text-fr-ink-600"
        >
          Housing
        </Link>
      </div>

      {tab === "Overview" ? (
        <div className="flex flex-col gap-4">
          <LivestockHeroCard />
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
            {mockLivestockGroups.map((group) => (
              <LivestockGroupCard key={group.id} group={group} />
            ))}
          </div>
          <button
            type="button"
            disabled
            title="Group creation arrives with the Phase 2 data model"
            className="flex items-center justify-center gap-2 rounded-fr-control bg-fr-green-700/40 py-3 text-sm font-semibold text-white"
          >
            <Plus className="size-4" />
            Add New Group
          </button>
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-fr-ink-400">
          Group management (rename, split, merge) is a Phase 2+ flow — coming soon.
        </p>
      )}
    </AppShell>
  );
}
