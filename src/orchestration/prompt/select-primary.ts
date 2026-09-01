/**
 * Today's "What matters now" card (`FARM_RETURN_NEXT_SPEC_v1_1.md` §8):
 * "Primary card: 'What matters now'. One strongest genuine action, not a
 * feed of everything." A real farm can have several real Prompts live at
 * once (multiple fields × multiple Prompt kinds) — something has to pick
 * the one Today leads with. This module is that picker.
 *
 * This is presentation-priority logic, not a scientific/financial
 * calculation: it never reads or recomputes a Prompt's own `basis`, only
 * ranks already-built real `Prompt` objects by their own already-computed
 * `basis.status` and `kind` — the same "orchestration ranks/presents,
 * domain computes" boundary `buildPrompt` itself already enforces
 * (`./index.ts`'s own header comment). No new evidence, confidence or
 * agronomic judgement is invented here.
 *
 * **Ranking rule (deliberately simple and fully documented, not a hidden
 * "urgency score")**:
 *
 * 1. `LEGAL_PROHIBITION` first — a real regulatory restriction currently
 *    in force is the one thing Today should never bury under a routine
 *    "OK" Prompt, matching §18's own "Constraint" state getting amber/red
 *    treatment ahead of a green "Ready" one.
 * 2. `OK` second — a genuine, actionable opportunity (e.g. "Calendar open
 *    — Field 7", spec's own worked example).
 * 3. `AMBIGUOUS` / `UNKNOWN` third — a real evidence gap worth surfacing,
 *    but weaker than either of the above.
 * 4. `BLOCKED_INSUFFICIENT_EVIDENCE` / `NOT_APPLICABLE` last — the least
 *    urgent real state: nothing to decide yet, or the check doesn't apply
 *    here.
 *
 * Within a tie, the earliest `createdAt` wins (stable, deterministic,
 * testable) — not field name or kind order, neither of which has any real
 * priority meaning `SCIENTIFIC_RULES.md` would sanction.
 */
import type { EngineOutcome } from "@/domain/evidence";
import type { Prompt } from "./index";

const STATUS_RANK: Record<EngineOutcome<unknown>["status"], number> = {
  LEGAL_PROHIBITION: 0,
  OK: 1,
  AMBIGUOUS: 2,
  UNKNOWN: 2,
  BLOCKED_INSUFFICIENT_EVIDENCE: 3,
  NOT_APPLICABLE: 3,
};

/**
 * Picks the single strongest real Prompt to lead Today with. Returns
 * `undefined` for an empty list — Today's own caller renders the honest
 * "nothing needs your attention right now" state for that case, never a
 * fabricated placeholder Prompt.
 */
export function selectPrimaryPrompt(prompts: readonly Prompt[]): Prompt | undefined {
  if (prompts.length === 0) return undefined;
  return [...prompts].sort((a, b) => {
    const rankDiff = STATUS_RANK[a.basis.status] - STATUS_RANK[b.basis.status];
    if (rankDiff !== 0) return rankDiff;
    return a.createdAt.localeCompare(b.createdAt);
  })[0];
}

/**
 * The remaining real Prompts, in the same rank order, once the primary
 * one is shown separately — Plan's "genuine opportunities" section
 * (§9) reads this rather than re-deriving its own ordering.
 */
export function selectSecondaryPrompts(prompts: readonly Prompt[]): Prompt[] {
  const primary = selectPrimaryPrompt(prompts);
  return [...prompts]
    .filter((p) => p.id !== primary?.id)
    .sort((a, b) => {
      const rankDiff = STATUS_RANK[a.basis.status] - STATUS_RANK[b.basis.status];
      if (rankDiff !== 0) return rankDiff;
      return a.createdAt.localeCompare(b.createdAt);
    });
}
