"use client";

import { PageHeader } from "@/components/shell/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { InputRequirementRow } from "@/components/farm/InputRequirementRow";
import { BuyingOpportunityCard } from "@/components/farm/BuyingOpportunityCard";
import { TimelineChart } from "@/components/farm/TimelineChart";
import { mockBuyingOpportunities, mockInputPlannerSummary, mockInputRequirements, mockSilagePlans } from "@/data/mock-farm";
import { useFields, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";
import {
  calculateFarmConcentrateFeedRequirement,
  calculateFarmFertiliserRequirement,
  withRealBuyingOpportunityRequirement,
  withRealInputRequirements,
} from "@/domain/finance";
import { INPUT_CATEGORY_LABEL } from "@/lib/input-category";
import { formatEur } from "@/lib/format";
import type { TimelineEvent } from "@/domain/types";

export default function InputPlannerPage() {
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();

  // Real forecast *demand* (Phase 6's other half — buying-group workflow —
  // stays blocked, no live supplier source; see finance.ts's doc comment).
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
  const buyingOpportunities = withRealBuyingOpportunityRequirement(mockBuyingOpportunities, fertiliserRequirement);

  // Forecast spend now sums the real Fertiliser/Feed rows alongside the
  // still-mock Lime/Bale Wrap/Other ones, so this figure always agrees with
  // the rows below it rather than reading from a separately-frozen mock
  // summary. potentialSavingEur/planningConfidencePct stay mock — no real
  // bulk-buy savings or scheduling-confidence model exists yet.
  const forecastSpendEur = inputRequirements.reduce((sum, r) => sum + r.estCost.value, 0);

  const purchaseTimelineEvents: TimelineEvent[] = inputRequirements.map((input) => {
    const start = new Date(input.requiredByWindow.start);
    const end = new Date(input.requiredByWindow.end);
    return {
      category: INPUT_CATEGORY_LABEL[input.category],
      label: input.label,
      monthStart: start.getUTCMonth(),
      monthEnd: end.getUTCMonth(),
    };
  });

  return (
    <>
      <div className="mb-4 lg:hidden">
        <h1 className="text-title text-fr-ink-900">Input Planner</h1>
        <p className="text-sm text-fr-ink-600">{mockInputPlannerSummary.seasonLabel}</p>
      </div>
      <PageHeader title="Input Planner" subtitle={mockInputPlannerSummary.seasonLabel} />

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard label="Forecast Spend" value={formatEur(forecastSpendEur)} />
          <MetricCard label="Potential Saving" value={formatEur(mockInputPlannerSummary.potentialSavingEur)} />
          <Card className="flex flex-col items-center justify-center gap-1">
            <ScoreRing score={mockInputPlannerSummary.planningConfidencePct} size={72} strokeWidth={6} suffix="" />
            <span className="text-label uppercase tracking-wide text-fr-ink-600">Planning Confidence</span>
          </Card>
        </div>

        <h2 className="text-base font-semibold text-fr-ink-900">All Inputs</h2>
        <div className="flex flex-col gap-3">
          {inputRequirements.map((input) => (
            <InputRequirementRow key={input.id} input={input} />
          ))}
        </div>

        <TimelineChart title="Annual Purchasing Timeline" events={purchaseTimelineEvents} />

        <h2 className="text-base font-semibold text-fr-ink-900">Bulk-buy opportunities</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {buyingOpportunities.map((opp) => (
            <BuyingOpportunityCard key={opp.id} opportunity={opp} />
          ))}
        </div>
      </div>
    </>
  );
}
