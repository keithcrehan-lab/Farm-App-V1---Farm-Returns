"use client";

import { CheckCircle2, ClipboardList, Scale, XCircle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Pill } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/lib/status";
import type { JobWithDecision } from "@/lib/farm-data/jobs";
import { EVIDENCE_STATE_UI_LABEL } from "@/domain/evidence";

/**
 * Farm Return Next Checkpoint 2, Vertical D — the first real screen
 * surface reading `decisions`/`jobs` (`BUILD_PLAN.md`'s build-priority
 * #1, product-owner decision 2026-09-01). Presentational only — real data
 * comes from `listJobsWithDecisionsForFarm`
 * (`src/lib/farm-data/jobs.ts`), fetched server-side by whichever page
 * renders this (`src/app/(app)/reports/page.tsx`).
 *
 * Extends V1's existing Records surface (`UX_DESIGN.md`: "Records — V1's
 * Reports screen, extended with the new job/Confirm/Actual history"),
 * built against the existing approved visual system per the product
 * owner's own explicit instruction — no new design reference needed for
 * this card (unlike Today/GPS job mode, still pending one).
 *
 * `job_type` is a plain, ever-growing string (`jobs.ts`'s own doc
 * comment) — this card names copy for the one real type this app
 * produces today (`record_weight_observation`) and falls back to an
 * honest, generic rendering (the raw `job_type` string, no invented
 * detail) for any other value, rather than assuming a shape it hasn't
 * seen.
 *
 * The displayed summary line comes from `job.weightObservation` (the
 * real, recorded Actual `jobs.ts` now embeds), never from
 * `decision.edits` (Codex audit HIGH, `docs/farm-return-next/audit-logs/
 * 20260901T094442Z.md` — an earlier version showed `edits` as if it were
 * the recorded fact; `edits` is the farmer's decided-time input
 * snapshot, which only matches the real Actual because today's one
 * write path verifies them equal at write time, not because they are
 * guaranteed to stay equal — see `listJobsWithDecisionsForFarm`'s own
 * doc comment for the full reasoning). `weightObservation` is `undefined`
 * for any job whose type doesn't produce one, or (defensively) if the
 * embed ever comes back missing for one that should — every field this
 * card reads from it is still type-checked before display, not assumed.
 */

function humanizeJobType(jobType: string): string {
  if (jobType === "record_weight_observation") return "Weight recorded";
  // Unknown job type — this app's own convention (jobs.ts's header
  // comment) is that the set of real job types only ever grows; a
  // generic, honest fallback here means a future job type renders
  // sensibly without this card needing to change first.
  return jobType.replace(/_/g, " ");
}

function outcomeTone(outcome: JobWithDecision["decision"]["outcome"]): StatusTone {
  switch (outcome) {
    case "accepted":
      return "good";
    case "edited":
      return "info";
    case "dismissed":
      return "neutral";
  }
}

