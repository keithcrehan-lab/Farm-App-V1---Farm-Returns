import { ChevronRight, Droplet, FlaskConical, ThermometerSun, Waves } from "lucide-react";
import { Pill } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/lib/status";
import { landUseTone } from "@/lib/status";
import { cn } from "@/lib/cn";
import type { EngineOutcome } from "@/domain/evidence";
import type { Field, SpreadingFieldScore } from "@/domain/types";

const TONE_BG: Record<string, string> = {
  good: "bg-fr-good",
  info: "bg-fr-info",
  silage: "bg-fr-map-silage",
  attention: "bg-fr-attention",
  neutral: "bg-fr-ink-400",
};

/** Real, deterministic legal status from `closed-period-calendar.ts`
 * (S.I. 588/2025) — NOT a suitability score. Maps to a plain
 * open/closed/unknown pill, no invented probability. */
function calendarStatusLabel(outcome: EngineOutcome<"BASELINE_OPEN"> | undefined): { label: string; tone: StatusTone } {
  if (outcome === undefined) return { label: "Under validation", tone: "neutral" };
  if (outcome.status === "OK") return { label: "Open", tone: "good" };
  if (outcome.status === "LEGAL_PROHIBITION") return { label: "Closed period", tone: "risk" };
  return { label: "Unknown", tone: "neutral" };
}

/**
 * Deliberately does not read `entry.slurryScore`/`entry.fertiliserScore`
 * or render a ring/band-label/hard-stop verdict — see
 * `SpreadingSuitabilityValidationCard`'s doc comment for why. The
 * per-field readings below (soil temp, rainfall forecast, drainage) are
 * kept as plain facts, not a computed suitability judgement.
 *
 * V3 closure pass (second pass) — `calendarStatus` (optional, real,
 * from `checkClosedPeriodCalendar`) replaces the previous unconditional
 * "Under validation" placeholder wherever the parent screen can resolve
 * it (this farm's own county + today's date) — a genuine statutory
 * calendar determination, not a suitability score, so it does not
 * reopen the "no invented 0-100 probability" decision this row already
 * made.
 */
export function SpreadingFieldRow({
  field,
  entry,
  calendarStatus,
}: {
  field: Field;
  entry: SpreadingFieldScore;
  calendarStatus?: EngineOutcome<"BASELINE_OPEN">;
}) {
  const swatchTone = field.plannedUse ? landUseTone(field.plannedUse.value) : "neutral";
  const calendar = calendarStatusLabel(calendarStatus);

  return (
    <div className="flex items-center gap-3 rounded-fr-card bg-fr-surface-alt p-3">
      <div className="flex w-20 shrink-0 flex-col items-center gap-1 text-center">
        <FlaskConical className="size-5 text-fr-ink-400" />
        <Pill tone={calendar.tone} className="whitespace-nowrap px-1.5 py-0.5 text-[10px]">
          {calendar.label}
        </Pill>
      </div>
      <span className={cn("size-3.5 shrink-0 rounded-sm", TONE_BG[swatchTone])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fr-ink-900">{field.name}</p>
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
      </div>
      <ChevronRight className="size-4 shrink-0 text-fr-ink-400" />
    </div>
  );
}
