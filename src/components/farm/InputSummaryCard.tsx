"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { mockInputRequirements, mockSilagePlans } from "@/data/mock-farm";
import { useFields, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";
import {
  calculateFarmConcentrateFeedRequirement,
  calculateFarmFertiliserRequirement,
  withRealInputRequirements,
} from "@/domain/finance";
import { formatEur, formatNumber } from "@/lib/format";

/**
 * Dashboard rollup of the same rows `/input-planner` shows — shares
 * `withRealInputRequirements` rather than its own copy of `mockInputRequirements`
 * so the two screens can never disagree on the real Fertiliser/Feed figures.
 */
export function InputSummaryCard() {
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();

  const fertiliserRequirement = calculateFarmFertiliserRequirement({
    fields,
    livestockGroups,
    slurryAllocations,
    silagePlans: mockSilagePlans,
  });
  const concentrateFeedRequirement = calculateFarmConcentrateFeedRequirement(livestockGroups);
  const inputRequirements = withRealInputRequirements(
    mockInputRequirements,
    fertiliserRequirement,
    concentrateFeedRequirement,
  );
  const forecastSpendEur = inputRequirements.reduce((sum, r) => sum + r.estCost.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Input Summary</CardTitle>
        <span className="text-xs text-fr-ink-400">2026 Requirements</span>
      </CardHeader>
      <ul className="flex flex-col gap-2 text-sm">
        {inputRequirements.map((input) => (
          <li key={input.id} className="flex items-center justify-between">
            <span className="text-fr-ink-600">{input.label}</span>
            <span className="flex items-baseline gap-3">
              <span className="text-fr-ink-400">
                {formatNumber(input.requiredQty.value, 1)} {input.unit}
              </span>
              <span className="w-16 text-right font-semibold text-fr-ink-900">
                {formatEur(input.estCost.value)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-fr-border pt-3 text-sm font-semibold text-fr-ink-900">
        <span>Total</span>
        <span>{formatEur(forecastSpendEur)}</span>
      </div>
      <Link href="/input-planner" className="mt-4 inline-block text-sm font-medium text-fr-green-700">
        View input planner →
      </Link>
    </Card>
  );
}
