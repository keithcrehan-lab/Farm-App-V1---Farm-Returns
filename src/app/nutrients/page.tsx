"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { FieldIdentityRow } from "@/components/farm/FieldIdentityRow";
import { SoilProfileCard } from "@/components/farm/SoilProfileCard";
import { FertilityAssumptionsCard } from "@/components/farm/FertilityAssumptionsCard";
import { NutrientRequirementCard } from "@/components/farm/NutrientRequirementCard";
import { NapComplianceCard } from "@/components/farm/NapComplianceCard";
import { OrganicNutrientsCard } from "@/components/farm/OrganicNutrientsCard";
import { PurchasedFertiliserCard } from "@/components/farm/PurchasedFertiliserCard";
import { mockSilagePlans } from "@/data/mock-farm";
import { useFields, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { cn } from "@/lib/cn";

export default function NutrientsPage() {
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>(undefined);

  const field = fields.find((f) => f.id === selectedFieldId) ?? fields[0];
  if (!field) return null;

  // Net grassland area (grazing + silage) across the farm — the
  // denominator the Green Book's stocking-rate tables use throughout
  // (docs/agronomy-engine.md, src/domain/nutrients.ts). This mock farm has
  // no tillage fields, so every field counts.
  const farmGrasslandAreaHa = fields.reduce((sum, f) => sum + f.areaHa, 0);
  const silagePlan = mockSilagePlans.find((p) => p.fieldId === field.id);
  const slurryAllocation = slurryAllocations.find((a) => a.fieldId === field.id);

  // V3 closure pass, Priority 1 (AF011): real non-grass eligible area,
  // computed from the actual farm's fields rather than assumed — feeds
  // checkNapCompliance's high-rate-N eligibility gate. This mock farm has
  // no tillage fields today, so this evaluates to 0 (safe default), but
  // the wiring is real/general for any future farm data.
  const totalFarmAreaHa = fields.reduce((sum, f) => sum + f.areaHa, 0);
  const nonGrassAreaHa = fields
    .filter((f) => f.plannedUse.value === "tillage")
    .reduce((sum, f) => sum + f.areaHa, 0);
  const nonGrassPct = totalFarmAreaHa > 0 ? (nonGrassAreaHa / totalFarmAreaHa) * 100 : 0;

  const plan = calculateNutrientPlan({
    field,
    farmGrasslandAreaHa,
    livestockGroups,
    slurryAllocation,
    nonGrassPct,
    silage: silagePlan
      ? {
          cutNumber: silagePlan.cutNumber,
          expectedYieldTDMha: silagePlan.expectedYieldTDMha.value,
          intendedUse: silagePlan.intendedUse,
          // V3 fix (audit conflict #5): the sale-route NAP ceiling needs
          // written evidence of sale, not just intendedUse — see
          // checkNapCompliance's own doc comment.
          saleEvidence: silagePlan.saleEvidence ? { hasWrittenEvidence: silagePlan.saleEvidence.value.hasWrittenEvidence } : undefined,
        }
      : undefined,
  });

  return (
    <>
      <MobileDetailHeader title="Nutrient planner" backHref="/fields" />
      <PageHeader title="Fertiliser Plan" subtitle="N/P/K requirement, slurry offset, products and field cost" />

      {/* Field selector — the nutrient engine computes a real plan for
       * whichever field is picked (Phase 3: docs/product-requirements.md
       * exit gate "known test cases independently validated"), not just
       * the one field Phase 1's mock data hardcoded. */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto">
        {fields.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelectedFieldId(f.id)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              f.id === field.id
                ? "border-fr-green-700 text-fr-green-700"
                : "border-fr-border text-fr-ink-600",
            )}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <FieldIdentityRow field={field} />
        <SoilProfileCard soil={field.mappedSoil} />
        <FertilityAssumptionsCard fieldId={field.id} fertility={field.fertility} />
        <NutrientRequirementCard plan={plan} field={field} />
        <NapComplianceCard compliance={plan.napCompliance} />
        <OrganicNutrientsCard organic={plan.organicApplication} />
        <PurchasedFertiliserCard products={plan.purchasedProducts} estimatedFieldCostEur={plan.estimatedFieldCostEur} />
      </div>
    </>
  );
}
