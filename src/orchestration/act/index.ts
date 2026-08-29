/**
 * Act stage — `MASTER_SPEC.md`: "The app creates a real record from the
 * decision — a job, a planned application, a stock movement — the same
 * shape a farmer would have hand-entered in V1," calling existing
 * `src/lib/farm-data/*` mutation functions, never duplicating them
 * (`ARCHITECTURE.md`'s reuse boundary / `DOMAIN_CONTRACTS.md`).
 *
 * This checkpoint's one real, end-to-end job type — proving the layering
 * actually works, not just documented (`BUILD_PLAN.md`'s Checkpoint 1
 * deliverable) — is `record_weight_observation`: a Decide-stage
 * acceptance of "record this animal's weight" becomes a real
 * `WeightObservation` row via the *existing*
 * `farm-data/individual-animals.ts`'s `addWeightObservation`, not a new
 * write path. Every other job type this app eventually needs (a
 * spreading run, a stock movement) is added the same way, one at a time,
 * once its own Prompt/Decide path exists for it — never invented ahead of
 * the Decide stage that would produce it.
 */
import "server-only";
import type { WeightObservation } from "@/domain/types";
import { addWeightObservation } from "@/lib/farm-data/individual-animals";
import type { Decision } from "@/orchestration/decide";

export type JobType = "record_weight_observation";

/** The only `Prompt.kind` `actRecordWeightObservation` accepts — see its
 * own doc comment (Codex audit round 11, HIGH). */
export const RECORD_WEIGHT_OBSERVATION_CALCULATION_KIND = "weight_observation_due";

export interface ActResult<T> {
  jobType: JobType;
  decisionId: string;
  record: T;
}

export interface RecordWeightObservationEdits {
  animalId: string;
  weightKg: number;
  observedDate: string;
}

function parseRecordWeightObservationEdits(
  edits: Record<string, unknown> | undefined,
): RecordWeightObservationEdits | undefined {
  if (
    !edits ||
    typeof edits.animalId !== "string" ||
    edits.animalId.trim().length === 0 ||
    typeof edits.weightKg !== "number" ||
    !Number.isFinite(edits.weightKg) ||
    edits.weightKg <= 0 ||
    typeof edits.observedDate !== "string" ||
    edits.observedDate.trim().length === 0
  ) {
    return undefined;
  }
  return { animalId: edits.animalId, weightKg: edits.weightKg, observedDate: edits.observedDate };
}

/**
 * Acts on a `record_weight_observation` Decision — the checkpoint's one
 * real end-to-end path. Throws (never silently coerces or no-ops) on:
 *
 * - a Decision the farmer didn't actually accept/edit — Codex audit
 *   finding, `docs/farm-return-next/audit-logs/20260829T001857Z.md`: the
 *   first version of this function checked `decision.edits`' *shape* but
 *   never `decision.outcome`/`decidedBy`, so a `"dismissed"` Decision that
 *   still happened to carry `edits`, or a structurally-valid
 *   `decidedBy: "auto_rule"` Decision, would have silently written a real
 *   record — exactly the unconfirmed real-world side effect
 *   `SCIENTIFIC_RULES.md`'s Decide-stage boundary forbids. `decidedBy` is
 *   required to be `"farmer"` unconditionally here, not just today's
 *   *practical* state that no auto-rule exists yet (`BLOCKERS.md`) — an
 *   auto-rule earning the right to call Act still needs its own reviewed
 *   entry point, never silent admission through this one.
 * - malformed/missing edits (animalId/weightKg/observedDate absent,
 *   non-finite or non-positive weight, empty-string id/date) — the same
 *   fail-closed discipline the domain layer applies to a missing input.
 * - a Decision that didn't actually come from a `weight_observation_due`
 *   Prompt, or whose own `estimateSnapshot` wasn't `"OK"` — Codex audit
 *   finding, HIGH, `docs/farm-return-next/audit-logs/20260829T012813Z.md`:
 *   the first version checked `outcome`/`decidedBy`/edit shape but never
 *   *which* Prompt the Decision was for, so any accepted Decision with
 *   suitably-shaped edits — even one that started life as, say, a
 *   spreading-window Prompt with a since-recomputed or blocked basis —
 *   could create a real weight observation. `decideAsFarmer` already
 *   refuses to build an accepted/edited Decision from a non-OK basis, and
 *   the database's own CHECK constraint mirrors that — but Act is the
 *   last line of defense before a real domain mutation runs, and must not
 *   assume either of those upstream guards ran (`CLAUDE.md`'s "never
 *   assume application code is the only writer," applied here to a
 *   different caller, not just a different table).
 */
export async function actRecordWeightObservation(
  decision: Decision,
  source: string,
): Promise<ActResult<WeightObservation>> {
  if (decision.outcome !== "accepted" && decision.outcome !== "edited") {
    throw new Error(
      `actRecordWeightObservation: decision ${decision.id} has outcome "${decision.outcome}" — only an accepted or edited decision may act`,
    );
  }
  if (decision.decidedBy !== "farmer") {
    throw new Error(
      `actRecordWeightObservation: decision ${decision.id} was decided by "${decision.decidedBy}" — no reviewed auto-rule may call Act yet (SCIENTIFIC_RULES.md, BLOCKERS.md)`,
    );
  }
  if (decision.calculationKind !== RECORD_WEIGHT_OBSERVATION_CALCULATION_KIND) {
    throw new Error(
      `actRecordWeightObservation: decision ${decision.id} is for calculationKind "${decision.calculationKind}", not "${RECORD_WEIGHT_OBSERVATION_CALCULATION_KIND}"`,
    );
  }
  if (decision.estimateSnapshot.status !== "OK") {
    throw new Error(
      `actRecordWeightObservation: decision ${decision.id}'s estimateSnapshot has status "${decision.estimateSnapshot.status}", not "OK"`,
    );
  }
  const edits = parseRecordWeightObservationEdits(decision.edits);
  if (!edits) {
    throw new Error(
      `actRecordWeightObservation: decision ${decision.id} is missing valid animalId/weightKg/observedDate edits`,
    );
  }
  const record = await addWeightObservation(decision.farmId, edits.animalId, edits.weightKg, edits.observedDate, source);
  return { jobType: "record_weight_observation", decisionId: decision.id, record };
}
