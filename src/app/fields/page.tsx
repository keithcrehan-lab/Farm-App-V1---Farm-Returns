"use client";

import { useState, type FormEvent } from "react";
import { Layers, Minus, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { FieldMap } from "@/components/farm/FieldMap";
import { FieldListRow } from "@/components/farm/FieldListRow";
import { FieldDrawer } from "@/components/farm/FieldDrawer";
import { MapLegend } from "@/components/farm/MapLegend";
import { useFarmActions, useFields } from "@/store/farm-store";
import { landUseLabel, landUseTone } from "@/lib/status";
import { cn } from "@/lib/cn";
import type { FieldUse } from "@/domain/types";

const MOBILE_TABS = ["Map", "Soil", "Zones"] as const;

const PLANNED_USE_OPTIONS: FieldUse[] = [
  "grazing",
  "silage_1st_cut",
  "silage_2nd_cut",
  "silage_3rd_cut",
  "tillage",
  "mixed",
  "other",
];

export default function FieldsPage() {
  const fields = useFields();
  const { addField } = useFarmActions();
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>(undefined);
  const [mobileTab, setMobileTab] = useState<(typeof MOBILE_TABS)[number]>("Map");
  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? fields[0];
  const effectiveSelectedId = selectedFieldId ?? fields[0]?.id;

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAreaHa, setNewAreaHa] = useState("");
  const [newUse, setNewUse] = useState<FieldUse>("grazing");

  function handleAddField(e: FormEvent) {
    e.preventDefault();
    const areaHa = Number(newAreaHa);
    if (!newName.trim() || !Number.isFinite(areaHa) || areaHa <= 0) return;
    const field = addField({ name: newName.trim(), areaHa, plannedUse: newUse });
    setSelectedFieldId(field.id);
    setNewName("");
    setNewAreaHa("");
    setNewUse("grazing");
    setAddOpen(false);
  }

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
          {addOpen ? (
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-fr-ink-900">Add field</p>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="text-fr-ink-400 hover:text-fr-ink-600"
                  aria-label="Cancel"
                >
                  <X className="size-4" />
                </button>
              </div>
              <form onSubmit={handleAddField} className="flex flex-col gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-fr-ink-600">Field name</span>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Bog Field"
                    className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-fr-ink-600">Area (ha)</span>
                  <input
                    type="number"
                    required
                    min="0.1"
                    step="0.1"
                    value={newAreaHa}
                    onChange={(e) => setNewAreaHa(e.target.value)}
                    placeholder="e.g. 4.2"
                    className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-fr-ink-600">Planned use</span>
                  <select
                    value={newUse}
                    onChange={(e) => setNewUse(e.target.value as FieldUse)}
                    className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                  >
                    {PLANNED_USE_OPTIONS.map((use) => (
                      <option key={use} value={use}>
                        {landUseLabel(use)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-fr-ink-400">
                  Soil and fertility start as Farm Return assumptions until mapped or tested — same as every other
                  field.
                </p>
                <button
                  type="submit"
                  className="rounded-fr-control bg-fr-green-700 py-2.5 text-sm font-semibold text-white"
                >
                  Add field
                </button>
              </form>
            </Card>
          ) : (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center justify-center gap-2 rounded-fr-control border border-dashed border-fr-border py-2.5 text-sm font-semibold text-fr-green-700 hover:border-fr-green-700"
            >
              <Plus className="size-4" />
              Add field
            </button>
          )}
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
