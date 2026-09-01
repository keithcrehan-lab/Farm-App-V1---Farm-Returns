"use server";

/**
 * Farm Return Next v1.1 — real Decide-stage persistence for Today's
 * Expanded Prompt sheet. One thin wrapper, the same shape every other
 * file in this directory already uses (`farm.ts`'s own header comment):
 * a Client Component builds the real `Decision` object via
 * `decideAsFarmer` (`src/orchestration/decide`, a pure function — no
 * reason to run it here instead), then calls this action to persist it
 * through `insertDecision` (`src/lib/farm-data/decisions.ts`,
 * server-only). This action does not itself decide anything or touch the
 * Prompt's own evidence — it only carries an already-built `Decision`
 * across the client/server boundary and calls the one sanctioned writer.
 *
 * Errors are not swallowed here — `insertDecision` throws a real, honest
 * error (unowned farm, a genuine Postgres failure, the migration not yet
 * applied) and this action lets it propagate to the caller, which shows
 * it rather than pretending the decision was recorded.
 */
import { revalidatePath } from "next/cache";
import { insertDecision, type DecisionInput } from "@/lib/farm-data/decisions";
import type { DecisionRecord } from "@/lib/farm-data/mappers";

export async function submitPromptDecisionAction(decision: DecisionInput): Promise<DecisionRecord> {
  const result = await insertDecision(decision);
  // Today re-derives its Prompts fresh on every load (no persisted Prompt
  // table — `ARCHITECTURE.md`), so nothing there depends on this decision
  // row; Records is the one real screen that reads decisions back.
  revalidatePath("/records");
  return result;
}
