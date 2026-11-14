/** One explicit, farm-scoped operation to apply a *specific* breed to the
 * current members of a group. Historical identity corrections are append-only.
 */
import { MAX_BREED_LENGTH, MIXED_BREEDS_VALUE } from "@/domain/cattle/group-breed-selection";

export const GROUP_BREED_BULK_SOURCE = "Group details: explicitly applied breed to all members";

export type GroupBreedBulkRequest = { groupId: string; breed: string; expectedAnimalIds: string[] };
export type GroupBreedBulkRefusal = "INVALID_REQUEST" | "NOT_SIGNED_IN" | "GROUP_NOT_FOUND" | "MEMBERS_CHANGED" | "UNREADABLE_MEMBERS" | "WRITE_FAILED";
export type GroupBreedBulkResult = { ok: true; updated: number } | { ok: false; reason: GroupBreedBulkRefusal; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const messages: Readonly<Record<GroupBreedBulkRefusal, string>> = {
  INVALID_REQUEST: "Choose a specific breed or cross before applying it to animals.",
  NOT_SIGNED_IN: "Sign in to update your cattle records.",
  GROUP_NOT_FOUND: "This cattle group could not be found on your farm.",
  MEMBERS_CHANGED: "Animals in this group have changed. Reload before applying the breed.",
  UNREADABLE_MEMBERS: "One or more animal records could not be verified. Nothing was changed.",
  WRITE_FAILED: "The individual breed changes could not be saved. No individual records were changed.",
};

export const refuseGroupBreedBulk = (reason: GroupBreedBulkRefusal): GroupBreedBulkResult => ({ ok: false, reason, message: messages[reason] });

export function parseGroupBreedBulk(raw: unknown): GroupBreedBulkRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).some((key) => !["groupId", "breed", "expectedAnimalIds"].includes(key))) return null;
  const breed = typeof r.breed === "string" ? r.breed.trim() : "";
  if (typeof r.groupId !== "string" || !UUID.test(r.groupId)) return null;
  if (!breed || breed.length > MAX_BREED_LENGTH || breed === MIXED_BREEDS_VALUE || breed === "Not known") return null;
  if (!Array.isArray(r.expectedAnimalIds) || r.expectedAnimalIds.length < 1 || r.expectedAnimalIds.length > 500) return null;
  if (!r.expectedAnimalIds.every((id) => typeof id === "string" && UUID.test(id))) return null;
  const ids = r.expectedAnimalIds.map((id: string) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) return null;
  return { groupId: r.groupId.toLowerCase(), breed, expectedAnimalIds: ids };
}

export function identicalGroupMembers(expected: readonly string[], actual: readonly string[]): boolean {
  if (expected.length !== actual.length) return false;
  const actualIds = new Set(actual);
  return expected.every((id) => actualIds.has(id));
}
