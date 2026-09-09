"use client";

import { CheckCircle2 } from "lucide-react";
import { Pill } from "@/components/ui/StatusBadge";
import { computeElapsedSeconds } from "@/domain/job-session-lifecycle";
import { buildJobSessionProvenance } from "@/domain/job-session-provenance";
import type { JobSessionWithActual } from "@/lib/farm-data/job-sessions";

/**
 * Records' real reader for a confirmed Job Session
 * (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
 * §18's "Resulting Record": "Show Confirmed Actual separately from
 * Estimated/Observed evidence. Preserve provenance."). Every value here
 * already comes from a real persisted `job_sessions`/`job_actuals` row;
 * nothing is computed here except the real, pure
 * `computeElapsedSeconds`/`buildJobSessionProvenance` calls, both already
 * audited domain functions.
 */
const ACTIVITY_LABELS: Record<string, string> = {
  fertiliser_spreading: "Fertiliser spreading",
  slurry_spreading: "Slurry spreading",
  silage: "Silage",
  field_inspection: "Field inspection",
  livestock_work: "Livestock work",
};

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}

/** Exported so `RecordsPageClient` can render one true
 * chronologically-merged timeline — the same pattern
 * `JobHistoryRow`/`DecisionRow` already establish. */
export function JobSessionRecordRow({ session }: { session: JobSessionWithActual }) {
  const activityLabel = ACTIVITY_LABELS[session.activityType] ?? session.activityType.replace(/_/g, " ");
  const elapsedSeconds = computeElapsedSeconds(session, session.updatedAt);
  const provenance = buildJobSessionProvenance({
    // Codex audit MEDIUM (round 47, completing this file's own round-1
    // finding, `docs/overnight/audits/gps-job-session-actual-contract-codex-audit-round1.md`
    // #6) then Codex audit HIGH (round 48, correcting round 47's own
    // fix as still insufficient): round 47 gated this on
    // `session.hasGpsTrace` too, matching its sibling field below — but
    // `hasGpsTrace` only proves a telemetry_events row exists *somewhere*
    // for this session, never that these specific values came from it.
    // `activeIntervals.startedAt`/`endedAt` are set by the pure
    // lifecycle state machine from whatever `nowIso`/`decidedAt` its
    // caller passed in (a server clock read at the moment Start/Pause/
    // Resume/Finish was invoked, online or the offline-queued
    // equivalent), and the displayed record date is `session.updatedAt`
    // — a database write timestamp. Neither is, or is bound to, a real
    // GPS-observed instant, regardless of whether unrelated telemetry
    // exists for the session. This app has no real, persisted
    // per-timestamp GPS provenance anywhere yet, so never claiming
    // "Phone GPS" for these two fields is the only honest option until
    // it does — always `false`, not a check against any session field.
    hasDeviceTimestamps: false,
    fieldGpsInferred: false,
    farmerConfirmed: session.actual !== undefined,
    hasPromptOrPlanOrigin: session.origin === "prompt" || session.origin === "plan",
    hasActualQuantity: typeof session.actual?.payload.quantity === "number",
    usesMappedFieldArea: session.actual?.completionType === "whole",
    hasWeatherContext: false,
    // Codex audit MEDIUM (round 1): a real telemetry_events check, not
    // activeIntervals.length > 0 (a plain lifecycle-timer fact true for
    // every started session regardless of whether GPS ever worked).
    hasGpsTrace: session.hasGpsTrace,
  });

  return (
    <li className="flex items-start gap-3 border-t border-fr-border py-3 first:border-t-0 first:pt-0">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-fr-good-bg">
        <CheckCircle2 className="size-4 text-fr-good" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-fr-ink-900">{activityLabel}</span>
          <Pill tone="good">Confirmed actual</Pill>
          {session.actual && session.actual.revision > 1 ? <Pill tone="info">Revised</Pill> : null}
        </div>
        {session.actual ? (
          <p className="mt-0.5 text-sm text-fr-ink-600">
            {session.actual.completionType === "whole"
              ? "Whole field"
              : session.actual.completionType === "partial"
                ? "Part of field"
                : "Did not happen"}
            {typeof session.actual.payload.quantity === "number" && typeof session.actual.payload.quantityUnit === "string"
              ? ` — ${session.actual.payload.quantity} ${session.actual.payload.quantityUnit}`
              : ""}
          </p>
        ) : null}
        {/* Codex audit HIGH (round 49): a "Confirmed actual" session's
            own real farmer-asserted `actual.confirmedAt` is the
            record's genuine activity date, not `session.updatedAt` —
            a database write timestamp that can genuinely differ from
            when the application was actually confirmed (a later
            revision, a delayed status-move retry, or any other write
            after the fact). `entryTimestamp` (`ActivityTimelineCard.tsx`)
            sorts/groups by the identical real value; falls back to
            `updatedAt` only if `actual` is ever somehow absent, matching
            that function's own defensive fallback. */}
        <p className="mt-0.5 text-xs text-fr-ink-400">
          {formatDate(session.actual?.confirmedAt ?? session.updatedAt)} · {formatElapsed(elapsedSeconds)}
        </p>
        {provenance.length > 0 ? (
          <p className="mt-0.5 text-xs text-fr-ink-400">
            {provenance.map((p) => p.description).join(" · ")}
          </p>
        ) : null}
      </div>
    </li>
  );
}
