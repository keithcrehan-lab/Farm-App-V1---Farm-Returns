"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { SoilCoverageCard } from "@/components/farm/SoilCoverageCard";
import { SoilFieldCard } from "@/components/farm/SoilFieldCard";
import { useFields } from "@/store/farm-store";
import { cn } from "@/lib/cn";

const TABS = ["All fields", "Verified tests", "Needs lab test"] as const;
type Tab = (typeof TABS)[number];

/**
 * Farm-wide soil evidence overview only. Crop/use belongs to each field's
 * production cycle in Recommendation setup; this page never re-classifies
 * fields from the retired `plannedUse` property and never writes fertility.
 */
export default function SoilPage() {
  const allFields = useFields();
  const [tab, setTab] = useState<Tab>("All fields");

  const fields = allFields.filter((field) => {
    if (tab === "Verified tests") return Boolean(field.fertility.verifiedTest);
    if (tab === "Needs lab test") return !field.fertility.verifiedTest;
    return true;
  });

  return (
    <>
      <PageHeader title="Soil" subtitle="Farm-wide soil mapping and laboratory evidence. Field inputs are managed once in each field's Recommendation setup." />

      <h1 className="mb-4 text-title text-fr-ink-900 lg:hidden">Soil</h1>

      <div className="mb-4 flex gap-1 rounded-xl border border-fr-border bg-fr-surface-alt p-1" aria-label="Soil evidence filter">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            aria-pressed={tab === item}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
              tab === item ? "border-b-2 border-fr-green-700 bg-fr-surface text-fr-green-700" : "text-fr-ink-600",
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <SoilCoverageCard />
      </div>

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
        {fields.map((field) => <SoilFieldCard key={field.id} field={field} />)}
        {fields.length === 0 ? <p className="py-10 text-center text-sm text-fr-ink-400 lg:col-span-2">No fields match this evidence filter.</p> : null}
      </div>
    </>
  );
}
