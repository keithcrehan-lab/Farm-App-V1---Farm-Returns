import { ChevronRight, FlaskConical } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { mockFinanceLines, mockFinanceSummary } from "@/data/mock-farm";
import { formatEur, formatPct } from "@/lib/format";

export function FertiliserSlurryCard() {
  const slurryLine = mockFinanceLines.find((l) => l.label === "Slurry nutrient value");
  const slurryValue = slurryLine?.amount.value ?? 0;
  const pctOfSpend = Math.round((slurryValue / mockFinanceSummary.fertiliserSpendEur) * 100);

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
          <p className="text-metric font-bold text-fr-ink-900">
            {formatEur(mockFinanceSummary.fertiliserSpendEur)}
          </p>
          <p className="text-xs font-medium text-fr-good">
            {formatPct(mockFinanceSummary.fertiliserSpendChangePct)} vs last season
          </p>
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
