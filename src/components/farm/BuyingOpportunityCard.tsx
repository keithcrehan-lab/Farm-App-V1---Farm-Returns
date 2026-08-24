import { Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatEur, formatNumber } from "@/lib/format";
import { INPUT_CATEGORY_LABEL } from "@/lib/input-category";
import type { BuyingOpportunity } from "@/domain/types";

/** design-system.md's BuyingOpportunityCard — spec §11 required page component. */
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
          <p className="text-xs text-fr-ink-600">Regional demand</p>
          <p className="font-semibold text-fr-ink-900">
            {formatNumber(opportunity.regionalConfirmedQty + opportunity.regionalCommittedQty, 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Current price</p>
          <p className="font-semibold text-fr-ink-900">{formatEur(opportunity.currentPrice, true)}</p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">Target price</p>
          <p className="font-semibold text-fr-good">{formatEur(opportunity.targetPrice, true)}</p>
        </div>
      </div>
      <p className="mt-3 flex items-center justify-between rounded-fr-control bg-fr-attention-bg px-3 py-2 text-sm font-medium text-fr-attention">
        <span>Potential saving</span>
        <span>{formatEur(savingTotal)}</span>
      </p>
    </Card>
  );
}
