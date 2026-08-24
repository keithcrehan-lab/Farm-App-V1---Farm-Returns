import { FlaskConical } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { Pill } from "@/components/ui/StatusBadge";

/**
 * Was "Best spreading opportunity 91/100 · 3 suitable · 1 marginal · 1
 * unsuitable" — computed entirely from `mockSpreadingScores`, an unsourced
 * mock composite score, presented as a headline Dashboard stat. See
 * `SpreadingSuitabilityValidationCard`'s doc comment for why that's no
 * longer shown as a real figure.
 */
export function BestSpreadingCard() {
  return (
    <Card className="flex items-center gap-4">
      <IconChip icon={FlaskConical} tone="neutral" className="size-11" />
      <div>
        <p className="text-sm font-medium text-fr-ink-600">Spreading suitability</p>
        <Pill tone="neutral" className="mt-1">
          Under validation
        </Pill>
        <p className="mt-1 text-xs text-fr-ink-600">Validating the decision rules before this is available.</p>
      </div>
    </Card>
  );
}
