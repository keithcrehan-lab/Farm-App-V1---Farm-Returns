import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { FieldIdentityRow } from "@/components/farm/FieldIdentityRow";
import { SoilProfileCard } from "@/components/farm/SoilProfileCard";
import { FertilityAssumptionsCard } from "@/components/farm/FertilityAssumptionsCard";
import { NutrientRequirementCard } from "@/components/farm/NutrientRequirementCard";
import { OrganicNutrientsCard } from "@/components/farm/OrganicNutrientsCard";
import { PurchasedFertiliserCard } from "@/components/farm/PurchasedFertiliserCard";
import { fieldById, mockNutrientPlans } from "@/data/mock-farm";

export default function NutrientsPage() {
  const plan = mockNutrientPlans[0];
  const field = fieldById(plan.fieldId);
  if (!field) return null;

  return (
    <AppShell>
      <MobileDetailHeader title="Nutrient planner" backHref="/fields" />
      <PageHeader title="Fertiliser Plan" subtitle="N/P/K requirement, slurry offset, products and field cost" />

      <div className="flex flex-col gap-4">
        <FieldIdentityRow field={field} />
        <SoilProfileCard soil={field.mappedSoil} />
        <FertilityAssumptionsCard fertility={field.fertility} />
        <NutrientRequirementCard plan={plan} field={field} />
        <OrganicNutrientsCard organic={plan.organicApplication} />
        <PurchasedFertiliserCard products={plan.purchasedProducts} estimatedFieldCostEur={plan.estimatedFieldCostEur} />
      </div>
    </AppShell>
  );
}
