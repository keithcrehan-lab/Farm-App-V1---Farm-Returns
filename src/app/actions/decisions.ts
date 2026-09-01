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
 */
import { revalidatePath } from "next/cache";
import { insertDecision } from "@/lib/farm-data/decisions";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { decideAsFarmer, type DecisionOutcome } from "@/orchestration/decide";
import { promptForSpreadingWindow } from "@/orchestration/prompt/spreading-window";
import { promptForSoilTestAge } from "@/orchestration/prompt/soil-test-age";
import { promptForCommonageStatus } from "@/orchestration/prompt/commonage-status";
import { promptForLocalBufferOverride } from "@/orchestration/prompt/local-buffer-override";
import type { SpreadingMaterial } from "@/domain/closed-period-calendar";
import type { Prompt } from "@/orchestration/prompt";

/** The four real Prompt kinds this action can recompute — the same
 * "reviewed starter registry" shape `Prompt.kind`'s own doc comment
 * describes, kept as a real closed union here specifically so an
 * unrecognised kind fails closed (the `default` arm below) rather than
 * silently skipping evidence reconstruction. */
export type RecomputablePromptKind = "spreading_window" | "soil_test_age" | "commonage_status" | "local_buffer_override";

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
  let prompt: Prompt;
  switch (input.promptKind) {
    case "spreading_window":
      if (!input.material) {
        throw new Error("submitPromptDecisionAction: material is required to recompute a spreading_window Prompt");
      }
      prompt = promptForSpreadingWindow(farm, field, input.material, undefined, now);
      break;
    case "soil_test_age":
      prompt = promptForSoilTestAge(field, undefined, now);
      break;
    case "commonage_status":
      prompt = promptForCommonageStatus(field, now);
      break;
    case "local_buffer_override":
      prompt = promptForLocalBufferOverride(field, now);
      break;
    default: {
      // Exhaustiveness guard — a future Prompt kind must be added above
      // explicitly, never silently accepted through this action without
      // its own real recomputation path.
      const exhaustive: never = input.promptKind;
      throw new Error(`submitPromptDecisionAction: unrecognised promptKind ${String(exhaustive)}`);
    }
  }

  const decision = decideAsFarmer(prompt, input.outcome, now);
  const result = await insertDecision({ ...decision, decidedBy: "farmer" });
  // Today re-derives its Prompts fresh on every load (no persisted Prompt
  // table — `ARCHITECTURE.md`), so nothing there depends on this decision
  // row; Records is the one real screen that reads decisions back.
  revalidatePath("/records");
  return result;
}
