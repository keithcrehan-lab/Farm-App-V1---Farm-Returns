"use server";

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { importScannedLpisFields, scanNearbyLpisFields } from "@/server/field-scan";
import type { Field } from "@/domain/types";
import type { FieldScanOutcome } from "@/domain/field-scan";
import { revalidatePath } from "next/cache";

/** Current-farmer scoped scan. The browser never supplies a farm id. A requested
 * centre is allowed only as an Irish map point because LPIS itself is public data. */
export async function scanCurrentFarmFieldsAction(centre?: [number, number]): Promise<FieldScanOutcome> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: "UNAVAILABLE", reason: "Set up your farm before scanning fields." };
  const fields = await listFieldsForFarm(farm.id);
  return scanNearbyLpisFields(farm, fields, centre);
}


export async function addScannedFieldsAction(lpisRefs: string[]): Promise<Field[]> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("Set up your farm before adding fields.");
  const fields = await listFieldsForFarm(farm.id);
  const added = await importScannedLpisFields(farm, fields, lpisRefs);
  revalidatePath("/fields");
  revalidatePath("/fertiliser-plan");
  revalidatePath("/onboarding");
  return added;
}
