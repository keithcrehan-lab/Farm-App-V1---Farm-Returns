import { Scale } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { formatNumber } from "@/lib/format";
import type { ForageInventory } from "@/domain/types";

export function WholeFarmFeedBalanceCard({ inventory }: { inventory: ForageInventory }) {
  const required = inventory.requiredWinterForageDmTonnes.value;
  const expected = inventory.totalDmTonnes.value;
  const deficit = inventory.surplusDeficitDmTonnes;
  const isDeficit = deficit < 0;
  const suppliedPct = Math.min(100, Math.round((expected / required) * 100));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <span className="flex items-center gap-3">
            <IconChip icon={Scale} tone={isDeficit ? "risk" : "good"} />
            <CardTitle>Whole-farm feed balance</CardTitle>
          </span>
        </CardHeader>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-fr-ink-600">Required winter forage</p>
            <p className="text-base font-bold text-fr-ink-900">{formatNumber(required, 0)} t DM</p>
          </div>
          <div>
            <p className="text-xs text-fr-ink-600">Expected silage production</p>
            <p className="text-base font-bold text-fr-ink-900">{formatNumber(expected, 0)} t DM</p>
          </div>
          <div>
            <p className="text-xs text-fr-ink-600">Surplus / deficit</p>
            <p className={`text-base font-bold ${isDeficit ? "text-fr-risk" : "text-fr-good"}`}>
              {deficit > 0 ? "+" : ""}
              {formatNumber(deficit, 0)} t DM
            </p>
          </div>
        </div>

        <div className="relative mt-4">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-fr-surface-alt">
            <div className="h-full bg-fr-good" style={{ width: `${Math.min(suppliedPct, 100)}%` }} />
            {isDeficit ? (
              <div className="h-full bg-fr-risk" style={{ width: `${100 - suppliedPct}%` }} />
            ) : null}
          </div>
          <div className="absolute top-0 h-2.5 w-px bg-fr-ink-900" style={{ left: "100%" }} />
          <p className="mt-1.5 text-right text-xs text-fr-ink-400">Target {formatNumber(required, 0)} t DM</p>
        </div>
      </Card>

      {isDeficit ? (
        <AlertBanner
          tone="attention"
          title="Silage deficit risk"
          description="You're short of winter forage. Consider 2nd cut or buying feed."
          actionLabel="View options"
        />
      ) : null}
    </div>
  );
}
