import { CalendarCheck2, Leaf } from "lucide-react";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { scoreBandLabel } from "@/lib/status";

export function SpreadingHeroCard({
  score,
  bestWindow,
  conditionSummary,
}: {
  score: number;
  bestWindow: string;
  conditionSummary: string;
}) {
  const headline =
    score >= 80 ? "Tomorrow looks strong" : score >= 50 ? "Tomorrow looks marginal" : "Tomorrow looks poor";

  return (
    <div className="flex items-center gap-5 rounded-fr-card bg-fr-green-100 p-5">
      <ScoreRing score={score} size={110} strokeWidth={10} />
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold text-fr-ink-900">{headline}</h2>
        <p className="text-sm text-fr-ink-600">Overall farm spreading score · {scoreBandLabel(score)}</p>
        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-fr-ink-900">
          <CalendarCheck2 className="size-4 text-fr-green-700" />
          Best window: {bestWindow}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-fr-ink-600">
          <Leaf className="size-4 text-fr-green-700" />
          {conditionSummary}
        </p>
      </div>
    </div>
  );
}
