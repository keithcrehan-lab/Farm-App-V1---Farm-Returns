import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { ShedCard } from "@/components/farm/ShedCard";
import { AssignedGroupsCard } from "@/components/farm/AssignedGroupsCard";
import { NutrientValueRow } from "@/components/farm/NutrientValueRow";
import { SuggestedAllocationCard } from "@/components/farm/SuggestedAllocationCard";
import { mockHousing, mockLivestockGroups, mockSlurryAllocations } from "@/data/mock-farm";

export default function HousingPage() {
  const housing = mockHousing[0];
  const linkedGroups = mockLivestockGroups.filter((g) => housing.linkedGroupIds.includes(g.id));

  return (
    <AppShell>
      <MobileDetailHeader title="Housing & Slurry" backHref="/livestock" />
      <PageHeader title="Housing & Slurry" subtitle="Shed assignment, slurry inventory and organic nutrient value" />

      <div className="flex flex-col gap-4">
        <ShedCard housing={housing} />
        <AssignedGroupsCard groups={linkedGroups} />
        <NutrientValueRow slurry={housing.slurryEstimate} />
        <SuggestedAllocationCard allocations={mockSlurryAllocations} />

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
    </AppShell>
  );
}
