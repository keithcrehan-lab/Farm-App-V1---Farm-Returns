"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ArrowRight, Layers, MapPin, Pencil, Radio, Scissors, Sprout, Tractor } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Pill, StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import { landUseLabel, phStatusLabel } from "@/lib/status";
import { mockSilagePlans } from "@/data/mock-farm";
import type { Field, FieldUse } from "@/domain/types";
import { formatHa, formatNumber } from "@/lib/format";
import { nearestStationsForField } from "@/domain/weather-stations";
import { FieldBoundaryMapModal } from "@/components/farm/FieldBoundaryMapModal";
import { useFarmActions, useFarm, useSlurryAllocations } from "@/store/farm-store";
import type { BufferFeature } from "@/domain/buffer-gate";
import { yearsBetweenIsoDates } from "@/domain/nutrients";
import { checkSoilTestAgeValidity } from "@/domain/soil-test-validity";

// Codex remediation Priority 6 — a real "not set" option, not a silent
// "grazing" default: `plannedUse` genuinely doesn't exist until the farmer
// (or this form) sets it, and pre-selecting a real FieldUse in this
// dropdown would save it as though the farmer had chosen it the moment
// they touched Save, even if they never opened this select at all.
const FIELD_USE_OPTIONS: { value: FieldUse; label: string }[] = [
  { value: "grazing", label: "Grazing" },
  { value: "silage_1st_cut", label: "Silage — 1st cut" },
  { value: "silage_2nd_cut", label: "Silage — 2nd cut" },
  { value: "silage_3rd_cut", label: "Silage — 3rd cut" },
  { value: "mixed", label: "Mixed" },
  { value: "tillage", label: "Tillage" },
  { value: "other", label: "Other / not yet decided" },
];

