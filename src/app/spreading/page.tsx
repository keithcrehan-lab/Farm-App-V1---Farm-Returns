"use client";

import { Bell, Sprout } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { SpreadingSuitabilityValidationCard } from "@/components/farm/SpreadingSuitabilityValidationCard";
import { SpreadingFieldRow } from "@/components/farm/SpreadingFieldRow";
import { PlannedApplicationsCard } from "@/components/farm/PlannedApplicationsCard";
import { CurrentConditionsCard } from "@/components/farm/CurrentConditionsCard";
import { NineDayForecastCard } from "@/components/farm/NineDayForecastCard";
import { mockFarm, mockPlannedApplications, mockSpreadingScores } from "@/data/mock-farm";
import { useFarm, useFields } from "@/store/farm-store";
import { checkClosedPeriodCalendar, normaliseCountyForZoneLookup } from "@/domain/closed-period-calendar";

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
  const farm = useFarm();
  // V3 closure pass (second pass) — real, deterministic closed-period
  // calendar status per field, replacing the previous unconditional
  // "Under validation" placeholder. This is a statutory calendar
  // determination (S.I. 588/2025), not an invented suitability score —
  // step H of the spec's own spreading-engine order (§H1: "current
  // ruleset; closed-period baseline") is exactly this check, nothing
  // more. Ground/weather hard stops (step 3) and buffers (step 4) are
  // not layered in here yet — this app has no live per-field ground-
  // condition capture to feed them, so only the calendar (fully
  // determinable from county + date alone) is wired to this screen.
  const today = new Date().toISOString().slice(0, 10);
  const county = normaliseCountyForZoneLookup(farm.location.county);

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
            // Each field's own planned use picks the material this
            // calendar check evaluates — tillage land intending chemical
            // fertiliser vs. grassland's own typical chemical-fertiliser
            // use; slurry/organic timing is a separate farmer decision
            // this row doesn't currently capture, so chemical fertiliser
            // (the material every field can meaningfully be asked about)
            // is the one real, always-applicable check shown here.
            const calendarStatus = checkClosedPeriodCalendar({ county, date: today, material: "chemical_fertiliser" });
            return <SpreadingFieldRow key={entry.fieldId} field={field} entry={entry} calendarStatus={calendarStatus} />;
          })}
        </div>

        <PlannedApplicationsCard applications={mockPlannedApplications} />
      </div>
    </>
  );
}
