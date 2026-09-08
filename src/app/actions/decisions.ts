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
 *
 * **Fertiliser Vertical campaign**: `"fertiliser_recommendation"` is a
 * real `RecomputablePromptKind` like any other, but it is the first one
 * a farmer can *edit* rather than only accept/dismiss — "Plan this
 * application" (campaign items 3/4) turns the live recommendation into a
 * real, farmer-scoped Decision carrying the farmer's own chosen
 * product/quantity/date. `edits` follows the identical discipline
 * `src/orchestration/job-session/index.ts`'s own
 * `assertManualJobStartValueHasNoOutcomeKeys` established: a narrow
 * allowlist (`validateFertiliserPlanEdits`), checked against the real,
 * server-recomputed recommendation itself — never trusted verbatim from
 * the client, and never silently dropped when invalid (it throws).
 */
import { revalidatePath } from "next/cache";
import { insertDecision } from "@/lib/farm-data/decisions";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { decideAsFarmer, type DecisionOutcome } from "@/orchestration/decide";
import { recomputePromptByKind, type RecomputablePromptKind } from "@/orchestration/prompt/recompute";
import {
  FERTILISER_RECOMMENDATION_PROMPT_KIND,
  validateFertiliserPlanEdits,
  type FertiliserRecommendationSummary,
} from "@/orchestration/prompt/fertiliser-recommendation";
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
  /** Only meaningful for `"fertiliser_recommendation"` with
   * `outcome: "edited"` — a farmer's planned product/quantity/date,
   * validated server-side against the real, freshly recomputed
   * recommendation by `validateFertiliserPlanEdits` before it is ever
   * persisted. Ignored (must be omitted) for every other promptKind. */
  edits?: Record<string, unknown>;
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

  if (input.edits !== undefined && input.promptKind !== FERTILISER_RECOMMENDATION_PROMPT_KIND) {
    throw new Error(`submitPromptDecisionAction: edits are only supported for "${FERTILISER_RECOMMENDATION_PROMPT_KIND}", not "${input.promptKind}"`);
  }

  const now = new Date().toISOString();
  const prompt =
    input.promptKind === FERTILISER_RECOMMENDATION_PROMPT_KIND
      ? recomputePromptByKind({
          promptKind: input.promptKind,
          farm,
          field,
          allFields: fields,
          livestockGroups: await listLivestockGroupsForFarm(farm.id),
          slurryAllocations: await listSlurryAllocationsForFarm(farm.id),
          now,
        })
      : recomputePromptByKind({ promptKind: input.promptKind, farm, field, material: input.material, now });

  let edits: Record<string, unknown> | undefined;
  if (input.outcome === "edited") {
    if (input.promptKind !== FERTILISER_RECOMMENDATION_PROMPT_KIND) {
      throw new Error(`submitPromptDecisionAction: "edited" is only supported for "${FERTILISER_RECOMMENDATION_PROMPT_KIND}" today`);
    }
    if (prompt.basis.status !== "OK") {
      throw new Error(`submitPromptDecisionAction: cannot edit prompt ${prompt.id} — its basis is "${prompt.basis.status}", not "OK"`);
    }
    if (!input.edits || Object.keys(input.edits).length === 0) {
      throw new Error('submitPromptDecisionAction: outcome "edited" requires at least one real edit');
    }
    edits = validateFertiliserPlanEdits(input.edits, prompt.basis.value as FertiliserRecommendationSummary) as Record<string, unknown>;
  }

  const decision = decideAsFarmer(prompt, input.outcome, now, edits);
  const result = await insertDecision({ ...decision, decidedBy: "farmer" });
  // Today re-derives its Prompts fresh on every load (no persisted Prompt
  // table — `ARCHITECTURE.md`), so nothing there depends on this decision
  // row; Records is the one real screen that reads decisions back.
  revalidatePath("/records");
  revalidatePath("/plan");
  return result;
}
