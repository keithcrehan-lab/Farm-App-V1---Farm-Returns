"use server";

import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import {
  appendScep2026FactAssertion,
} from "@/lib/farm-data/scheme-facts";
import type {
  SchemeFactAssertion,
  Scep2026SchemeFactKey,
} from "@/domain/schemes/facts";

/**
 * Scheme-owned facts only. Canonical cattle/field/farm facts must continue
 * to be edited in their owning modules and must not be duplicated here.
 */
export async function recordScep2026FactAction(
  key: Scep2026SchemeFactKey,
  value: unknown,
): Promise<SchemeFactAssertion> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("No farm found for the current user.");

  const assertion = await appendScep2026FactAssertion(farm.id, key, value);
  revalidatePath("/schemes");
  return assertion;
}
