import { PageHeader } from "@/components/shell/PageHeader";
import { MarginHeroCard } from "@/components/finance/MarginHeroCard";
import { LivestockValueCard } from "@/components/finance/LivestockValueCard";
import { FeedCostOverviewCard } from "@/components/finance/FeedCostOverviewCard";
import { FertiliserSlurryCard } from "@/components/finance/FertiliserSlurryCard";
import { CashflowCard } from "@/components/finance/CashflowCard";
import { BestOpportunitiesCard } from "@/components/finance/BestOpportunitiesCard";
import { FinancialAssumptionsCard } from "@/components/finance/FinancialAssumptionsCard";
import { FinancePositionSummary } from "@/components/finance/FinancePositionSummary";
import { ProgressiveDisclosure } from "@/components/ui/ProgressiveDisclosure";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFinancialAssumptionsForFarm } from "@/lib/farm-data/financial-assumptions";
import { listSupplierQuotesForFarm, type SupplierQuote } from "@/lib/farm-data/supplier-quotes";

export default async function FinancePage() {
  const supabaseConfigured = isSupabaseConfigured();
  const farm = supabaseConfigured ? await getFarmForCurrentUser() : null;
  const assumptions = farm ? await listFinancialAssumptionsForFarm(farm.id) : [];

  let supplierQuotes: SupplierQuote[] = [];
  if (farm) {
    try {
      supplierQuotes = await listSupplierQuotesForFarm(farm.id);
    } catch {
      // Quote storage is supplementary. Finance remains usable if that
      // migration/source is temporarily unavailable.
    }
  }

  return (
    <>
      <h1 className="mb-1 text-title text-fr-ink-900 lg:hidden">Finance</h1>
      <p className="mb-4 text-sm text-fr-ink-600 lg:hidden">Known value, costs and price evidence</p>
      <PageHeader title="Finance" subtitle="Known farm value and costs first. Forecasts appear only when the evidence exists." />

      {farm ? (
        <div className="flex flex-col">
          <FinancePositionSummary assumptionCount={assumptions.length} quoteCount={supplierQuotes.length} />

          <ProgressiveDisclosure
            label="1 · Livestock assets"
            summary="Current cattle value from the livestock records already held by Farm Return"
            status="neutral"
            defaultOpen
          >
            <LivestockValueCard />
          </ProgressiveDisclosure>

          <ProgressiveDisclosure
            label="2 · Farm input costs"
            summary="Feed, fertiliser and slurry economics calculated from the farm records and available evidence"
            status="neutral"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <FeedCostOverviewCard assumptions={assumptions} />
              <FertiliserSlurryCard />
            </div>
          </ProgressiveDisclosure>

          <ProgressiveDisclosure
            label="3 · Prices & assumptions"
            summary={`${assumptions.length} assumption${assumptions.length === 1 ? "" : "s"} · ${supplierQuotes.length} supplier quote${supplierQuotes.length === 1 ? "" : "s"}`}
            status={assumptions.length > 0 || supplierQuotes.length > 0 ? "good" : "attention"}
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.65fr)]">
              <FinancialAssumptionsCard farmId={farm.id} farmerName={farm.ownerName} assumptions={assumptions} />
              <div className="rounded-fr-card border border-fr-border bg-fr-surface p-4">
                <p className="text-sm font-semibold text-fr-ink-900">Supplier quotes</p>
                <p className="mt-1 text-2xl font-bold text-fr-ink-900">{supplierQuotes.length}</p>
                <p className="mt-1 text-xs leading-relaxed text-fr-ink-600">Quotes are captured once in Market/Quotes. Finance reads that evidence rather than asking you to enter the same supplier price again.</p>
                <a href="/quotes" className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-fr-green-700 underline underline-offset-2">Open supplier quotes →</a>
              </div>
            </div>
          </ProgressiveDisclosure>

          <ProgressiveDisclosure
            label="4 · Cashflow & margin"
            summary="Not calculated yet · real revenue and payment timing are not recorded"
            status="neutral"
          >
            <div className="border-l-[3px] border-fr-v2-gold pl-4">
              <p className="text-sm font-semibold text-fr-ink-900">Cashflow is waiting for real transaction evidence</p>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fr-ink-600">
                Farm Return will not invent revenue, payment dates or margin. Once sales, scheme receipts and other cash movements are captured, this section can become the monthly cashflow view without changing the cost records above.
              </p>
            </div>
          </ProgressiveDisclosure>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <MarginHeroCard detailed />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <LivestockValueCard />
            <FeedCostOverviewCard assumptions={assumptions} />
            <FertiliserSlurryCard />
            <CashflowCard />
          </div>
          <BestOpportunitiesCard />
        </div>
      )}
    </>
  );
}
