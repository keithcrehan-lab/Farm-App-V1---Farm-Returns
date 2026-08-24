import { Euro, Layers, Package, Truck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatEur, formatNumber } from "@/lib/format";
import type { SilagePlan, SlurryAllocation } from "@/domain/types";

export function SilageNutrientCostCard({
  plan,
  allocation,
  storageCapacityM3,
}: {
  plan: SilagePlan;
  allocation?: SlurryAllocation;
  storageCapacityM3: number;
}) {
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Layers} tone="good" />
          <div>
            <CardTitle>Nutrient &amp; cost</CardTitle>
            <p className="text-xs font-medium text-fr-good">Linked to fertiliser plan</p>
          </div>
        </span>
      </CardHeader>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Truck className="mb-1 size-4 text-fr-ink-400" />
          <p className="text-xs text-fr-ink-600">Slurry allocated</p>
          <p className="text-base font-bold text-fr-ink-900">
            {allocation ? formatNumber(allocation.volumeM3, 0) : 0} m³
          </p>
          <p className="text-xs text-fr-ink-400">
            {allocation ? Math.round((allocation.volumeM3 / storageCapacityM3) * 100) : 0}% of storage
          </p>
        </div>
        <div>
          <Package className="mb-1 size-4 text-fr-ink-400" />
          <p className="text-xs text-fr-ink-600">Chemical fertiliser required</p>
          <p className="text-base font-bold text-fr-ink-900">
            {formatNumber(plan.chemicalFertiliserKgNpk, 0)} kg NPK
          </p>
          <p className="text-xs text-fr-good">{formatEur(plan.estimatedFieldCost)}</p>
        </div>
        <div>
          <Euro className="mb-1 size-4 text-fr-ink-400" />
          <p className="text-xs text-fr-ink-600">Estimated field cost</p>
          <p className="text-base font-bold text-fr-ink-900">{formatEur(plan.estimatedFieldCost)}</p>
        </div>
      </div>
    </Card>
  );
}
