"use client";

import { Card } from "@/components/ui/Card";
import { FarmSectionHeading } from "@/components/next/FarmSectionHeading";
import { JobHistoryRow } from "@/components/farm/JobHistoryCard";
import { DecisionRow } from "@/components/next/DecisionHistoryCard";
import { JobSessionRecordRow } from "@/components/next/JobSessionRecordCard";
import type { JobWithDecision } from "@/lib/farm-data/jobs";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import type { JobSessionWithActual } from "@/lib/farm-data/job-sessions";

export type TimelineEntry =
  | { type: "job"; job: JobWithDecision }
  | { type: "decision"; decision: DecisionRecord }
  | { type: "job_session"; session: JobSessionWithActual };

/** The one real timestamp each entry type sorts/groups by — `job.updatedAt`/
 * `session.updatedAt` (when the job/session itself last changed state),
 * `decision.decidedAt` for a bare decision with no job. Exported so
 * `RecordsPageClient`'s own sort and this component's own date-grouping
 * both read the identical real value, never two independently-maintained
 * copies of the same switch (Codex audit MEDIUM, round 2, on why a job
 * entry specifically must not use its decision's `decidedAt` — see this
 * function's original inline home, `RecordsPageClient.tsx`, for the full
 * reasoning, preserved verbatim here). */
export function entryTimestamp(entry: TimelineEntry): string {
  return entry.type === "job" ? entry.job.updatedAt : entry.type === "job_session" ? entry.session.updatedAt : entry.decision.decidedAt;
}

/** Real, unambiguous local-date grouping identity ("YYYY-MM-DD") — used
 * for the actual grouping decision and as the React `key`, never the
 * human-readable label. Final audit (Codex, base a3df614): grouping/
 * keying by `dayLabel`'s own display text ("27 Aug") would silently
 * merge or duplicate-key entries from different years that happen to
 * share the same day-of-year. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Real calendar-day label for a group of entries sharing the same local
 * date — "Today"/"Yesterday" when genuinely true (compared against the
 * real wall clock, not assumed), otherwise a plain formatted date
 * (always including the year — the same final-audit finding above:
 * an undated "27 Aug" is ambiguous for a farm history that can span
 * multiple years). Never a fabricated bucket — every entry still keeps
 * its own exact timestamp on its own row (`JobHistoryRow`/`DecisionRow`/
 * `JobSessionRecordRow`, unchanged by this grouping). */
function dayLabel(iso: string, now: Date): string {
  const entryDate = new Date(iso);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(entryDate)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return entryDate.toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}

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
 *
 * Visual Alignment Phase V4 (2026-09-03): grouped by real calendar day
 * (`dayLabel`, spec §9's "strong date/activity hierarchy" requirement,
 * media/image1.png's own Records panel real "TODAY — 29 AUG 2025"/
 * "YESTERDAY — 28 AUG 2025" section labels), one continuous flow with
 * `FarmSectionHeading` day dividers instead of everything inside one
 * large enclosing Card — same pattern Plan's own rebuild already
 * established. Each row's own real date/time is unchanged (still
 * rendered by the row components themselves, shared with `/reports`'s
 * `JobHistoryCard` — not touched here) — grouping is purely additional
 * organisation, never a replacement for a row's own real timestamp.
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
  // Codex audit round 1 (Strict Visual Reproduction, Records): the empty
  // state was "disproportionately tall and visually dominant compared
  // with the reference's compact activity surfaces" and its text "low-
  // contrast... wraps into a broad two-line block" — tighter padding and
  // a narrower measure read as a lightweight placeholder, not a large
  // empty panel; slightly darker ink keeps it legible while still
  // secondary.
  if (unavailable) {
    return (
      <Card className="py-4">
        <p className="mx-auto max-w-[220px] py-2 text-center text-sm text-fr-ink-600">
          Your activity history is temporarily unavailable — try again shortly.
        </p>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card className="py-4">
        <p className="mx-auto max-w-[220px] py-2 text-center text-sm text-fr-ink-600">
          No activity yet — completed jobs and recorded decisions will appear here.
        </p>
      </Card>
    );
  }

  // Real grouping, not a fabricated bucket: entries already arrive sorted
  // (most-recent-first, `RecordsPageClient`), so a run of consecutive
  // entries sharing the same real calendar day forms one real group.
  const now = new Date();
  const groups: { key: string; label: string; items: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    const timestamp = entryTimestamp(entry);
    const key = dayKey(timestamp);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.key === key) {
      lastGroup.items.push(entry);
    } else {
      groups.push({ key, label: dayLabel(timestamp, now), items: [entry] });
    }
  }

  return (
    <>
      {/* One real, continuous surface (matching Plan's own single
          grouping-Card pattern) rather than one bordered box per day —
          date hierarchy comes from `FarmSectionHeading` dividers inside
          it, not from splitting history into N separate day-cards. */}
      <Card className="flex flex-col gap-5 p-5">
        {groups.map((group) => (
          <section key={group.key}>
            <FarmSectionHeading>{group.label}</FarmSectionHeading>
            <ul>
              {group.items.map((entry) =>
                entry.type === "job" ? (
                  <JobHistoryRow key={`job-${entry.job.id}`} job={entry.job} />
                ) : entry.type === "job_session" ? (
                  <JobSessionRecordRow key={`job-session-${entry.session.id}`} session={entry.session} />
                ) : (
                  <DecisionRow key={`decision-${entry.decision.id}`} decision={entry.decision} />
                ),
              )}
            </ul>
          </section>
        ))}
      </Card>
      {truncated ? (
        <p className="mt-4 text-center text-xs text-fr-ink-400">
          Showing the most recent {entries.length} — older history exists but isn&apos;t shown here yet.
        </p>
      ) : null}
      {partiallyUnavailable ? (
        <p className="mt-3 text-center text-xs text-fr-attention">
          Part of your history is temporarily unavailable — some entries may be missing.
        </p>
      ) : null}
    </>
  );
}
