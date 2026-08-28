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
import { useFarmActions, useFarm, useSlurryAllocations } from "@/store/farm-store";
import type { BufferFeature } from "@/domain/buffer-gate";

const TABS = ["Overview", "Map", "Soil"] as const;

/**
 * Field detail panel — spec §4/screen-specification.md "/fields":
 * "Selecting a field opens a FieldDrawer: field name + area, tab bar
 * (Overview/Map/Soil…), Planned Use row, cutting window/est. yield summary,
 * Edit Field CTA."
 */
const BUFFER_FEATURE_OPTIONS: { value: BufferFeature; label: string }[] = [
  { value: "surface_water", label: "Surface water (stream/river/canal)" },
  { value: "major_drinking_water_abstraction", label: "Major drinking-water abstraction" },
  { value: "drinking_water_abstraction", label: "Drinking-water abstraction" },
  { value: "other_drinking_well_spring_borehole", label: "Well / spring / borehole" },
  { value: "lake_or_turlough_likely_to_flood", label: "Lake or turlough likely to flood" },
  { value: "exposed_cavernous_or_karst_limestone_feature", label: "Exposed karst/cavernous limestone" },
];

export function FieldDrawer({ field, className }: { field: Field; className?: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [mappingOpen, setMappingOpen] = useState(false);
  const {
    setFieldBoundary,
    updateFieldCommonageStatus,
    updateFieldWaterBufferContext,
    updateSlurryApplicationMethod,
  } = useFarmActions();
  const farm = useFarm();
  const slurryAllocations = useSlurryAllocations();
  const fieldSlurryAllocation = slurryAllocations.find((a) => a.fieldId === field.id);
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

          {/* V3 closure pass — required_input_fields.csv "FIELD_COMMONAGE_STATUS" /
              "LOCAL_WATER_BUFFER_OVERRIDE" / "SLURRY_APPLICATION_METHOD". Until
              this section existed, none of these three real, tested, live-wired
              gates (commonage-gate.ts, buffer-gate.ts, less-method-gate.ts via
              checkNapCompliance) could ever be given real evidence by a farmer
              — every field silently and permanently hit the fail-closed default.
              This is the minimum capture needed to make that evidence real,
              not a redesign of the field record. */}
          <div className="mt-1 flex flex-col gap-3 border-t border-fr-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-fr-ink-600">Compliance evidence</p>

            <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
              Commonage status (S.I. 588/2025 chemical-fertiliser prohibition)
              <select
                className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
                value={field.commonageStatus?.value ?? "unknown"}
                onChange={(e) =>
                  updateFieldCommonageStatus(
                    field.id,
                    e.target.value as "commonage" | "not_commonage" | "unknown",
                    farm.ownerName,
                  )
                }
              >
                <option value="unknown">Unknown — not yet confirmed</option>
                <option value="not_commonage">Not commonage</option>
                <option value="commonage">Commonage</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
              Nearest regulated water feature
              <select
                className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
                value={field.waterBufferContext?.value.featureType ?? ""}
                onChange={(e) =>
                  updateFieldWaterBufferContext(
                    field.id,
                    {
                      ...field.waterBufferContext?.value,
                      featureType: (e.target.value || undefined) as BufferFeature | undefined,
                      localOverrideStatus: field.waterBufferContext?.value.localOverrideStatus ?? "unknown",
                    },
                    farm.ownerName,
                  )
                }
              >
                <option value="">Not assessed yet</option>
                {BUFFER_FEATURE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            {field.waterBufferContext?.value.featureType ? (
              <>
                <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
                  Distance to that feature (metres)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
                    value={field.waterBufferContext?.value.distanceM ?? ""}
                    onChange={(e) =>
                      updateFieldWaterBufferContext(
                        field.id,
                        {
                          ...field.waterBufferContext!.value,
                          distanceM: e.target.value === "" ? undefined : Number(e.target.value),
                        },
                        farm.ownerName,
                      )
                    }
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
                  Local authority buffer override
                  <select
                    className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
                    value={field.waterBufferContext?.value.localOverrideStatus ?? "unknown"}
                    onChange={(e) =>
                      updateFieldWaterBufferContext(
                        field.id,
                        {
                          ...field.waterBufferContext!.value,
                          localOverrideStatus: e.target.value as "authoritative_rule" | "verified_none" | "unknown",
                        },
                        farm.ownerName,
                      )
                    }
                  >
                    <option value="unknown">Unknown — not yet confirmed</option>
                    <option value="verified_none">Verified — no local override applies</option>
                    <option value="authoritative_rule">Local authority sets an alternative buffer</option>
                  </select>
                </label>

                {field.waterBufferContext?.value.localOverrideStatus === "authoritative_rule" ? (
                  <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
                    Local authority&apos;s own buffer distance (metres)
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
                      value={field.waterBufferContext?.value.localOverrideDistanceM ?? ""}
                      onChange={(e) =>
                        updateFieldWaterBufferContext(
                          field.id,
                          {
                            ...field.waterBufferContext!.value,
                            localOverrideDistanceM: e.target.value === "" ? undefined : Number(e.target.value),
                          },
                          farm.ownerName,
                        )
                      }
                    />
                  </label>
                ) : null}
              </>
            ) : null}

            {fieldSlurryAllocation ? (
              <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
                Slurry application method for this field&apos;s allocation
                <select
                  className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
                  value={fieldSlurryAllocation.applicationMethod?.value ?? ""}
                  onChange={(e) =>
                    updateSlurryApplicationMethod(
                      field.id,
                      fieldSlurryAllocation.housingId,
                      e.target.value as "LESS" | "splashplate" | "incorporate_24h" | "other",
                      farm.ownerName,
                    )
                  }
                >
                  <option value="" disabled>
                    Select a method
                  </option>
                  <option value="LESS">Low Emission Slurry Spreading (LESS)</option>
                  <option value="splashplate">Splashplate</option>
                  <option value="incorporate_24h">Incorporated within 24 hours</option>
                  <option value="other">Other</option>
                </select>
              </label>
            ) : null}
          </div>
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
