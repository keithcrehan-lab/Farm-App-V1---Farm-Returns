/**
 * The group workspace's "Edit group details" — only what the `livestock_groups` row owns: name, breed, and the
 * headcount while no animal is recorded individually. Read from the same evaluation the group page already loads
 * (`loadRealCattle`); nothing is computed afresh. Where animals are recorded individually the headcount is theirs.
 * The legacy stored group count is deliberately ignored and never surfaced.
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
  /** Effective headcount: individual membership when present, otherwise the stored group count. */
  storedHeadcount: number | null;
  /** Individually recorded animals in the group. */
  individuals: number;
  /** The headcount is the group record's own fact only while no animal is recorded individually. */
  headcountEditable: boolean;
  /** Retained for component compatibility; legacy stored-count discrepancies are no longer surfaced. */
  headcountNote: string | null;
  /** Authoritative breed identities of every active individually tracked member. */
  members: GroupMemberBreed[];
}

export interface GroupMemberBreed {
  animalId: string;
  breed: string | null;
}

/** Reads membership from the already-evaluated, farm-scoped C1 records.
 * Removed animals are absent from this evaluation; breed follows the latest
 * append-only identity correction, never a stale group default.
 */
export function groupMemberBreedsOf(e: RealEvaluation, groupRef: string): GroupMemberBreed[] {
  return e.records.assertions
    .filter((r) => r.inputs.some((input) => input.kind === "MANAGEMENT_GROUP" && input.value === groupRef))
    .map((r) => {
      const snap = e.outputs.snapshots[r.animalId];
      return {
        animalId: r.animalId,
        breed: snap?.breed.state === "KNOWN" ? (snap.breed.value?.label ?? null) : null,
      };
    });
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
    headcountNote: null,
    members: groupMemberBreedsOf(e, groupRef),
  };
}
