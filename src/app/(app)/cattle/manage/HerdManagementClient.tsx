"use client";

/**
 * Pilot Integration P3 — Cattle → Add cattle (`/cattle/manage`), DECISIONS D14. An admin entry point only: add a new
 * group (name, category, count — nothing another workflow owns) or an individual animal. Existing groups are opened
 * from Cattle; their record is corrected in the group workspace (`/cattle/groups/<id>`), where moves, weighings and the
 * production goal are also recorded. Housing is its own destination. It writes through the existing livestock
 * actions, which resolve the farm server-side. Real (signed-in) mode only.
 */
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { AddAnimalCard } from "@/components/farm/AddAnimalCard";
import { BackLink } from "@/components/cattle/ui";
import { useFarmActions, useLivestockGroups } from "@/store/farm-store";
import { GROUP_CATEGORY_LABEL } from "@/server/cattle-real/group-record-edit";
import type { LivestockCategory, LivestockGoal } from "@/domain/types";
import { LIVESTOCK_GOAL_LABEL } from "@/domain/cattle/presentation";

const CATEGORY_OPTIONS = Object.keys(GROUP_CATEGORY_LABEL) as LivestockCategory[];
const GOAL_OPTIONS = Object.keys(LIVESTOCK_GOAL_LABEL) as LivestockGoal[];

/**
 * Not farmer-entered: `livestock_groups.system` is required by the schema and the create action, so a new group takes
 * the form's long-standing baseline. Where the group actually is comes from its field movements (and Housing), recorded
 * in their own workflows.
 */
const NEW_GROUP_BASELINE_SYSTEM = "grazing" as const;

export function HerdManagementClient({ farmId }: { farmId: string }) {
  const router = useRouter();
  const livestockGroups = useLivestockGroups();
  const { addLivestockGroup } = useFarmActions();

  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState<LivestockCategory>("suckler_cow");
  const [newCount, setNewCount] = useState("");
  /** Optional: "" = decide later (the group workspace shows the feasible paths unranked until a goal is chosen). */
  const [newGoal, setNewGoal] = useState<LivestockGoal | "">("");

  async function handleAddGroup(e: FormEvent) {
    e.preventDefault();
    const count = Number(newCount);
    if (!newLabel.trim() || !Number.isFinite(count) || count <= 0) return;
    // addLivestockGroup resolves a Promise — in real mode the new group's
    // id comes from Postgres, not a client-generated placeholder.
    await addLivestockGroup({
      label: newLabel.trim(),
      category: newCategory,
      count,
      system: NEW_GROUP_BASELINE_SYSTEM,
      ...(newGoal !== "" ? { goal: newGoal } : {}),
    });
    setNewLabel("");
    setNewCategory("suckler_cow");
    setNewCount("");
    setNewGoal("");
    setAddOpen(false);
    router.refresh();
  }

  return (
    <>
      <BackLink href="/cattle" label="Cattle" />
      <PageHeader title="Add cattle" subtitle="Add a new group or an individual animal. To change an existing group, open it from Cattle." />
      <h1 className="mb-3 text-title text-fr-ink-900 lg:hidden">Add cattle</h1>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-fr-border pb-4">
        <p className="max-w-xl text-sm text-fr-ink-600">
          Existing groups are opened from Cattle. Each group&apos;s workspace is where its details are corrected and its moves, weighings and production goal are recorded.
        </p>
        <Link href="/cattle" className="rounded-fr-control border border-fr-green-700 px-3 py-2 text-sm font-semibold text-fr-green-700">
          Open herd
        </Link>
      </div>

      <div className="flex flex-col gap-4">
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
                        {GROUP_CATEGORY_LABEL[c]}
                      </option>
                    ))}
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
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-fr-ink-600">Production goal (optional)</span>
                <select
                  value={newGoal}
                  onChange={(e) => setNewGoal(e.target.value as LivestockGoal | "")}
                  className="w-full rounded-fr-control border border-fr-border px-3 py-2 text-sm text-fr-ink-900"
                >
                  <option value="">Decide later</option>
                  {GOAL_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {LIVESTOCK_GOAL_LABEL[g]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-fr-ink-400">
                Count is confirmed by you. Category can&apos;t be changed after adding. The goal can be changed later in the group&apos;s production target; until one is chosen, the group shows its feasible paths unranked. After adding, open the group from Cattle to record moves and weighings.
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
            Add new group
          </button>
        )}

        <AddAnimalCard farmId={farmId} groups={livestockGroups} />
      </div>
    </>
  );
}
