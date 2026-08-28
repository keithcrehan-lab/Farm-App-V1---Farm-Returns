"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Plus, SlidersHorizontal, Warehouse, X } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MobileDetailHeader } from "@/components/shell/MobileDetailHeader";
import { Card } from "@/components/ui/Card";
import { ShedCard } from "@/components/farm/ShedCard";
import { AssignedGroupsCard } from "@/components/farm/AssignedGroupsCard";
import { NutrientValueRow } from "@/components/farm/NutrientValueRow";
import { SuggestedAllocationCard } from "@/components/farm/SuggestedAllocationCard";
import { useFarmActions, useHousingList, useLivestockGroups, useSlurryAllocations } from "@/store/farm-store";

/**
 * Real Farm V1 Phase 11 — a real new farm can genuinely have zero housing
 * records (onboarding's Housing step is skippable). The screen used to
 * assume `useHousingList()[0]` always existed — a real crash, not just a
 * missing feature, for any farmer who hadn't added a shed yet.
 */
export default function HousingPage() {
  const housingList = useHousingList();
  const livestockGroups = useLivestockGroups();
  const slurryAllocations = useSlurryAllocations();
  const { addHousing } = useFarmActions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [shedName, setShedName] = useState("");
  const [shedType, setShedType] = useState<"slatted" | "straw_bedded" | "other">("slatted");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capacity, setCapacity] = useState("");
  const [fillPct, setFillPct] = useState("");

  const housing = housingList[selectedIndex] ?? housingList[0];
  const linkedGroups = housing ? livestockGroups.filter((g) => housing.linkedGroupIds.includes(g.id)) : [];

  async function handleAddShed(e: FormEvent) {
    e.preventDefault();
    if (!shedName.trim() || !start || !end || !(Number(capacity) > 0)) return;
    await addHousing({
      shedName: shedName.trim(),
      shedType,
      housingPeriod: { start, end },
      storageCapacityM3: Number(capacity),
      storageFillPct: fillPct ? Number(fillPct) : 0,
    });
    setShedName("");
    setStart("");
    setEnd("");
    setCapacity("");
    setFillPct("");
    setAddOpen(false);
  }

  const addForm = (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-fr-ink-900">Add shed</p>
        {housingList.length > 0 ? (
          <button type="button" onClick={() => setAddOpen(false)} className="text-fr-ink-400 hover:text-fr-ink-600" aria-label="Cancel">
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <form onSubmit={handleAddShed} className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-fr-ink-600">Shed name</span>
          <input
            type="text"
            required
            value={shedName}
            onChange={(e) => setShedName(e.target.value)}
            placeholder="e.g. Shed 1"
            className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-fr-ink-600">Type</span>
          <select
            value={shedType}
            onChange={(e) => setShedType(e.target.value as typeof shedType)}
            className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
          >
            <option value="slatted">Slatted</option>
            <option value="straw_bedded">Straw bedded</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-fr-ink-600">Housing period start</span>
            <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-fr-ink-600">Housing period end</span>
            <input type="date" required value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-fr-ink-600">Slurry storage capacity (m³)</span>
            <input type="number" required min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-fr-ink-600">Current fill (%)</span>
            <input type="number" min="0" max="100" value={fillPct} onChange={(e) => setFillPct(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900" />
          </label>
        </div>
        <p className="text-xs text-fr-ink-400">
          Slurry nutrient value starts as a placeholder until a real storage/excretion coefficient is available — see
          docs/evidence-register.md.
        </p>
        <button type="submit" className="rounded-fr-control bg-fr-green-700 py-2.5 text-sm font-semibold text-white">
          Add shed
        </button>
      </form>
    </Card>
  );

  return (
    <>
      <MobileDetailHeader title="Housing & Slurry" backHref="/livestock" />
      <PageHeader title="Housing & Slurry" subtitle="Shed assignment, slurry inventory and organic nutrient value" />

      {!housing ? (
        <div className="flex flex-col items-center gap-3 rounded-fr-card border border-dashed border-fr-border py-12 text-center">
          <Warehouse className="size-8 text-fr-ink-400" />
          <p className="text-sm font-medium text-fr-ink-900">No housing recorded yet</p>
          <p className="max-w-xs text-sm text-fr-ink-600">
            Add your winter housing to see slurry capacity, storage fill and organic nutrient value.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {!housing || addOpen ? (
          addForm
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center justify-center gap-2 rounded-fr-control border border-dashed border-fr-border py-2.5 text-sm font-semibold text-fr-green-700 hover:border-fr-green-700"
          >
            <Plus className="size-4" />
            Add another shed
          </button>
        )}

        {housing ? (
          <>
            {housingList.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto">
                {housingList.map((h, i) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelectedIndex(i)}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      i === selectedIndex ? "border-fr-green-700 text-fr-green-700" : "border-fr-border text-fr-ink-600"
                    }`}
                  >
                    {h.shedName}
                  </button>
                ))}
              </div>
            ) : null}
            <ShedCard housing={housing} />
            <AssignedGroupsCard groups={linkedGroups} />
            <NutrientValueRow slurry={housing.slurryEstimate} />
            <SuggestedAllocationCard allocations={slurryAllocations} />

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled
                title="Manual refinement (tank dimensions, fill level, analysis) arrives with the Phase 2 data model"
                className="flex flex-1 items-center justify-center gap-2 rounded-fr-control border border-fr-border py-3 text-sm font-semibold text-fr-ink-600"
              >
                <SlidersHorizontal className="size-4" />
                Refine estimate
              </button>
              <a
                href="/spreading"
                className="flex flex-1 items-center justify-center gap-2 rounded-fr-control bg-fr-green-700 py-3 text-sm font-semibold text-white"
              >
                View spreading plan
                <ArrowRight className="size-4" />
              </a>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
