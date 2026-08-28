"use client";

/**
 * Real Mode Completion Phase 12 — individual animal detail foundation.
 * Optional, collapsed by default ("Do not require individual-animal
 * tracking for farmers who only want group management" — brief).
 * Real-mode only, same reasoning as `FinancialAssumptionsCard`:
 * `livestock_individuals`/`livestock_weight_observations` aren't part of
 * `farm-store.tsx`'s mock-mode state.
 *
 * "Current weight" is always the latest real observation, never a second
 * stored fact — `latestWeightObservation` (mappers.ts).
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, PawPrint, Plus, Scale } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { IconChip } from "@/components/ui/IconChip";
import { formatNumber } from "@/lib/format";
import { latestWeightObservation } from "@/lib/farm-data/mappers";
import type { IndividualAnimal, LivestockCategory, LivestockGroup, WeightObservation } from "@/domain/types";
import { addIndividualAnimalAction, addWeightObservationAction } from "@/app/actions/farm";

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

export function IndividualAnimalsCard({
  farmId,
  groups,
  animals: initialAnimals,
  weightObservations: initialObservations,
}: {
  farmId: string;
  groups: LivestockGroup[];
  animals: IndividualAnimal[];
  weightObservations: WeightObservation[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [animals, setAnimals] = useState(initialAnimals);
  const [observations, setObservations] = useState(initialObservations);
  const [addOpen, setAddOpen] = useState(false);
  const [tagNumber, setTagNumber] = useState("");
  const [category, setCategory] = useState<LivestockCategory>("suckler_cow");
  const [groupId, setGroupId] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "">("");
  const [breed, setBreed] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [weighingAnimalId, setWeighingAnimalId] = useState<string | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [weightDate, setWeightDate] = useState("");

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-3">
          <IconChip icon={PawPrint} tone="good" />
          <div>
            <CardTitle>Individual animals</CardTitle>
            <p className="text-xs text-fr-ink-600">Optional — tag, weight history and detail per animal</p>
          </div>
        </span>
        <button type="button" onClick={() => setExpanded((e) => !e)} className="text-fr-ink-400 hover:text-fr-ink-600">
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </CardHeader>

      {expanded ? (
        <div className="flex flex-col gap-3">
          {animals.length > 0 ? (
            <ul className="flex flex-col divide-y divide-fr-border rounded-fr-control border border-fr-border">
              {animals.map((animal) => {
                const animalObservations = observations.filter((o) => o.animalId === animal.id);
                const latest = latestWeightObservation(animalObservations);
                const isWeighing = weighingAnimalId === animal.id;
                return (
                  <li key={animal.id} className="flex flex-col gap-2 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-fr-ink-900">
                        {animal.tagNumber ?? "No tag"} · {CATEGORY_LABEL[animal.category]}
                        {animal.breed ? ` · ${animal.breed}` : ""}
                      </span>
                      <span className="flex items-center gap-2 text-fr-ink-600">
                        {latest ? `${formatNumber(latest.weightKg, 0)} kg (${latest.observedDate})` : "No weight recorded"}
                        <button
                          type="button"
                          onClick={() => {
                            setWeighingAnimalId(isWeighing ? null : animal.id);
                            setWeightInput("");
                            setWeightDate(new Date().toISOString().slice(0, 10));
                          }}
                          className="text-fr-green-700"
                          aria-label={`Record weight for ${animal.tagNumber ?? animal.id}`}
                        >
                          <Scale className="size-4" />
                        </button>
                      </span>
                    </div>
                    {isWeighing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          placeholder="kg"
                          value={weightInput}
                          onChange={(e) => setWeightInput(e.target.value)}
                          className="w-24 rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1 text-sm text-fr-ink-900"
                        />
                        <input
                          type="date"
                          value={weightDate}
                          onChange={(e) => setWeightDate(e.target.value)}
                          className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1 text-sm text-fr-ink-900"
                        />
                        <button
                          type="button"
                          disabled={!(Number(weightInput) > 0) || !weightDate}
                          onClick={async () => {
                            const observation = await addWeightObservationAction(
                              farmId,
                              animal.id,
                              Number(weightInput),
                              weightDate,
                              "Farmer entered",
                            );
                            setObservations((o) => [...o, observation]);
                            setWeighingAnimalId(null);
                          }}
                          className="rounded-fr-control bg-fr-green-700 px-3 py-1 text-xs font-semibold text-white disabled:bg-fr-green-700/40"
                        >
                          Save
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-fr-ink-600">No individual animals recorded yet — this is entirely optional.</p>
          )}

          {addOpen ? (
            <div className="flex flex-col gap-2 rounded-fr-control border border-fr-border p-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Tag number (optional)"
                  value={tagNumber}
                  onChange={(e) => setTagNumber(e.target.value)}
                  className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
                />
                <select
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
                  value={breed}
                  onChange={(e) => setBreed(e.target.value)}
                  className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
                />
                <input
                  type="date"
                  placeholder="Date of birth"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="rounded-fr-control border border-fr-border bg-fr-surface px-2 py-1.5 text-sm text-fr-ink-900"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAddOpen(false)} className="text-xs font-medium text-fr-ink-600">
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-fr-control bg-fr-green-700 px-3 py-1.5 text-xs font-semibold text-white"
                  onClick={async () => {
                    const animal = await addIndividualAnimalAction(farmId, {
                      ...(tagNumber ? { tagNumber } : {}),
                      category,
                      ...(groupId ? { groupId } : {}),
                      ...(sex ? { sex } : {}),
                      ...(breed ? { breed } : {}),
                      ...(dateOfBirth ? { dateOfBirth } : {}),
                    });
                    setAnimals((a) => [...a, animal]);
                    setTagNumber("");
                    setBreed("");
                    setDateOfBirth("");
                    setSex("");
                    setGroupId("");
                    setAddOpen(false);
                  }}
                >
                  Save animal
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center justify-center gap-2 rounded-fr-control border border-dashed border-fr-border py-2 text-sm font-medium text-fr-green-700 hover:border-fr-green-700"
            >
              <Plus className="size-4" />
              Add an individual animal
            </button>
          )}
        </div>
      ) : null}
    </Card>
  );
}
