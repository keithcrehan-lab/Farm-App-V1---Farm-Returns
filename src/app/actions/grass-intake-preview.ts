"use server";

/** Read-only research preview of source-scoped grass intake (planning
 * allocation, not measured grass eaten). The caller may name only a field;
 * the farm, owner authorisation, flag and time window are decided on the
 * server (`getGrassIntakePreviewForCurrentFarm`). No writes, no revalidation.
 */
import { getGrassIntakePreviewForCurrentFarm, type GrassIntakePreviewView } from "@/lib/farm-data/grass-intake-preview";

export async function getGrassIntakePreviewAction(input: { fieldId: string }): Promise<GrassIntakePreviewView> {
  return getGrassIntakePreviewForCurrentFarm({ fieldId: input?.fieldId });
}
