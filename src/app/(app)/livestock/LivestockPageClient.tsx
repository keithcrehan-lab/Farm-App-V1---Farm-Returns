"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Pencil, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { LivestockHeroCard } from "@/components/farm/LivestockHeroCard";
import { LivestockGroupCard } from "@/components/farm/LivestockGroupCard";
import { FINISHING_OPTIONS } from "@/app/(app)/livestock/[groupId]/LivestockEconomicsView";
import { IndividualAnimalsCard } from "@/components/farm/IndividualAnimalsCard";
import { useFarm, useFarmActions, useHousingList, useLivestockGroups } from "@/store/farm-store";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { IndividualAnimal, LivestockCategory, WeightObservation } from "@/domain/types";

const LOCAL_TABS = ["Overview", "Groups"] as const;
type Tab = (typeof LOCAL_TABS)[number];

const CATEGORY_LABEL: Record<LivestockCategory, string> = {
  suckler_cow: "Suckler cow",
  dairy_cow: "Dairy cow",
  bull: "Bull",
  calf: "Calf",
  weanling: "Weanling",
  store: "Store",
  steer: "Steer",
  heifer: "Heifer",
};
const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABEL) as LivestockCategory[];

export function LivestockPageClient({
  farmId,
  individualAnimals,
  weightObservations,
}: {
  farmId: string | null;
  individualAnimals: IndividualAnimal[];
  weightObservations: WeightObservation[];
}) {
  const farm = useFarm();
  const livestockGroups = useLivestockGroups();
  const housingList = useHousingList();
  const { addLivestockGroup } = useFarmActions();
  const [tab, setTab] = useState<Tab>("Overview");

  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState<LivestockCategory>("suckler_cow");
  const [newCount, setNewCount] = useState("");
  const [newAvgWeightKg, setNewAvgWeightKg] = useState("");
  const [newSystem, setNewSystem] = useState<"grazing" | "housed">("grazing");
  const [newHousingId, setNewHousingId] = useState("");

  async function handleAddGroup(e: FormEvent) {
    e.preventDefault();
    const count = Number(newCount);
    const avgWeightKg = newAvgWeightKg ? Number(newAvgWeightKg) : undefined;
    if (!newLabel.trim() || !Number.isFinite(count) || count <= 0) return;
    // addLivestockGroup resolves a Promise — in real mode the new group's
    // id comes from Postgres, not a client-generated placeholder.
    await addLivestockGroup({
      label: newLabel.trim(),
      category: newCategory,
      count,
      avgWeightKg: avgWeightKg !== undefined && Number.isFinite(avgWeightKg) ? avgWeightKg : undefined,
      system: newSystem,
      ...(newHousingId ? { housingId: newHousingId } : {}),
    });
    setNewLabel("");
    setNewCategory("suckler_cow");
    setNewCount("");
    setNewAvgWeightKg("");
    setNewSystem("grazing");
    setNewHousingId("");
    setAddOpen(false);
  }

  return (
    <>
      <PageHeader title="Livestock" subtitle="Animal groups, numbers, weight/value and housing link" />
      <h1 className="mb-3 text-title text-fr-ink-900 lg:hidden">Livestock</h1>

      <div className="mb-4 flex gap-5 border-b border-fr-border">
        {LOCAL_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 pb-2.5 text-sm font-medium transition-colors",
              tab === t
                ? "border-fr-green-700 text-fr-green-700"
                : "border-transparent text-fr-ink-400 hover:text-fr-ink-600",
            )}
          >
            {t}
          </button>
        ))}
        {/* Housing is its own screen (spec: "contextual" route), not a tab panel */}
        <Link
          href="/housing"
          className="border-b-2 border-transparent pb-2.5 text-sm font-medium text-fr-ink-400 hover:text-fr-ink-600"
        >
          Housing
        </Link>
      </div>

      {tab === "Overview" ? (
        <div className="flex flex-col gap-4">
          <LivestockHeroCard />
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
            {livestockGroups.map((group) => (
              <LivestockGroupCard
                key={group.id}
                group={group}
                hasEconomics={group.id in FINISHING_OPTIONS}
              />
            ))}
          </div>

          {farmId ? (
            <IndividualAnimalsCard
              farmId={farmId}
              groups={livestockGroups}
              animals={individualAnimals}
              weightObservations={weightObservations}
            />
          ) : null}

          {addOpen ? (
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-fr-ink-900">Add livestock group</p>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="text-fr-ink-400 hover:text-fr-ink-600"
                  aria-label="Cancel"
                >
                  <X className="size-4" />
                </button>
              </div>
              <form onSubmit={handleAddGroup} className="flex flex-col gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-fr-ink-600">Group name</span>
                  <input
                    type="text"
                    required
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g. Spring Calves"
                    className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-fr-ink-600">Category</span>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as LivestockCategory)}
                      className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-fr-ink-600">System</span>
                    <select
                      value={newSystem}
                      onChange={(e) => setNewSystem(e.target.value as "grazing" | "housed")}
                      className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                    >
                      <option value="grazing">Grazing</option>
                      <option value="housed">Housed</option>
                    </select>
                  </label>
                  {housingList.length > 0 ? (
                    <label className="block">
                      <span className="mb-1 block text-xs text-fr-ink-600">Housing (optional)</span>
                      <select
                        value={newHousingId}
                        onChange={(e) => setNewHousingId(e.target.value)}
                        className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                      >
                        <option value="">No shed linked</option>
                        {housingList.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.shedName}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="block">
                    <span className="mb-1 block text-xs text-fr-ink-600">Count</span>
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      value={newCount}
                      onChange={(e) => setNewCount(e.target.value)}
                      placeholder="e.g. 12"
                      className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-fr-ink-600">Avg weight (kg)</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={newAvgWeightKg}
                      onChange={(e) => setNewAvgWeightKg(e.target.value)}
                      placeholder="optional"
                      className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                    />
                  </label>
                </div>
                <p className="text-xs text-fr-ink-400">
                  Count is confirmed by you; weight and value start as Farm Return assumptions until refined.
                </p>
                <button
                  type="submit"
                  className="rounded-fr-control bg-fr-green-700 py-2.5 text-sm font-semibold text-white"
                >
                  Add group
                </button>
              </form>
            </Card>
          ) : (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center justify-center gap-2 rounded-fr-control border border-dashed border-fr-border py-3 text-sm font-semibold text-fr-green-700 hover:border-fr-green-700"
            >
              <Plus className="size-4" />
              Add New Group
            </button>
          )}
        </div>
      ) : (
        <GroupsTab groups={livestockGroups} housingList={housingList} farmerName={farm.ownerName} />
      )}
    </>
  );
}

