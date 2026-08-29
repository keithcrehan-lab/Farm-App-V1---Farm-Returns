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
  const edits = parseRecordWeightObservationEdits(decision.edits);
  if (!edits) {
    throw new Error(
      `actRecordWeightObservation: decision ${decision.id} is missing valid animalId/weightKg/observedDate edits`,
    );
  }
  const record = await addWeightObservation(decision.farmId, edits.animalId, edits.weightKg, edits.observedDate, source);
  return { jobType: "record_weight_observation", decisionId: decision.id, record };
}
