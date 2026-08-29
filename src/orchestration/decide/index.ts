/**
 * Decide stage — the farmer's response to a Prompt. `MASTER_SPEC.md`: "The
 * farmer accepts, edits, or dismisses the prompt (or a documented
 * auto-rule decides, only where the brief already allows planning-advice
 * automation — never a compliance decision)."
 *
 * `SCIENTIFIC_RULES.md`'s Decide-stage auto-rule boundary: no auto-rule
 * exists yet (`BLOCKERS.md`) — `decidedBy: "auto_rule"` is reserved for
 * when one is proposed and reviewed against that boundary, not usable
 * today. Every real Decision this checkpoint produces has
 * `decidedBy: "farmer"`.
 */
import type { Prompt } from "@/orchestration/prompt";

export type DecisionOutcome = "accepted" | "edited" | "dismissed";

export interface Decision {
  id: string;
  promptId: string;
  farmId: string;
  outcome: DecisionOutcome;
  /** The farmer-confirmed values Act needs to create a real record —
   * present for `"accepted"`/`"edited"` (Prompt doesn't yet type a
   * structured suggested-payload for Decide to fall back to on
   * `"accepted"` alone; that's added alongside the first typed Prompt kind
   * that needs it, per `DOMAIN_CONTRACTS.md`'s "new contracts" process,
   * not invented here). Absent for `"dismissed"`. */
  edits?: Record<string, unknown>;
  decidedBy: "farmer" | "auto_rule";
  /** ISO datetime. */
  decidedAt: string;
}

/**
 * Constructs a farmer Decision from a Prompt — the only constructor this
 * checkpoint ships; a `decidedBy: "auto_rule"` constructor is added
 * alongside its first real, reviewed auto-rule (`SCIENTIFIC_RULES.md`),
 * not before.
 */
export function decideAsFarmer(
  prompt: Pick<Prompt, "id" | "farmId">,
  outcome: DecisionOutcome,
  decidedAt: string,
  edits?: Record<string, unknown>,
): Decision {
  return {
    id: `decision:${prompt.id}:${decidedAt}`,
    promptId: prompt.id,
    farmId: prompt.farmId,
    outcome,
    edits,
    decidedBy: "farmer",
    decidedAt,
  };
}
