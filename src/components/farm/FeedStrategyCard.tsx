import { Star } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import { formatEur, formatNumber } from "@/lib/format";
import type { FeedStrategy } from "@/domain/types";

const INGREDIENT_DOT: Record<string, string> = {
  Silage: "bg-fr-good",
  Barley: "bg-fr-attention",
  "Beet Pulp": "bg-purple-500",
  Maize: "bg-amber-500",
  Minerals: "bg-fr-info",
};

export function FeedStrategyCard({
  strategy,
  selected,
  onSelect,
}: {
  strategy: FeedStrategy;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      className={cn(
        "cursor-pointer",
        strategy.recommended ? "border-fr-green-700 bg-fr-green-100/40" : undefined,
      )}
      onClick={onSelect}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
            selected ? "border-fr-green-700 bg-fr-green-700" : "border-fr-border",
          )}
        >
          {selected ? <span className="size-2 rounded-full bg-white" /> : null}
        </span>
        <h3 className="text-base font-bold text-fr-ink-900">{strategy.label}</h3>
        {strategy.recommended ? <Pill tone="good">Recommended</Pill> : null}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-5">
        {strategy.ingredientsKgDay.map((ing) => (
          <div key={ing.label} className="min-w-0">
            <p className="mb-1 flex items-start gap-1 text-[11px] leading-tight text-fr-ink-600">
              <span className={cn("mt-0.5 size-1.5 shrink-0 rounded-full", INGREDIENT_DOT[ing.label] ?? "bg-fr-ink-400")} />
              <span>{ing.label}</span>
            </p>
            <p className="text-sm font-bold text-fr-ink-900">{formatNumber(ing.kgDay, 1)}</p>
            <p className="text-[10px] text-fr-ink-400">kg/day</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-fr-border pt-3 text-sm">
        <div>
          <p className="text-xs text-fr-ink-600">Daily gain</p>
          <p className="font-bold text-fr-ink-900">{formatNumber(strategy.dailyGainKg, 2)} kg</p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Days to finish</p>
          <p className="font-bold text-fr-ink-900">{strategy.daysToFinish} days</p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Feed cost / head / day</p>
          <p className="font-bold text-fr-ink-900">{formatEur(strategy.feedCostPerHeadDayEur, true)}</p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Total cost / head</p>
          <p className={cn("font-bold", strategy.recommended ? "text-fr-good" : "text-fr-ink-900")}>
            {formatEur(strategy.totalCostPerHeadEur)}
          </p>
        </div>
      </div>

      {strategy.note ? (
        <p className="mt-3 flex items-center gap-2 rounded-fr-control bg-fr-good-bg px-3 py-2 text-xs font-medium text-fr-good">
          <Star className="size-3.5 shrink-0" />
          {strategy.note}
        </p>
      ) : null}
    </Card>
  );
}
