import { Cloud, CloudRain, Sun } from "lucide-react";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { cn } from "@/lib/cn";
import type { SpreadingDayForecast } from "@/domain/types";

const WEATHER_ICON: Record<SpreadingDayForecast["weather"], React.ComponentType<{ className?: string }>> = {
  sun: Sun,
  cloud: Cloud,
  rain: CloudRain,
};

export function SpreadingForecastStrip({
  days,
  selectedDate,
}: {
  days: SpreadingDayForecast[];
  selectedDate?: string;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {days.map((day) => {
        const [weekday, dayNum, month] = day.dayLabel.split(" ");
        const Icon = WEATHER_ICON[day.weather];
        const selected = day.date === selectedDate;
        return (
          <div
            key={day.date}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-fr-control border p-2",
              selected ? "border-fr-green-700 bg-fr-green-100/50" : "border-fr-border",
            )}
          >
            <p className="text-xs font-semibold text-fr-ink-900">{weekday}</p>
            <p className="text-[11px] text-fr-ink-400">
              {dayNum} {month}
            </p>
            <Icon className="size-4 text-fr-ink-400" />
            <ScoreRing score={day.score} size={40} strokeWidth={4} suffix="" />
          </div>
        );
      })}
    </div>
  );
}
