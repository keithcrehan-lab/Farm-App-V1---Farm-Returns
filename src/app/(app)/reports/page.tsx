import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listJobsWithDecisionsForFarm, type JobWithDecision } from "@/lib/farm-data/jobs";
import { ReportsPageClient } from "./ReportsPageClient";

/** Postgres SQLSTATE `undefined_table` — PostgREST passes the real
 * underlying Postgres error code through in `error.code` (the same
 * behaviour `insertDecision`/`insertJob`'s own `23505` retry-safety logic
 * already relies on elsewhere in this codebase, so this isn't a guess at
 * PostgREST's error shape). The one, specific, *expected* failure mode
 * while `jobs`/`decisions` are `PENDING_DEV_VALIDATION` — the table
 * genuinely doesn't exist on this project yet. */
const UNDEFINED_TABLE = "42P01";

export default async function ReportsPage() {
  if (!isSupabaseConfigured()) {
    return <ReportsPageClient jobs={[]} />;
  }

  const farm = await getFarmForCurrentUser();
  if (!farm) {
    return <ReportsPageClient jobs={[]} />;
  }

  // Farm Return Next Checkpoint 2, Vertical D — requires
  // supabase/migrations/20260829000000_orchestration_foundation.sql,
  // 20260829010000_decisions_jobs_client_access.sql and
  // 20260829020000_jobs_weight_observation_reference.sql applied to the
  // live project; fails open (empty list, not a crash) if they haven't
  // been yet, the same disclosed-until-applied posture
  // `livestock/page.tsx`'s own individual-animals fetch already uses for
  // its own not-yet-applied migration.
  //
  // Codex audit MEDIUM (docs/farm-return-next/audit-logs/20260901T094442Z.md):
  // an earlier version of this catch was blanket — any error (an auth
  // failure, an RLS regression, a transient DB outage) rendered the exact
  // same "No job history yet" as a genuinely empty farm, which is a real
  // false-negative on a Records screen whose entire job is showing what
  // actually happened. Distinguished here: only the one specific,
  // expected "table doesn't exist yet" error is treated as honestly
  // empty; anything else is logged (so it's diagnosable, not silently
  // lost) and surfaces as a real "unavailable" state, not a fabricated
  // empty one. This page has no nearby `error.tsx` boundary yet (none
  // exists anywhere in this app), and Reports has three other, unrelated
  // real reports on the same page — re-throwing an unexpected error here
  // would crash the whole page over one card's data, a worse regression
  // than a correctly-labelled "unavailable" state for that one card.
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
      console.error("[reports] listJobsWithDecisionsForFarm failed with an unexpected error:", error);
      jobsUnavailable = true;
    }
    // code === UNDEFINED_TABLE: migration(s) not yet applied to this
    // project — see this function's own comment above and
    // docs/farm-return-next/BLOCKERS.md. Genuinely empty, not an error.
  }

  return <ReportsPageClient jobs={jobs} jobsUnavailable={jobsUnavailable} jobsTruncated={jobsTruncated} />;
}
