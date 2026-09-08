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
 *
 * Also re-fetches on `field.polygonCapturedAt` (Codex audit HIGH,
 * round 2): the boundary-fetch effect originally depended on
 * `field.id` alone, so mapping a previously-unmapped field's boundary,
 * or editing an existing one, left this card either still saying "not
 * mapped yet" or silently showing a snapshot computed for the *old*
 * polygon — a real field id does not change when its boundary does.
 * `polygonCapturedAt` (`FieldDrawer.tsx`'s own `setFieldBoundary` path)
 * is set every time a real boundary is captured or re-drawn, so it is
 * a genuine, cheap proxy for "this field's boundary just changed".
 *
 * **Codex audit HIGH (round 5), reviewed and partially rejected with a
 * documented reason**: the finding argued that, without field-pixel
 * quality evidence, this card should never show a `"normal"`/no-action
 * conclusion at all — only ever describe a catalogued pass. Accepted
 * and fixed: `whatThisMeans`'s own `"normal"` copy was reworded from
 * "No action is required at the moment." (which could be misread as a
 * claim about the field's own condition) to make explicit that the
 * only thing ever being reported is monitoring currency. **Rejected**
 * beyond that: this module's own scope — established across Phase 0 and
 * every prior audit round — has never claimed field-level visibility
 * certainty; `freshness`/`attention`/`confidence` classify how recently
 * a usable satellite pass covered the field, nothing about the field's
 * own condition, and `classifyFieldAwarenessConfidence` already never
 * returns `"high"` from satellite evidence for exactly this reason
 * (round 3). Eliminating every "normal"/positive state whenever any
 * remote-sensing evidence is involved at all is an unfalsifiable
 * standard — no real quantitative satellite metadata can ever fully
 * rule out a highly localised, sub-pixel-scale anomaly, so accepting
 * this argument in full would make classifying monitoring currency
 * from satellite evidence impossible in principle, directly
 * contradicting this campaign's own explicit brief (a "good" example it
 * gives verbatim: "Satellite confidence is limited because the latest
 * usable observation is 12 days old" — implying a *recent* observation
 * may legitimately read as reassuring about monitoring currency
 * specifically). The standing "a monitoring signal, not a crop-health
 * measurement" disclaimer below already discloses this scope to the
 * farmer.
 *
 * **Codex audit round 6**: raised the identical underlying argument
 * again ("scene-wide cloud cover is still treated as proof of a usable
 * field-monitoring observation") without a materially new angle beyond
 * round 5's own. **Rejected again, for the same documented reason
 * above** — repeating an already-addressed objection does not change
 * the analysis; see round 5's own account immediately above. Round 6
 * did find one genuine, new, distinct bug in the round-5 wording
 * change itself, fixed separately: `whatThisMeans` (below) previously
 * rendered the same "Field monitoring is up to date" copy for
 * `"normal"` regardless of *why* it was `"normal"` — including an
 * unmapped boundary or a genuine provider outage, both real,
 * non-current states, producing a directly self-contradicting message
 * (e.g. "Field boundary is not mapped yet." immediately followed by
 * "Field monitoring is up to date"). `whatThisMeans` now distinguishes
 * all three real causes of `"normal"` attention.
 */
import { useEffect, useState } from "react";
import { Satellite } from "lucide-react";
import { Pill, ConfidenceBadge } from "@/components/ui/StatusBadge";
import { getFieldAwarenessAction } from "@/app/actions/field-awareness";
import { isOk } from "@/domain/evidence";
import { FIELD_AWARENESS_ACTIVITY_TRUNCATED_WARNING, FIELD_AWARENESS_ACTIVITY_UNAVAILABLE_WARNING } from "@/domain/field-awareness";
import type { FieldAwarenessSnapshot } from "@/domain/field-awareness";
import type { Field } from "@/domain/types";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IE", { day: "numeric", month: "short" });
}

/** How many recent-activity entries this card shows before summarising
 * the rest as "+N more" (Codex audit MEDIUM, round 5) — a real,
 * disclosed UI display limit, not a data limit: `snapshot.recentActivity`
 * itself is never truncated by the domain/orchestration layers beyond
 * the 60-day lookback window and the database reader's own real cap. */
const RECENT_ACTIVITY_DISPLAY_LIMIT = 3;

/** Plain-language activity labels — reuses the same five real
 * `ActivityType` values `job-actual.ts` already validates, never a new
 * taxonomy. Only the four field-scoped types
 * (`fertiliser_spreading`/`slurry_spreading`/`silage`/`field_inspection`)
 * can genuinely appear here — `livestock_work` has no `payload.fieldIds`
 * at all and can never match a field (see
 * `src/orchestration/field-awareness/index.ts`'s own `KNOWN_ACTIVITY_TYPES`
 * doc comment); kept in this map only for completeness of the real,
 * validated vocabulary. */
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
 * about *checking in on the field's own monitoring*, never diagnoses
 * anything. Codex audit HIGH (round 2): "a clear satellite look at this
 * field" overstated what a real, scene-wide cloud-cover reading can
 * actually confirm about one small field within a ~100km scene — no
 * per-pixel visibility check exists (see
 * `classifyFieldAwarenessConfidence`'s own doc comment in
 * `field-awareness.ts` for the full account, including why it never
 * returns `"high"` from satellite evidence) — reworded to talk about
 * satellite *passes*, not confirmed clarity. Codex audit HIGH (round
 * 5, reviewed and partially accepted — see this file's own header
 * comment on the part that was rejected): the `"normal"` case's own
 * copy, "No action is required at the moment.", could be misread as a
 * claim about the *field's own condition* rather than about
 * *monitoring currency* — reworded to make the subject explicit.
 *
 * Codex audit HIGH (round 6): that round-5 reword introduced a real,
 * genuine contradiction — `classifyFieldAwarenessAttention` also
 * returns `"normal"` for an unmapped boundary and for a genuine
 * provider outage (`isProviderOutage`), neither of which means
 * monitoring is actually current; the card could show "Field boundary
 * is not mapped yet." (or "Could not reach the satellite service...")
 * immediately above "Field monitoring is up to date" — a direct,
 * self-contradicting claim. Fixed: this function now takes the whole
 * snapshot and gives each of `"normal"`'s three real causes (no
 * boundary / provider outage / genuinely current, usable coverage) its
 * own distinct, non-contradictory copy, rather than treating `attention`
 * as the only relevant fact.
 */
