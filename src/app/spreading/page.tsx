"use client";

import { Bell, Sprout } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { SpreadingHeroCard } from "@/components/farm/SpreadingHeroCard";
import { SpreadingForecastStrip } from "@/components/farm/SpreadingForecastStrip";
import { SpreadingFieldRow } from "@/components/farm/SpreadingFieldRow";
import { PlannedApplicationsCard } from "@/components/farm/PlannedApplicationsCard";
import { CurrentConditionsCard } from "@/components/farm/CurrentConditionsCard";
import { NineDayForecastCard } from "@/components/farm/NineDayForecastCard";
import { mockFarm, mockPlannedApplications, mockSpreadingForecast, mockSpreadingScores } from "@/data/mock-farm";
import { useFields } from "@/store/farm-store";
import { isHardStop } from "@/domain/types";

export default function SpreadingPage() {
  const fields = useFields();
  // The hero's "overall farm score" is the best near-term day's forecast
  // (today/tomorrow), not an average of the field rows below — matching
  // the reference, where the hero figure equals the selected forecast day.
  const today = mockSpreadingForecast[1]; // Tue — matches the reference's "best window" selection
  const ranked = [...mockSpreadingScores].sort((a, b) => {
    const av = isHardStop(a.slurryScore) ? -1 : a.slurryScore.value;
    const bv = isHardStop(b.slurryScore) ? -1 : b.slurryScore.value;
    return bv - av;
  });

  return (
    <>
      <header className="mb-4 flex items-center justify-between lg:hidden">
        <span className="flex items-center gap-1.5 text-fr-green-700">
          <Sprout className="size-5" />
          <span className="text-lg font-bold">Spreading</span>
        </span>
        <button type="button" className="text-fr-ink-600" aria-label="Notifications">
          <Bell className="size-5" />
        </button>
      </header>
      <PageHeader title="Spreading" subtitle="Farm score, forecast windows and application plan" />

      <div className="flex flex-col gap-4">
        <SpreadingHeroCard
          score={today.score}
          bestWindow="Tue 08:00 – Wed 15:00"
          conditionSummary="Good drying conditions with low rainfall risk."
        />
        <SpreadingForecastStrip days={mockSpreadingForecast} selectedDate={today.date} />
        <CurrentConditionsCard centroid={mockFarm.location.centroid} />
        <NineDayForecastCard centroid={mockFarm.location.centroid} />

        <div className="flex flex-col gap-3">
          {ranked.map((entry) => {
            const field = fields.find((f) => f.id === entry.fieldId);
            if (!field) return null;
            return <SpreadingFieldRow key={entry.fieldId} field={field} entry={entry} />;
          })}
        </div>

        <PlannedApplicationsCard applications={mockPlannedApplications} />
      </div>
    </>
  );
}
