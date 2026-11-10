"use server";

import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser, updateFarmProfileForCurrentUser } from "@/lib/farm-data/farms";
import type { FarmGrazingProductionSystem } from "@/domain/types";

const VALUES: readonly FarmGrazingProductionSystem[] = ["SUCKLER_CALF_TO_WEANING", "SUCKLER_CALF_TO_BEEF", "OTHER_DRYSTOCK"];

/** Saves the farm's answer to "what do you usually do with the calves?" from wherever it's asked. */
export async function setFarmCalfSystemAction(value: FarmGrazingProductionSystem): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!VALUES.includes(value)) return { ok: false, error: "Choose one of the options." };
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to save this." };
  try {
    await updateFarmProfileForCurrentUser(farm.id, { grazingProductionSystem: value });
    for (const p of ["/settings", "/fertiliser-plan", "/cattle/manage"]) revalidatePath(p);
    return { ok: true };
  } catch (err) {
    console.error("[Farm] calf system save failed", err);
    return { ok: false, error: "Couldn't save just now. Check your signal and try again." };
  }
}
