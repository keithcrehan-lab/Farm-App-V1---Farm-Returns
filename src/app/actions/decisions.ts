"use server";

/**
 * Farm Return Next v1.1 — real Decide-stage persistence for Today's
 * Expanded Prompt sheet.
 *
 * **Codex audit HIGH (docs/overnight/audits/
 * phase-1-visual-nav-today-plan-records-codex-audit.md, round 1):** the
 * first version of this action accepted a fully client-constructed
 * `Decision` (via `decideAsFarmer`, run client-side) and persisted its
 * `estimateSnapshot`/`inputsSnapshot`/`calculationVersion` verbatim.
 * `insertDecision`'s farm-ownership check and RLS rule out a *cross-farm*
 * leak, but nothing stopped an authenticated farmer's own client from
 * submitting fabricated evidence for their *own* farm's historical
 * record — a real breach of this app's "never assume application code is
 * the only writer" / no-fabricated-evidence discipline
 * (`SCIENTIFIC_RULES.md`), not merely a security gap.
 *
 * **Fix**: this action now takes only the minimal real facts a farmer
 * actually decided about (`promptKind`, `fieldId`, `outcome`, and
 * `material` for the one Prompt kind that needs it) and **recomputes the
 * real Prompt itself, server-side, from a fresh database read** — the
 * exact same pure producer functions `src/orchestration/prompt/
 * build-all.ts` already uses, just called here instead of on the client.
 * The server, not the client, is now the source of truth for what
 * evidence justified the decision — the client can no longer inject any
 * `basis`/`inputsSnapshot`/`calculationVersion` content at all. A side
 * effect, and an honest improvement, not a compromise: the evidence
 * persisted is whatever is *actually true at the moment of decision*,
 * not a few seconds/minutes stale from whenever the sheet first opened.
 *
 * The actual recompute switch now lives in
 * `src/orchestration/prompt/recompute.ts`'s `recomputePromptByKind` —
 * extracted once `src/app/actions/job-sessions.ts`'s
 * `startJobSessionFromPromptAction` (GPS Job Session + Confirm Actual
 * contract) needed the identical "recompute, never trust the client"
 * discipline, rather than a second, independently-drifting copy of this
 * security-sensitive switch.
 */
import { revalidatePath } from "next/cache";
import { insertDecision } from "@/lib/farm-data/decisions";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { decideAsFarmer, type DecisionOutcome } from "@/orchestration/decide";
import { recomputePromptByKind, type RecomputablePromptKind } from "@/orchestration/prompt/recompute";
import type { SpreadingMaterial } from "@/domain/closed-period-calendar";

export type { RecomputablePromptKind };

export interface SubmitPromptDecisionInput {
  promptKind: RecomputablePromptKind;
  fieldId: string;
  outcome: DecisionOutcome;
  /** Required only for `"spreading_window"` — that producer has no
   * default (a Prompt built for one material must be re-decided for that
   * same material, never a different, unconfirmed one). */
  material?: SpreadingMaterial;
}

export async function submitPromptDecisionAction(input: SubmitPromptDecisionInput): Promise<DecisionRecord> {
  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error("submitPromptDecisionAction: no real farm for the current session");
  }
  // listFieldsForFarm is RLS-scoped to the current session's own farms —
  // farm.id itself already came from getFarmForCurrentUser() above, so
  // this can only ever read this farm's own fields (same ownership
  // boundary `(app)/layout.tsx`'s identical real call already relies on).
  const fields = await listFieldsForFarm(farm.id);
  const field = fields.find((f) => f.id === input.fieldId);
  if (!field) {
    throw new Error(`submitPromptDecisionAction: field ${input.fieldId} not found on the current session's farm`);
  }

  const now = new Date().toISOString();
  const prompt = recomputePromptByKind({ promptKind: input.promptKind, farm, field, material: input.material, now });

  const decision = decideAsFarmer(prompt, input.outcome, now);
  const result = await insertDecision({ ...decision, decidedBy: "farmer" });
  // Today re-derives its Prompts fresh on every load (no persisted Prompt
  // table — `ARCHITECTURE.md`), so nothing there depends on this decision
  // row; Records is the one real screen that reads decisions back.
  revalidatePath("/records");
  return result;
}
