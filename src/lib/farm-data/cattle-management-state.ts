import "server-only";

/**
 * A livestock group's current management location: an open grazing field session (`record_grazing_field_move`,
 * `grazing-field-sessions.ts`) OR a shed (`record_group_housing_move`, here). Both RPCs are security-invoker and
 * atomic; each clears the other state, so a group is never recorded in a field and a shed at once.
 */
import { createClient } from "@/lib/supabase/server";

const REJECTION = /housing_move_rejected:([A-Z_]+)/;

export class HousingMoveRejectedError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "HousingMoveRejectedError";
    this.code = code;
  }
}

export interface HousingMoveResult {
  /** The grazing session this move closed (at the housing date), if one was open. */
  closedSessionId: string | null;
  closedFieldId: string | null;
  /** `false` when the group was already in this shed with no open field session: nothing was written. */
  changed: boolean;
}

export async function recordGroupHousingMove(input: {
  livestockGroupId: string;
  housingId: string;
  housedAt: string;
  source: string;
}): Promise<HousingMoveResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_group_housing_move", {
    p_livestock_group_id: input.livestockGroupId,
    p_housing_id: input.housingId,
    p_housed_at: input.housedAt,
    p_source: input.source,
  });
  if (error) {
    const match = REJECTION.exec(error.message ?? "");
    if (match) throw new HousingMoveRejectedError(match[1]);
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as { closed_session_id: string | null; closed_field_id: string | null; changed: boolean } | null;
  if (!row) throw new Error("Housing move did not return a result.");
  return { closedSessionId: row.closed_session_id, closedFieldId: row.closed_field_id, changed: row.changed === true };
}
