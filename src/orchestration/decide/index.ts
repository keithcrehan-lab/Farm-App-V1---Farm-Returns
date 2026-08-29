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
import type { EngineOutcome } from "@/domain/evidence";
import type { Prompt } from "@/orchestration/prompt";

export type DecisionOutcome = "accepted" | "edited" | "dismissed";

export interface Decision {
  id: string;
  promptId: string;
  farmId: string;
  /** Copied from the originating `Prompt.kind` at decision time — lets
   * Learn group/reconcile a farm's calibration by calculation type
   * without re-deriving it later from `promptId` alone (Codex audit
   * finding, HIGH, `docs/farm-return-next/audit-logs/20260829T004238Z.md`:
   * the first version of this Decision shape had nothing for Learn to
   * reconcile Estimate vs Actual against). */
  calculationKind: string;
  /** Copied from the originating `Prompt.fieldId` at decision time, when
   * present (`Prompt.fieldId`'s own doc comment — absent for a Prompt not
   * scoped to one field). Codex audit finding (HIGH,
   * `docs/farm-return-next/audit-logs/20260829T085836Z.md`): the first
   * version of this Decision shape was written before any real Prompt
   * kind carried a `fieldId`, so it copied `id`/`farmId`/`kind`/`basis`
   * only — once `soil_test_age` added a real `fieldId` to `Prompt`, this
   * field would otherwise have been silently dropped at the very next
   * stage, breaking `SCIENTIFIC_RULES.md`'s "a Prompt's own trace...
   * must be inspectable" once the Prompt itself is gone. */
  fieldId?: string;
  /** Copied from the originating `Prompt.calculationVersion` at decision
   * time, when present — see `Prompt.calculationVersion`'s own doc
   * comment. Added alongside `fieldId` for the same reason: a real
   * `Prompt` field must survive into its `Decision`, or the trace is lost
   * the moment the Prompt (never persisted) goes away. */
  calculationVersion?: string;
  /** Copied (deep-cloned, same discipline as `estimateSnapshot`) from the
   * originating `Prompt.inputsSnapshot` at decision time, when present —
   * see `Prompt.inputsSnapshot`'s own doc comment. This, together with
   * `estimateSnapshot`, is the checkpoint's real answer to
   * `SCIENTIFIC_RULES.md`'s "which Estimate, which evidence" requirement
   * surviving past the moment the Prompt (never persisted) or the `Field`
   * it was computed from (mutable) may have changed. */
  inputsSnapshot?: Record<string, unknown>;
  /** An immutable snapshot of the Prompt's own `basis` (the Estimate it
   * presented) at the moment the farmer decided — not a live reference to
   * the Estimate, which may since have been recomputed. This is the trace
   * `SCIENTIFIC_RULES.md` requires stay inspectable ("A Prompt's own
   * trace... must be inspectable the same way NutrientPlan's trace
   * already is") once the Prompt itself is gone (Prompts are never
   * persisted — `ARCHITECTURE.md`). */
  estimateSnapshot: EngineOutcome<unknown>;
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
 * not before. Takes the whole Prompt (not just id/farmId) so
 * `calculationKind`/`estimateSnapshot` are always copied from it, never
 * separately supplied and possibly mismatched.
 *
 * Fixes from Codex audit round 4
 * (`docs/farm-return-next/audit-logs/20260829T004941Z.md`, both Medium):
 * - `id` is a real UUID (`crypto.randomUUID()`), not a hand-built
 *   `decision:<promptId>:<timestamp>` string — the `decisions` table's
 *   primary key is `uuid`, so a Decision must already be
 *   persistence-shaped the moment it's constructed, not reformatted by
 *   whichever writer eventually calls the migration's `decisions` table.
 * - `estimateSnapshot` is a deep clone of `prompt.basis`
 *   (`structuredClone`), not the same object reference — a genuine
 *   snapshot must not change if the caller later mutates the Prompt it
 *   came from; a shared reference would have silently broken that
 *   guarantee.
 *
 * Fix from Codex audit round 6
 * (`docs/farm-return-next/audit-logs/20260829T010214Z.md`, HIGH): the
 * first version accepted `"accepted"`/`"edited"` for *any* Prompt,
 * including one whose `basis` was `LEGAL_PROHIBITION` or another non-OK
 * outcome — so a Decision could persist as "the farmer accepted this"
 * while its own snapshot said the underlying Estimate was blocked or
 * legally prohibited, exactly the kind of Prompt/Decide-boundary breach
 * `SCIENTIFIC_RULES.md` exists to prevent. `"accepted"`/`"edited"` now
 * throw unless `prompt.basis.status === "OK"` — dismissing a blocked/
 * prohibited Prompt is still fine, accepting one is not.
 */
export function decideAsFarmer(
  prompt: Pick<Prompt, "id" | "farmId" | "kind" | "basis" | "fieldId" | "calculationVersion" | "inputsSnapshot">,
  outcome: DecisionOutcome,
  decidedAt: string,
  edits?: Record<string, unknown>,
): Decision {
  if ((outcome === "accepted" || outcome === "edited") && prompt.basis.status !== "OK") {
    throw new Error(
      `decideAsFarmer: cannot ${outcome} prompt ${prompt.id} — its basis is "${prompt.basis.status}", not "OK". A blocked/ambiguous/prohibited/unknown Prompt can only be dismissed.`,
    );
  }
  return {
    id: globalThis.crypto.randomUUID(),
    promptId: prompt.id,
    farmId: prompt.farmId,
    calculationKind: prompt.kind,
    fieldId: prompt.fieldId,
    calculationVersion: prompt.calculationVersion,
    inputsSnapshot: prompt.inputsSnapshot === undefined ? undefined : structuredClone(prompt.inputsSnapshot),
    estimateSnapshot: structuredClone(prompt.basis),
    outcome,
    edits,
    decidedBy: "farmer",
    decidedAt,
  };
}
