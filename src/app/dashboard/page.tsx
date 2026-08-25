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
import { MarketWatchCard } from "@/components/farm/MarketWatchCard";
import { MarginHeroCard } from "@/components/finance/MarginHeroCard";
import { FinancialOverviewCard } from "@/components/finance/FinancialOverviewCard";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { mockFarmStats, mockInputPlannerSummary, mockSilagePlans, mockTimeline } from "@/data/mock-farm";
import { useFarm, useFields, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";
import { calculateFarmFertiliserCostEur } from "@/domain/finance";
import { calculateFarmCoverageStats } from "@/domain/farm-stats";
import { formatEur } from "@/lib/format";

export default function DashboardPage() {
  const farm = useFarm();
  const fields = useFields();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const fertiliserCost = calculateFarmFertiliserCostEur({
    fields,
    livestockGroups,
    slurryAllocations,
    silagePlans: mockSilagePlans,
  });
  const { totalFieldsMapped } = calculateFarmCoverageStats(fields);
  return (
    <>
      <MobileGreetingHeader />
      <PageHeader title="Dashboard" subtitle="Overview of your farm performance" />

      {/* Desktop KPI row */}
      <div className="mb-6 hidden gap-4 lg:grid lg:grid-cols-5">
        <div className="lg:col-span-1">
          <MarginHeroCard />
        </div>
        <MetricCard label="Total Revenue" value={formatEur(121_400)} changePct={8} icon={TrendingUp} />
        <MetricCard
          label="Total Costs"
          value={formatEur(73_580)}
          changePct={-3}
          changeIsGoodWhenNegative
          icon={Coins}
        />
        <Card className="flex flex-col items-center justify-center gap-1">
          <ScoreRing
            score={mockFarmStats.planConfidencePct}
            size={72}
            strokeWidth={6}
            suffix=""
          />
          <span className="text-label uppercase tracking-wide text-fr-ink-600">Plan Confidence</span>
        </Card>
        <Card className="flex flex-col items-center justify-center gap-1">
          <span className="text-metric font-bold text-fr-good">{mockFarmStats.carbonGrade}</span>
          <span className="text-xs text-fr-ink-600">{mockFarmStats.carbonGradeLabel}</span>
          <span className="text-label uppercase tracking-wide text-fr-ink-600">Carbon Score</span>
        </Card>
      </div>

      {/* Mobile-only cards */}
      <div className="flex min-w-0 flex-col gap-4 lg:hidden">
        <BestSpreadingCard />
        <FarmMapCard />
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Fertiliser cost" value={formatEur(fertiliserCost.value)} icon={Coins} />
          <MetricCard label="Slurry available" value="2,850 m³" icon={Droplets} />
          <MetricCard label="Mapped fields" value={String(totalFieldsMapped)} icon={MapPinned} />
          <MetricCard
            label="Savings potential"
            value={formatEur(mockInputPlannerSummary.potentialSavingEur)}
            icon={TrendingUp}
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
          <TimelineChart title="Upcoming Timeline" events={mockTimeline} />
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
