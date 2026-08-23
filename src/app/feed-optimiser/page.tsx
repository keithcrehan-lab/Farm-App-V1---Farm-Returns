"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { FeedGroupSummaryCard } from "@/components/farm/FeedGroupSummaryCard";
import { FeedStrategyCard } from "@/components/farm/FeedStrategyCard";
import { FeedOptimiserFooter } from "@/components/farm/FeedOptimiserFooter";
import { feedOptimiserByGroupId, livestockEconomicsByGroupId } from "@/data/mock-farm";
import { useLivestockGroups } from "@/store/farm-store";
import type { FeedStrategy } from "@/domain/types";

const GROUP_ID = "lg-continental-steers";

export default function FeedOptimiserPage() {
  const livestockGroups = useLivestockGroups();
  const group = livestockGroups.find((g) => g.id === GROUP_ID);
  const economics = livestockEconomicsByGroupId(GROUP_ID);
  const context = feedOptimiserByGroupId(GROUP_ID);
  const [selected, setSelected] = useState<FeedStrategy["id"]>("balanced");

  if (!group || !economics || !context) return null;

  return (
    <>
      <MobileDetailHeader title="Feed optimiser" backHref="/livestock" />
      <PageHeader
        title="Feed Optimiser"
        subtitle="Lowest cost, balanced and faster-finish feeding strategies"
      />
      <div className="mb-3 hidden items-center gap-1.5 text-xs text-fr-ink-400 lg:flex">
        <Info className="size-3.5" />
        Strategies optimise forecast margin, not just feed cost per tonne — spec §9.
      </div>

      <div className="flex flex-col gap-4">
        <FeedGroupSummaryCard group={group} economics={economics} />

        <h2 className="text-base font-semibold text-fr-ink-900">Compare feeding strategies</h2>
        <div className="flex flex-col gap-3">
          {context.strategies.map((strategy) => (
            <FeedStrategyCard
              key={strategy.id}
              strategy={strategy}
              selected={selected === strategy.id}
              onSelect={() => setSelected(strategy.id)}
            />
          ))}
        </div>

        <FeedOptimiserFooter context={context} />
      </div>
    </>
  );
}
