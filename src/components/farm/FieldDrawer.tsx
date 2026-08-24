"use client";

import { useState } from "react";
import { Layers, MapPin, Pencil, Radio, Scissors, Sprout, Tractor } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill, StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import { landUseLabel } from "@/lib/status";
import { mockSilagePlans } from "@/data/mock-farm";
import type { Field } from "@/domain/types";
import { formatHa, formatNumber } from "@/lib/format";
import { nearestStationsForField } from "@/domain/weather-stations";
import { FieldBoundaryMapModal } from "@/components/farm/FieldBoundaryMapModal";
import { useFarmActions } from "@/store/farm-store";

const TABS = ["Overview", "Map", "Soil"] as const;

/**
 * Field detail panel — spec §4/screen-specification.md "/fields":
 * "Selecting a field opens a FieldDrawer: field name + area, tab bar
 * (Overview/Map/Soil…), Planned Use row, cutting window/est. yield summary,
 * Edit Field CTA."
 */
export function FieldDrawer({ field, className }: { field: Field; className?: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [mappingOpen, setMappingOpen] = useState(false);
  const { setFieldBoundary } = useFarmActions();
  const silagePlan = mockSilagePlans.find((p) => p.fieldId === field.id);
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

          {/* Was "Spreading today: {score}/100" or "Do not spread" — an
              unsourced mock verdict presented as fact. See
              SpreadingSuitabilityValidationCard's doc comment for why
              that's no longer shown as a real figure. */}
          <div className="flex items-center gap-3">
            <Tractor className="size-4 shrink-0 text-fr-green-700" />
            <span className="text-fr-ink-600">Spreading suitability</span>
            <Pill tone="neutral" className="ml-auto">
              Under validation
            </Pill>
          </div>

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
                {nearestWeatherStation.station.canonicalName} · {formatNumber(nearestWeatherStation.distanceKm, 1)} km
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
        onClick={() => setMappingOpen(true)}
        className="mt-1 flex items-center justify-center gap-2 rounded-fr-control border border-fr-green-700 py-2.5 text-sm font-medium text-fr-green-700"
      >
        <Pencil className="size-4" />
        {field.polygon ? "Edit boundary" : "Map this field"}
      </button>

      {mappingOpen ? (
        <FieldBoundaryMapModal
          fieldName={field.name}
          initialCentroid={field.centroid}
          initialPolygon={field.polygon}
          onClose={() => setMappingOpen(false)}
          onSave={(polygon) => {
            setFieldBoundary(field.id, polygon);
            setMappingOpen(false);
          }}
        />
      ) : null}
    </Card>
  );
}
