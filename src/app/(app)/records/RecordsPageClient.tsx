"use client";

import { PageHeader } from "@/components/shell/PageHeader";
import { AskAIButton } from "@/components/next/AskAI";
import { ActivityTimelineCard, type TimelineEntry } from "@/components/next/ActivityTimelineCard";
import type { JobWithDecision } from "@/lib/farm-data/jobs";
import type { DecisionRecord } from "@/lib/farm-data/mappers";

/**
 * Records — Farm Return Next v1.1, canonical screen #6 (§4/§9). Builds
 * one real, chronologically-sorted timeline from real jobs (`decision.
 * decidedAt`) and real decisions with no job attached (`decidedAt`) —
 * see `ActivityTimelineCard`'s own doc comment for why this replaced two
 * separately-stacked cards (Codex audit MEDIUM, round 1). `/reports` is
 * untouched and keeps its own `JobHistoryCard` plus the CSV/audit-trail
 * tools this screen doesn't need — `CLAUDE.md`'s "never remove an
 * approved screen element".
 */
export function RecordsPageClient({
  jobs,
  jobsUnavailable = false,
  jobsTruncated = false,
  decisions,
  decisionsUnavailable = false,
  decisionsTruncated = false,
}: {
  jobs: JobWithDecision[];
  jobsUnavailable?: boolean;
  jobsTruncated?: boolean;
  decisions: DecisionRecord[];
  decisionsUnavailable?: boolean;
  decisionsTruncated?: boolean;
}) {
  const entries: TimelineEntry[] = [
    ...jobs.map((job): TimelineEntry => ({ type: "job", job })),
    ...decisions.map((decision): TimelineEntry => ({ type: "decision", decision })),
  ].sort((a, b) => {
    const atA = a.type === "job" ? a.job.decision.decidedAt : a.decision.decidedAt;
    const atB = b.type === "job" ? b.job.decision.decidedAt : b.decision.decidedAt;
    return atB.localeCompare(atA);
  });

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3 lg:hidden">
        <div>
          <h1 className="text-title text-fr-ink-900">Records</h1>
          <p className="text-sm text-fr-ink-600">Your farm history</p>
        </div>
        <AskAIButton context={{ screen: "Records", facts: { "Activity entries": String(entries.length) } }} />
      </div>
      <PageHeader title="Records" subtitle="Your farm history" />

      <ActivityTimelineCard
        entries={entries}
        // jobsUnavailable taints entries entirely (jobs=[] already, and
        // dedup for decisions is unsafe too — records/page.tsx already
        // forces decisionsUnavailable alongside it). A decisions-only
        // failure leaves the real, correct job entries intact — shown via
        // the softer `partiallyUnavailable` caveat instead.
        unavailable={jobsUnavailable}
        partiallyUnavailable={!jobsUnavailable && decisionsUnavailable}
        truncated={jobsTruncated || decisionsTruncated}
      />
    </>
  );
}
