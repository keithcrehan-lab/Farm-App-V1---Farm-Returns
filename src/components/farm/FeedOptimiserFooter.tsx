import { Coins, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatEur } from "@/lib/format";
import type { FeedOptimiserContext } from "@/domain/types";

export function FeedOptimiserFooter({ context }: { context: FeedOptimiserContext }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3">
          <IconChip icon={TrendingUp} tone="good" />
          <div>
            <p className="text-xs text-fr-ink-600">Cattle price (liveweight)</p>
            <p className="text-lg font-bold text-fr-ink-900">
              {formatEur(context.cattlePriceLiveweightEurKg, true)}
              <span className="text-sm font-normal text-fr-ink-400">/kg</span>
            </p>
            <p className="text-xs font-medium text-fr-good">
              {formatEur(context.cattlePriceChangeEurKg, true)} vs last week
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <IconChip icon={Coins} tone="good" />
          <div>
            <p className="text-xs text-fr-ink-600">Est. margin uplift</p>
            <p className="text-lg font-bold text-fr-good">
              +{formatEur(context.marginUpliftEurHead)}
              <span className="text-sm font-normal text-fr-ink-400">/head</span>
            </p>
            <p className="text-xs text-fr-ink-400">{context.marginUpliftComparison}</p>
          </div>
        </Card>
      </div>
      <p className="text-center text-xs text-fr-ink-400">
        Prices exclude VAT. Feed costs based on current contracts.
      </p>
    </>
  );
}
