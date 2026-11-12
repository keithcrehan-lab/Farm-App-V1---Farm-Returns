"use server";

import { revalidatePath } from "next/cache";
import type { LivestockCategory } from "@/domain/types";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import {
  GrazingMoveRejectedError,
  listGrazingFieldSessionsForFarm,
  recordGrazingFieldMove,
} from "@/lib/farm-data/grazing-field-sessions";
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { HousingMoveRejectedError, recordGroupHousingMove } from "@/lib/farm-data/cattle-management-state";

export interface GrazingMovementGroupView {
  id: string;
  label: string;
  category: LivestockCategory;
  headCount: number;
  system: "grazing" | "housed";
  currentFieldId?: string;
  currentFieldName?: string;
  currentSince?: string;
}

export interface GrazingMovementContext {
  groups: GrazingMovementGroupView[];
  fieldId: string;
  fieldName: string;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

/** A move time sent from the map: a real instant, not in the future, and within the last year. */
function validMoveInstant(value: string): boolean {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return false;
  const now = Date.now();
  return at <= now + 5 * 60_000 && at >= now - 366 * 86_400_000;
}

async function loadMovementGroups(farmId: string) {
  const [fields, groups, sessions] = await Promise.all([
    listFieldsForFarm(farmId),
    listLivestockGroupsForFarm(farmId),
    listGrazingFieldSessionsForFarm(farmId),
  ]);
  return { fields, views: movementGroupViews(fields, groups, sessions) };
}

function movementGroupViews(
  fields: Awaited<ReturnType<typeof listFieldsForFarm>>,
  groups: Awaited<ReturnType<typeof listLivestockGroupsForFarm>>,
  sessions: Awaited<ReturnType<typeof listGrazingFieldSessionsForFarm>>,
): GrazingMovementGroupView[] {
  const fieldNameById = new Map(fields.map((candidate) => [candidate.id, candidate.name]));
  const openByGroup = new Map(
    sessions
      .filter((session) => !session.endedAt)
      .map((session) => [session.livestockGroupId, session]),
  );
  return groups
    .filter((group) => group.count.value > 0)
    .map((group) => {
      const open = openByGroup.get(group.id);
      return {
        id: group.id,
        label: group.label,
        category: group.category,
        headCount: group.count.value,
        system: group.system,
        ...(open
          ? {
              currentFieldId: open.fieldId,
              currentFieldName: fieldNameById.get(open.fieldId) ?? "Recorded field",
              currentSince: open.startedAt,
            }
          : {}),
      };
    });
}

/** Every group with animals in it and the field it is grazing now, for the Farm map. The farm is the signed-in one. */
export async function listGrazingMovementGroupsAction(): Promise<GrazingMovementGroupView[]> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return [];
  return (await loadMovementGroups(farm.id)).views;
}

export async function loadGrazingMovementContextAction(fieldId: string): Promise<GrazingMovementContext> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("No signed-in farm.");
  const { fields, views } = await loadMovementGroups(farm.id);
  const field = fields.find((candidate) => candidate.id === fieldId && !candidate.archivedAt);
  if (!field) throw new Error("Field not found.");
  return { fieldId: field.id, fieldName: field.name, groups: views };
}

/** Every surface that reads a group's current field or shed. */
function revalidateManagementState(groupId: string, fieldIds: readonly string[]) {
  revalidatePath("/cattle");
  revalidatePath(`/cattle/groups/${groupId}`);
  revalidatePath("/fields");
  revalidatePath("/grass");
  revalidatePath("/fertiliser-plan");
  for (const fieldId of fieldIds) revalidatePath(`/today/field/${fieldId}`);
}

export type MoveLivestockGroupToFieldResult =
  | { status: "saved"; sessionId: string }
  | { status: "rejected"; reasonCode: string };

