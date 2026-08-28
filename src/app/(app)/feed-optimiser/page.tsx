"use client";

import { useState } from "react";
import { Beef, Info } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { Card } from "@/components/ui/Card";
import { FeedGroupSummaryCard } from "@/components/farm/FeedGroupSummaryCard";
import { FeedStrategyCard } from "@/components/farm/FeedStrategyCard";
import { useLivestockGroups } from "@/store/farm-store";
import {
  calculateLivestockEconomics,
  calculateSteerConcentrateStrategies,
  calculateWeanlingConcentrateStrategies,
  STEER_CONCENTRATE_PRICE_EUR_PER_TONNE,
  WEANLING_ADG_EVIDENCE_WINDOW_DAYS,
  WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE,
  WEANLING_STRATEGY_TARGET_WEIGHT_KG,
} from "@/domain/livestock";
import { CATTLE_PRICE_EUR_PER_KG_CARCASS, FINISHING_OPTIONS } from "@/app/(app)/livestock/[groupId]/LivestockEconomicsView";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { FeedStrategy } from "@/domain/types";

const STEER_GROUP_ID = "lg-continental-steers";
const WEANLING_GROUP_ID = "lg-weanlings";

const GROUP_TABS = [
  { id: STEER_GROUP_ID, label: "Continental Steers" },
  { id: WEANLING_GROUP_ID, label: "Weanlings" },
] as const;

export default function FeedOptimiserPage() {
  const livestockGroups = useLivestockGroups();
  const [activeGroupId, setActiveGroupId] = useState<(typeof GROUP_TABS)[number]["id"]>(STEER_GROUP_ID);
  const [selected, setSelected] = useState<FeedStrategy["id"]>("balanced");

  const group = livestockGroups.find((g) => g.id === activeGroupId);

  // Continental Steers: the group summary (target/date/margin) still uses
  // the existing fixed-ADG DMD budget (FINISHING_OPTIONS) — the currently
  // "planned" path. The strategy comparison below it is a separate real
  // model: a variable-ADG-by-concentrate curve from real trial evidence,
  // answering "what if I fed more/less concentrate" rather than "what's
  // my current plan worth".
  const finishingOptions = activeGroupId === STEER_GROUP_ID ? FINISHING_OPTIONS[STEER_GROUP_ID] : undefined;
  const economics =
    group && finishingOptions
      ? calculateLivestockEconomics(group, {
          ...finishingOptions,
          pricing: { kind: "per_kg_carcass", cattlePriceEurPerKgCarcass: CATTLE_PRICE_EUR_PER_KG_CARCASS },
        })
      : undefined;
  const steerStrategies =
    activeGroupId === STEER_GROUP_ID && group?.avgWeightKg && finishingOptions
      ? calculateSteerConcentrateStrategies({
          currentWeightKg: group.avgWeightKg.value,
          targetWeightKg: finishingOptions.targetWeightKg,
          concentratePriceEurPerTonne: STEER_CONCENTRATE_PRICE_EUR_PER_TONNE,
        })
      : undefined;

  // Weanlings: real variable-ADG comparison — concentrate level genuinely
  // changes both daily gain and days-to-target here, from Teagasc trial
  // evidence (see calculateWeanlingConcentrateStrategies).
  const weanlingStrategies =
    activeGroupId === WEANLING_GROUP_ID && group?.avgWeightKg
      ? calculateWeanlingConcentrateStrategies({
          currentWeightKg: group.avgWeightKg.value,
          targetWeightKg: WEANLING_STRATEGY_TARGET_WEIGHT_KG,
          concentratePriceEurPerTonne: WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE,
        })
      : undefined;

  if (!group) return null;
  if (activeGroupId === STEER_GROUP_ID && (!economics || !steerStrategies)) return null;
  if (activeGroupId === WEANLING_GROUP_ID && !weanlingStrategies) return null;

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

      <div className="mb-4 flex gap-2">
        {GROUP_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveGroupId(tab.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              activeGroupId === tab.id
                ? "border-fr-green-700 bg-fr-green-700 text-white"
                : "border-fr-border text-fr-ink-600 hover:border-fr-green-700",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {activeGroupId === STEER_GROUP_ID && economics ? (
          <FeedGroupSummaryCard group={group} economics={economics} />
        ) : (
          <Card className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-fr-green-100">
              <Beef className="size-6 text-fr-green-700" />
            </span>
            <div className="flex flex-1 flex-wrap gap-x-8 gap-y-2">
              <p className="basis-full text-base font-bold text-fr-ink-900">
                {formatNumber(group.count.value, 0)} {group.label}
              </p>
              <div>
                <p className="text-xs text-fr-ink-600">Current weight</p>
                <p className="text-lg font-bold text-fr-ink-900">
                  {group.avgWeightKg ? formatNumber(group.avgWeightKg.value, 0) : "—"}
                  <span className="text-sm font-normal text-fr-ink-400"> kg</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-fr-ink-600">Winter target</p>
                <p className="text-lg font-bold text-fr-ink-900">
                  {formatNumber(WEANLING_STRATEGY_TARGET_WEIGHT_KG, 0)}
                  <span className="text-sm font-normal text-fr-ink-400"> kg</span>
                </p>
              </div>
            </div>
          </Card>
        )}

        <h2 className="text-base font-semibold text-fr-ink-900">Compare feeding strategies</h2>
        <div className="flex flex-col gap-3">
          {(activeGroupId === STEER_GROUP_ID ? steerStrategies : weanlingStrategies)?.map((strategy) => (
            <FeedStrategyCard
              key={strategy.id}
              strategy={strategy}
              selected={selected === strategy.id}
              onSelect={() => setSelected(strategy.id)}
            />
          ))}
        </div>

        <p className="text-center text-xs text-fr-ink-400">
          {activeGroupId === STEER_GROUP_ID
            ? "Based on real Teagasc trial evidence (evidence class B-RESEARCH) — genuine experimental response points from different trials, not directly comparable treatments from one single modern study. Modelled scenarios, not Teagasc recommendations."
            : `Based on a ${WEANLING_ADG_EVIDENCE_WINDOW_DAYS}-day Teagasc research trial (evidence class B) — real observed response points, not a universal recommendation. Cattle price and margin uplift aren't shown here: weanlings aren't being valued for sale in this comparison, only fed for winter growth.`}
        </p>
      </div>
    </>
  );
}