function outcomeLabel(outcome: JobWithDecision["decision"]["outcome"]): string {
  switch (outcome) {
    case "accepted":
      return "Accepted";
    case "edited":
      return "Edited";
    case "dismissed":
      return "Dismissed";
  }
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

/** Real summary line for the recorded Actual — the real `WeightObservation`
 * row `jobs.ts` embeds, never `decision.edits` (see this file's own
 * header comment). `WeightObservation`'s fields are compile-time typed
 * (unlike `edits`), so no defensive runtime check is needed for its
 * shape — only for whether it's present at all.
 *
 * Includes the animal id and the observation's own `source` (Codex
 * audit HIGH, `docs/farm-return-next/audit-logs/20260901T095654Z.md`:
 * an earlier version showed only weight and date, so two different
 * animals weighed the same on the same day were indistinguishable, and
 * the figure carried no inspectable provenance — `SCIENTIFIC_RULES.md`'s
 * "which evidence" requirement, restated for this real Actual). The raw
 * animal id, not a friendly tag/name, is deliberate: resolving it to a
 * farmer-facing label would need a fourth embedded table
 * (`livestock_individuals`) this checkpoint's own scope didn't extend
 * to — the raw id is still real and inspectable (a farmer or support
 * engineer can cross-reference it against Livestock), which is what this
 * requirement actually asks for, not friendliness. */
function weightObservationSummary(observation: JobWithDecision["weightObservation"]): string | undefined {
  if (!observation) return undefined;
  return `${observation.weightKg} kg — animal ${observation.animalId}, recorded ${formatDate(observation.observedDate)} (${observation.source})`;
}

/** Exported (Farm Return Next v1.1, Codex audit MEDIUM round 1 fix) so
 * `RecordsPageClient` can render one true chronologically-merged timeline
 * across jobs and decisions, reusing this exact row rendering rather than
 * duplicating it (`CLAUDE.md`'s reuse rule) — see
 * `docs/overnight/OVERNIGHT_BUILD_LOG.md` for the full account of why a
 * single merged list replaced two separately-stacked cards. */
export function JobHistoryRow({ job }: { job: JobWithDecision }) {
  const isWeightObservation = job.jobType === "record_weight_observation";
  const summary = isWeightObservation ? weightObservationSummary(job.weightObservation) : undefined;
  // Phase D (Evidence Ledger/provenance UX, 2026-09-03): the authorising
  // decision's own real evidence tier, embedded here since `job.decision`
  // (join, `jobs.ts`) is a full `DecisionRecord` — the identical gap and
  // identical fix `DecisionHistoryCard.tsx`'s own `DecisionRow` just
  // closed, applied here since a Job's own history view has the same
  // "why did I confirm this" question and the same already-persisted
  // answer. Never fabricated: only rendered when the decision's own
  // `estimateSnapshot` genuinely is the `"OK"` branch that carries one.
  const evidenceState = job.decision.estimateSnapshot.status === "OK" ? job.decision.estimateSnapshot.evidenceState : undefined;

  return (
    <li className="flex items-start gap-3 border-t border-fr-border py-3 first:border-t-0 first:pt-0">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-fr-surface-alt">
        {isWeightObservation ? (
          <Scale className="size-4 text-fr-ink-600" />
        ) : (
          <ClipboardList className="size-4 text-fr-ink-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-fr-ink-900">{humanizeJobType(job.jobType)}</span>
          <Pill tone={outcomeTone(job.decision.outcome)}>{outcomeLabel(job.decision.outcome)}</Pill>
          {evidenceState ? <Pill tone="good">{EVIDENCE_STATE_UI_LABEL[evidenceState]}</Pill> : null}
        </div>
        {summary ? <p className="mt-0.5 text-sm text-fr-ink-600">{summary}</p> : null}
        {job.decision.calculationVersion ? (
          <p className="mt-0.5 text-xs text-fr-ink-400">Calculation version: {job.decision.calculationVersion}</p>
        ) : null}
        {/* Codex audit MEDIUM (round 3, docs/overnight/audits/
            phase-1-visual-nav-today-plan-records-codex-audit-round3.md):
            this row now displays the same real timestamp
            (`job.updatedAt`) `RecordsPageClient`'s merged timeline sorts
            it by, not the authorising decision's `decidedAt` — for
            today's one real, synchronous job type the two coincide, but
            a displayed date that could disagree with the row's own
            sorted position (a job completed well after its decision)
            would be a real, farmer-visible inconsistency. */}
        <p className="mt-0.5 text-xs text-fr-ink-400">{formatDate(job.updatedAt)}</p>
      </div>
      <div className="mt-0.5 shrink-0">
        {job.status === "confirmed" ? (
          <CheckCircle2 className="size-4 text-fr-good" aria-label="Confirmed" />
        ) : job.status === "dismissed" ? (
          <XCircle className="size-4 text-fr-ink-400" aria-label="Dismissed" />
        ) : null}
      </div>
    </li>
  );
}

/**
 * `unavailable` (Codex audit MEDIUM, `docs/farm-return-next/audit-logs/
 * 20260901T094442Z.md`): the server-side fetch
 * (`src/app/(app)/reports/page.tsx`) distinguishes the one *expected*
 * empty case (the migrations genuinely not applied yet, or a real farm
 * with genuinely no job history) from a real, unexpected fetch failure
 * (an auth problem, an RLS regression, a transient outage) — this card
 * must not present the second case as if it were the first. A real,
 * distinct "temporarily unavailable" message, not a fabricated "no
 * history" one.
 *
 * `truncated` (Codex audit MEDIUM, `docs/farm-return-next/audit-logs/
 * 20260901T095654Z.md`): `listJobsWithDecisionsForFarm`'s own real cap
 * (`MAX_JOB_HISTORY_ROWS`) must be disclosed, not silently applied — a
 * farmer with more history than the cap must not read this list as
 * complete.
 */
export function JobHistoryCard({
  jobs,
  unavailable = false,
  truncated = false,
}: {
  jobs: JobWithDecision[];
  unavailable?: boolean;
  truncated?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Job history</CardTitle>
      </CardHeader>
      {unavailable ? (
        <p className="py-6 text-center text-sm text-fr-ink-400">
          Job history is temporarily unavailable — try again shortly.
        </p>
      ) : jobs.length === 0 ? (
        <p className="py-6 text-center text-sm text-fr-ink-400">
          No job history yet — completed jobs and their evidence will appear here.
        </p>
      ) : (
        <>
          <ul>
            {jobs.map((job) => (
              <JobHistoryRow key={job.id} job={job} />
            ))}
          </ul>
          {truncated ? (
            <p className="mt-3 text-center text-xs text-fr-ink-400">
              Showing the most recent {jobs.length} jobs — older history exists but isn&apos;t shown here yet.
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
