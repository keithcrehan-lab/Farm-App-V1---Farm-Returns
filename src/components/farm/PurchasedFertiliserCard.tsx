import { Package } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatEur, formatNumber } from "@/lib/format";
import type { NutrientPlan } from "@/domain/types";

export function PurchasedFertiliserCard({
  products,
  estimatedFieldCostEur,
}: {
  products: NutrientPlan["purchasedProducts"];
  estimatedFieldCostEur: number;
}) {
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Package} tone="good" />
          <CardTitle>Purchased fertiliser</CardTitle>
        </span>
      </CardHeader>

      {/* Sized to fit all 5 columns down to a 360px viewport without its
          own scroll — a 3-row table hiding the cost column behind a swipe
          would bury the number farmers care about most. */}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-xs sm:text-sm">
          <thead>
            <tr className="text-left text-fr-ink-600">
              <th className="w-[32%] pb-2 pr-1 font-medium">Product</th>
              <th className="w-[17%] pb-2 pr-1 font-medium">N-P-K</th>
              <th className="w-[13%] pb-2 pr-1 text-right font-medium">Rate</th>
              <th className="w-[19%] pb-2 pr-1 text-right font-medium">kg/ha</th>
              <th className="w-[19%] pb-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.name} className="border-t border-fr-border">
                <td className="py-2 pr-1 font-medium leading-tight text-fr-ink-900">{product.name}</td>
                <td className="py-2 pr-1 text-fr-ink-600">{product.npkAnalysis}</td>
                <td className="py-2 pr-1 text-right text-fr-ink-600">{product.rateKgHa}</td>
                <td className="py-2 pr-1 text-right text-fr-ink-600">{formatNumber(product.totalKg, 1)}</td>
                <td className="py-2 text-right font-semibold text-fr-ink-900">{formatEur(product.costEur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-fr-control bg-fr-good-bg px-4 py-2.5">
        <span className="text-sm font-medium text-fr-good">Estimated field cost</span>
        <span className="text-base font-bold text-fr-good">{formatEur(estimatedFieldCostEur)}</span>
      </div>
    </Card>
  );
}
