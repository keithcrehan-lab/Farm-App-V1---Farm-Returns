import { CalendarCheck2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { mockSpreadingScores } from "@/data/mock-farm";
import { isHardStop } from "@/domain/types";

export function BestSpreadingCard() {
  const scored = mockSpreadingScores.filter((s) => !isHardStop(s.slurryScore));
  const hardStops = mockSpreadingScores.length - scored.length;
  const suitable = scored.filter((s) => !isHardStop(s.slurryScore) && s.slurryScore.value >= 80).length;
  const marginal = scored.length - suitable;
  const best = Math.max(
    ...scored.map((s) => (!isHardStop(s.slurryScore) ? s.slurryScore.value : 0)),
  );

  return (
    <Card className="flex items-center gap-4">
      <IconChip icon={CalendarCheck2} tone="good" className="size-11" />
      <div>
        <p className="text-sm font-medium text-fr-ink-600">Best spreading opportunity</p>
        <p className="text-2xl font-bold text-fr-ink-900">
          {best}
          <span className="text-base font-medium text-fr-ink-400">/100</span>
        </p>
        <p className="text-xs text-fr-ink-600">
          {suitable} field{suitable === 1 ? "" : "s"} suitable · {marginal} marginal · {hardStops} unsuitable
        </p>
      </div>
    </Card>
  );
}
