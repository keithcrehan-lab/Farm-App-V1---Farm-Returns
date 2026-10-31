"use client";

/**
 * Pilot Integration P3 — Cattle → Manage herd (`/cattle/manage`). This is the former Livestock screen's management UI,
 * moved under Cattle unchanged in behaviour (DECISIONS D14): add a group, edit a group (name, headcount, weight, breed,
 * system, housing link, finishing goal), the group value and economics cards, and add an individual animal. It writes
 * through the existing livestock actions, which resolve the farm server-side; the herd itself, its animals and their
 * weights are shown and recorded on Cattle. Real (signed-in) mode only: the demonstration herd has nothing to manage.
 */
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { ProgressiveDisclosure } from "@/components/ui/ProgressiveDisclosure";
import { LivestockHeroCard } from "@/components/farm/LivestockHeroCard";
import { LivestockGroupCard } from "@/components/farm/LivestockGroupCard";
import { finishingOptionsForGroup } from "@/domain/livestock";
import { AddAnimalCard } from "@/components/farm/AddAnimalCard";
import { BackLink } from "@/components/cattle/ui";
import { useFarm, useFarmActions, useHousingList, useLivestockGroups } from "@/store/farm-store";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { LivestockCategory } from "@/domain/types";

const LOCAL_TABS = ["Overview", "Groups"] as const;
export type Tab = (typeof LOCAL_TABS)[number];

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

const GOAL_LABEL: Record<string, string> = {
  maintain: "Maintain",
  grow: "Grow",
  breed: "Breed",
  sell_store: "Sell as store",
  finish_slaughter: "Finish to slaughter",
};

