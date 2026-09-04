"use server";

/**
 * Farm Return Next — Supports Intelligence + Farm Strategy phase. Real
 * Server Actions for `support_profile_facts`
 * (`src/lib/farm-data/support-profile.ts`).
 *
 * Neither action takes a `farmId` from the client — both resolve the
 * current authenticated user's own farm server-side via
 * `getFarmForCurrentUser()`, the same "never trust client-supplied farm
 * ownership" discipline `decisions.ts`'s own actions already establish.
 * A signed-out session, or one with no farm yet, gets an honest empty
 * result rather than throwing — `/supports` (still reachable pre-
 * onboarding in demo/mock mode) can render its "known from your farm"
 * section from mock data alone in that case.
 */
import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listSupportProfileFactsForFarm, upsertSupportProfileFact } from "@/lib/farm-data/support-profile";
import type { SupportProfileFact, SupportProfileFactKey } from "@/domain/support-profile";

export async function listSupportProfileFactsAction(): Promise<SupportProfileFact[]> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return [];
  return listSupportProfileFactsForFarm(farm.id);
}

export async function upsertSupportProfileFactAction(key: SupportProfileFactKey, value: unknown): Promise<SupportProfileFact> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("No farm found for the current user.");
  const fact = await upsertSupportProfileFact(farm.id, key, value);
  revalidatePath("/supports");
  return fact;
}
