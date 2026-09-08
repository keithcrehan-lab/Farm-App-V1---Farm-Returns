"use server";

/**
 * Farm Return Next — Field Awareness / Satellite Field Intelligence
 * campaign. The one real Server Action the client calls to get a real
 * `FieldAwarenessSnapshot` for one field.
 *
 * Never takes a `farmId` from the client — `getFieldAwarenessForCurrentUser`
 * (`src/orchestration/field-awareness/index.ts`) resolves the current
 * authenticated user's own farm server-side and re-verifies that
 * `fieldId` genuinely belongs to it before ever calling the satellite
 * provider or reading confirmed activity, the same "never trust
 * client-supplied farm ownership" discipline every other action in this
 * directory already follows (`decisions.ts`, `support-profile.ts`,
 * `job-sessions.ts`).
 *
 * Returns `null` for a signed-out session, a farm with no such field, or
 * a genuine cross-farm attempt — deliberately not distinguishing those
 * cases from each other (see the orchestration layer's own doc comment).
 */
import { getFieldAwarenessForCurrentUser } from "@/orchestration/field-awareness";
import type { FieldAwarenessSnapshot } from "@/domain/field-awareness";

export async function getFieldAwarenessAction(fieldId: string): Promise<FieldAwarenessSnapshot | null> {
  if (!fieldId) return null;
  return getFieldAwarenessForCurrentUser(fieldId);
}
