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
import { rowToDecision, rowToJob, rowToWeightObservation, type DecisionRecord, type JobRecord, type JobStatus } from "./mappers";
import type { DecisionRow, JobRow, WeightObservationRow } from "./row-types";
import type { WeightObservation } from "@/domain/types";

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

/**
 * Farm Return Next Checkpoint 2, Vertical D — real read path for the
 * Records UI (`BUILD_PLAN.md`'s build-priority #1, product-owner
 * decision 2026-09-01). The first reader either `decisions.ts` or
 * `jobs.ts` has shipped — everything before this was insert-only, since
 * nothing had a real consumer yet.
 *
 * Returns each `Job` with its authorising `Decision` embedded (a real
 * PostgREST embedded-resource select over `jobs.decision_id ->
 * decisions.id`, not a second round-trip or an application-level join) —
 * `jobs` alone (`job_type`/`status`) is not farmer-legible; what actually
 * happened is the *decision* (`outcome`, `estimateSnapshot`, `edits`)
 * that authorised it. Also embeds the real `weightObservation` row via
 * `jobs.weight_observation_id`, when present (Codex audit HIGH,
 * `docs/farm-return-next/audit-logs/20260901T094442Z.md`: an earlier
 * version of this function only embedded `decisions`, so the UI ended up
 * presenting `decision.edits` — the farmer's *decided-time* input snapshot
 * — as if it were the recorded Actual; `edits` and the real
 * `livestock_weight_observations` row it produced are the same value only
 * because `persistRecordWeightObservationAuditTrail` verifies them equal
 * at write time today, not because they are structurally guaranteed to
 * stay equal forever — `ARCHITECTURE.md`'s own offline-conflict-
 * resolution decision explicitly anticipates a confirmed Actual being
 * later revised, which `decision.edits` would never reflect). Records'
 * own stated scope is "completed jobs, **Actuals**, evidence and
 * historical records" — the real Actual, not a decision-time snapshot of
 * intent, is what this reader now surfaces as the source of truth.
 *
 * RLS scopes this the same way every other query here is scoped:
 * `jobs_owner_all`'s `using` clause restricts the outer `jobs` rows to
 * this farm, and both embedded rows (`decisions`,
 * `livestock_weight_observations`) are independently subject to their
 * own farm-scoped RLS policies — all three already `farm_id`-scoped to
 * the same farm (enforced by `jobs_check_same_farm` at insert time for
 * both foreign keys), so there is no cross-farm read seam here even
 * though three tables' worth of RLS is in play.
 *
 * Ordered newest-first (`created_at desc`) — a farmer's history reads
 * top-down as "what happened most recently." Capped at
 * `MAX_JOB_HISTORY_ROWS` (Codex audit MEDIUM,
 * `docs/farm-return-next/audit-logs/20260901T094442Z.md`: an unbounded
 * select grows without limit and risks PostgREST's own default row cap
 * truncating silently, the exact "PostgREST row-limit correctness bug"
 * class already found once in this codebase, `act/index.ts`'s own
 * `getWeightObservationById` fix) — a real, explicit, small-multiple-of-
 * PostgREST's-default limit, not a full pagination UI, which is
 * proportionate future work once real usage volume (this table has zero
 * live rows anywhere today — the migrations aren't applied yet) actually
 * justifies the added complexity of cursor state and "load more" UI.
 * `truncated` (Codex audit MEDIUM, `docs/farm-return-next/audit-logs/
 * 20260901T095654Z.md`: a silent cap can be mistaken for "this is all
 * the history there is") makes that cap honestly disclosable rather than
 * silently applied — fetches one extra row beyond the cap to detect
 * whether more exist, without ever returning that extra row itself.
 */
export const MAX_JOB_HISTORY_ROWS = 200;

export interface JobWithDecision extends JobRecord {
  decision: DecisionRecord;
  /** The real, recorded Actual this job's `confirmed` status is based
   * on — present only when `weightObservationId` is (`record_weight_observation`
   * jobs today). This, not `decision.edits`, is the source of truth for
   * "what actually happened" — see this file's own `listJobsWithDecisionsForFarm`
   * doc comment. */
  weightObservation?: WeightObservation;
}

export interface JobHistoryResult {
  jobs: JobWithDecision[];
  /** `true` when this farm has more than `MAX_JOB_HISTORY_ROWS` real jobs
   * — `jobs` above holds only the most recent `MAX_JOB_HISTORY_ROWS`, not
   * every job that exists. A caller must disclose this, not present
   * `jobs` as the complete history. */
  truncated: boolean;
}

/** Records' own stated scope is "**completed** jobs, Actuals, evidence
 * and historical records" (`UX_DESIGN.md`) — `proposed`/`scheduled`/
 * `in_progress` are not yet history, they're still in-flight work
 * (Plan/Today's own concern, not Records'). `confirmed`/`dismissed` are
 * the two real terminal states this table's own CHECK constraint
 * defines (`20260829000000_orchestration_foundation.sql`) — a decision
 * to act, and a decision not to, are both real historical facts.
 * `listJobsWithDecisionsForFarm`'s one real caller today
 * (`actRecordWeightObservation`) only ever inserts `status: "confirmed"`,
 * so this filter is a no-op in practice right now — it matters once
 * Vertical C's GPS job mode starts creating jobs that spend real time in
 * `proposed`/`scheduled`/`in_progress` before Confirm, which this reader
 * must not show as if they were already history (Codex audit MEDIUM,
 * `docs/farm-return-next/audit-logs/20260901T100458Z.md`). */
const RECORDS_TERMINAL_STATUSES: JobStatus[] = ["confirmed", "dismissed"];

export async function listJobsWithDecisionsForFarm(farmId: string): Promise<JobHistoryResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*, decision:decisions(*), weightObservation:livestock_weight_observations(*)")
    .eq("farm_id", farmId)
    .in("status", RECORDS_TERMINAL_STATUSES)
    .order("created_at", { ascending: false })
    .limit(MAX_JOB_HISTORY_ROWS + 1);
  if (error) throw error;

  const rows = data as (JobRow & { decision: DecisionRow; weightObservation: WeightObservationRow | null })[];
  const truncated = rows.length > MAX_JOB_HISTORY_ROWS;
  const jobs = rows.slice(0, MAX_JOB_HISTORY_ROWS).map((row) => ({
    ...rowToJob(row),
    decision: rowToDecision(row.decision),
    ...(row.weightObservation ? { weightObservation: rowToWeightObservation(row.weightObservation) } : {}),
  }));
  return { jobs, truncated };
}
