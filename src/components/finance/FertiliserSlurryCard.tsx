"use client";

import { ChevronRight, FlaskConical } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { mockFinanceLines, mockSilagePlans } from "@/data/mock-farm";
import { useFields, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";
import { calculateFarmFertiliserCostEur } from "@/domain/finance";
import { formatEur } from "@/lib/format";

export function FertiliserSlurryCard() {
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const fertiliserCost = calculateFarmFertiliserCostEur({
    fields,
    livestockGroups,
    slurryAllocations,
    silagePlans: mockSilagePlans,
  });
  // Slurry's cash-equivalent value isn't computed yet (needs a nutrient
  // replacement-cost model — a follow-up, not invented here); kept as the
  // existing Phase 1 placeholder pending that.
  const slurryLine = mockFinanceLines.find((l) => l.label === "Slurry nutrient value");
  const slurryValue = slurryLine?.amount.value ?? 0;
  const pctOfSpend = fertiliserCost.value > 0 ? Math.round((slurryValue / fertiliserCost.value) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={FlaskConical} tone="good" />
          <CardTitle>Fertiliser & slurry</CardTitle>
        </span>
        <ChevronRight className="size-4 text-fr-ink-400" />
      </CardHeader>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs text-fr-ink-600">Estimated fertiliser spend</p>
          <p className="text-metric font-bold text-fr-ink-900">{formatEur(fertiliserCost.value)}</p>
          <StatusBadge status={fertiliserCost.status} className="mt-1" />
        </div>
        <div className="border-t border-fr-border pt-3">
          <p className="text-xs text-fr-ink-600">Slurry nutrient value</p>
          <p className="text-lg font-bold text-fr-ink-900">{formatEur(slurryValue)}</p>
          <p className="text-xs text-fr-ink-400">{pctOfSpend}% of fertiliser spend</p>
        </div>
      </div>
    </Card>
  );
}
