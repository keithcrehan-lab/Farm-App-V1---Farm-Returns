"use client";

import { useState } from "react";
import { Layers, Minus, Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { FieldMap } from "@/components/farm/FieldMap";
import { FieldListRow } from "@/components/farm/FieldListRow";
import { FieldDrawer } from "@/components/farm/FieldDrawer";
import { MapLegend } from "@/components/farm/MapLegend";
import { useFields } from "@/store/farm-store";
import { landUseTone } from "@/lib/status";
import { cn } from "@/lib/cn";

const MOBILE_TABS = ["Map", "Soil", "Zones"] as const;

export default function FieldsPage() {
  const fields = useFields();
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>(undefined);
  const [mobileTab, setMobileTab] = useState<(typeof MOBILE_TABS)[number]>("Map");
  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? fields[0];
  const effectiveSelectedId = selectedFieldId ?? fields[0]?.id;

  return (
    <>
      <PageHeader title="Farm Map" subtitle="Field boundaries, planned use and per-field detail" />

      {/* Mobile header + segmented tabs */}
      <div className="mb-4 lg:hidden">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-title text-fr-ink-900">Fields</h1>
          <span className="text-sm text-fr-ink-600">All Fields ({fields.length})</span>
        </div>
        <div className="flex gap-1 rounded-full border border-fr-border bg-fr-surface p-1">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMobileTab(tab)}
              aria-disabled={tab !== "Map"}
              className={cn(
                "flex-1 rounded-full py-1.5 text-sm font-medium transition-colors",
                mobileTab === tab
                  ? "bg-fr-green-700 text-white"
                  : tab === "Map"
                    ? "text-fr-ink-600"
                    : "text-fr-ink-400",
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-5">
        <div className="min-w-0 lg:col-span-2">
          <Card className="overflow-hidden p-0">
            <div className="relative">
              <FieldMap
                fields={fields}
                getTone={(field) => landUseTone(field.plannedUse.value)}
                selectedFieldId={effectiveSelectedId}
                onSelectField={setSelectedFieldId}
                className="rounded-none"
              />
              <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border border-white/20 bg-black/40 backdrop-blur">
                <button type="button" className="p-2 text-white hover:bg-white/10" aria-label="Zoom in">
                  <Plus className="size-4" />
                </button>
                <button type="button" className="p-2 text-white hover:bg-white/10" aria-label="Zoom out">
                  <Minus className="size-4" />
                </button>
              </div>
              <button
                type="button"
                className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur"
              >
                <Layers className="size-3.5" />
                Layers
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <MapLegend />
            </div>
          </Card>

          <div className="mt-4 hidden lg:block">
            {selectedField ? <FieldDrawer field={selectedField} /> : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          {fields.map((field) => (
            <FieldListRow
              key={field.id}
              field={field}
              selected={field.id === effectiveSelectedId}
              onSelect={setSelectedFieldId}
            />
          ))}
        </div>

        <div className="min-w-0 lg:hidden">
          {selectedField ? <FieldDrawer field={selectedField} /> : null}
        </div>
      </div>
    </>
  );
}