export function HerdManagementClient({ farmId, initialTab }: { farmId: string; initialTab: Tab }) {
  const farm = useFarm();
  const livestockGroups = useLivestockGroups();
  const housingList = useHousingList();
  const { addLivestockGroup } = useFarmActions();
  const [tab, setTab] = useState<Tab>(initialTab);

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
      <BackLink href="/cattle" label="Cattle" />
      <PageHeader title="Manage herd" subtitle="Groups, headcounts, housing links and new animals — the same records Cattle shows" />
      <h1 className="mb-3 text-title text-fr-ink-900 lg:hidden">Manage herd</h1>

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
                hasEconomics={finishingOptionsForGroup(group).status === "OK"}
              />
            ))}
          </div>

          <AddAnimalCard farmId={farmId} groups={livestockGroups} />

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
  const { deleteLivestockGroup, updateLivestockGroup } = useFarmActions();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-fr-border pb-4">
        <div>
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fr-v2-gold">Livestock groups</p>
          <p className="mt-1 text-sm text-fr-ink-600">Select a group to review it. Open only the section you need to change.</p>
        </div>
        <p className="text-xs text-fr-ink-400">{groups.length} group{groups.length === 1 ? "" : "s"}</p>
      </div>

      <ul className="flex flex-col gap-3">
        {groups.map((group) => {
          const editing = editingId === group.id;
          const linkedHousing = housingList.find((h) => h.id === group.housingId);
          const managementSummary = `${group.system === "grazing" ? "Grazing" : "Housed"}${group.breed ? ` · ${group.breed}` : ""}`;
          const housingSummary = linkedHousing?.shedName ?? (group.system === "housed" ? "No shed linked" : "No housing link needed");
          const goalSummary = group.goal ? GOAL_LABEL[group.goal] ?? group.goal : "No finishing goal set";

          return (
            <li key={group.id} className="overflow-hidden rounded-fr-card border border-fr-border bg-fr-surface">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-fr-ink-900">{group.label}</p>
                    <span className="rounded-full bg-fr-surface-alt px-2.5 py-1 text-[11px] font-medium text-fr-ink-600">
                      {CATEGORY_LABEL[group.category]}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <span>
                      <strong className="font-semibold text-fr-ink-900">{formatNumber(group.count.value, 0)}</strong>
                      <span className="ml-1 text-fr-ink-600">head</span>
                    </span>
                    <span>
                      <strong className="font-semibold text-fr-ink-900">
                        {group.avgWeightKg ? `${formatNumber(group.avgWeightKg.value, 0)} kg` : "Not recorded"}
                      </strong>
                      <span className="ml-1 text-fr-ink-600">avg weight</span>
                    </span>
                    <span className="text-fr-ink-600">{managementSummary}</span>
                  </div>
                  <p className="mt-2 text-xs text-fr-ink-400">
                    {housingSummary} · {goalSummary}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => editing ? setEditingId(null) : startEdit(group)}
                  className={`flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-fr-control px-3 text-sm font-semibold ${
                    editing ? "border border-fr-border text-fr-ink-600" : "border border-fr-green-700 text-fr-green-700"
                  }`}
                >
                  {editing ? <X className="size-4" /> : <Pencil className="size-4" />}
                  {editing ? "Close" : "Edit details"}
                </button>
              </div>

              {editing ? (
                <div className="border-t border-fr-border px-4 pb-4">
                  <ProgressiveDisclosure
                    label="1 · Core group record"
                    summary={`${label || group.label} · ${count || group.count.value} head${avgWeightKg ? ` · ${avgWeightKg} kg avg` : " · weight not recorded"}`}
                    status="neutral"
                    defaultOpen
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs text-fr-ink-600">Group name</span>
                        <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-3 py-2.5 text-base text-fr-ink-900" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-fr-ink-600">Headcount</span>
                        <input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-3 py-2.5 text-base text-fr-ink-900" />
                        <span className="mt-1 block text-[11px] text-fr-ink-400">Confirmed by you when saved.</span>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-fr-ink-600">Average weight (kg)</span>
                        <input type="number" min={0} value={avgWeightKg} onChange={(e) => setAvgWeightKg(e.target.value)} placeholder="Not recorded" className="w-full rounded-fr-control border border-fr-border px-3 py-2.5 text-base text-fr-ink-900" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-fr-ink-600">Breed</span>
                        <input value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="Not recorded" className="w-full rounded-fr-control border border-fr-border px-3 py-2.5 text-base text-fr-ink-900" />
                      </label>
                    </div>
                  </ProgressiveDisclosure>

                  <ProgressiveDisclosure
                    label="2 · Management"
                    summary={`${system === "grazing" ? "Grazing" : "Housed"} system`}
                    status="neutral"
                  >
                    <label className="block max-w-md">
                      <span className="mb-1 block text-xs text-fr-ink-600">Current system</span>
                      <select value={system} onChange={(e) => setSystem(e.target.value as "grazing" | "housed")} className="w-full rounded-fr-control border border-fr-border px-3 py-2.5 text-base text-fr-ink-900">
                        <option value="grazing">Grazing</option>
                        <option value="housed">Housed</option>
                      </select>
                    </label>
                  </ProgressiveDisclosure>

                  <ProgressiveDisclosure
                    label="3 · Housing & economics"
                    summary={`${housingId ? housingList.find((h) => h.id === housingId)?.shedName ?? "Housing linked" : "No shed linked"} · ${goal ? GOAL_LABEL[goal] ?? goal : "No finishing goal"}`}
                    status={system === "housed" && !housingId ? "attention" : "neutral"}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs text-fr-ink-600">Housing link</span>
                        <select value={housingId} onChange={(e) => setHousingId(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-3 py-2.5 text-base text-fr-ink-900">
                          <option value="">No shed linked</option>
                          {housingList.map((h) => (
                            <option key={h.id} value={h.id}>{h.shedName}</option>
                          ))}
                        </select>
                        <span className="mt-1 block text-[11px] text-fr-ink-400">Uses the existing Housing record; no shed details are re-entered here.</span>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-fr-ink-600">Finishing goal</span>
                        <select value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full rounded-fr-control border border-fr-border px-3 py-2.5 text-base text-fr-ink-900">
                          <option value="">Not set</option>
                          <option value="maintain">Maintain</option>
                          <option value="grow">Grow</option>
                          <option value="breed">Breed</option>
                          <option value="sell_store">Sell as store</option>
                          <option value="finish_slaughter">Finish to slaughter</option>
                        </select>
                      </label>
                    </div>
                  </ProgressiveDisclosure>

                  {deleteConfirmId === group.id ? (
                    <div className="mt-4 border-t border-fr-risk/30 bg-fr-risk/5 p-4">
                      <p className="text-sm font-semibold text-fr-risk">Delete {group.label}?</p>
                      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fr-ink-600">
                        This removes the group from herd totals and calculations. Any individual animals linked to this group are not deleted; they remain in Cattle but become ungrouped. This action cannot be undone.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setDeleteConfirmId(null)} className="min-h-10 rounded-fr-control border border-fr-border px-4 text-sm font-semibold text-fr-ink-600">Keep group</button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteLivestockGroup(group.id);
                            setDeleteConfirmId(null);
                            setEditingId(null);
                          }}
                          className="flex min-h-10 items-center gap-2 rounded-fr-control bg-fr-risk px-4 text-sm font-semibold text-white"
                        >
                          <Trash2 className="size-4" /> Delete group permanently
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-fr-border pt-4">
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(group.id)}
                      className="flex min-h-10 items-center gap-2 rounded-fr-control px-2 text-sm font-semibold text-fr-risk"
                    >
                      <Trash2 className="size-4" /> Delete group
                    </button>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => setEditingId(null)} className="min-h-10 rounded-fr-control px-4 text-sm font-medium text-fr-ink-600">Cancel</button>
                      <button
                      type="button"
                      disabled={!label.trim() || !(Number(count) > 0)}
                      className="min-h-10 rounded-fr-control bg-fr-green-700 px-4 text-sm font-semibold text-white disabled:opacity-40"
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
                      Save changes
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
