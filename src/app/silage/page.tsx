"use client";

import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { FieldIdentityRow } from "@/components/farm/FieldIdentityRow";
import { SilagePlanCard } from "@/components/farm/SilagePlanCard";
import { SilageNutrientCostCard } from "@/components/farm/SilageNutrientCostCard";
import { FeedValueCard } from "@/components/farm/FeedValueCard";
import { WholeFarmFeedBalanceCard } from "@/components/farm/WholeFarmFeedBalanceCard";
import { mockForageInventory, mockSilagePlans } from "@/data/mock-farm";
import { useFieldById, useHousingList, useSlurryAllocations } from "@/store/farm-store";

export default function SilagePage() {
  const plan = mockSilagePlans[0];
  const field = useFieldById(plan.fieldId);
  const slurryAllocations = useSlurryAllocations();
  const allocation = slurryAllocations.find((a) => a.fieldId === plan.fieldId);
  const housing = useHousingList()[0];

  if (!field) return null;

  return (
    <>
      <MobileDetailHeader title="Silage planning" backHref="/fields" />
      <PageHeader title="Silage & Fields" subtitle="Cuts, expected/actual yield, forage balance and cost" />

      <div className="flex flex-col gap-4">
        <FieldIdentityRow field={field} />
        <SilagePlanCard plan={plan} field={field} />
        <SilageNutrientCostCard plan={plan} allocation={allocation} storageCapacityM3={housing.storageCapacityM3} />
        <FeedValueCard plan={plan} field={field} />
        <WholeFarmFeedBalanceCard inventory={mockForageInventory} />
      </div>
    </>
  );
}