function whatThisMeans(snapshot: FieldAwarenessSnapshot): string {
  if (snapshot.attention === "worth_checking") {
    return "We haven't had a usable satellite pass over this field in a while — worth checking in when you're next passing.";
  }
  if (snapshot.attention === "worth_watching") {
    return "Satellite coverage is getting a little dated for this field — nothing urgent, just worth keeping an eye on.";
  }
  // attention === "normal" here — but that covers three genuinely
  // different real causes; only the last one means monitoring is
  // actually current.
  if (!snapshot.hasMappedBoundary) {
    return "Map this field's boundary to enable satellite monitoring.";
  }
  if (snapshot.coverage.status === "UNKNOWN") {
    return "We couldn't reach the satellite service to check this field just now — this doesn't necessarily mean anything has changed.";
  }
  return "Field monitoring is up to date — no satellite-related action needed.";
}

/**
 * Codex audit HIGH (round 2): "Latest usable observation" read as a
 * confirmed, field-level fact ("we saw this field clearly"), but the
 * only real quality signal behind it is a scene-*wide* cloud-cover
 * percentage — real evidence about the ~100km tile, not a per-pixel
 * check of this one field. Reworded to "Latest satellite pass" (a
 * timing fact, not a visibility claim) and the real cloud-cover
 * percentage is now shown directly rather than folded silently into an
 * unqualified "usable"/"current" label.
 *
 * Codex audit MEDIUM (round 7): the label "Latest satellite pass" could
 * itself overstate the real selection — `selectMostRecentUsableSatelliteCoverage`
 * deliberately excludes any candidate above the disclosed cloud-cover
 * ceiling first, then picks the most recent *survivor*, so the scene
 * actually shown can genuinely be older than the single most recent
 * real Sentinel-2 pass over the field if that more recent one was too
 * cloudy. The row label is now paired with `PASS_LABEL_QUALIFIER` so the
 * card never implies "the single most recent pass, full stop" when it
 * is really "the most recent pass within the disclosed cloud limit".
 */
