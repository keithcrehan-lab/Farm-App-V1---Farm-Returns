"use client";

import { useState } from "react";
import { FlaskConical, Package, Sprout, Wheat } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { mockFinanceLines, mockFinanceSummary, mockSilagePlans } from "@/data/mock-farm";
import { useFields, useHousingList, useLivestockGroups } from "@/store/farm-store";
import {
  calculateFarmConcentrateFeedCostEur,
  calculateFarmGrassAndSilageCostEur,
  calculateFarmMineralCostEur,
} from "@/domain/finance";
import { cn } from "@/lib/cn";
import { formatEur } from "@/lib/format";
import type { FeedCostBasis } from "@/domain/feed-cost";

const ROW_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Silage: Wheat,
  Concentrates: Package,
  Grass: Sprout,
  Minerals: FlaskConical,
};

const BASIS_OPTIONS: { id: FeedCostBasis; label: string }[] = [
  { id: "cash", label: "Cash cost" },
  { id: "economic", label: "Economic cost" },
];

export function FeedCostOverviewCard() {
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const housingList = useHousingList();
  const [basis, setBasis] = useState<FeedCostBasis>("cash");

  // Concentrates: a genuine per-group budget from src/domain/livestock.ts's
  // Teagasc-sourced feed engine, summed across every group with a real
  // model. Grass/Silage: real Teagasc Spring 2026 €/t DM benchmarks
  // (src/domain/feed-cost.ts) applied to this farm's real grazing hectares
  // and each field's own silage plan yield — on the cost basis the source
  // sheet's own README calls for ("Use economic vs cash-cost toggle in
  // Finance"), never blended into one number. Minerals: a real €/head/day
  // Teagasc mineral benchmark for the suckler cow group over its real
  // housing-period length — deliberately partial (no benchmark for
  // weanlings/steers/heifers yet), so this is a floor, not the whole
  // farm's mineral bill.
  const concentrateCost = calculateFarmConcentrateFeedCostEur(livestockGroups);
  const { grassCostEur, silageCostEur } = calculateFarmGrassAndSilageCostEur({ fields, silagePlans: mockSilagePlans }, basis);
  const mineralCost = calculateFarmMineralCostEur({ livestockGroups, housingList });
  const feedLines = mockFinanceLines.filter((l) => l.category === "feed");

  const realAmountEur: Partial<Record<string, number>> = {
    Concentrates: concentrateCost.value,
    Grass: grassCostEur.value,
    Silage: silageCostEur.value,
    Minerals: mineralCost.value,
  };
  const realStatus: Partial<Record<string, (typeof concentrateCost)["status"]>> = {
    Concentrates: concentrateCost.status,
    Grass: grassCostEur.status,
    Silage: silageCostEur.status,
    Minerals: mineralCost.status,
  };

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Sprout} tone="good" />
          <CardTitle>Feed cost overview</CardTitle>
        </span>
        <div className="flex gap-1 rounded-full border border-fr-border p-0.5">
          {BASIS_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setBasis(option.id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                basis === option.id ? "bg-fr-green-700 text-white" : "text-fr-ink-600",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <ul className="flex flex-col gap-2 text-sm">
        {feedLines.map((line) => {
          const Icon = ROW_ICON[line.label] ?? Package;
          const amountEur = realAmountEur[line.label] ?? line.amount.value;
          const status = realStatus[line.label];
          return (
            <li key={line.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-fr-ink-600">
                <Icon className="size-4 text-fr-ink-400" />
                {line.label}
              </span>
              <span className="flex items-center gap-2">
                {status ? <StatusBadge status={status} /> : null}
                <span className="font-semibold text-fr-ink-900">{formatEur(amountEur)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-fr-ink-400">
        {basis === "cash"
          ? "Cash cost excludes a land charge — out-of-pocket spend only."
          : "Economic cost includes a land charge — the full opportunity cost of using this land for feed."}
      </p>
      <p className="mt-3 flex items-center justify-between rounded-fr-control bg-fr-good-bg px-3 py-2 text-sm font-medium text-fr-good">
        <span>Potential saving</span>
        <span>{formatEur(mockFinanceSummary.feedPotentialSavingEur)}</span>
      </p>
    </Card>
  );
}
