import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { MarginHeroCard } from "@/components/finance/MarginHeroCard";
import { LivestockValueCard } from "@/components/finance/LivestockValueCard";
import { FeedCostOverviewCard } from "@/components/finance/FeedCostOverviewCard";
import { FertiliserSlurryCard } from "@/components/finance/FertiliserSlurryCard";
import { CashflowCard } from "@/components/finance/CashflowCard";
import { BestOpportunitiesCard } from "@/components/finance/BestOpportunitiesCard";

export default function FinancePage() {
  return (
    <AppShell>
      <h1 className="mb-1 text-title text-fr-ink-900 lg:hidden">Finance</h1>
      <p className="mb-4 text-sm text-fr-ink-600 lg:hidden">Your farm financial overview</p>
      <PageHeader title="Finance" subtitle="Revenue, cost, margin, cashflow and enterprise economics" />

      <div className="flex flex-col gap-4">
        <MarginHeroCard detailed />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LivestockValueCard />
          <FeedCostOverviewCard />
          <FertiliserSlurryCard />
          <CashflowCard />
        </div>

        <BestOpportunitiesCard />
      </div>
    </AppShell>
  );
}
