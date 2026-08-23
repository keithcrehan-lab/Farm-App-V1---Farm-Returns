import { ChevronRight, Droplet, ThermometerSun, TriangleAlert, Waves } from "lucide-react";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { landUseTone, scoreBandLabel } from "@/lib/status";
import { cn } from "@/lib/cn";
import { isHardStop, type Field, type SpreadingFieldScore } from "@/domain/types";

const TONE_BG: Record<string, string> = {
  good: "bg-fr-good",
  info: "bg-fr-info",
  silage: "bg-fr-map-silage",
  attention: "bg-fr-attention",
  neutral: "bg-fr-ink-400",
};

const ROW_TINT: Record<"good" | "attention" | "risk", string> = {
  good: "bg-fr-good-bg/40",
  attention: "bg-fr-attention-bg/40",
  risk: "bg-fr-risk-bg/40",
};

export function SpreadingFieldRow({ field, entry }: { field: Field; entry: SpreadingFieldScore }) {
  const slurryScore = entry.slurryScore;
  const hardStopReason = isHardStop(slurryScore) ? slurryScore.reason : undefined;
  const score = isHardStop(slurryScore) ? 0 : slurryScore.value;
  const tone = hardStopReason ? "risk" : score >= 80 ? "good" : score >= 50 ? "attention" : "risk";
  const swatchTone = landUseTone(field.plannedUse.value);

  return (
    <div className={cn("flex items-center gap-3 rounded-fr-card p-3", ROW_TINT[tone])}>
      <ScoreRing score={score} size={64} strokeWidth={6} suffix="" label={scoreBandLabel(score)} />
      <span className={cn("size-3.5 shrink-0 rounded-sm", TONE_BG[swatchTone])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fr-ink-900">{field.name}</p>
        {hardStopReason ? (
          <>
            {hardStopReason.split(", ").map((line) => (
              <p key={line} className="flex items-center gap-1.5 text-xs text-fr-ink-600">
                <Droplet className="size-3.5 shrink-0 text-fr-risk" />
                {line}
              </p>
            ))}
            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-fr-risk">
              <TriangleAlert className="size-3.5 shrink-0" />
              Hard stop — do not spread
            </p>
          </>
        ) : (
          <>
            {entry.soilTempC !== undefined ? (
              <p className="flex items-center gap-1.5 text-xs text-fr-ink-600">
                <ThermometerSun className="size-3.5 shrink-0 text-fr-ink-400" />
                Soil temp {entry.soilTempC}°C
              </p>
            ) : null}
            {entry.rainfallForecastMm ? (
              <p className="flex items-center gap-1.5 text-xs text-fr-ink-600">
                <Droplet className="size-3.5 shrink-0 text-fr-ink-400" />
                Rainfall forecast {entry.rainfallForecastMm}
              </p>
            ) : null}
            {entry.drainageLabel ? (
              <p className="flex items-center gap-1.5 text-xs text-fr-ink-600">
                <Waves className="size-3.5 shrink-0 text-fr-ink-400" />
                {entry.drainageLabel}
              </p>
            ) : null}
          </>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0 text-fr-ink-400" />
    </div>
  );
}
