"use client";

/**
 * Pilot Integration P3 — "Add an animal" on Cattle → Manage herd. The form (and its fields) is the one the former
 * Livestock screen's individual-animals card used (Real Mode Completion Phase 12), unchanged: every field but the
 * category is optional, as `livestock_individuals` treats it. It writes through the existing
 * `addIndividualAnimalAction`, which resolves the farm server-side (DECISIONS D14).
 *
 * After a save the page re-reads from Supabase (`router.refresh()`), and the new animal — identified by its database
 * id — is linked to its Cattle profile, where its weights are recorded. No browser copy of the herd is kept here.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PawPrint, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import type { LivestockCategory, LivestockGroup } from "@/domain/types";
import { addIndividualAnimalAction } from "@/app/actions/farm";

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

export function AddAnimalCard({ farmId, groups }: { farmId: string; groups: LivestockGroup[] }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ id: string; label: string } | null>(null);
  const [tagNumber, setTagNumber] = useState("");
  const [category, setCategory] = useState<LivestockCategory>("suckler_cow");
  const [groupId, setGroupId] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "">("");
  const [breed, setBreed] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const animal = await addIndividualAnimalAction(farmId, {
        ...(tagNumber ? { tagNumber } : {}),
        category,
        ...(groupId ? { groupId } : {}),
        ...(sex ? { sex } : {}),
        ...(breed ? { breed } : {}),
        ...(dateOfBirth ? { dateOfBirth } : {}),
      });
      setAdded({ id: animal.id, label: animal.tagNumber ?? "The untagged animal" });
      setTagNumber("");
      setBreed("");
      setDateOfBirth("");
      setSex("");
      setGroupId("");
      setAddOpen(false);
      router.refresh();
    } catch {
      setError("The animal couldn't be saved. Nothing was added — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={PawPrint} tone="good" />
          <div>
            <CardTitle>Add an animal</CardTitle>
            <p className="text-xs text-fr-ink-600">Optional — tag, group and details per animal. Weights are recorded on its Cattle page.</p>
          </div>
        </span>
      </CardHeader>

      <div className="flex flex-col gap-3">
        {added ? (
          <p className="text-sm text-fr-ink-900" role="status">
            {added.label} was added.{" "}
            <Link href={`/cattle/animals/${encodeURIComponent(added.id)}`} className="font-semibold text-fr-green-700 hover:underline">
              Open it in Cattle →
            </Link>
          </p>
        ) : null}
        {addOpen ? (
          <div className="flex flex-col gap-2 rounded-fr-control border border-fr-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Tag number (optional)"
                aria-label="Tag number"
                value={tagNumber}
                onChange={(e) => setTagNumber(e.target.value)}
                className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
              />
              <select
                aria-label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value as LivestockCategory)}
                className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
              >
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Group"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Sex"
                value={sex}
                onChange={(e) => setSex(e.target.value as "male" | "female" | "")}
                className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
              >
                <option value="">Sex unrecorded</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <input
                placeholder="Breed (optional)"
                aria-label="Breed"
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
              />
              <input
                type="date"
                aria-label="Date of birth"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
              />
            </div>
            {error ? (
              <p className="text-sm text-fr-risk" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAddOpen(false)} className="text-xs font-medium text-fr-ink-600">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-fr-control bg-fr-green-700 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-fr-green-700/40"
                onClick={save}
              >
                {saving ? "Saving…" : "Save animal"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAddOpen(true);
              setAdded(null);
              setError(null);
            }}
            className="flex items-center justify-center gap-2 rounded-fr-control border border-dashed border-fr-border py-2 text-sm font-medium text-fr-green-700 hover:border-fr-green-700"
          >
            <Plus className="size-4" />
            Add an individual animal
          </button>
        )}
      </div>
    </Card>
  );
}
