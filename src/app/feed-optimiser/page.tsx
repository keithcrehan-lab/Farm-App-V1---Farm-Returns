"use client";

import { useState } from "react";
import { Beef, Info } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { Card } from "@/components/ui/Card";
import { FeedGroupSummaryCard } from "@/components/farm/FeedGroupSummaryCard";
import { FeedStrategyCard } from "@/components/farm/FeedStrategyCard";
import { FeedOptimiserFooter } from "@/components/farm/FeedOptimiserFooter";
import { feedOptimiserByGroupId } from "@/data/mock-farm";
import { useLivestockGroups } from "@/store/farm-store";
import {
  calculateLivestockEconomics,
  calculateWeanlingConcentrateStrategies,
  WEANLING_ADG_EVIDENCE_WINDOW_DAYS,
} from "@/domain/livestock";
import { CATTLE_PRICE_EUR_PER_KG_CARCASS, FINISHING_OPTIONS } from "@/app/livestock/[groupId]/LivestockEconomicsView";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { FeedStrategy } from "@/domain/types";

const STEER_GROUP_ID = "lg-continental-steers";
const WEANLING_GROUP_ID = "lg-weanlings";

/**
 * Real, sourced targets for the weanling variable-ADG comparison — the
 * workbook's own "Optimiser_Calculator" worked example was built around
 * this exact farm's weanling starting weight (335kg, mock-farm.ts's
 * lg-weanlings), targeting 420kg over a winter; concentrate price
 * EUR350/t matches that same sheet. See src/domain/livestock.ts's
 * calculateWeanlingConcentrateStrategies doc comment for the evidence.
 */
const WEANLING_STRATEGY_TARGET_WEIGHT_KG = 420;
const WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE = 350;

const GROUP_TABS = [
  { id: STEER_GROUP_ID, label: "Continental Steers" },
  { id: WEANLING_GROUP_ID, label: "Weanlings" },
] as const;

export default function FeedOptimiserPage() {
  const livestockGroups = useLivestockGroups();
  const [activeGroupId, setActiveGroupId] = useState<(typeof GROUP_TABS)[number]["id"]>(STEER_GROUP_ID);
  const [selected, setSelected] = useState<FeedStrategy["id"]>("balanced");

  const group = livestockGroups.find((g) => g.id === activeGroupId);

  // Continental Steers: unchanged fixed-ADG DMD comparison — the source
  // data only ever fixes one target ADG per animal type here, so this
  // stays the Phase 1 mock strategy set (see livestock.ts header comment).
  const finishingOptions = activeGroupId === STEER_GROUP_ID ? FINISHING_OPTIONS[STEER_GROUP_ID] : undefined;
  const economics =
    group && finishingOptions
      ? calculateLivestockEconomics(group, { ...finishingOptions, cattlePriceEurPerKgCarcass: CATTLE_PRICE_EUR_PER_KG_CARCASS })
      : undefined;
  const context = activeGroupId === STEER_GROUP_ID ? feedOptimiserByGroupId(STEER_GROUP_ID) : undefined;

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
  if (activeGroupId === STEER_GROUP_ID && (!economics || !context)) return null;
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
          {(activeGroupId === STEER_GROUP_ID ? context?.strategies : weanlingStrategies)?.map((strategy) => (
            <FeedStrategyCard
              key={strategy.id}
              strategy={strategy}
              selected={selected === strategy.id}
              onSelect={() => setSelected(strategy.id)}
            />
          ))}
        </div>

        {activeGroupId === STEER_GROUP_ID && context ? (
          <FeedOptimiserFooter context={context} />
        ) : (
          <p className="text-center text-xs text-fr-ink-400">
            Based on a {WEANLING_ADG_EVIDENCE_WINDOW_DAYS}-day Teagasc research trial (evidence class B) — real
            observed response points, not a universal recommendation. Cattle price and margin uplift aren&apos;t
            shown here: weanlings aren&apos;t being valued for sale in this comparison, only fed for winter growth.
          </p>
        )}
      </div>
    </>
  );
}
