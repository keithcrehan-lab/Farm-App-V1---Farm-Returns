"use client";

import { notFound } from "next/navigation";
import { Award } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { GroupIdentityRow } from "@/components/farm/GroupIdentityRow";
import { EconomicsStatRow } from "@/components/farm/EconomicsStatRow";
import { CurrentFeedCostCard } from "@/components/farm/CurrentFeedCostCard";
import { PerformanceForecastCard } from "@/components/farm/PerformanceForecastCard";
import { CostBreakdownCard } from "@/components/farm/CostBreakdownCard";
import { MarginOutlookCard } from "@/components/farm/MarginOutlookCard";
import { mockMarketPrices } from "@/data/mock-farm";
import { useLivestockGroups } from "@/store/farm-store";
import { calculateLivestockEconomics, FINISHING_OPTIONS, finishingOptionsForGroup } from "@/domain/livestock";
import type { FinishingAnimalType, LivestockEconomicsPricing } from "@/domain/livestock";
import { CSO_BULLOCKS_400_449KG, latestPoint, weanlingPriceSeries } from "@/domain/market";

export const CATTLE_PRICE_EUR_PER_KG_CARCASS =
  mockMarketPrices.find((p) => p.id === "mp-beef")?.price ?? 5.42;

// FINISHING_OPTIONS/finishingOptionsForGroup now live in
// src/domain/livestock.ts (a pure domain module, unlike this "use client"
// view file) so src/domain/finance.ts's whole-farm feed cost aggregation
// can reuse the exact same per-farm assumptions instead of re-declaring
// them a third time. Re-exported here so the Livestock list and Feed
// Optimiser screen's existing imports don't need to change.
export { FINISHING_OPTIONS };

/**
 * Per-group pricing mechanism — steers/heifers still use the mock Bord
 * Bia €/kg carcass figure (no real per-kg-carcass series exists), but
 * weanlings get a real one: CSO's own live-mart price at this group's
 * current weight band (300-349kg) and target weight band (400-449kg,
 * `WEANLING_STRATEGY_TARGET_WEIGHT_KG`'s 420kg) — two real, different
 * prices at two real, different weights, not one rate applied twice.
 *
 * Codex remediation Priority 4 — keyed by the group's real classified
 * animal type, not its id, so a real farm's own weanling group (any
 * Supabase UUID) gets the real CSO pricing too, not just the one demo
 * group that happened to be named "lg-weanlings".
 */
function pricingFor(animalType: FinishingAnimalType): LivestockEconomicsPricing {
  if (animalType === "weanling") {
    return {
      kind: "mart_price_per_head",
      sellNowValueEurPerHead: Math.round(latestPoint(weanlingPriceSeries()).value),
      forecastSaleValueEurPerHead: Math.round(latestPoint(CSO_BULLOCKS_400_449KG).value),
    };
  }
  return { kind: "per_kg_carcass", cattlePriceEurPerKgCarcass: CATTLE_PRICE_EUR_PER_KG_CARCASS };
}

/**
 * Client view for the /livestock/[groupId] economics screen — split out of
 * page.tsx because the group itself is store state (a farmer-added group
 * won't exist in the build-time mock data generateStaticParams uses), while
 * generateStaticParams must stay in a server module.
 */
export function LivestockEconomicsView({ groupId }: { groupId: string }) {
  const livestockGroups = useLivestockGroups();
  const group = livestockGroups.find((g) => g.id === groupId);
  const finishingOptionsOutcome = group ? finishingOptionsForGroup(group) : undefined;
  const finishingOptions = finishingOptionsOutcome?.status === "OK" ? finishingOptionsOutcome.value : undefined;
  const pricing = pricingFor(finishingOptions?.animalType ?? "finishing_steer");
  const economics = group && finishingOptions
    ? calculateLivestockEconomics(group, { ...finishingOptions, pricing })
    : undefined;
  if (!group || !economics) notFound();

  const pricingAssumptionText =
    pricing.kind === "mart_price_per_head"
      ? `Concentrate ${finishingOptions?.concentratePriceEurPerTonne}/t, cattle from real CSO live-mart prices (€${pricing.sellNowValueEurPerHead}/hd now, €${pricing.forecastSaleValueEurPerHead}/hd at target weight)`
      : `Concentrate ${finishingOptions?.concentratePriceEurPerTonne}/t, cattle €${CATTLE_PRICE_EUR_PER_KG_CARCASS}/kg carcass (Bord Bia)`;

  return (
    <>
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
          <button
            type="button"
            disabled
            title={`${pricingAssumptionText} — a full assumptions viewer is a future refinement`}
            className="font-medium text-fr-info/70"
          >
            Market assumptions →
          </button>
        </p>
      </div>
    </>
  );
}
