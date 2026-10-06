"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Layers3, LocateFixed, Plus, Search, X } from "lucide-react";
import { MapHero } from "@/components/farm/MapHero";
import { useFarm, useFields } from "@/store/farm-store";
import { formatHa } from "@/lib/format";
import { landUseLabel, landUseTone } from "@/lib/status";
import type { Field } from "@/domain/types";

const LENSES = ["Current", "Grass", "Nutrients", "Soil", "Conditions"] as const;
type Lens = (typeof LENSES)[number];

function soilSummary(field: Field) {
  const bits: string[] = [];
  if (field.fertility?.ph?.value != null) bits.push(`pH ${field.fertility.ph.value}`);
  if (field.fertility?.pIndex?.value != null) bits.push(`P${field.fertility.pIndex.value}`);
  if (field.fertility?.kIndex?.value != null) bits.push(`K${field.fertility.kIndex.value}`);
  return bits.join(" · ");
}

export function FarmSpatialV2() {
  const farm = useFarm();
  const fields = useFields();
  const mappedFields = useMemo(() => fields.filter((field) => field.polygon), [fields]);
  const [selectedFieldId, setSelectedFieldId] = useState<string>();
  const [lens, setLens] = useState<Lens>("Current");
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const selectedField = fields.find((field) => field.id === selectedFieldId);

  return (
    <section className="relative isolate min-h-[calc(100dvh-5rem)] overflow-hidden bg-[#132219] lg:min-h-[calc(100vh-4rem)] lg:rounded-[28px] lg:shadow-[0_24px_80px_rgba(13,31,20,.18)]">
      <MapHero
        fields={mappedFields}
        center={farm.location.centroid}
        selectedFieldId={selectedFieldId}
        onSelectField={(id) => {
          setSelectedFieldId(id);
          setActivitiesOpen(false);
        }}
        getTone={(field) => (field.plannedUse ? landUseTone(field.plannedUse.value) : "neutral")}
        getStatusLabel={(field) => (field.plannedUse ? landUseLabel(field.plannedUse.value) : undefined)}
        flyToSelection
        flyToPadding={{ top: 150, bottom: selectedField ? 330 : 150, left: 50, right: 50 }}
        flyToMaxZoom={16}
        glowSelection
        compactNeighbourLabels
        plain
        className="absolute inset-0 h-full min-h-full"
      />

      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-black/55 via-transparent to-black/45" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-white">
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Farm Return</p>
            <h1 className="truncate font-display text-[28px] leading-tight drop-shadow-sm">{farm.name}</h1>
            <p className="mt-1 text-sm text-white/75">{mappedFields.length} mapped fields</p>
          </div>
          <div className="pointer-events-auto flex gap-2">
            <button type="button" aria-label="Search farm" className="grid size-10 place-items-center rounded-full border border-white/20 bg-[#14261c]/65 text-white shadow-lg backdrop-blur-xl">
              <Search className="size-[18px]" />
            </button>
            <button type="button" aria-label="Map controls" className="grid size-10 place-items-center rounded-full border border-white/20 bg-[#14261c]/65 text-white shadow-lg backdrop-blur-xl">
              <LocateFixed className="size-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <div className="pointer-events-auto absolute right-4 top-28 z-20 flex flex-col gap-2">
        <div className="grid size-10 place-items-center rounded-full border border-white/20 bg-[#14261c]/65 text-white shadow-lg backdrop-blur-xl" aria-hidden="true">
          <Layers3 className="size-[18px]" />
        </div>
      </div>

      {!selectedField ? (
        <div className="pointer-events-auto absolute inset-x-3 bottom-5 z-20 sm:inset-x-5">
          <div className="mx-auto flex max-w-xl items-center gap-1 overflow-x-auto rounded-full border border-white/15 bg-[#14261c]/78 p-1.5 shadow-2xl backdrop-blur-xl">
            {LENSES.map((item) => (
              <button key={item} type="button" onClick={() => setLens(item)} className={`min-w-max flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${lens === item ? "bg-[#f3efe4] text-[#173221]" : "text-white/72 hover:text-white"}`}>
                {item}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] font-medium text-white/65 drop-shadow">Tap a field to open its live record</p>
        </div>
      ) : null}

      {selectedField ? (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30">
          <div className="mx-auto max-w-2xl rounded-t-[30px] border-t border-[#ded8c9] bg-[#f6f2e8]/[0.97] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_60px_rgba(12,30,18,.22)] backdrop-blur-xl sm:mb-4 sm:rounded-[30px] sm:border">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#1c3425]/20" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#657165]">Selected field</p>
                <h2 className="mt-0.5 font-display text-[27px] leading-tight text-[#16291c]">{selectedField.name}</h2>
                <p className="mt-1 text-sm text-[#687166]">
                  {formatHa(selectedField.areaHa)}
                  {selectedField.plannedUse ? ` · ${landUseLabel(selectedField.plannedUse.value)}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => { setSelectedFieldId(undefined); setActivitiesOpen(false); }} aria-label="Close field" className="grid size-9 place-items-center rounded-full bg-[#e9e4d8] text-[#294031]">
                <X className="size-4" />
              </button>
            </div>

            {!activitiesOpen ? (
              <>
                <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-[#dcd6c8] py-4 text-sm">
                  <div><p className="text-[11px] uppercase tracking-wide text-[#81887f]">Soil</p><p className="mt-0.5 font-semibold text-[#203629]">{soilSummary(selectedField) || "Not yet recorded"}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-[#81887f]">Soil type</p><p className="mt-0.5 truncate font-semibold text-[#203629]">{selectedField.mappedSoil?.seriesName ?? "Not yet resolved"}</p></div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => setActivitiesOpen(true)} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#173c28] px-4 py-3 text-sm font-semibold text-white shadow-sm">
                    <Plus className="size-4" /> Activity
                  </button>
                  <Link href={`/fields?field=${selectedField.id}`} className="flex flex-1 items-center justify-center gap-1 rounded-full border border-[#cfc8b9] bg-white/55 px-4 py-3 text-sm font-semibold text-[#21382a]">
                    Open field <ChevronRight className="size-4" />
                  </Link>
                </div>
              </>
            ) : (
              <div className="mt-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-display text-xl text-[#16291c]">Record activity</h3>
                  <button type="button" onClick={() => setActivitiesOpen(false)} className="text-xs font-semibold text-[#536359]">Back</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`/spreading/plan?field=${selectedField.id}`} className="rounded-2xl border border-[#d8d1c2] bg-white/55 p-3 text-sm font-semibold text-[#203629]">Spread slurry</Link>
                  <Link href={`/nutrients?field=${selectedField.id}`} className="rounded-2xl border border-[#d8d1c2] bg-white/55 p-3 text-sm font-semibold text-[#203629]">Apply fertiliser</Link>
                  <Link href={`/soil-sample/${selectedField.id}`} className="rounded-2xl border border-[#d8d1c2] bg-white/55 p-3 text-sm font-semibold text-[#203629]">Soil sample</Link>
                  <Link href={`/fields?field=${selectedField.id}`} className="rounded-2xl border border-[#d8d1c2] bg-white/55 p-3 text-sm font-semibold text-[#203629]">More field actions</Link>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#737b72]">Only activities already backed by Farm Return records are shown here. Livestock movement will appear once field assignment is persisted in the farm model.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
