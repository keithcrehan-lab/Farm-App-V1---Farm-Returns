"use client";

import { PageHeader } from "@/components/shell/PageHeader";
import { AskAIButton } from "@/components/next/AskAI";
import { JobHistoryCard } from "@/components/farm/JobHistoryCard";
import { DecisionHistoryCard } from "@/components/next/DecisionHistoryCard";
import type { JobWithDecision } from "@/lib/farm-data/jobs";
import type { DecisionRecord } from "@/lib/farm-data/mappers";

/**
 * Records — Farm Return Next v1.1, canonical screen #6 (§4/§9): "Default
 * view is a chronological activity timeline... provenance/status."
 *
 * Reuses `JobHistoryCard` unchanged (Vertical D's already-shipped,
 * already-audited real Job+Decision history) and adds `DecisionHistoryCard`
 * alongside it for the real decisions that have no job attached yet — see
 * `records/page.tsx`'s own comment for exactly how the two are kept from
 * double-showing the same decision. `/reports` is untouched and keeps its
 * own copy of `JobHistoryCard` plus the CSV/audit-trail tools this screen
 * doesn't need — CLAUDE.md's "never remove an approved screen element".
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
  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3 lg:hidden">
        <div>
          <h1 className="text-title text-fr-ink-900">Records</h1>
          <p className="text-sm text-fr-ink-600">Your farm history</p>
        </div>
        <AskAIButton context={{ screen: "Records", facts: { "Job records": String(jobs.length), "Decision records": String(decisions.length) } }} />
      </div>
      <PageHeader title="Records" subtitle="Your farm history" />

      <div className="flex flex-col gap-4">
        <JobHistoryCard jobs={jobs} unavailable={jobsUnavailable} truncated={jobsTruncated} />
        <DecisionHistoryCard decisions={decisions} unavailable={decisionsUnavailable} truncated={decisionsTruncated} />
      </div>
    </>
  );
}