export async function moveLivestockGroupToFieldAction(input: {
  livestockGroupId: string;
  fieldId: string;
  /** The day of the move (recorded at the start of that day). */
  movedOn?: string;
  /** The exact time of the move (from the Farm map), used instead of `movedOn` when given. */
  movedAt?: string;
}): Promise<MoveLivestockGroupToFieldResult> {
  let startedAt: string;
  if (input.movedAt !== undefined) {
    if (!validMoveInstant(input.movedAt)) return { status: "rejected", reasonCode: "INVALID_MOVE_TIME" };
    startedAt = new Date(Date.parse(input.movedAt)).toISOString();
  } else {
    if (input.movedOn === undefined || !validDate(input.movedOn)) return { status: "rejected", reasonCode: "INVALID_MOVE_DATE" };
    startedAt = `${input.movedOn}T00:00:00.000Z`;
  }
  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: "rejected", reasonCode: "NO_FARM" };

  const [fields, groups] = await Promise.all([
    listFieldsForFarm(farm.id),
    listLivestockGroupsForFarm(farm.id),
  ]);
  const field = fields.find((candidate) => candidate.id === input.fieldId && !candidate.archivedAt);
  if (!field) return { status: "rejected", reasonCode: "FIELD_NOT_FOUND" };
  const group = groups.find((candidate) => candidate.id === input.livestockGroupId);
  if (!group) return { status: "rejected", reasonCode: "GROUP_NOT_FOUND" };

  // An exact time from the map may not reach back before the group's last grazing record ended (for a housed
  // group, when it was housed): that would make two records cover the same days.
  if (input.movedAt !== undefined) {
    const sessions = await listGrazingFieldSessionsForFarm(farm.id);
    const lastEnded = sessions
      .filter((session) => session.livestockGroupId === group.id && session.endedAt)
      .reduce((latest, session) => Math.max(latest, Date.parse(session.endedAt!)), -Infinity);
    if (Date.parse(startedAt) < lastEnded) return { status: "rejected", reasonCode: "MOVE_BEFORE_LAST_RECORD" };
  }

  try {
    const session = await recordGrazingFieldMove({
      livestockGroupId: group.id,
      fieldId: field.id,
      startedAt,
      source: farm.ownerName.trim() || "Farmer",
    });

    revalidateManagementState(group.id, [field.id]);
    // The move also clears any housing the group had.
    revalidatePath("/housing");
    return { status: "saved", sessionId: session.id };
  } catch (error) {
    if (error instanceof GrazingMoveRejectedError) {
      return { status: "rejected", reasonCode: error.code };
    }
    throw error;
  }
}

export type MoveLivestockGroupToHousingResult =
  | { status: "saved"; closedSessionId: string | null }
  /** Already in that shed with no open field session: nothing was written. */
  | { status: "unchanged" }
  | { status: "rejected"; reasonCode: string };

/**
 * The housing counterpart of `moveLivestockGroupToFieldAction`: the group goes into one of the farm's sheds on
 * `housedOn`, its open grazing session (if any) is closed on that date, and the group becomes housed — atomically
 * (`record_group_housing_move`). The farm is resolved server-side; the group and the shed must both be that farm's
 * (checked here and again in the database). Closed grazing sessions are never rewritten or deleted.
 */
export async function moveLivestockGroupToHousingAction(input: {
  livestockGroupId: string;
  housingId: string;
  housedOn: string;
}): Promise<MoveLivestockGroupToHousingResult> {
  if (!validDate(input.housedOn)) return { status: "rejected", reasonCode: "INVALID_MOVE_DATE" };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: "rejected", reasonCode: "NO_FARM" };

  const [groups, housing] = await Promise.all([listLivestockGroupsForFarm(farm.id), listHousingForFarm(farm.id)]);
  const group = groups.find((candidate) => candidate.id === input.livestockGroupId);
  if (!group) return { status: "rejected", reasonCode: "GROUP_NOT_FOUND" };
  const shed = housing.find((candidate) => candidate.id === input.housingId);
  if (!shed) return { status: "rejected", reasonCode: "HOUSING_NOT_FOUND" };

  try {
    const result = await recordGroupHousingMove({
      livestockGroupId: group.id,
      housingId: shed.id,
      housedAt: `${input.housedOn}T00:00:00.000Z`,
      source: farm.ownerName.trim() || "Farmer",
    });
    if (!result.changed) return { status: "unchanged" };
    revalidateManagementState(group.id, result.closedFieldId ? [result.closedFieldId] : []);
    revalidatePath("/housing");
    return { status: "saved", closedSessionId: result.closedSessionId };
  } catch (error) {
    if (error instanceof HousingMoveRejectedError) {
      return { status: "rejected", reasonCode: error.code };
    }
    throw error;
  }
}
