/**
 * The group workspace's "Edit group details" — only what the `livestock_groups` row owns: name, breed, and the
 * headcount while no animal is recorded individually. Read from the same evaluation the group page already loads
 * (`loadRealCattle`); nothing is computed afresh. Where animals are recorded individually the headcount is theirs,
 * and a stored group count that disagrees is shown (`records.headcountNotes`), never overwritten.
 */

import type { LivestockCategory } from "@/domain/types";
import type { RealEvaluation } from "./real-service";

export const GROUP_CATEGORY_LABEL: Readonly<Record<LivestockCategory, string>> = {
  suckler_cow: "Suckler cow",
  dairy_cow: "Dairy cow",
  bull: "Bull",
  calf: "Calf",
  weanling: "Weanling",
  store: "Store",
  steer: "Steer",
  heifer: "Heifer",
};

export interface GroupRecordEdit {
  groupId: string;
  name: string;
  breed: string | null;
  categoryLabel: string;
  /** The group record's stored headcount; `null` when none is recorded. */
  storedHeadcount: number | null;
  /** Individually recorded animals in the group. */
  individuals: number;
  /** The headcount is the group record's own fact only while no animal is recorded individually. */
  headcountEditable: boolean;
  /** The stored headcount disagrees with the individual records (neither figure is changed). */
  headcountNote: string | null;
}

/** Pure: the editable group record for one of the evaluated farm's groups, or `null` if it isn't one. */
export function groupRecordEditOf(e: RealEvaluation, groupRef: string): GroupRecordEdit | null {
  const group = e.sourceGroups.find((g) => g.id === groupRef);
  const fact = e.records.groupFacts.find((f) => f.groupRef === groupRef);
  if (!group || !fact) return null;
  return {
    groupId: group.id,
    name: group.label,
    breed: group.breed?.trim() ? group.breed : null,
    categoryLabel: GROUP_CATEGORY_LABEL[group.category] ?? group.category,
    storedHeadcount: fact.headcount,
    individuals: fact.individuals,
    headcountEditable: fact.individuals === 0,
    headcountNote: e.records.headcountNotes[groupRef] ?? null,
  };
}
