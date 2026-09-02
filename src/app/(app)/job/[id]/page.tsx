/**
 * Active GPS Job Mode — canonical screen #3
 * (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
 * §18). Server component: resolves the real farm/Job Session (mirroring
 * `records/page.tsx`'s own real-mode-detection pattern) and hands off to
 * `ActiveJobSessionView` (client) for the live, interactive part — GPS
 * tracking, ticking elapsed time and Pause/Finish/Confirm Actual all need
 * a browser, not a server render.
 */
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { getJobSessionById } from "@/lib/farm-data/job-sessions";
import { ActiveJobSessionView } from "./ActiveJobSessionView";

export default async function JobSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return <ActiveJobSessionView jobSessionId={id} initialSession={null} demoMode />;
  }

  const farm = await getFarmForCurrentUser();
  if (!farm) {
    return <ActiveJobSessionView jobSessionId={id} initialSession={null} demoMode />;
  }

  let session = null;
  let unavailable = false;
  try {
    session = await getJobSessionById(farm.id, id);
  } catch (error) {
    // Same disclosed-until-applied posture as `records/page.tsx` — the
    // migrations this contract needs (`20260902000000_job_sessions.sql`)
    // are `PENDING_DEV_VALIDATION`; an "undefined_table" error here is the
    // one specific, expected failure mode while that's true, not a real
    // outage. Anything else is logged and surfaced as genuinely
    // unavailable, never silently swallowed.
    const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code !== "42P01") {
      console.error(`[job/${id}] getJobSessionById failed with an unexpected error:`, error);
      unavailable = true;
    }
  }

  return <ActiveJobSessionView jobSessionId={id} initialSession={session} demoMode={false} unavailable={unavailable} />;
}