// Real Mode Completion Phase 9 — "Map" was dropped: boundary editing
// already has its own dedicated "Map this field"/"Edit boundary" button
// below, a separate tab that only said "coming in a later screen" was a
// dead end, not a real second way to do the same thing.
//
// Strict Visual Reproduction phase (2026-09-03): restyled from
// Overview/Soil to Now/Soil/Activity/Constraints, matching
// media/image3.png's own literal tab bar — real content regrouped, not
// rewritten. "Overview"'s own real facts split across "Now" (current
// status: planned use, cutting window, spreading suitability, drainage,
// weather station) and "Constraints" (the real compliance-evidence
// dropdowns that already existed, just not their own tab). "Activity"
// is new — an honest link to Records, not a fabricated per-field feed:
// this app's own jobs/decisions are fetched server-side
// (`records/page.tsx`), not from the client farm-store this component
// reads, so a real field-scoped activity list isn't buildable here
// without a materially larger data-layer change.
const TABS = ["Now", "Soil", "Activity", "Constraints"] as const;

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
  const [tab, setTab] = useState<(typeof TABS)[number]>("Now");
  const [mappingOpen, setMappingOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [nameInput, setNameInput] = useState(field.name);
  const [useInput, setUseInput] = useState<FieldUse | "">(field.plannedUse?.value ?? "");
  const [areaInput, setAreaInput] = useState(String(field.areaHa));
  const {
    setFieldBoundary,
    updateFieldDetails,
    archiveField,
    restoreField,
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
      {field.archivedAt ? (
        <div className="flex items-center justify-between rounded-fr-control bg-fr-surface-alt px-3 py-2 text-sm">
          <span className="text-fr-ink-600">
            Archived {new Date(field.archivedAt).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}
            — hidden from Nutrients, Soil and other planning screens.
          </span>
          <button
            type="button"
            onClick={() => restoreField(field.id)}
            className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-fr-green-700"
          >
            <ArchiveRestore className="size-3.5" />
            Restore
          </button>
        </div>
      ) : null}

      <div className="flex items-start justify-between">
        {editOpen ? (
          <div className="flex w-full flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
              Field name
              <input
                className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
              Planned use
              <select
                className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
                value={useInput}
                onChange={(e) => setUseInput(e.target.value as FieldUse)}
              >
                <option value="" disabled>
                  Not set — choose a planned use
                </option>
                {FIELD_USE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {field.polygon ? (
              <p className="text-xs text-fr-ink-600/70">
                Area ({formatHa(field.areaHa)}) comes from the mapped boundary — edit the boundary on the Map tab to
                change it, not this field.
              </p>
            ) : (
              <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
                Area (ha) — typed, not yet mapped
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                />
              </label>
            )}
            <div className="mt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  archiveField(field.id);
                  setEditOpen(false);
                }}
                className="flex items-center gap-1.5 text-xs font-medium text-fr-risk"
              >
                <Archive className="size-3.5" />
                Archive field
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNameInput(field.name);
                    setUseInput(field.plannedUse?.value ?? "");
                    setAreaInput(String(field.areaHa));
                    setEditOpen(false);
                  }}
                  className="rounded-fr-control border border-fr-border px-3 py-1.5 text-xs font-medium text-fr-ink-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!nameInput.trim()}
                  onClick={() => {
                    const areaHa = Number(areaInput);
                    updateFieldDetails(
                      field.id,
                      {
                        ...(nameInput.trim() !== field.name ? { name: nameInput.trim() } : {}),
                        ...(useInput !== "" && useInput !== field.plannedUse?.value ? { plannedUse: useInput } : {}),
                        ...(!field.polygon && Number.isFinite(areaHa) && areaHa > 0 && areaHa !== field.areaHa
                          ? { areaHa }
                          : {}),
                      },
                      farm.ownerName,
                    );
                    setEditOpen(false);
                  }}
                  className="rounded-fr-control bg-fr-green-700 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-fr-green-700/40"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h3 className="text-title text-fr-ink-900">{field.name}</h3>
              <p className="text-sm text-fr-ink-600">{formatHa(field.areaHa)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label="Edit field name, use or archive"
                className="text-fr-ink-400 hover:text-fr-ink-600"
              >
                <Pencil className="size-4" />
              </button>
              {field.plannedUse ? <StatusBadge status={field.plannedUse.status} /> : <Pill tone="neutral">Not set</Pill>}
            </div>
          </>
        )}
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

      {tab === "Now" ? (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-3">
            <Sprout className="size-4 shrink-0 text-fr-green-700" />
            <span className="text-fr-ink-600">Planned use</span>
            <span className="ml-auto font-medium text-fr-ink-900">
              {field.plannedUse ? landUseLabel(field.plannedUse.value) : "Not set"}
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
              {field.mappedSoil?.drainage.replace(/_/g, " ") ?? "Unavailable"}
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

          {/* Real Mode Completion Phase 9 — a real field-detail drill-down,
           * not a dead end: this field's real nutrient plan is one click
           * away, deep-linked to the exact field rather than "go find it
           * yourself" on /nutrients. */}
          <div className="mt-1 border-t border-fr-border pt-3">
            <Link
              href={`/nutrients?field=${field.id}`}
              className="flex items-center justify-between rounded-fr-control border border-fr-border px-3 py-2.5 text-sm font-medium text-fr-ink-900 hover:border-fr-green-700 hover:text-fr-green-700"
            >
              Open this field&apos;s nutrient plan
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      ) : tab === "Soil" ? (
        <SoilTabContent field={field} />
      ) : tab === "Activity" ? (
        <div className="flex flex-col gap-3 text-sm">
          {/* Strict Visual Reproduction phase: a real, honest link rather
              than a fabricated per-field feed — see this file's own
              TABS comment for why a real field-scoped activity list
              isn't buildable from this component today. */}
          <p className="text-fr-ink-600">
            This field&apos;s completed jobs and recorded decisions appear in your farm&apos;s real activity history.
          </p>
          <Link
            href="/records"
            className="flex items-center justify-between rounded-fr-control border border-fr-border px-3 py-2.5 text-sm font-medium text-fr-ink-900 hover:border-fr-green-700 hover:text-fr-green-700"
          >
            Open Records
            <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : (
        // Strict Visual Reproduction phase: media/image3.png's own
        // "Constraints" tab — the same real, tested, live-wired
        // compliance-evidence gates (commonage-gate.ts, buffer-gate.ts,
        // less-method-gate.ts) that used to sit inside "Overview",
        // regrouped into their own tab, not rewritten (V3 closure pass's
        // own comment on why this capture exists is preserved below).
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1 text-xs text-fr-ink-600">
            Commonage status (S.I. 588/2025 chemical-fertiliser prohibition)
            <select
              className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
              value={field.commonageStatus?.value ?? "unknown"}
              onChange={(e) =>
                updateFieldCommonageStatus(field.id, e.target.value as "commonage" | "not_commonage" | "unknown", farm.ownerName)
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

/**
 * Real Mode Completion Phase 9 — real Soil tab, replacing the previous
 * "coming in a later screen" dead end. Same P/K-Index/pH/validity display
 * as `SoilFieldCard` (`/soil`), condensed for the drawer — one real
 * classification, shown in two places, not two separate guesses at it.
 */
function SoilTabContent({ field }: { field: Field }) {
  const { fertility } = field;
  const validity =
    fertility.verifiedTest && fertility.pIndex
      ? (() => {
          const ageYears = yearsBetweenIsoDates(fertility.verifiedTest!.sampleDate, new Date().toISOString().slice(0, 10));
          const outcome = checkSoilTestAgeValidity({ ageYears, pIndex: fertility.pIndex!.value });
          if (outcome.status !== "OK") return null;
          return outcome.value;
        })()
      : null;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-fr-ink-600">P Index</p>
          <p className="flex items-center gap-2 font-semibold text-fr-ink-900">
            {fertility.pIndex ? fertility.pIndex.value : "Not recorded"}
            <StatusBadge status={fertility.pIndex?.status ?? "unavailable"} />
          </p>
        </div>
        <div>
          <p className="text-xs text-fr-ink-600">K Index</p>
          <p className="flex items-center gap-2 font-semibold text-fr-ink-900">
            {fertility.kIndex ? fertility.kIndex.value : "Not recorded"}
            <StatusBadge status={fertility.kIndex?.status ?? "unavailable"} />
          </p>
        </div>
      </div>

      {fertility.pH ? (
        <div>
          <p className="text-xs text-fr-ink-600">pH</p>
          <p className="font-semibold text-fr-ink-900">
            {fertility.pH.value} <span className="font-normal text-fr-ink-600">({phStatusLabel(fertility.pH.value)})</span>
          </p>
        </div>
      ) : null}

      {fertility.verifiedTest ? (
        <div className="rounded-fr-control border border-fr-border p-3">
          <p className="text-xs text-fr-ink-600">
            Lab test — {fertility.verifiedTest.laboratory}, {new Date(fertility.verifiedTest.sampleDate).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}
          </p>
          {validity ? (
            <p className={cn("mt-1 text-xs font-medium", validity === "DISREGARD" ? "text-fr-risk" : "text-fr-good")}>
              {validity === "VALID"
                ? "Valid for statutory ceilings"
                : validity === "INDEX4_PERSISTED"
                  ? "P4 result still applies"
                  : "Too old for statutory ceilings (4-year limit)"}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-fr-ink-600">No lab test recorded yet — P/K are Farm Return assumptions until one is added.</p>
      )}

      <Link
        href="/soil"
        className="mt-1 flex items-center justify-between rounded-fr-control border border-fr-border px-3 py-2.5 text-sm font-medium text-fr-ink-900 hover:border-fr-green-700 hover:text-fr-green-700"
      >
        Add or review soil tests
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
