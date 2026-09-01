"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { JobHistoryRow } from "@/components/farm/JobHistoryCard";
import { DecisionRow } from "@/components/next/DecisionHistoryCard";
import type { JobWithDecision } from "@/lib/farm-data/jobs";
import type { DecisionRecord } from "@/lib/farm-data/mappers";

export type TimelineEntry =
  | { type: "job"; job: JobWithDecision }
  | { type: "decision"; decision: DecisionRecord };

/**
 * Records — Farm Return Next v1.1, canonical screen #6 (§9): "Default
 * view is a chronological activity timeline, not a spreadsheet
 * register."
 *
 * Codex audit MEDIUM (round 1, `docs/overnight/audits/
 * phase-1-visual-nav-today-plan-records-codex-audit.md`): the first
 * version of Records rendered jobs and decisions as two separately-
 * stacked cards, each internally ordered but never merged — a reader
 * scanning top-to-bottom did not see true chronological order across
 * both, which the spec's own "chronological activity timeline" language
 * (singular) means. This component takes one already-merged,
 * already-sorted `entries` array (`RecordsPageClient` builds and sorts
 * it by real `decidedAt`) and renders it as one real list — reusing
 * `JobHistoryRow`/`DecisionRow` exactly as they already are (`CLAUDE.md`'s
 * reuse rule), not a re-implementation of either.
 */
export function ActivityTimelineCard({
  entries,
  unavailable = false,
  truncated = false,
  partiallyUnavailable = false,
}: {
  entries: TimelineEntry[];
  /** Blanks the whole card — reserved for when even the entries this
   * component *does* have can't be trusted (`records/page.tsx`: the jobs
   * fetch itself failed, which also makes any decision dedup unsafe). */
  unavailable?: boolean;
  truncated?: boolean;
  /** A real fetch failure that does *not* taint `entries` itself (e.g.
   * only the decisions side failed while jobs are fine) — shown as a
   * small inline caveat rather than hiding real, correct data behind a
   * blanket "unavailable" state. */
  partiallyUnavailable?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      {unavailable ? (
        <p className="py-6 text-center text-sm text-fr-ink-400">
          Your activity history is temporarily unavailable — try again shortly.
        </p>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-fr-ink-400">
          No activity yet — completed jobs and recorded decisions will appear here.
        </p>
      ) : (
        <>
          <ul>
            {entries.map((entry) =>
              entry.type === "job" ? (
                <JobHistoryRow key={`job-${entry.job.id}`} job={entry.job} />
              ) : (
                <DecisionRow key={`decision-${entry.decision.id}`} decision={entry.decision} />
              ),
            )}
          </ul>
          {truncated ? (
            <p className="mt-3 text-center text-xs text-fr-ink-400">
              Showing the most recent {entries.length} — older history exists but isn&apos;t shown here yet.
            </p>
          ) : null}
        </>
      )}
      {partiallyUnavailable ? (
        <p className="mt-3 text-center text-xs text-fr-attention">
          Part of your history is temporarily unavailable — some entries may be missing.
        </p>
      ) : null}
    </Card>
  );
}
