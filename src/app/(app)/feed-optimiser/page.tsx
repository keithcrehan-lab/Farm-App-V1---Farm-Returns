"use client";

import { useState } from "react";
import { Beef, Info, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { FeedGroupSummaryCard } from "@/components/farm/FeedGroupSummaryCard";
import { FeedStrategyCard } from "@/components/farm/FeedStrategyCard";
import { useIsRealMode, useLivestockGroups } from "@/store/farm-store";
import {
  calculateLivestockEconomics,
  calculateSteerConcentrateStrategies,
  calculateWeanlingConcentrateStrategies,
  classifyFinishingAnimalType,
  finishingOptionsForGroup,
  STEER_CONCENTRATE_PRICE_EUR_PER_TONNE,
  WEANLING_ADG_EVIDENCE_WINDOW_DAYS,
  WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE,
  WEANLING_STRATEGY_TARGET_WEIGHT_KG,
} from "@/domain/livestock";
import { CATTLE_PRICE_EUR_PER_KG_CARCASS } from "@/app/(app)/livestock/[groupId]/LivestockEconomicsView";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { FeedStrategy, LivestockGroup } from "@/domain/types";

/**
 * Codex remediation Priority 4 — real livestock-group routing. Group tabs
 * are built from this farm's actual `useLivestockGroups()` (any real
 * Supabase UUID-backed group), never a fixed two-entry list of mock ids.
 * Eligibility for a strategy comparison is decided by
 * `classifyFinishingAnimalType`/`finishingOptionsForGroup` — real
 * category/goal characteristics, not `group.id`. A group that doesn't
 * classify (wrong category/goal) or classifies but has no evidenced
 * finishing budget yet (e.g. `finishing_heifer` — see `FINISHING_OPTIONS`'s
 * own doc comment) still gets a real, visible tab with a clear
 * unsupported/missing-evidence explanation — never silently dropped or
 * treated as a zero-cost group.
 */
export default function FeedOptimiserPage() {
  const livestockGroups = useLivestockGroups();
  const isRealMode = useIsRealMode();
  const [activeGroupId, setActiveGroupId] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<FeedStrategy["id"]>("balanced");

  const effectiveGroupId = activeGroupId ?? livestockGroups[0]?.id;
  const group = livestockGroups.find((g) => g.id === effectiveGroupId);

  if (livestockGroups.length === 0 || !group) {
    return (
      <>
        <MobileDetailHeader title="Feed optimiser" backHref="/livestock" />
        <PageHeader title="Feed Optimiser" subtitle="Lowest cost, balanced and faster-finish feeding strategies" />
        <div className="flex flex-col items-center gap-3 rounded-fr-card border border-dashed border-fr-border py-12 text-center">
          <Beef className="size-8 text-fr-ink-400" />
          <p className="text-sm font-medium text-fr-ink-900">No livestock groups yet</p>
          <p className="max-w-sm text-sm text-fr-ink-600">
            Add a livestock group on the Livestock screen to see feeding strategies for it here.
          </p>
        </div>
      </>
    );
  }

  const animalTypeOutcome = classifyFinishingAnimalType(group);
  const finishingOptionsOutcome = finishingOptionsForGroup(group);
  const isWeanling = animalTypeOutcome.status === "OK" && animalTypeOutcome.value === "weanling";
  const isSteer = animalTypeOutcome.status === "OK" && animalTypeOutcome.value === "finishing_steer";
  const supported = finishingOptionsOutcome.status === "OK" && (isWeanling || isSteer) && group.avgWeightKg !== undefined;

  // Authenticated Real-Data Stabilisation Phase, Codex audit round 1
  // (CRITICAL): `CATTLE_PRICE_EUR_PER_KG_CARCASS` is a mock Bord Bia
  // constant (`LivestockEconomicsView.tsx`'s own header comment) — never
  // computed for a real authenticated farmer's steer group here.
  // `FeedGroupSummaryCard`'s own margin figure depends on it, so a real
  // steer group instead renders the honest fallback card below (weight/
  // count only, same as an unsupported group already does) rather than a
  // margin computed from a fabricated cattle price.
  const marketDataUnavailable = isRealMode && isSteer;
  const economics =
    isSteer && !marketDataUnavailable && finishingOptionsOutcome.status === "OK" && group.avgWeightKg
      ? calculateLivestockEconomics(group, {
          ...finishingOptionsOutcome.value,
          pricing: { kind: "per_kg_carcass", cattlePriceEurPerKgCarcass: CATTLE_PRICE_EUR_PER_KG_CARCASS },
        })
      : undefined;
  const steerStrategies =
    isSteer && group.avgWeightKg && finishingOptionsOutcome.status === "OK"
      ? calculateSteerConcentrateStrategies({
          currentWeightKg: group.avgWeightKg.value,
          targetWeightKg: finishingOptionsOutcome.value.targetWeightKg,
          concentratePriceEurPerTonne: STEER_CONCENTRATE_PRICE_EUR_PER_TONNE,
        })
      : undefined;

  // Weanlings: real variable-ADG comparison — concentrate level genuinely
  // changes both daily gain and days-to-target here, from Teagasc trial
  // evidence (see calculateWeanlingConcentrateStrategies).
  const weanlingStrategies =
    isWeanling && group.avgWeightKg
      ? calculateWeanlingConcentrateStrategies({
          currentWeightKg: group.avgWeightKg.value,
          targetWeightKg: WEANLING_STRATEGY_TARGET_WEIGHT_KG,
          concentratePriceEurPerTonne: WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE,
        })
      : undefined;

  return (
    <>
      <MobileDetailHeader title="Feed optimiser" backHref="/livestock" />
      <PageHeader
        title="Feed Optimiser"
        subtitle="Lowest cost, balanced and faster-finish feeding strategies"
      />
      {/* Codex audit round 4 (MEDIUM): this claimed every strategy
       * comparison "optimises forecast margin," but a real steer group
       * with no market-price source (marketDataUnavailable, above) shows
       * no margin at all — a real contradiction with that exact state's
       * own copy. Conditional on the actual real path a farmer sees. */}
      <div className="mb-3 hidden items-center gap-1.5 text-xs text-fr-ink-400 lg:flex">
        <Info className="size-3.5" />
        {marketDataUnavailable
          ? "Strategies compare real feed cost and performance — margin isn't shown without a live cattle price."
          : "Strategies optimise forecast margin, not just feed cost per tonne — spec §9."}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {livestockGroups.map((g) => (
          <GroupTabButton
            key={g.id}
            group={g}
            active={g.id === effectiveGroupId}
            onClick={() => setActiveGroupId(g.id)}
          />
        ))}
      </div>

      {!supported ? (
        <div className="flex flex-col items-center gap-3 rounded-fr-card border border-dashed border-fr-border py-12 text-center">
          <Beef className="size-8 text-fr-ink-400" />
          <p className="text-sm font-medium text-fr-ink-900">Feed Optimiser isn&apos;t available for {group.label}</p>
          <p className="max-w-sm text-sm text-fr-ink-600">
            {animalTypeOutcome.status !== "OK"
              ? "This group's category/goal doesn't match a supported feeding model (weanling, or steer with goal “finish for slaughter”)."
              : finishingOptionsOutcome.status !== "OK"
                ? "This group's animal type is supported, but this app has no full evidenced feeding budget for it yet."
                : "This group has no recorded average weight to build a strategy from — add one on the Livestock screen."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {isSteer && economics ? (
            <FeedGroupSummaryCard group={group} economics={economics} />
          ) : marketDataUnavailable ? (
            <Card className="flex items-center gap-3">
              <TrendingUp className="size-6 shrink-0 text-fr-ink-400" />
              <p className="text-sm text-fr-ink-600">
                Market data is currently unavailable — Farm Return doesn&apos;t yet have a live cattle price source for{" "}
                {group.label}, so a margin figure isn&apos;t shown. Feeding strategies below still compare real
                Teagasc trial response points, priced at a modelled concentrate-cost assumption (
                {STEER_CONCENTRATE_PRICE_EUR_PER_TONNE}/t), not yet this farm&apos;s own recorded price.
              </p>
            </Card>
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
            {(isSteer ? steerStrategies : weanlingStrategies)?.map((strategy) => (
              <FeedStrategyCard
                key={strategy.id}
                strategy={strategy}
                selected={selected === strategy.id}
                onSelect={() => setSelected(strategy.id)}
              />
            ))}
          </div>

          <p className="text-center text-xs text-fr-ink-400">
            {isSteer
              ? "Based on real Teagasc trial evidence (evidence class B-RESEARCH) — genuine experimental response points from different trials, not directly comparable treatments from one single modern study. Modelled scenarios, not Teagasc recommendations."
              : `Based on a ${WEANLING_ADG_EVIDENCE_WINDOW_DAYS}-day Teagasc research trial (evidence class B) — real observed response points, not a universal recommendation. Cattle price and margin uplift aren't shown here: weanlings aren't being valued for sale in this comparison, only fed for winter growth.`}
          </p>
        </div>
      )}
    </>
  );
}

function GroupTabButton({
  group,
  active,
  onClick,
}: {
  group: LivestockGroup;
  active: boolean;
  onClick: () => void;
}) {
  const supported = finishingOptionsForGroup(group).status === "OK";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-fr-green-700 bg-fr-green-700 text-white"
          : "border-fr-border text-fr-ink-600 hover:border-fr-green-700",
      )}
    >
      {group.label}
      {!supported ? (
        <Pill tone="neutral" className={active ? "bg-white/20 text-white" : undefined}>
          Unsupported
        </Pill>
      ) : null}
    </button>
  );
}

