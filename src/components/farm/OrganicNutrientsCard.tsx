import { Beef } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatNumber } from "@/lib/format";
import type { NutrientPlan } from "@/domain/types";

const NUTRIENT_COLOR: Record<"offsetN" | "offsetP" | "offsetK", string> = {
  offsetN: "text-fr-info",
  offsetP: "text-fr-attention",
  offsetK: "text-fr-risk",
};

export function OrganicNutrientsCard({ organic }: { organic: NutrientPlan["organicApplication"] }) {
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Beef} tone="good" />
          <CardTitle>Organic nutrients</CardTitle>
        </span>
      </CardHeader>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div>
          <p className="text-xs text-fr-ink-600">Planned slurry application</p>
          <p className="text-lg font-bold text-fr-ink-900">
            {formatNumber(organic.rateM3ha, 0)} <span className="text-sm font-normal text-fr-ink-400">m³/ha</span>
          </p>
          <p className="text-xs font-medium text-fr-good">Total: {formatNumber(organic.totalM3, 0)} m³</p>
        </div>
        <div>
          <p className="mb-1.5 text-xs text-fr-ink-600">Nutrient offset from slurry</p>
          <div className="flex gap-5">
            {(["offsetN", "offsetP", "offsetK"] as const).map((key) => (
              <div key={key}>
                <p className={`text-xs font-bold ${NUTRIENT_COLOR[key]}`}>{key.replace("offset", "")}</p>
                <p className="text-base font-bold text-fr-ink-900">{formatNumber(organic[key], 0)}</p>
                <p className="text-xs text-fr-ink-400">kg/ha</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
