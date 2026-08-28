"use client";

import { Coins, Droplets, MapPinned, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileGreetingHeader } from "@/components/farm/MobileGreetingHeader";
import { BestSpreadingCard } from "@/components/farm/BestSpreadingCard";
import { FarmMapCard } from "@/components/farm/FarmMapCard";
import { LivestockOverviewCard } from "@/components/farm/LivestockOverviewCard";
import { AlertsCard } from "@/components/farm/AlertsCard";
import { TimelineChart } from "@/components/farm/TimelineChart";
import { InputSummaryCard } from "@/components/farm/InputSummaryCard";
import { SetupProgressCard } from "@/components/farm/SetupProgressCard";
import { MarketWatchCard } from "@/components/farm/MarketWatchCard";
import { MarginHeroCard } from "@/components/finance/MarginHeroCard";
import { FinancialOverviewCard } from "@/components/finance/FinancialOverviewCard";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { mockInputPlannerSummary, mockSilagePlans, mockTimeline } from "@/data/mock-farm";
import { useFarm, useFields, useHousingList, useIsRealMode, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";
import { calculateFarmFertiliserCostEur } from "@/domain/finance";
import { calculateFarmCoverageStats, calculateFarmSlurryAvailableM3 } from "@/domain/farm-stats";
import { formatEur, formatNumber } from "@/lib/format";

export default function DashboardPage() {
  const farm = useFarm();
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const housing = useHousingList();
  const isRealMode = useIsRealMode();
  const fertiliserCost = calculateFarmFertiliserCostEur({
    fields,
    livestockGroups,
    slurryAllocations,
    // Codex remediation Priority 3 — see FeedCostOverviewCard's identical
    // comment: a real farm's real fields never match mockSilagePlans's
    // demo ids, so `[]` is the honest equivalent, not a relied-upon
    // coincidental mismatch.
    silagePlans: isRealMode ? [] : mockSilagePlans,
  });
  const { totalFieldsMapped } = calculateFarmCoverageStats(fields);
  const slurryAvailableM3 = calculateFarmSlurryAvailableM3(housing);
  return (
    <>
      <MobileGreetingHeader />
      <PageHeader title="Dashboard" subtitle="Overview of your farm performance" />

      <div className="mb-4">
        <SetupProgressCard fields={fields} livestockGroups={livestockGroups} housing={housing} />
      </div>

      {/* Desktop KPI row */}
      <div className="mb-6 hidden gap-4 lg:grid lg:grid-cols-5">
        <div className="lg:col-span-1">
          <MarginHeroCard />
        </div>
        {/* Codex remediation Priority 3: no real sales-log/revenue-tracking
            feature exists in this app yet (see lib/reports.ts's own
            comment) — a real account sees "Not yet available", never a
            labelled fabricated figure; mock mode keeps the illustrative
            values, labelled, unchanged. */}
        <MetricCard
          label="Total Revenue"
          value={formatEur(121_400)}
          icon={TrendingUp}
          sampleData={!isRealMode}
          unavailable={isRealMode}
        />
        <MetricCard
          label="Total Costs"
          value={formatEur(73_580)}
          icon={Coins}
          sampleData={!isRealMode}
          unavailable={isRealMode}
        />
        {/* "Plan Confidence"/"Carbon Score" have no defined methodology
            anywhere in this app's spec — not even a planned future
            feature — so an honest "not yet available" state replaces the
            previous fabricated 82%/B+ values, per Priority 8's "replace
            with an appropriate unavailable/evidence-required state". */}
        <Card className="flex flex-col items-center justify-center gap-1">
          <ScoreRing score={0} size={72} strokeWidth={6} suffix="" className="opacity-30" />
          <span className="text-xs text-fr-ink-600">Not yet available</span>
          <span className="text-label uppercase tracking-wide text-fr-ink-600">Plan Confidence</span>
        </Card>
        <Card className="flex flex-col items-center justify-center gap-1">
          <span className="text-metric font-bold text-fr-ink-400">—</span>
          <span className="text-xs text-fr-ink-600">Not yet available</span>
          <span className="text-label uppercase tracking-wide text-fr-ink-600">Carbon Score</span>
        </Card>
      </div>

      {/* Mobile-only cards */}
      <div className="flex min-w-0 flex-col gap-4 lg:hidden">
        <BestSpreadingCard />
        <FarmMapCard />
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Fertiliser cost" value={formatEur(fertiliserCost.value)} icon={Coins} />
          <MetricCard label="Slurry available" value={`${formatNumber(slurryAvailableM3, 0)} m³`} icon={Droplets} />
          <MetricCard label="Mapped fields" value={String(totalFieldsMapped)} icon={MapPinned} />
          {/* Codex remediation Priority 3 — this figure has no real Input
              Planner forecast/purchasing-log behind it (see
              lib/reports.ts's own comment on why a real savings figure
              doesn't exist yet). Real account: "Not yet available". */}
          <MetricCard
            label="Savings potential"
            value={formatEur(mockInputPlannerSummary.potentialSavingEur)}
            icon={TrendingUp}
            sampleData={!isRealMode}
            unavailable={isRealMode}
          />
        </div>
        <MarginHeroCard />
      </div>

      {/* Shared content — reflows from stacked (mobile) to grid (desktop) */}
      <div className="mt-4 flex min-w-0 flex-col gap-4 lg:mt-0 lg:grid lg:grid-cols-4 lg:gap-5">
        <div className="lg:col-span-2">
          <div className="hidden lg:block">
            <FarmMapCard />
          </div>
        </div>
        <LivestockOverviewCard />
        <FinancialOverviewCard />

        <div className="min-w-0 lg:col-span-2">
          <AlertsCard />
        </div>
        <div className="min-w-0 lg:col-span-2">
          {/* Codex remediation Priority 3 — mockTimeline is Phase 1 demo
              data with no real farm activity behind it; a real account
              gets an empty timeline (TimelineChart's own "no planned
              activities" state), not the demo farm's fabricated schedule. */}
          <TimelineChart title="Upcoming Timeline" events={isRealMode ? [] : mockTimeline} />
        </div>

        <div className="min-w-0 lg:col-span-2">
          <InputSummaryCard />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <MarketWatchCard />
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-fr-ink-400 lg:hidden">{farm.name}</p>
    </>
  );
}
