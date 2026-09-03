"use client";

import { PageHeader } from "@/components/shell/PageHeader";
import { AskAIButton } from "@/components/next/AskAI";
import { ActivityTimelineCard, entryTimestamp, type TimelineEntry } from "@/components/next/ActivityTimelineCard";
import type { JobWithDecision } from "@/lib/farm-data/jobs";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import type { JobSessionWithActual } from "@/lib/farm-data/job-sessions";

/**
 * Records — Farm Return Next v1.1, canonical screen #6 (§4/§9). Builds
 * one real, chronologically-sorted timeline from real jobs and real
 * decisions with no job attached — see `ActivityTimelineCard`'s own doc
 * comment for why this replaced two separately-stacked cards (Codex audit
 * MEDIUM, round 1). `/reports` is untouched and keeps its own
 * `JobHistoryCard` plus the CSV/audit-trail tools this screen doesn't
 * need — `CLAUDE.md`'s "never remove an approved screen element".
 *
 * **Sort key (Codex audit MEDIUM, round 2):** a decision's `decidedAt`
 * for a bare decision entry, but a job's `updatedAt` — not
 * `job.decision.decidedAt` — for a job entry. Round 1 sorted job entries
 * by their authorising decision's `decidedAt`, which is *when the farmer
 * decided*, not when the job itself last changed state (e.g. reached
 * `confirmed`) — for today's one real job type
 * (`record_weight_observation`, created synchronously in the same
 * request as its decision) the two are practically identical, but that's
 * an accident of this app's current single job type, not a real
 * guarantee `jobs.updated_at`
 * (`20260829000000_orchestration_foundation.sql`'s `jobs_set_updated_at`
 * trigger, real and already-existing) already provides for any future
 * job whose completion trails its own decision by hours. Using it here
 * costs nothing today and is correct for that future case too.
 */
export function RecordsPageClient({
  jobs,
  jobsUnavailable = false,
  jobsTruncated = false,
  decisions,
  decisionsUnavailable = false,
  decisionsTruncated = false,
  jobSessions = [],
  jobSessionsUnavailable = false,
  jobSessionsTruncated = false,
}: {
  jobs: JobWithDecision[];
  jobsUnavailable?: boolean;
  jobsTruncated?: boolean;
  decisions: DecisionRecord[];
  decisionsUnavailable?: boolean;
  decisionsTruncated?: boolean;
  /** GPS Job Session + Confirm Actual contract — confirmed Job Sessions,
   * a real third source alongside jobs/decisions, merged into the same
   * chronological timeline (this file's own header comment on why job
   * entries sort by their own real timestamp, not a decision's). */
  jobSessions?: JobSessionWithActual[];
  jobSessionsUnavailable?: boolean;
  jobSessionsTruncated?: boolean;
}) {
  const entries: TimelineEntry[] = [
    ...jobs.map((job): TimelineEntry => ({ type: "job", job })),
    ...decisions.map((decision): TimelineEntry => ({ type: "decision", decision })),
    ...jobSessions.map((session): TimelineEntry => ({ type: "job_session", session })),
  ].sort((a, b) => entryTimestamp(b).localeCompare(entryTimestamp(a)));

  const askAIContext = { screen: "Records", facts: { "Activity entries": String(entries.length) } };

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3 lg:hidden">
        <div>
          <h1 className="font-display text-title text-fr-ink-900">Records</h1>
          <p className="text-sm text-fr-ink-600">Your farm history</p>
        </div>
      </div>
      {/* Codex audit MEDIUM (round 3): desktop needs a real Ask AI
          affordance too — see Today's own identical fix. Desktop keeps
          Ask AI in `PageHeader`'s own `actions` slot, the established
          cross-screen convention (Farm/Plan use the identical slot) —
          image1 has no desktop mockup to reproduce here, only mobile. */}
      <PageHeader title="Records" subtitle="Your farm history" actions={<AskAIButton context={askAIContext} />} />

      <ActivityTimelineCard
        entries={entries}
        // jobsUnavailable taints entries entirely (jobs=[] already, and
        // dedup for decisions is unsafe too — records/page.tsx already
        // forces decisionsUnavailable alongside it). A decisions-only
        // failure leaves the real, correct job entries intact — shown via
        // the softer `partiallyUnavailable` caveat instead.
        unavailable={jobsUnavailable}
        partiallyUnavailable={!jobsUnavailable && (decisionsUnavailable || jobSessionsUnavailable)}
        truncated={jobsTruncated || decisionsTruncated || jobSessionsTruncated}
      />

      {/* Strict Visual Reproduction phase: image1's own Records panel
          shows Ask AI as a persistent, full-width bottom pill, not a
          header action — the phase's accepted "every image1 panel treats
          Ask AI this way" direction, applied here on mobile (Plan/Field
          detail's own identical fix). Reserves scroll room the same way. */}
      <div className="h-16 lg:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 px-4 lg:hidden">
        <AskAIButton context={askAIContext} className="w-full justify-center py-3 shadow-fr-card" />
      </div>
    </>
  );
}
