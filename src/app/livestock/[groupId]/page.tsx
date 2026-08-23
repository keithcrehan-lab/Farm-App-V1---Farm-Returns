import { notFound } from "next/navigation";
import { Award } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { GroupIdentityRow } from "@/components/farm/GroupIdentityRow";
import { EconomicsStatRow } from "@/components/farm/EconomicsStatRow";
import { CurrentFeedCostCard } from "@/components/farm/CurrentFeedCostCard";
import { PerformanceForecastCard } from "@/components/farm/PerformanceForecastCard";
import { CostBreakdownCard } from "@/components/farm/CostBreakdownCard";
import { MarginOutlookCard } from "@/components/farm/MarginOutlookCard";
import { livestockEconomicsByGroupId, mockLivestockGroups } from "@/data/mock-farm";

export function generateStaticParams() {
  return mockLivestockGroups.map((g) => ({ groupId: g.id }));
}

export default async function LivestockEconomicsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const group = mockLivestockGroups.find((g) => g.id === groupId);
  const economics = livestockEconomicsByGroupId(groupId);
  if (!group || !economics) notFound();

  return (
    <AppShell>
      <MobileDetailHeader title="Livestock economics" backHref="/livestock" />
      <PageHeader
        title="Livestock Economics"
        subtitle="Current weight/value, feed cost, performance forecast and margin comparison"
      />

      <div className="flex flex-col gap-4">
        <GroupIdentityRow group={group} />
        <EconomicsStatRow group={group} economics={economics} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CurrentFeedCostCard feed={economics.currentFeedCost} />
          <PerformanceForecastCard forecast={economics.performanceForecast} />
        </div>

        <CostBreakdownCard items={economics.costBreakdown} />
        <MarginOutlookCard outlook={economics.marginOutlook} />

        <AlertBanner
          tone="good"
          icon={Award}
          title={economics.recommendation.title}
          description={economics.recommendation.description}
        />

        <p className="text-center text-xs text-fr-ink-400">
          All values are estimates based on current market prices and inputs.{" "}
          <button type="button" disabled title="Arrives with the Phase 4 finance engine" className="font-medium text-fr-info/70">
            Market assumptions →
          </button>
        </p>
      </div>
    </AppShell>
  );
}