/**
 * Real Mode Completion Phase 26 (editability) — replaces the previous
 * "Group management ... is a Phase 2+ flow — coming soon" dead end.
 * Rename, correct a count/weight/breed, change system/goal, link/unlink
 * housing — not split/merge (a genuinely different, bigger feature: it
 * would need to divide one group's real DB row into two while preserving
 * history, not just patch fields on the existing row).
 */
function GroupsTab({
  groups,
  housingList,
  farmerName,
}: {
  groups: ReturnType<typeof useLivestockGroups>;
  housingList: ReturnType<typeof useHousingList>;
  farmerName: string;
}) {
  const { updateLivestockGroup } = useFarmActions();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [count, setCount] = useState("");
  const [avgWeightKg, setAvgWeightKg] = useState("");
  const [breed, setBreed] = useState("");
  const [system, setSystem] = useState<"grazing" | "housed">("grazing");
  const [goal, setGoal] = useState<string>("");
  const [housingId, setHousingId] = useState("");

  if (groups.length === 0) {
    return <p className="py-16 text-center text-sm text-fr-ink-400">No livestock groups yet — add one on the Overview tab.</p>;
  }

  function startEdit(group: (typeof groups)[number]) {
    setEditingId(group.id);
    setLabel(group.label);
    setCount(String(group.count.value));
    setAvgWeightKg(group.avgWeightKg ? String(group.avgWeightKg.value) : "");
    setBreed(group.breed ?? "");
    setSystem(group.system);
    setGoal(group.goal ?? "");
    setHousingId(group.housingId ?? "");
  }

  return (
    <ul className="flex flex-col gap-3">
      {groups.map((group) => {
        const editing = editingId === group.id;
        return (
          <li key={group.id} className="rounded-fr-card border border-fr-border p-4">
            {!editing ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-fr-ink-900">{group.label}</p>
                  <p className="text-xs text-fr-ink-600">
                    {formatNumber(group.count.value, 0)} head
                    {group.avgWeightKg ? ` · avg ${formatNumber(group.avgWeightKg.value, 0)} kg` : ""}
                    {group.breed ? ` · ${group.breed}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(group)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-fr-green-700"
                >
                  <Pencil className="size-3.5" />
                  Edit
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-fr-ink-600">Group name</span>
                    <input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-fr-ink-600">Count</span>
                    <input
                      type="number"
                      min={1}
                      value={count}
                      onChange={(e) => setCount(e.target.value)}
                      className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-fr-ink-600">Avg weight (kg)</span>
                    <input
                      type="number"
                      min={0}
                      value={avgWeightKg}
                      onChange={(e) => setAvgWeightKg(e.target.value)}
                      className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-fr-ink-600">Breed</span>
                    <input
                      value={breed}
                      onChange={(e) => setBreed(e.target.value)}
                      className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-fr-ink-600">System</span>
                    <select
                      value={system}
                      onChange={(e) => setSystem(e.target.value as "grazing" | "housed")}
                      className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                    >
                      <option value="grazing">Grazing</option>
                      <option value="housed">Housed</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-fr-ink-600">Housing</span>
                    <select
                      value={housingId}
                      onChange={(e) => setHousingId(e.target.value)}
                      className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                    >
                      <option value="">No shed linked</option>
                      {housingList.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.shedName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-fr-ink-600">Goal</span>
                    <select
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                    >
                      <option value="">Not set</option>
                      <option value="maintain">Maintain</option>
                      <option value="grow">Grow</option>
                      <option value="breed">Breed</option>
                      <option value="sell_store">Sell as store</option>
                      <option value="finish_slaughter">Finish to slaughter</option>
                    </select>
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingId(null)} className="text-xs font-medium text-fr-ink-600">
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-fr-control bg-fr-green-700 px-3 py-1.5 text-xs font-semibold text-white"
                    onClick={() => {
                      updateLivestockGroup(
                        group.id,
                        {
                          label: label.trim(),
                          count: Number(count),
                          ...(avgWeightKg ? { avgWeightKg: Number(avgWeightKg) } : {}),
                          ...(breed ? { breed } : {}),
                          system,
                          housingId: housingId || null,
                          ...(goal ? { goal: goal as "maintain" | "grow" | "breed" | "sell_store" | "finish_slaughter" } : {}),
                        },
                        farmerName,
                      );
                      setEditingId(null);
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
