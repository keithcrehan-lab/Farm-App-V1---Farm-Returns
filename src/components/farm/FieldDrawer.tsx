"use client";

import { useState } from "react";
import { Layers, MapPin, Pencil, Radio, Scissors, Sprout, Tractor } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import { landUseLabel } from "@/lib/status";
import { mockSilagePlans, mockSpreadingScores } from "@/data/mock-farm";
import { isHardStop, type Field } from "@/domain/types";
import { formatHa, formatNumber } from "@/lib/format";
import { nearestStationsForField } from "@/domain/weather-stations";

const TABS = ["Overview", "Map", "Soil"] as const;

/**
 * Field detail panel — spec §4/screen-specification.md "/fields":
 * "Selecting a field opens a FieldDrawer: field name + area, tab bar
 * (Overview/Map/Soil…), Planned Use row, cutting window/est. yield summary,
 * Edit Field CTA."
 */
export function FieldDrawer({ field, className }: { field: Field; className?: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const silagePlan = mockSilagePlans.find((p) => p.fieldId === field.id);
  const spreadingScore = mockSpreadingScores.find((s) => s.fieldId === field.id);
  // Real Met Éireann station-selection engine (src/domain/weather-stations.ts):
  // a confirmed 25-station registry, matched by real geographic distance, not
  // county. No live/historical observation feed is wired to any station yet —
  // this only answers "which station," not "what's the weather there."
  const [nearestWeatherStation] = nearestStationsForField(field, undefined, 1);

  return (
    <Card className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-title text-fr-ink-900">{field.name}</h3>
          <p className="text-sm text-fr-ink-600">{formatHa(field.areaHa)}</p>
        </div>
        <StatusBadge status={field.plannedUse.status} />
      </div>

      <div className="flex gap-1 border-b border-fr-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-1 pb-2 text-sm font-medium transition-colors",
              tab === t
                ? "border-fr-green-700 text-fr-green-700"
                : "border-transparent text-fr-ink-400 hover:text-fr-ink-600",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-3">
            <Sprout className="size-4 shrink-0 text-fr-green-700" />
            <span className="text-fr-ink-600">Planned use</span>
            <span className="ml-auto font-medium text-fr-ink-900">
              {landUseLabel(field.plannedUse.value)}
            </span>
          </div>

          {silagePlan ? (
            <>
              <div className="flex items-center gap-3">
                <Scissors className="size-4 shrink-0 text-fr-green-700" />
                <span className="text-fr-ink-600">Cutting window</span>
                <span className="ml-auto font-medium text-fr-ink-900">
                  {new Date(silagePlan.targetCutWindow.value.start).toLocaleDateString("en-IE", {
                    day: "numeric",
                    month: "short",
                  })}
                  {" – "}
                  {new Date(silagePlan.targetCutWindow.value.end).toLocaleDateString("en-IE", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Layers className="size-4 shrink-0 text-fr-green-700" />
                <span className="text-fr-ink-600">Expected yield</span>
                <span className="ml-auto font-medium text-fr-ink-900">
                  {formatNumber(silagePlan.expectedYieldTDMha.value, 1)} t DM/ha
                </span>
              </div>
            </>
          ) : null}

          {spreadingScore ? (
            <div className="flex items-center gap-3">
              <Tractor className="size-4 shrink-0 text-fr-green-700" />
              <span className="text-fr-ink-600">Spreading today</span>
              <span className="ml-auto font-medium text-fr-ink-900">
                {isHardStop(spreadingScore.slurryScore)
                  ? "Do not spread"
                  : `${spreadingScore.slurryScore.value}/100`}
              </span>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <MapPin className="size-4 shrink-0 text-fr-green-700" />
            <span className="text-fr-ink-600">Drainage</span>
            <span className="ml-auto font-medium text-fr-ink-900 capitalize">
              {field.mappedSoil.drainage.replace(/_/g, " ")}
            </span>
          </div>

          {nearestWeatherStation ? (
            <div className="flex items-center gap-3">
              <Radio className="size-4 shrink-0 text-fr-green-700" />
              <span className="text-fr-ink-600">Nearest weather station</span>
              <span className="ml-auto font-medium text-fr-ink-900">
                {nearestWeatherStation.station.name} · {formatNumber(nearestWeatherStation.distanceKm, 1)} km
              </span>
            </div>
          ) : null}

          <p className="text-xs text-fr-ink-400">
            Nearest weather station is a real, confirmed Met Éireann station match by geographic distance
            (evidence class A-OFFICIAL) — no live or historical weather feed is connected to it yet.
          </p>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-fr-ink-400">
          {tab} detail is part of the {tab === "Map" ? "Fields" : "Soil"} module — coming in a later
          screen.
        </p>
      )}

      <button
        type="button"
        disabled
        title="Field editing arrives with the Phase 2 data model"
        className="mt-1 flex items-center justify-center gap-2 rounded-fr-control border border-fr-border py-2.5 text-sm font-medium text-fr-ink-400"
      >
        <Pencil className="size-4" />
        Edit Field
      </button>
    </Card>
  );
}
