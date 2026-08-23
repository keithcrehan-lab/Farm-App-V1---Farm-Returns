"use client";

import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { ShedCard } from "@/components/farm/ShedCard";
import { AssignedGroupsCard } from "@/components/farm/AssignedGroupsCard";
import { NutrientValueRow } from "@/components/farm/NutrientValueRow";
import { SuggestedAllocationCard } from "@/components/farm/SuggestedAllocationCard";
import { useHousingList, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";

export default function HousingPage() {
  const housingList = useHousingList();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const housing = housingList[0];
  const linkedGroups = livestockGroups.filter((g) => housing.linkedGroupIds.includes(g.id));

  return (
    <>
      <MobileDetailHeader title="Housing & Slurry" backHref="/livestock" />
      <PageHeader title="Housing & Slurry" subtitle="Shed assignment, slurry inventory and organic nutrient value" />

      <div className="flex flex-col gap-4">
        <ShedCard housing={housing} />
        <AssignedGroupsCard groups={linkedGroups} />
        <NutrientValueRow slurry={housing.slurryEstimate} />
        <SuggestedAllocationCard allocations={slurryAllocations} />

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled
            title="Manual refinement (tank dimensions, fill level, analysis) arrives with the Phase 2 data model"
            className="flex flex-1 items-center justify-center gap-2 rounded-fr-control border border-fr-border py-3 text-sm font-semibold text-fr-ink-600"
          >
            <SlidersHorizontal className="size-4" />
            Refine estimate
          </button>
          <button
            type="button"
            disabled
            title="The Spreading screen is next in the Phase 1 build order"
            className="flex flex-1 items-center justify-center gap-2 rounded-fr-control bg-fr-green-700/40 py-3 text-sm font-semibold text-white"
          >
            View spreading plan
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}
