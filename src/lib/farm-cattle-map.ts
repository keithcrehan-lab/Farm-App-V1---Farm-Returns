/**
 * Cattle groups on the Farm map: where each group sits, which field a point
 * on the map falls in, and the words shown when a move is refused.
 * Presentation only — moves are recorded by `moveLivestockGroupToFieldAction`
 * and no figure is calculated here.
 */
import { pointInPolygon } from "@/domain/near-field";
import type { Field } from "@/domain/types";

export interface CattleMapGroup {
  id: string;
  label: string;
  headCount: number;
  system: "grazing" | "housed";
  currentFieldId?: string;
  currentFieldName?: string;
  currentSince?: string;
}

export interface CattleMapPlacement {
  /** Groups on each mapped field, in a stable order (by name). */
  byField: Map<string, CattleMapGroup[]>;
  /** Groups not on a mapped field: housed, never placed, or on a field that is no longer mapped. */
  elsewhere: CattleMapGroup[];
}

type MappedField = Field & { polygon: GeoJSON.Polygon };

export function mappedFields(fields: readonly Field[]): MappedField[] {
  return fields.filter((field): field is MappedField => field.polygon !== undefined && !field.archivedAt);
}

export function placeCattleGroups(groups: readonly CattleMapGroup[], fields: readonly Field[]): CattleMapPlacement {
  const onMap = new Set(mappedFields(fields).map((field) => field.id));
  const byField = new Map<string, CattleMapGroup[]>();
  const elsewhere: CattleMapGroup[] = [];
  const sorted = [...groups].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  for (const group of sorted) {
    if (group.currentFieldId && onMap.has(group.currentFieldId)) {
      const row = byField.get(group.currentFieldId) ?? [];
      row.push(group);
      byField.set(group.currentFieldId, row);
    } else {
      elsewhere.push(group);
    }
  }
  return { byField, elsewhere };
}

/** The mapped field a point on the map falls in, if any. */
export function fieldAtPoint(fields: readonly Field[], lngLat: { lng: number; lat: number }): MappedField | undefined {
  return mappedFields(fields).find((field) => pointInPolygon({ longitude: lngLat.lng, latitude: lngLat.lat }, field.polygon));
}

/** Where a group is now, in words. */
export function cattleGroupWhereabouts(group: CattleMapGroup): string {
  if (group.currentFieldName) return `in ${group.currentFieldName}`;
  if (group.system === "housed") return "housed";
  return "not on a field";
}

/** A `datetime-local` value (local time, to the minute) for a moment. */
export function toLocalDateTimeInput(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** The moment a `datetime-local` value names, or undefined when it isn't one. */
export function fromLocalDateTimeInput(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

/** Checks a chosen move time before anything is sent. */
export function moveTimeProblem(at: Date | undefined, group: CattleMapGroup, now: Date): string | undefined {
  if (!at) return "Pick the date and time of the move.";
  if (at.getTime() > now.getTime() + 60_000) return "The move can't be in the future.";
  if (group.currentSince && at.getTime() <= Date.parse(group.currentSince)) {
    return `${group.label} went into ${group.currentFieldName ?? "their field"} after that. Pick a later time.`;
  }
  return undefined;
}

const MOVE_REFUSED: Record<string, string> = {
  MOVE_NOT_AFTER_CURRENT_START: "That group went into its current field after the time picked. Pick a later time.",
  MOVE_BEFORE_LAST_RECORD: "That time is before the group's last move (or housing) was recorded. Pick a later time.",
  INVALID_MOVE_TIME: "The move time can't be in the future or more than a year ago.",
  INVALID_STARTED_AT: "The move time can't be in the future.",
  HEADCOUNT_NOT_RECORDED: "This group has no head count recorded. Add it in Cattle first.",
  UNSUPPORTED_LIVESTOCK_CATEGORY: "This kind of animal can't be moved on the map yet.",
  FIELD_NOT_FOUND: "That field isn't on the farm any more.",
  GROUP_NOT_FOUND: "That group isn't on the farm any more.",
  NO_FARM: "You're not signed in to a farm.",
};

export function moveRefusedMessage(reasonCode: string): string {
  return MOVE_REFUSED[reasonCode] ?? "The move couldn't be saved. Nothing was changed.";
}
