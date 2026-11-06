/**
 * The guided grass walk's progress through a farm's fields. Purely which field
 * comes next: readings are saved through the normal grass observation action
 * and a walk holds no cover value of its own, so leaving one mid-way loses
 * nothing that was recorded.
 */
export interface GrassWalk {
  fieldIds: string[];
  measuredIds: string[];
  skippedIds: string[];
  /** `null` when every remaining field has been skipped, or the walk is complete. */
  currentFieldId: string | null;
}

export interface GrassWalkProgress {
  total: number;
  measured: number;
  remaining: number;
  remainingFieldIds: string[];
  complete: boolean;
}

export function grassWalkProgress(walk: GrassWalk): GrassWalkProgress {
  const remainingFieldIds = walk.fieldIds.filter((id) => !walk.measuredIds.includes(id));
  return {
    total: walk.fieldIds.length,
    measured: walk.measuredIds.length,
    remaining: remainingFieldIds.length,
    remainingFieldIds,
    complete: remainingFieldIds.length === 0,
  };
}

/** The next unmeasured field after `fromId`, wrapping round. A GPS-preferred
 * field goes first when it's still to be measured; skipped fields only come
 * back once the walk has nothing else left and `includeSkipped` allows it. */
function nextField(walk: Pick<GrassWalk, "fieldIds" | "measuredIds" | "skippedIds">, fromId: string | null, preferredId: string | null | undefined, includeSkipped: boolean): string | null {
  const open = (id: string) => !walk.measuredIds.includes(id) && !walk.skippedIds.includes(id);
  if (preferredId && preferredId !== fromId && walk.fieldIds.includes(preferredId) && open(preferredId)) return preferredId;
  const start = fromId === null ? -1 : walk.fieldIds.indexOf(fromId);
  const ordered = [...walk.fieldIds.slice(start + 1), ...walk.fieldIds.slice(0, start + 1)];
  const next = ordered.find((id) => id !== fromId && open(id));
  if (next) return next;
  return includeSkipped ? (ordered.find((id) => id !== fromId && !walk.measuredIds.includes(id)) ?? null) : null;
}

export function startGrassWalk(fieldIds: readonly string[]): GrassWalk {
  return { fieldIds: [...fieldIds], measuredIds: [], skippedIds: [], currentFieldId: fieldIds[0] ?? null };
}

/** Called only after a reading has really been saved. */
export function recordGrassWalkReading(walk: GrassWalk, fieldId: string, preferredId?: string | null): GrassWalk {
  const updated = {
    ...walk,
    measuredIds: walk.measuredIds.includes(fieldId) ? walk.measuredIds : [...walk.measuredIds, fieldId],
    skippedIds: walk.skippedIds.filter((id) => id !== fieldId),
  };
  return { ...updated, currentFieldId: nextField(updated, fieldId, preferredId, true) };
}

export function skipGrassWalkField(walk: GrassWalk, preferredId?: string | null): GrassWalk {
  if (!walk.currentFieldId) return walk;
  const updated = { ...walk, skippedIds: [...walk.skippedIds.filter((id) => id !== walk.currentFieldId), walk.currentFieldId] };
  return { ...updated, currentFieldId: nextField(updated, walk.currentFieldId, preferredId, false) };
}

export function moveGrassWalkTo(walk: GrassWalk, fieldId: string): GrassWalk {
  if (!walk.fieldIds.includes(fieldId) || walk.measuredIds.includes(fieldId)) return walk;
  return { ...walk, skippedIds: walk.skippedIds.filter((id) => id !== fieldId), currentFieldId: fieldId };
}
