import { Info, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatEur, formatNumber } from "@/lib/format";
import { INPUT_CATEGORY_LABEL } from "@/lib/input-category";
import type { BuyingOpportunity } from "@/domain/types";

/**
 * design-system.md's BuyingOpportunityCard — spec §11 required page
 * component. Real Farm V1 Phase 13 — only `userRequirementQty` is real
 * (this farm's own demand, `withRealBuyingOpportunityRequirement` in
 * `finance.ts`); `regionalConfirmedQty`/`regionalCommittedQty`/
 * `currentPrice`/`targetPrice`, and therefore the "Potential saving"
 * figure derived from them, are all still the Phase 1 mock regional-
 * buying-group data — confirmed genuinely blocked, not just unbuilt
 * (`docs/evidence-register.md`: "both workbooks agree... a live merchant
 * quote is the only thing that can fill it. Do not populate from invented
 * examples."). Bulk buying is real Farm Return functionality, so this
 * card must stay — but showing a real number next to three still-mock
 * ones with identical visual confidence (a "Target price" in green, a
 * highlighted "Potential saving" banner) is exactly the labelling risk
 * CLAUDE.md's rules exist to prevent. One explicit notice covers all
 * three, rather than four separate badges cluttering the card.
 */
export function BuyingOpportunityCard({ opportunity }: { opportunity: BuyingOpportunity }) {
  const savingTotal = opportunity.potentialSavingPerUnit * opportunity.userRequirementQty;

  return (
    <Card>
      <div className="mb-3 flex items-center gap-3">
        <IconChip icon={Users} tone="attention" />
        <div>
          <p className="text-sm font-semibold text-fr-ink-900">{INPUT_CATEGORY_LABEL[opportunity.category]}</p>
          <p className="text-xs text-fr-ink-600">Regional buying group</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-fr-ink-600">Your requirement</p>
          <p className="font-semibold text-fr-ink-900">{formatNumber(opportunity.userRequirementQty, 1)}</p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Regional demand (example)</p>
          <p className="font-semibold text-fr-ink-600">
            {formatNumber(opportunity.regionalConfirmedQty + opportunity.regionalCommittedQty, 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Current price (example)</p>
          <p className="font-semibold text-fr-ink-600">{formatEur(opportunity.currentPrice, true)}</p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Target price (example)</p>
          <p className="font-semibold text-fr-ink-600">{formatEur(opportunity.targetPrice, true)}</p>
        </div>
      </div>
      <p className="mt-3 flex items-center justify-between rounded-fr-control bg-fr-surface-alt px-3 py-2 text-sm font-medium text-fr-ink-600">
        <span>Potential saving (illustrative)</span>
        <span>{formatEur(savingTotal)}</span>
      </p>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-fr-ink-400">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Only &quot;Your requirement&quot; is real for your farm. Regional demand, prices and saving are a worked example
        until Farm Return connects a live supplier — no live commercial pricing source exists yet.
      </p>
    </Card>
  );
}
