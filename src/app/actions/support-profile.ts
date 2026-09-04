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
 *
 * `upsertSupportProfileFactAction` validates `value` against
 * `validateSupportProfileFactValue` (`support-profile.ts`) before ever
 * reaching the database — Codex audit HIGH (round 1, 2026-09-04): the
 * database's own CHECK constraint only ever governed `key`, never
 * `value`'s shape, so a malformed date, a future date, an out-of-range
 * qualification level, or a non-boolean answer could previously be
 * persisted and would later reach `scheme-eligibility.ts` looking like a
 * real, considered farmer answer. This is the real write-boundary fix,
 * not just a defensive read-side guard.
 */
import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listSupportProfileFactsForFarm, upsertSupportProfileFact } from "@/lib/farm-data/support-profile";
import { validateSupportProfileFactValue, type SupportProfileFact, type SupportProfileFactKey } from "@/domain/support-profile";

export async function listSupportProfileFactsAction(): Promise<SupportProfileFact[]> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return [];
  return listSupportProfileFactsForFarm(farm.id);
}

export async function upsertSupportProfileFactAction(key: SupportProfileFactKey, value: unknown): Promise<SupportProfileFact> {
  const validation = validateSupportProfileFactValue(key, value, new Date().toISOString());
  if (!validation.valid) throw new Error(`Invalid value for ${key}: ${validation.reason}`);

  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("No farm found for the current user.");
  const fact = await upsertSupportProfileFact(farm.id, key, value);
  revalidatePath("/supports");
  return fact;
}
