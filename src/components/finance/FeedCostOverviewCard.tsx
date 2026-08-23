"use client";

import { FlaskConical, Package, Sprout, Wheat } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { mockFinanceLines, mockFinanceSummary } from "@/data/mock-farm";
import { useLivestockGroups } from "@/store/farm-store";
import { calculateFarmConcentrateFeedCostEur } from "@/domain/finance";
import { formatEur } from "@/lib/format";

const ROW_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Silage: Wheat,
  Concentrates: Package,
  Grass: Sprout,
  Minerals: FlaskConical,
};

export function FeedCostOverviewCard() {
  const livestockGroups = useLivestockGroups();
  // Only "Concentrates" is real yet — a genuine per-group budget from
  // src/domain/livestock.ts's Teagasc-sourced feed engine, summed across
  // every group that has a real model (see calculateFarmConcentrateFeedCostEur's
  // doc comment for exactly which). Silage/Grass/Minerals stay Phase 1
  // mock: no real cost-per-tonne source in hand for those yet (README
  // "known gap").
  const concentrateCost = calculateFarmConcentrateFeedCostEur(livestockGroups);
  const feedLines = mockFinanceLines.filter((l) => l.category === "feed");

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={Sprout} tone="good" />
          <CardTitle>Feed cost overview</CardTitle>
        </span>
      </CardHeader>
      <ul className="flex flex-col gap-2 text-sm">
        {feedLines.map((line) => {
          const Icon = ROW_ICON[line.label] ?? Package;
          const isConcentrates = line.label === "Concentrates";
          const amountEur = isConcentrates ? concentrateCost.value : line.amount.value;
          return (
            <li key={line.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-fr-ink-600">
                <Icon className="size-4 text-fr-ink-400" />
                {line.label}
              </span>
              <span className="flex items-center gap-2">
                {isConcentrates ? <StatusBadge status={concentrateCost.status} /> : null}
                <span className="font-semibold text-fr-ink-900">{formatEur(amountEur)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex items-center justify-between rounded-fr-control bg-fr-good-bg px-3 py-2 text-sm font-medium text-fr-good">
        <span>Potential saving</span>
        <span>{formatEur(mockFinanceSummary.feedPotentialSavingEur)}</span>
      </p>
    </Card>
  );
}
