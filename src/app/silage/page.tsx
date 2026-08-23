import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { FieldIdentityRow } from "@/components/farm/FieldIdentityRow";
import { SilagePlanCard } from "@/components/farm/SilagePlanCard";
import { SilageNutrientCostCard } from "@/components/farm/SilageNutrientCostCard";
import { FeedValueCard } from "@/components/farm/FeedValueCard";
import { WholeFarmFeedBalanceCard } from "@/components/farm/WholeFarmFeedBalanceCard";
import {
  fieldById,
  mockForageInventory,
  mockHousing,
  mockSilagePlans,
  mockSlurryAllocations,
} from "@/data/mock-farm";

export default function SilagePage() {
  const plan = mockSilagePlans[0];
  const field = fieldById(plan.fieldId);
  const allocation = mockSlurryAllocations.find((a) => a.fieldId === plan.fieldId);
  const housing = mockHousing[0];

  if (!field) return null;

  return (
    <AppShell>
      <MobileDetailHeader title="Silage planning" backHref="/fields" />
      <PageHeader title="Silage & Fields" subtitle="Cuts, expected/actual yield, forage balance and cost" />

      <div className="flex flex-col gap-4">
        <FieldIdentityRow field={field} />
        <SilagePlanCard plan={plan} field={field} />
        <SilageNutrientCostCard plan={plan} allocation={allocation} storageCapacityM3={housing.storageCapacityM3} />
        <FeedValueCard plan={plan} field={field} />
        <WholeFarmFeedBalanceCard inventory={mockForageInventory} />
      </div>
    </AppShell>
  );
}
