"use client";

import { Bell, Sprout } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { SpreadingSuitabilityValidationCard } from "@/components/farm/SpreadingSuitabilityValidationCard";
import { SpreadingFieldRow } from "@/components/farm/SpreadingFieldRow";
import { PlannedApplicationsCard } from "@/components/farm/PlannedApplicationsCard";
import { CurrentConditionsCard } from "@/components/farm/CurrentConditionsCard";
import { NineDayForecastCard } from "@/components/farm/NineDayForecastCard";
import { mockFarm, mockPlannedApplications, mockSpreadingScores } from "@/data/mock-farm";
import { useFields } from "@/store/farm-store";

/**
 * Screen order is deliberate — verified live data first, unvalidated
 * placeholder last: Current Conditions (live) -> 9-Day Farm Forecast
 * (live) -> Spreading Suitability Score (under validation). See
 * SpreadingSuitabilityValidationCard's doc comment for why the old mock
 * score hero/forecast strip that used to sit at the top of this page is
 * gone, and docs/evidence-register.md's Phase 5 capability-status table
 * for the full picture.
 */
export default function SpreadingPage() {
  const fields = useFields();

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
      <PageHeader title="Spreading" subtitle="Live conditions, forecast and application plan" />

      <div className="flex flex-col gap-4">
        <CurrentConditionsCard centroid={mockFarm.location.centroid} />
        <NineDayForecastCard centroid={mockFarm.location.centroid} />
        <SpreadingSuitabilityValidationCard />

        <div className="flex flex-col gap-3">
          {mockSpreadingScores.map((entry) => {
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
