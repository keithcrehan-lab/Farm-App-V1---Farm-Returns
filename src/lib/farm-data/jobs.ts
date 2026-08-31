import "server-only";

/**
 * Farm Return Next Checkpoint 2, Vertical D — real persistence for the Act
 * stage's job record. Requires `supabase/migrations/
 * 20260829010000_decisions_jobs_client_access.sql` applied *in addition
 * to* `20260829000000_orchestration_foundation.sql` — see
 * `decisions.ts`'s own header comment for the identical disclosed-until-
 * applied posture, and for why this file uses the plain RLS-respecting
 * session client rather than a privileged one (an earlier version of this
 * checkpoint used a service-role client here too; see `decisions.ts`'s
 * header and `docs/farm-return-next/BLOCKERS.md` for the full reasoning
 * behind reverting it).
 *
 * No `Job`/`JobType` import from `@/orchestration/act` here — same
 * layering reasoning as `decisions.ts`; `NewJobInput` is this file's own
 * structural type. `jobType` is typed as a plain `string`, not a literal
 * union: this table has no CHECK constraint on `job_type` (unlike
 * `status`, which mirrors the migration's five-value CHECK exactly via
 * `JobStatus`), and the set of real job types only ever grows as new Act
 * implementations ship (`act/index.ts`'s own header comment: "Every other
 * job type this app eventually needs... is added the same way, one at a
 * time") — this file has no reason to know that set ahead of time.
 *
 * `weightObservationId` (`supabase/migrations/
 * 20260829020000_jobs_weight_observation_reference.sql`, added by an
 * overnight-run Codex audit finding, HIGH,
 * `docs/farm-return-next/audit-logs/20260831T204350Z.md`) is job-type-specific
 * — see that migration's own header comment for why it doesn't pre-empt
 * Vertical C's future general `target_type`/`target_id` design.
 */
import { createClient } from "@/lib/supabase/server";
import { rowToJob, type JobRecord, type JobStatus } from "./mappers";
import type { JobRow } from "./row-types";

export interface NewJobInput {
  farmId: string;
  decisionId: string;
  jobType: string;
  status: JobStatus;
  /** The specific `WeightObservation` (or other future job-type-specific
   * Actual) row that justifies this job, when the job type has one.
   * Same-farm-enforced by `jobs_check_same_farm`
   * (`20260829020000_jobs_weight_observation_reference.sql`) — a value
   * belonging to another farm is rejected at insert time, the same
   * protection `decisionId` already has. See `JobRow.weight_observation_id`'s
   * own doc comment for why this is job-type-specific, not a general
   * target reference. */
  weightObservationId?: string;
}

/**
 * Inserts a Job row, via the regular RLS-respecting session client.
 * `jobs` grants `select, insert` only at the table level
 * (`20260829010000_decisions_jobs_client_access.sql`) — no `update`, no
 * `delete`. A job's `status` will legitimately need to transition after
 * creation once a real caller exists (Vertical C's GPS job mode, in
 * particular), but that grant was deliberately removed rather than
 * shipped ahead of a real consumer (Codex audit CRITICAL,
 * `docs/farm-return-next/audit-logs/20260829T193529Z.md`: an earlier,
 * unconstrained column-scoped `update` grant let a client rewrite a
 * `confirmed` job back to `proposed` with nothing enforcing a real state
 * machine) — whichever vertical adds real status transitions designs
 * that state machine against its own actual requirements and adds a
 * properly-gated write path alongside it, not a raw grant guessed at
 * now. This file ships only the insert this checkpoint's one real caller
 * (`actRecordWeightObservation`) needs.
 */
export async function insertJob(input: NewJobInput): Promise<JobRecord> {
  const supabase = await createClient();

  // Farm-ownership pre-check — see `decisions.ts`'s `insertDecision` for
  // the identical reasoning (independent of, not a substitute for,
  // `jobs_owner_all`'s own `with check` on the insert below).
  // `jobs_check_same_farm` (the trigger on `jobs` itself) separately
  // re-verifies that `decisionId` actually belongs to this same farm.
  const { data: ownedFarm, error: ownershipError } = await supabase
    .from("farms")
    .select("id")
    .eq("id", input.farmId)
    .maybeSingle();
  if (ownershipError) throw ownershipError;
  if (!ownedFarm) {
    throw new Error(`insertJob: farm ${input.farmId} does not belong to the current session`);
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      farm_id: input.farmId,
      decision_id: input.decisionId,
      job_type: input.jobType,
      status: input.status,
      weight_observation_id: input.weightObservationId ?? null,
    })
    .select("*")
    .single();
  if (error) {
    // Retry-safety (Codex audit HIGH, docs/farm-return-next/audit-logs/
    // 20260829T191227Z.md and 20260829T191955Z.md): `jobs.id` is
    // server-generated per insert, so a plain retry after a lost response
    // would mint a fresh id and create a *second* job for the same
    // decision — `jobs_decision_id_unique`
    // (`20260829010000_decisions_jobs_client_access.sql`) makes that
    // impossible and turns it into a detectable `23505` here instead.
    // Mirrors `insertDecision`'s own retry-safety fix exactly, content
    // comparison included: a conflicting row is only ever treated as "the
    // same retried insert" once its farm/type/status actually match what
    // was requested — a mismatch fails closed rather than silently
    // returning the wrong job.
    if (error.code === "23505") {
      const { data: existing, error: fetchError } = await supabase
        .from("jobs")
        .select("*")
        .eq("decision_id", input.decisionId)
        .single();
      if (fetchError) throw fetchError;
      const existingRow = existing as JobRow;
      if (
        existingRow.farm_id !== input.farmId ||
        existingRow.job_type !== input.jobType ||
        existingRow.status !== input.status ||
        existingRow.weight_observation_id !== (input.weightObservationId ?? null)
      ) {
        throw new Error(
          `insertJob: a job for decision ${input.decisionId} already exists with different farmId/jobType/status/weightObservationId — refusing to silently return mismatched data`,
        );
      }
      return rowToJob(existingRow);
    }
    throw error;
  }

  return rowToJob(data as JobRow);
}
