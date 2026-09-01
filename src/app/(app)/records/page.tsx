import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listJobsWithDecisionsForFarm, listJobDecisionIdsForFarm, type JobWithDecision } from "@/lib/farm-data/jobs";
import { listDecisionsForFarm } from "@/lib/farm-data/decisions";
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
  let decisions: DecisionRecord[] = [];
  let decisionsUnavailable = jobsUnavailable;
  let decisionsTruncated = false;
  if (!jobsUnavailable) {
    try {
      const [decisionIdsResult, decisionsResult] = await Promise.all([
        listJobDecisionIdsForFarm(farm.id),
        listDecisionsForFarm(farm.id),
      ]);
      decisionsTruncated = decisionsResult.truncated;
      if (decisionIdsResult.truncated) {
        console.error(`[records] listJobDecisionIdsForFarm truncated for farm ${farm.id} — cannot safely dedup, marking decisions unavailable.`);
        decisionsUnavailable = true;
      } else {
        decisions = decisionsResult.decisions.filter((d) => !decisionIdsResult.decisionIds.has(d.id));
      }
    } catch (error) {
      if (!isUndefinedTableError(error)) {
        console.error("[records] listDecisionsForFarm/listJobDecisionIdsForFarm failed with an unexpected error:", error);
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
    />
  );
}
