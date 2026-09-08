"use client";

/**
 * Farm Return Next — Field Awareness / Satellite Field Intelligence
 * campaign. The one real farmer-facing surface for `FieldAwarenessSnapshot`
 * (`src/domain/field-awareness.ts`) — item 8 of the campaign brief
 * ("Field Detail experience"). Deliberately small: a short "what we
 * know" summary plus a one-line "what this means", never a technical
 * remote-sensing dashboard (item 21) — no raw bands, no unexplained
 * index numbers, no provider branding.
 *
 * Fetches once per `fieldId` via `getFieldAwarenessAction`
 * (`src/app/actions/field-awareness.ts`) — no polling, no re-fetch on
 * every render (item 19, performance). A `cancelled` guard avoids
 * setting state after unmount/field-change, the same pattern
 * `GpsActivityCandidateCard.tsx` already established for its own
 * effect-driven fetch.
 */
import { useEffect, useState } from "react";
import { Satellite } from "lucide-react";
import { Pill, ConfidenceBadge } from "@/components/ui/StatusBadge";
import { getFieldAwarenessAction } from "@/app/actions/field-awareness";
import { isOk } from "@/domain/evidence";
import type { FieldAwarenessAttention, FieldAwarenessSnapshot } from "@/domain/field-awareness";
import type { Field } from "@/domain/types";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IE", { day: "numeric", month: "short" });
}

/** Plain-language activity labels — reuses the same five real
 * `ActivityType` values `job-actual.ts` already validates, never a new
 * taxonomy. */
const ACTIVITY_LABEL: Record<string, string> = {
  fertiliser_spreading: "Fertiliser spreading",
  slurry_spreading: "Slurry spreading",
  silage: "Silage",
  field_inspection: "Field inspection",
  livestock_work: "Livestock work",
};

/**
 * "What this means" copy — attention is based entirely on monitoring
 * currency (see `field-awareness.ts`'s own header comment), never a
 * fabricated crop-condition judgement, so this copy only ever talks
 * about *checking in on the field*, never diagnoses anything.
 */
function whatThisMeans(attention: FieldAwarenessAttention): string {
  if (attention === "worth_checking") {
    return "We haven't had a clear satellite look at this field in a while — worth checking in when you're next passing.";
  }
  if (attention === "worth_watching") {
    return "Satellite coverage is getting a little dated for this field — nothing urgent, just worth keeping an eye on.";
  }
  return "No action is required at the moment.";
}

function observationSummary(snapshot: FieldAwarenessSnapshot): string {
  if (!snapshot.hasMappedBoundary) return "Field boundary is not mapped yet.";
  if (isOk(snapshot.coverage)) {
    return `${formatShortDate(snapshot.coverage.value.acquisitionTimestamp)} (${snapshot.observationAgeDays === 0 ? "today" : `${snapshot.observationAgeDays} day${snapshot.observationAgeDays === 1 ? "" : "s"} ago`})`;
  }
  return snapshot.warnings[0] ?? "No usable satellite observation available.";
}

export function FieldAwarenessCard({ field }: { field: Field }) {
  const [snapshot, setSnapshot] = useState<FieldAwarenessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Resets the loading/failed UI for a real, external trigger — a
    // different `field.id` (a new field selected) — not on every
    // render; the same sanctioned "synchronise from an external change"
    // use `fields/page.tsx`'s own URL-driven selection effect already
    // establishes.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting loading/failed for a real field.id change, not every render.
    setLoading(true);
    setFailed(false);
    getFieldAwarenessAction(field.id)
      .then((result) => {
        if (cancelled) return;
        setSnapshot(result);
        setLoading(false);
      })
      .catch((error) => {
        // Codex-style discipline (ExpandedPromptSheet.tsx's own pattern):
        // log the real error, show a stable, generic message — never a
        // raw server/database error to the farmer.
        console.error("[FieldAwarenessCard] getFieldAwarenessAction failed:", error);
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [field.id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-fr-control border border-fr-border bg-fr-surface-alt p-3 text-sm text-fr-ink-400">
        <Satellite className="size-4 shrink-0 animate-pulse" />
        Checking field awareness…
      </div>
    );
  }

  // `failed` (a real fetch error) and `snapshot === null` (no current
  // farm, or this field genuinely isn't this farm's — see the
  // orchestration layer's own doc comment on why those look identical)
  // both render nothing rather than a confusing or alarming message —
  // this section is additive, not load-bearing for the rest of the tab.
  if (failed || !snapshot) return null;

  return (
    <div className="flex flex-col gap-2 rounded-fr-control border border-fr-border bg-fr-surface-alt p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-label uppercase tracking-wide text-fr-ink-600">
          <Satellite className="size-3.5" />
          Field awareness
        </p>
        <ConfidenceBadge level={snapshot.confidence} />
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-fr-ink-600">Latest usable observation</span>
        <span className="ml-auto text-right font-medium text-fr-ink-900">{observationSummary(snapshot)}</span>
      </div>

      {snapshot.recentActivity.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-fr-ink-600">Recent confirmed activity</span>
          {snapshot.recentActivity.slice(0, 3).map((activity, i) => (
            <span key={i} className="font-medium text-fr-ink-900">
              {ACTIVITY_LABEL[activity.activityType] ?? activity.activityType} — {formatShortDate(activity.confirmedAt)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-1 flex items-start gap-2 border-t border-fr-border pt-2">
        {snapshot.attention !== "normal" ? <Pill tone="attention">Worth a look</Pill> : null}
        <p className="text-xs text-fr-ink-600">{whatThisMeans(snapshot.attention)}</p>
      </div>

      <p className="text-xs text-fr-ink-400/80">
        Based on Copernicus Sentinel-2 satellite coverage and your farm&apos;s own confirmed activity — a monitoring
        signal, not a crop-health measurement.
      </p>
    </div>
  );
}
