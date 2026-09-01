import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listJobsWithDecisionsForFarm, type JobWithDecision } from "@/lib/farm-data/jobs";
import { listDecisionsForFarm } from "@/lib/farm-data/decisions";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import { RecordsPageClient } from "./RecordsPageClient";

/** Postgres SQLSTATE `undefined_table` — see `reports/page.tsx`'s
 * identical constant/comment; the one specific, expected failure mode
 * while `decisions`/`jobs` are `PENDING_DEV_VALIDATION`. */
const UNDEFINED_TABLE = "42P01";

export default async function RecordsPage() {
  if (!isSupabaseConfigured()) {
    return <RecordsPageClient jobs={[]} decisions={[]} />;
  }

  const farm = await getFarmForCurrentUser();
  if (!farm) {
    return <RecordsPageClient jobs={[]} decisions={[]} />;
  }

  // Farm Return Next v1.1 — Records extension. Same disclosed-until-
  // applied posture as `reports/page.tsx`'s identical try/catch (this
  // page's own header comment there explains the full reasoning): only
  // the one specific, expected "migration not applied yet" error is
  // treated as honestly empty; anything else surfaces as a real
  // "unavailable" state, logged, never silently swallowed.
  let jobs: JobWithDecision[] = [];
  let jobsUnavailable = false;
  let jobsTruncated = false;
  try {
    const result = await listJobsWithDecisionsForFarm(farm.id);
    jobs = result.jobs;
    jobsTruncated = result.truncated;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code !== UNDEFINED_TABLE) {
      console.error("[records] listJobsWithDecisionsForFarm failed with an unexpected error:", error);
      jobsUnavailable = true;
    }
  }

  let decisions: DecisionRecord[] = [];
  let decisionsUnavailable = false;
  let decisionsTruncated = false;
  try {
    const result = await listDecisionsForFarm(farm.id);
    decisionsTruncated = result.truncated;
    // This page shows a decision only when *no* job exists for it —
    // `JobHistoryCard` already shows the job+decision pair for every
    // decision `jobs` above covers (`listDecisionsForFarm`'s own doc
    // comment explains why this split is a presentational choice, not a
    // data-access one).
    const decisionIdsWithJobs = new Set(jobs.map((j) => j.decision.id));
    decisions = result.decisions.filter((d) => !decisionIdsWithJobs.has(d.id));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code !== UNDEFINED_TABLE) {
      console.error("[records] listDecisionsForFarm failed with an unexpected error:", error);
      decisionsUnavailable = true;
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
