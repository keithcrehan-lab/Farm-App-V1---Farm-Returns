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
import { calculateLivestockEconomics, type FinishingAnimalType, type LivestockEconomicsOptions } from "@/domain/livestock";

export const CATTLE_PRICE_EUR_PER_KG_CARCASS =
  mockMarketPrices.find((p) => p.id === "mp-beef")?.price ?? 5.42;

/**
 * Finishing-budget assumptions per group — real, sourced values (Farm
 * Return Teagasc Animal Nutrition Database: DMD-Concentrate + the
 * workbook's own worked Feed-Calculator example), not fabricated. Only
 * groups this dataset covers a finishing/weanling concentrate table for
 * get a real economics view; others fall through to notFound() below, same
 * as before this only had one entry in mock-farm.ts's economics array.
 * Exported so the Livestock list (hasEconomics link gate) and Feed
 * Optimiser (its summary card) share this one registry rather than each
 * re-deciding which groups have a model.
 */
export const FINISHING_OPTIONS: Record<string, Omit<LivestockEconomicsOptions, "cattlePriceEurPerKgCarcass">> = {
  "lg-continental-steers": {
    animalType: "finishing_steer" satisfies FinishingAnimalType,
    targetWeightKg: 650,
    silageDMD: 72,
    concentratePriceEurPerTonne: 350,
  },
};

/**
 * Client view for the /livestock/[groupId] economics screen — split out of
 * page.tsx because the group itself is store state (a farmer-added group
 * won't exist in the build-time mock data generateStaticParams uses), while
 * generateStaticParams must stay in a server module.
 */
export function LivestockEconomicsView({ groupId }: { groupId: string }) {
  const livestockGroups = useLivestockGroups();
  const group = livestockGroups.find((g) => g.id === groupId);
  const finishingOptions = FINISHING_OPTIONS[groupId];
  const economics = group && finishingOptions
    ? calculateLivestockEconomics(group, {
        ...finishingOptions,
        cattlePriceEurPerKgCarcass: CATTLE_PRICE_EUR_PER_KG_CARCASS,
      })
    : undefined;
  if (!group || !economics) notFound();

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
            title={`Concentrate ${FINISHING_OPTIONS[group.id]?.concentratePriceEurPerTonne}/t, cattle ${CATTLE_PRICE_EUR_PER_KG_CARCASS}/kg carcass (Bord Bia) — a full assumptions viewer is a future refinement`}
            className="font-medium text-fr-info/70"
          >
            Market assumptions →
          </button>
        </p>
      </div>
    </>
  );
}
