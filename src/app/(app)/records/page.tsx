import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listJobsWithDecisionsForFarm, listJobDecisionIdsForFarm, type JobWithDecision } from "@/lib/farm-data/jobs";
import { listDecisionsForFarm } from "@/lib/farm-data/decisions";
import {
  listConfirmedJobSessionsForFarm,
  listJobSessionDecisionIdsForFarm,
  type JobSessionWithActual,
} from "@/lib/farm-data/job-sessions";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import { RecordsPageClient } from "./RecordsPageClient";

/** Postgres SQLSTATE `undefined_table` — see `reports/page.tsx`'s
 * identical constant/comment; the one specific, expected failure mode
 * while `decisions`/`jobs` are `PENDING_DEV_VALIDATION`. */
const UNDEFINED_TABLE = "42P01";

function isUndefinedTableError(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  return code === UNDEFINED_TABLE;
}

export default async function RecordsPage() {
  if (!isSupabaseConfigured()) {
    return <RecordsPageClient jobs={[]} decisions={[]} />;
  }

  const farm = await getFarmForCurrentUser();
  if (!farm) {
    return <RecordsPageClient jobs={[]} decisions={[]} />;
  }

  // GPS Job Session + Confirm Actual contract — fetched alongside
  // jobs/decisions (independent of both), same disclosed-until-applied
  // posture (this contract's own migrations are PENDING_DEV_VALIDATION).
  let jobSessions: JobSessionWithActual[] = [];
  let jobSessionsUnavailable = false;
  let jobSessionsTruncated = false;
  try {
    const result = await listConfirmedJobSessionsForFarm(farm.id);
    jobSessions = result.sessions;
    jobSessionsTruncated = result.truncated;
  } catch (error) {
    if (!isUndefinedTableError(error)) {
      console.error("[records] listConfirmedJobSessionsForFarm failed with an unexpected error:", error);
      jobSessionsUnavailable = true;
    }
  }

  // Same disclosed-until-applied posture as `reports/page.tsx`'s
  // identical try/catch (that page's own header comment has the full
  // reasoning): only the one specific, expected "migration not applied
  // yet" error is treated as honestly empty; anything else surfaces as a
  // real "unavailable" state, logged, never silently swallowed.
  let jobs: JobWithDecision[] = [];
  let jobsUnavailable = false;
  let jobsTruncated = false;
  try {
    const result = await listJobsWithDecisionsForFarm(farm.id);
    jobs = result.jobs;
    jobsTruncated = result.truncated;
  } catch (error) {
    if (!isUndefinedTableError(error)) {
      console.error("[records] listJobsWithDecisionsForFarm failed with an unexpected error:", error);
      jobsUnavailable = true;
    }
  }

  // Codex audit MEDIUM (round 1, docs/overnight/audits/
  // phase-1-visual-nav-today-plan-records-codex-audit.md): the first
  // version excluded a decision from `decisions` using only the *capped,
  // status-filtered* `jobs` list above as its exclusion set — a decision
  // whose job fell outside that cap (or wasn't fetched at all because
  // `jobsUnavailable`) could then be wrongly shown as "unattached". Fixed
  // by reading the complete, dedicated `decisionIds` set below
  // (`listJobDecisionIdsForFarm` — see its own doc comment) and failing
  // closed (`decisionsUnavailable = true`, no attempted dedup at all)
  // whenever that set can't be trusted as complete: the jobs fetch itself
  // already failed, this dedicated fetch itself fails, or it reports its
  // own `truncated: true`.
  //
  // GPS Job Session + Confirm Actual contract addition: a Job Session's
  // own authorising decision (`job_sessions.decision_id`) needs the
  // identical exclusion — `listJobSessionDecisionIdsForFarm` is merged
  // into the same dedup set, same all-or-nothing truncation-safety
  // reasoning, so a job-session-authorising decision never *also* shows
  // as a bare, unattached "Decision" entry.
  let decisions: DecisionRecord[] = [];
  let decisionsUnavailable = jobsUnavailable;
  let decisionsTruncated = false;
  if (!jobsUnavailable) {
    try {
      const [decisionIdsResult, jobSessionDecisionIdsResult, decisionsResult] = await Promise.all([
        listJobDecisionIdsForFarm(farm.id),
        listJobSessionDecisionIdsForFarm(farm.id),
        listDecisionsForFarm(farm.id),
      ]);
      decisionsTruncated = decisionsResult.truncated;
      if (decisionIdsResult.truncated || jobSessionDecisionIdsResult.truncated) {
        console.error(`[records] listJobDecisionIdsForFarm/listJobSessionDecisionIdsForFarm truncated for farm ${farm.id} — cannot safely dedup, marking decisions unavailable.`);
        decisionsUnavailable = true;
      } else {
        const excludedDecisionIds = new Set([...decisionIdsResult.decisionIds, ...jobSessionDecisionIdsResult.decisionIds]);
        decisions = decisionsResult.decisions.filter((d) => !excludedDecisionIds.has(d.id));
      }
    } catch (error) {
      if (!isUndefinedTableError(error)) {
        console.error("[records] listDecisionsForFarm/listJobDecisionIdsForFarm/listJobSessionDecisionIdsForFarm failed with an unexpected error:", error);
        decisionsUnavailable = true;
      }
    }
  }

  return (
    <RecordsPageClient
      jobs={jobs}
      jobsUnavailable={jobsUnavailable}
      jobsTruncated={jobsTruncated}
      decisions={decisions}
      decisionsUnavailable={decisionsUnavailable}
      decisionsTruncated={decisionsTruncated}
      jobSessions={jobSessions}
      jobSessionsUnavailable={jobSessionsUnavailable}
      jobSessionsTruncated={jobSessionsTruncated}
    />
  );
}
