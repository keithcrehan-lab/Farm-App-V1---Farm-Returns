import { PageHeader } from "@/components/shell/PageHeader";
import { MarginHeroCard } from "@/components/finance/MarginHeroCard";
import { LivestockValueCard } from "@/components/finance/LivestockValueCard";
import { FeedCostOverviewCard } from "@/components/finance/FeedCostOverviewCard";
import { FertiliserSlurryCard } from "@/components/finance/FertiliserSlurryCard";
import { CashflowCard } from "@/components/finance/CashflowCard";
import { BestOpportunitiesCard } from "@/components/finance/BestOpportunitiesCard";
import { FinancialAssumptionsCard } from "@/components/finance/FinancialAssumptionsCard";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFinancialAssumptionsForFarm } from "@/lib/farm-data/financial-assumptions";

export default async function FinancePage() {
  const supabaseConfigured = isSupabaseConfigured();
  const farm = supabaseConfigured ? await getFarmForCurrentUser() : null;
  const assumptions = farm ? await listFinancialAssumptionsForFarm(farm.id) : [];

  return (
    <>
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

        {farm ? (
          <FinancialAssumptionsCard farmId={farm.id} farmerName={farm.ownerName} assumptions={assumptions} />
        ) : null}

        <BestOpportunitiesCard />
      </div>
    </>
  );
}
