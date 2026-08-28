"use client";

import { PageHeader } from "@/components/shell/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { InputRequirementRow } from "@/components/farm/InputRequirementRow";
import { BreakdownToggle } from "@/components/ui/BreakdownToggle";
import { BuyingOpportunityCard } from "@/components/farm/BuyingOpportunityCard";
import { TimelineChart } from "@/components/farm/TimelineChart";
import { mockBuyingOpportunities, mockInputPlannerSummary, mockInputRequirements, mockSilagePlans } from "@/data/mock-farm";
import { useFields, useIsRealMode, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";
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
  const isRealMode = useIsRealMode();

  // Real forecast *demand* (Phase 6's other half — buying-group workflow —
  // stays blocked, no live supplier source; see finance.ts's doc comment).
  const fertiliserRequirement = calculateFarmFertiliserRequirement({
    fields,
    livestockGroups,
    slurryAllocations,
    silagePlans: isRealMode ? [] : mockSilagePlans,
  });
  const concentrateFeedRequirement = calculateFarmConcentrateFeedRequirement(livestockGroups);
  // Codex remediation Priority 3 — a real account only ever sees the
  // Fertiliser/Feed rows/opportunities this app has a real model for; the
  // Lime/Minerals/Silage-inputs/Contractor/Other mock rows and every
  // bulk-buy opportunity (100% Phase 1 illustrative, no live pooling/price
  // feed — see withRealBuyingOpportunityRequirement's own doc comment) are
  // dropped entirely rather than shown unlabelled or "Sample data"-tagged.
  const inputRequirements = withRealInputRequirements(
    mockInputRequirements,
    fertiliserRequirement,
    concentrateFeedRequirement,
    !isRealMode,
  );
  const buyingOpportunities = withRealBuyingOpportunityRequirement(mockBuyingOpportunities, fertiliserRequirement, !isRealMode);

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
        <p className="text-sm text-fr-ink-600">
          {isRealMode ? "Fertiliser and feed forecast for your farm" : mockInputPlannerSummary.seasonLabel}
        </p>
      </div>
      <PageHeader
        title="Input Planner"
        subtitle={isRealMode ? "Fertiliser and feed forecast for your farm" : mockInputPlannerSummary.seasonLabel}
      />

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard label="Forecast Spend" value={formatEur(forecastSpendEur)} />
          {/* Codex remediation Priority 3 — "Potential Saving"/"Planning
           * Confidence" have no defined methodology anywhere in this app
           * (no bulk-buy pricing source, no scheduling-confidence model) —
           * a real account sees "Not yet available" for both, never the
           * demo farm's fabricated figure even with a "Sample data" tag. */}
          <MetricCard
            label="Potential Saving"
            value={formatEur(mockInputPlannerSummary.potentialSavingEur)}
            sampleData={!isRealMode}
            unavailable={isRealMode}
          />
          <Card className="flex flex-col items-center justify-center gap-1">
            <ScoreRing score={0} size={72} strokeWidth={6} suffix="" className="opacity-30" />
            <span className="text-xs text-fr-ink-600">Not yet available</span>
            <span className="text-label uppercase tracking-wide text-fr-ink-600">Planning Confidence</span>
          </Card>
        </div>

        <h2 className="text-base font-semibold text-fr-ink-900">All Inputs</h2>
        <div className="flex flex-col gap-3">
          {inputRequirements.length === 0 ? (
            <p className="rounded-fr-control border border-dashed border-fr-border py-8 text-center text-sm text-fr-ink-600">
              No real fertiliser or feed requirement yet — add fields/livestock and a slurry allocation to see one.
            </p>
          ) : (
            inputRequirements.map((input) => <InputRequirementRow key={input.id} input={input} />)
          )}
        </div>

        {/* Real Mode Completion Phase 15 — "How was this calculated?":
         * the Fertiliser row's total is a sum across every field's real
         * product requirement (`calculateFarmFertiliserRequirement`'s
         * `byProduct`, already computed above) — surfaced here rather
         * than left implicit in the single "Requirement" figure on its row. */}
        {fertiliserRequirement.byProduct.length > 0 ? (
          <BreakdownToggle
            rows={fertiliserRequirement.byProduct.map((p) => ({
              label: p.name,
              valueEur: p.costEur,
              detail: `${p.totalTonnes.toFixed(1)} t, ${p.npkAnalysis}`,
            }))}
            totalEur={fertiliserRequirement.totalCostEur}
          />
        ) : null}

        <TimelineChart title="Annual Purchasing Timeline" events={purchaseTimelineEvents} />

        <h2 className="text-base font-semibold text-fr-ink-900">Bulk-buy opportunities</h2>
        {buyingOpportunities.length === 0 ? (
          <p className="rounded-fr-control border border-dashed border-fr-border py-8 text-center text-sm text-fr-ink-600">
            No live regional bulk-buy pooling or supplier price feed exists yet — this is a confirmed, documented
            blocker, not just unbuilt.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {buyingOpportunities.map((opp) => (
              <BuyingOpportunityCard key={opp.id} opportunity={opp} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
