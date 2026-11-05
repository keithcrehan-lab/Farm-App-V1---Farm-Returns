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

export async function loadGrazingMovementContextAction(fieldId: string): Promise<GrazingMovementContext> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("No signed-in farm.");
  const [fields, groups, sessions] = await Promise.all([
    listFieldsForFarm(farm.id),
    listLivestockGroupsForFarm(farm.id),
    listGrazingFieldSessionsForFarm(farm.id),
  ]);
  const field = fields.find((candidate) => candidate.id === fieldId && !candidate.archivedAt);
  if (!field) throw new Error("Field not found.");

  const fieldNameById = new Map(fields.map((candidate) => [candidate.id, candidate.name]));
  const openByGroup = new Map(
    sessions
      .filter((session) => !session.endedAt)
      .map((session) => [session.livestockGroupId, session]),
  );

  return {
    fieldId: field.id,
    fieldName: field.name,
    groups: groups
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
      }),
  };
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
  movedOn: string;
}): Promise<MoveLivestockGroupToFieldResult> {
  if (!validDate(input.movedOn)) return { status: "rejected", reasonCode: "INVALID_MOVE_DATE" };
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

  try {
    const session = await recordGrazingFieldMove({
      livestockGroupId: group.id,
      fieldId: field.id,
      startedAt: `${input.movedOn}T00:00:00.000Z`,
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
