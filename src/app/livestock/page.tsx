"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { LivestockHeroCard } from "@/components/farm/LivestockHeroCard";
import { LivestockGroupCard } from "@/components/farm/LivestockGroupCard";
import { FINISHING_OPTIONS } from "@/app/livestock/[groupId]/LivestockEconomicsView";
import { useFarmActions, useLivestockGroups } from "@/store/farm-store";
import { cn } from "@/lib/cn";
import type { LivestockCategory } from "@/domain/types";

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

export default function LivestockPage() {
  const livestockGroups = useLivestockGroups();
  const { addLivestockGroup } = useFarmActions();
  const [tab, setTab] = useState<Tab>("Overview");

  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState<LivestockCategory>("suckler_cow");
  const [newCount, setNewCount] = useState("");
  const [newAvgWeightKg, setNewAvgWeightKg] = useState("");
  const [newSystem, setNewSystem] = useState<"grazing" | "housed">("grazing");

  function handleAddGroup(e: FormEvent) {
    e.preventDefault();
    const count = Number(newCount);
    const avgWeightKg = newAvgWeightKg ? Number(newAvgWeightKg) : undefined;
    if (!newLabel.trim() || !Number.isFinite(count) || count <= 0) return;
    addLivestockGroup({
      label: newLabel.trim(),
      category: newCategory,
      count,
      avgWeightKg: avgWeightKg !== undefined && Number.isFinite(avgWeightKg) ? avgWeightKg : undefined,
      system: newSystem,
    });
    setNewLabel("");
    setNewCategory("suckler_cow");
    setNewCount("");
    setNewAvgWeightKg("");
    setNewSystem("grazing");
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
        <p className="py-16 text-center text-sm text-fr-ink-400">
          Group management (rename, split, merge) is a Phase 2+ flow — coming soon.
        </p>
      )}
    </>
  );
}