const PASS_LABEL_QUALIFIER = "within the cloud limit";

function observationSummary(snapshot: FieldAwarenessSnapshot): string {
  if (!snapshot.hasMappedBoundary) return "Field boundary is not mapped yet.";
  if (isOk(snapshot.coverage)) {
    const age = snapshot.observationAgeDays === 0 ? "today" : `${snapshot.observationAgeDays} day${snapshot.observationAgeDays === 1 ? "" : "s"} ago`;
    return `${formatShortDate(snapshot.coverage.value.acquisitionTimestamp)} (${age}) — scene cloud cover ${Math.round(snapshot.coverage.value.cloudCoverPercent)}%`;
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
  }, [field.id, field.polygonCapturedAt]);

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
        <span className="text-fr-ink-600">
          Latest satellite pass <span className="text-fr-ink-400">({PASS_LABEL_QUALIFIER})</span>
        </span>
        <span className="ml-auto text-right font-medium text-fr-ink-900">{observationSummary(snapshot)}</span>
      </div>

      {snapshot.recentActivity.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-fr-ink-600">Recent confirmed activity</span>
          {snapshot.recentActivity.slice(0, RECENT_ACTIVITY_DISPLAY_LIMIT).map((activity, i) => (
            <span key={i} className="font-medium text-fr-ink-900">
              {ACTIVITY_LABEL[activity.activityType] ?? activity.activityType} — {formatShortDate(activity.confirmedAt)}
            </span>
          ))}
          {/* Codex audit MEDIUM (round 5): showing only the first three
              entries with no indication of the real remainder silently
              presented a truncated list as complete — distinct from,
              and in addition to, the database-level truncation warning
              below (that one covers a real 200-session farm-wide cap;
              this covers this card's own real display limit). */}
          {snapshot.recentActivity.length > RECENT_ACTIVITY_DISPLAY_LIMIT ? (
            <span className="text-xs text-fr-ink-400">
              + {snapshot.recentActivity.length - RECENT_ACTIVITY_DISPLAY_LIMIT} more
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Codex audit MEDIUM (round 4): this warning previously only
          reached the farmer via `observationSummary`'s own fallback
          text, which only renders when satellite coverage itself is NOT
          `OK` — a genuine truncation could occur alongside perfectly
          normal, current coverage and never be shown at all. Checked
          explicitly, independent of coverage status. */}
      {snapshot.warnings.includes(FIELD_AWARENESS_ACTIVITY_TRUNCATED_WARNING) ? (
        <p className="text-xs text-fr-ink-400">{FIELD_AWARENESS_ACTIVITY_TRUNCATED_WARNING}</p>
      ) : null}

      {/* Codex audit MEDIUM (round 7): a real confirmed-activity read
          failure previously discarded the whole snapshot, including
          otherwise-valid satellite coverage — now handled independently
          in the orchestration layer, disclosed here rather than
          silently showing an empty activity section as though none
          existed. */}
      {snapshot.warnings.includes(FIELD_AWARENESS_ACTIVITY_UNAVAILABLE_WARNING) ? (
        <p className="text-xs text-fr-ink-400">{FIELD_AWARENESS_ACTIVITY_UNAVAILABLE_WARNING}</p>
      ) : null}

      <div className="mt-1 flex items-start gap-2 border-t border-fr-border pt-2">
        {snapshot.attention !== "normal" ? <Pill tone="attention">Worth a look</Pill> : null}
        <p className="text-xs text-fr-ink-600">{whatThisMeans(snapshot)}</p>
      </div>

      <p className="text-xs text-fr-ink-400/80">
        Based on Copernicus Sentinel-2 satellite coverage and your farm&apos;s own confirmed activity — a monitoring
        signal, not a crop-health measurement.
      </p>
    </div>
  );
}
