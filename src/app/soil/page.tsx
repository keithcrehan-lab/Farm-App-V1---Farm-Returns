"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { SoilCoverageCard } from "@/components/farm/SoilCoverageCard";
import { SoilFieldCard } from "@/components/farm/SoilFieldCard";
import { mockFields } from "@/data/mock-farm";
import { cn } from "@/lib/cn";
import type { FieldUse } from "@/domain/types";

const TABS = ["Mapped", "Assumptions", "Verified Tests"] as const;
type Tab = (typeof TABS)[number];

const FILTERS: { label: string; uses?: FieldUse[] }[] = [
  { label: "All fields" },
  { label: "Grass", uses: ["grazing", "mixed"] },
  { label: "Silage", uses: ["silage_1st_cut", "silage_2nd_cut", "silage_3rd_cut"] },
  { label: "Arable", uses: ["tillage"] },
];

export default function SoilPage() {
  const [tab, setTab] = useState<Tab>("Assumptions");
  const [filter, setFilter] = useState<string>("All fields");

  const activeFilter = FILTERS.find((f) => f.label === filter);
  const fields = mockFields.filter((field) => {
    if (tab === "Verified Tests" && !field.fertility.verifiedTest) return false;
    if (!activeFilter?.uses) return true;
    return activeFilter.uses.includes(field.plannedUse.value);
  });

  return (
    <AppShell>
      <PageHeader title="Soil" subtitle="Mapped soil, fertility assumptions and verified test results" />

      <h1 className="mb-4 text-title text-fr-ink-900 lg:hidden">Soil</h1>

      {/* Segmented tab control */}
      <div className="mb-4 flex gap-1 rounded-xl border border-fr-border bg-fr-surface-alt p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
              tab === t
                ? "border-b-2 border-fr-green-700 bg-fr-surface text-fr-green-700"
                : "text-fr-ink-600",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <SoilCoverageCard />
      </div>

      {/* Filter chips */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setFilter(f.label)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === f.label
                ? "border-fr-green-700 text-fr-green-700"
                : "border-fr-border text-fr-ink-600",
            )}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-full border border-fr-border text-fr-ink-600"
          aria-label="More filters"
        >
          <SlidersHorizontal className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
        {fields.map((field) => (
          <SoilFieldCard key={field.id} field={field} />
        ))}
        {fields.length === 0 ? (
          <p className="py-10 text-center text-sm text-fr-ink-400 lg:col-span-2">
            No fields match this filter yet.
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
