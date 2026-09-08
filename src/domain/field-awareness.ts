/**
 * Farm Return Next — Farm Awareness / Satellite Field Intelligence
 * campaign. A single, coherent, farm-scoped "what does Farm Return
 * currently know about this field" read model — `FieldAwarenessSnapshot`
 * — combining real satellite coverage evidence
 * (`satellite-field-coverage.ts`'s `SatelliteFieldCoverage` type,
 * reused directly — that module gained a purely additive new export,
 * `selectMostRecentUsableSatelliteCoverage`, in this campaign's own
 * Codex audit rounds 1/4, but its pre-existing `selectBestSatelliteCoverage`
 * export is unmodified) with real, already-confirmed farm activity for
 * the same field.
 *
 * **Naming note**: this campaign's own brief uses "Farm Awareness" to
 * describe satellite/field intelligence — but that exact term already
 * means something else, real and shipped, in this codebase: the GPS Job
 * Mode campaign's low-power background location mode
 * (`LocationTrackingProvider.startFarmAwareness`,
 * `src/lib/location/location-tracking-provider.ts`). To avoid a genuine
 * naming collision with an existing, unrelated, already-audited
 * contract, this module and everything built on it uses "Field
 * Awareness" — the brief's own alternative term (`FieldAwarenessSnapshot`,
 * section 1) — exclusively. See
 * `docs/farm-return-next/FIELD_AWARENESS_ARCHITECTURE.md` for the full
 * Phase 0 account of this and every other inspection finding.
 *
 * **The decisive Phase 0 finding shaping this whole module**: there is
 * no real, field-specific vegetation signal available today, at all.
 * `satellite-field-coverage.ts`'s own header comment and
 * `docs/farm-return-next/BLOCKERS.md` already establish this: real NDVI/
 * vegetation-index computation requires downloading and processing a
 * Sentinel-2 scene's raw spectral bands, which requires CDSE `oidc`/`s3`
 * credentials this build cannot obtain (a hard policy prohibition on
 * creating an account, not a technical or network limitation — already
 * decided, not reopened here). `vegetationPixelPercent` on
 * `SatelliteFieldCoverage` is CDSE's own real, provider-computed
 * scene-*wide* pixel-classification statistic — evidence about the
 * whole ~100km-tile scene, not this field, and never a biomass/growth
 * figure. This module therefore never computes, and never surfaces, a
 * vegetation trend, a biomass estimate, or an attention state based on
 * "the crop looks different" — there is no real signal for any of that.
 *
 * **What this module honestly can, and does, provide**: real evidence
 * about *monitoring currency* (how recently, and how cleanly, a real
 * satellite pass covered this field) and real, already-confirmed farm
 * activity for the same field (from the existing GPS Job Session +
 * Confirm Actual contract) — genuinely useful "what do we know, and
 * when did we last see this field" context, honestly labelled as
 * exactly that, never oversold as crop-health intelligence.
 */

import { isOk, type EngineOutcome } from "./evidence";
import type { SatelliteFieldCoverage } from "./satellite-field-coverage";
import type { ActivityType, CompletionType } from "./job-actual";

export const FIELD_AWARENESS_VERSION = "field_awareness_v1.0.0";

/**
 * Real, engineering/product-chosen thresholds — NOT a scientific or
 * regulatory figure. Disclosed in `docs/evidence-register.md`'s "Modules
 * with no external source" section, per this campaign's own item 24.
 * Chosen relative to Sentinel-2's own real ~2-3 day revisit cadence over
 * Ireland (`satellite-field-coverage.ts`'s own `DEFAULT_LOOKBACK_DAYS`
 * comment) and to Irish weather's own real tendency toward multi-day
 * cloud runs: `current` comfortably covers "we saw this within roughly
 * one revisit cycle"; `recent` tolerates a single missed pass;
 * `ageing`/`stale` name a genuine, growing monitoring gap, not a crop
 * condition. A future tuning pass changes only these two numbers.
 */
export const FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS = {
  currentMaxDays: 3,
  recentMaxDays: 7,
  ageingMaxDays: 14,
} as const;

/**
 * Wider than `satellite-field-coverage.ts`'s own conservative
 * `DEFAULT_LOOKBACK_DAYS` (10) default — a Field Awareness snapshot
 * wants to know *how* stale an old observation is (to genuinely
 * distinguish "ageing" from "stale" from "no coverage at all"), not
 * just whether one exists within a narrow window. Passed explicitly as
 * `selectMostRecentUsableSatelliteCoverage`'s own `lookbackDays` option
 * (round 1 switched the orchestration layer to that function — see
 * `FIELD_AWARENESS_MAX_USABLE_CLOUD_COVER_PERCENT`'s own doc comment)
 * — `satellite-field-coverage.ts`'s own default lookback is unchanged
 * for any other caller of either function.
 */
export const FIELD_AWARENESS_SATELLITE_LOOKBACK_DAYS = 30;

/**
 * A real, disclosed usability ceiling — NOT a scientific or regulatory
 * figure (see `docs/evidence-register.md`'s "Modules with no external
 * source" entry). Codex audit HIGH (round 1, Farm Awareness / Satellite
 * Field Intelligence campaign): the first version of this module had no
 * ceiling at all — the orchestration layer called
 * `selectBestSatelliteCoverage`, which always returns the least-cloudy
 * candidate in the window *however cloudy that candidate actually is*,
 * and this module then happily classified a 100%-cloud-obscured scene
 * as "current"/"high confidence". A scene above this ceiling is never
 * usable evidence, however recent — see
 * `satellite-field-coverage.ts`'s own `selectMostRecentUsableSatelliteCoverage`,
 * which the orchestration layer now calls instead. 40% is a real,
 * disclosed engineering judgement (a scene materially more than a third
 * cloud-obscured is unlikely to give a genuinely representative look at
 * a single field within it), not a Teagasc/S.I./Met Éireann figure.
 */
export const FIELD_AWARENESS_MAX_USABLE_CLOUD_COVER_PERCENT = 40;

/**
 * How far back a confirmed activity must have happened to still count
 * as "recent" for this snapshot — Codex audit MEDIUM (round 2): the
 * first version had no age window at all, so a confirmed Actual from
 * a year ago could still appear under a section literally titled
 * "Recent confirmed activity". A real, disclosed product judgement
 * (comfortably covers this campaign's own item-12 "did a recorded
 * event explain a recent change" use case), not a scientific figure.
 */
export const FIELD_AWARENESS_ACTIVITY_LOOKBACK_DAYS = 60;

/**
 * Exported (not just pushed inline) so `FieldAwarenessCard.tsx` can
 * detect this specific warning by identity rather than duplicating the
 * string — Codex audit MEDIUM (round 4): the first version pushed this
 * warning into `warnings[]` but the UI only ever read `warnings[0]`,
 * and only when satellite coverage itself was not `OK` — a genuine
 * truncation could occur alongside perfectly normal, current coverage
 * and never reach the farmer at all.
 */
export const FIELD_AWARENESS_ACTIVITY_TRUNCATED_WARNING =
  "Some older confirmed activity may not be shown — your farm has a large number of confirmed jobs.";

/**
 * Codex audit MEDIUM (round 7): the orchestration layer's own confirmed
 * -activity read is a real, separate database query from the satellite
 * search, and a genuine failure there (network/DB error) previously
 * discarded otherwise-valid, already-resolved satellite coverage
 * entirely (the two were coupled through a single `Promise.all`).
 * Now handled independently: a real activity-read failure still lets a
 * genuine satellite result reach the farmer, with this distinct,
 * honest warning rather than silently showing an empty activity
 * section as though none existed.
 */
export const FIELD_AWARENESS_ACTIVITY_UNAVAILABLE_WARNING = "Could not check recent farm activity for this field just now.";

export type FieldAwarenessFreshness = "current" | "recent" | "ageing" | "stale" | "unavailable";

/**
 * A real, honest "does this field's own monitoring need attention"
 * signal — based entirely on *how recently a usable satellite pass has
 * covered this field*, never on a fabricated crop-condition judgement
 * (see this module's own header comment for why no such judgement is
 * possible today). `"worth_checking"` here means "we haven't had a
 * usable satellite pass over this field in a while", not "something is
 * wrong with the crop" — and never "the field looked clear", which no
 * scene-wide metadata can actually confirm (see
 * `classifyFieldAwarenessConfidence`'s own doc comment).
 */
export type FieldAwarenessAttention = "normal" | "worth_watching" | "worth_checking";

/**
 * A real, disclosed product-judgement confidence label — reuses
 * `freshness` directly rather than inventing a second, competing
 * measure of "how sure are we" (see `docs/evidence-register.md`'s
 * "Modules with no external source" entry for this module). This is
 * NOT `EvidenceState` (`evidence.ts`) — that classifies the *kind* of
 * evidence a value rests on (measured/derived/modelled/defaulted); this
 * classifies how much a farmer should trust *this specific snapshot*
 * given how recently it was actually observed. `"high"`/`"medium"`/
 * `"low"` matches `ConfidenceBadge`'s (`StatusBadge.tsx`) existing UI
 * contract — no new confidence vocabulary introduced. The type still
 * permits `"high"` (a future, genuinely different evidence source —
 * e.g. a farmer's own ground-truth confirmation — could earn it), but
 * `classifyFieldAwarenessConfidence` itself never produces it from
 * satellite evidence alone; see that function's own doc comment.
 */
export type FieldAwarenessConfidence = "high" | "medium" | "low";

/**
 * Codex audit HIGH (round 2, then round 3 more sharply): a real,
 * disclosed `cloudCoverPercent`-based degradation was tried between
 * these two rounds — capping confidence at `"medium"` above a second,
 * lower cloud threshold — but round 3 correctly rejected that as still
 * insufficient: `cloudCoverPercent` is real STAC `eo:cloud_cover`, a
 * *scene-wide* statistic over the whole ~100km Sentinel-2 tile, never a
 * field-specific measurement. No cloud-cover *value*, however low, can
 * establish that this one small field within the scene was actually
 * visible — a 0%-cloud scene could still, in principle, have had a
 * highly localised obstruction (fog, smoke, a sensor artefact) over
 * this exact field that scene-wide statistics cannot see, and a
 * genuinely field-level visibility check would need the same per-pixel
 * band access NDVI computation requires, which is blocked for the same
 * disclosed reason (`docs/farm-return-next/BLOCKERS.md`). Tuning the
 * threshold further cannot close this gap — it is inferential, not a
 * calibration problem. This function therefore never returns `"high"`
 * — `"medium"` is now the honest ceiling for any confidence built on
 * scene-wide satellite metadata alone, whatever the freshness or cloud
 * reading. The real cloud-cover percentage remains directly disclosed
 * in the UI (`FieldAwarenessCard.tsx`) so a farmer/reviewer can weigh it
 * themselves, rather than being lossily folded into a confidence tier
 * that cannot actually speak to field-level visibility.
 */
export function classifyFieldAwarenessConfidence(freshness: FieldAwarenessFreshness): FieldAwarenessConfidence {
  if (freshness === "stale" || freshness === "unavailable") return "low";
  return "medium"; // current/recent/ageing — never "high" from satellite evidence alone.
}

export interface FieldAwarenessRecentActivity {
  /** Included so `buildFieldAwarenessSnapshot` can defensively re-verify
   * every activity entry actually belongs to the field it's assembling
   * a snapshot for, rather than trusting a caller's own pre-filtering —
   * the same defence-in-depth discipline `buildFarmContext`
   * (`src/orchestration/ai-context/index.ts`, Checkpoint 1.5) already
   * established. */
  fieldId: string;
  activityType: ActivityType;
  completionType: CompletionType;
  /** When the farmer confirmed this Actual (ISO datetime) — the same
   * real timestamp `job_actuals.confirmed_at` already carries. */
  confirmedAt: string;
}

export interface FieldAwarenessSnapshot {
  fieldId: string;
  farmId: string;
  /** When this snapshot was assembled (ISO datetime). */
  generatedAt: string;
  /** False when the field has no mapped boundary at all — satellite
   * coverage can never be checked without one (`Field.polygon` is
   * optional; a newly-created field genuinely has none yet). */
  hasMappedBoundary: boolean;
  /** Reuses `satellite-field-coverage.ts`'s own `EngineOutcome` directly
   * — no parallel result envelope. `status: "OK"` carries the real
   * scene evidence; every other branch is a real, honest "why not". */
  coverage: EngineOutcome<SatelliteFieldCoverage>;
  freshness: FieldAwarenessFreshness;
  /** Whole days since the coverage's own real acquisition timestamp —
   * absent exactly when `freshness === "unavailable"`. */
  observationAgeDays?: number;
  /** See `classifyFieldAwarenessConfidence`'s own doc comment — derived
   * from `freshness`, never a second independent judgement call. */
  confidence: FieldAwarenessConfidence;
  attention: FieldAwarenessAttention;
  /** Real, already-confirmed farm activity for this field, most recent
   * first — never a fabricated per-field feed (see
   * `FieldDrawer.tsx`'s own header comment on why building one had
   * previously been deferred; this module is the "materially larger
   * data-layer change" that comment named, built server-side, not
   * retrofitted onto the client farm-store). */
  recentActivity: FieldAwarenessRecentActivity[];
  /** Plain-language reasons a farmer/reviewer should see — e.g. "no
   * usable satellite observation in the last 30 days", never silently
   * dropped. */
  warnings: string[];
}

export function classifyFieldAwarenessFreshness(observationAgeDays: number | undefined): FieldAwarenessFreshness {
  if (observationAgeDays === undefined) return "unavailable";
  if (observationAgeDays <= FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS.currentMaxDays) return "current";
  if (observationAgeDays <= FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS.recentMaxDays) return "recent";
  if (observationAgeDays <= FIELD_AWARENESS_FRESHNESS_THRESHOLDS_DAYS.ageingMaxDays) return "ageing";
  return "stale";
}

/**
 * `hasMappedBoundary === false` is deliberately `"normal"`, never
 * `"worth_checking"` — a field with no boundary yet has nothing to
 * monitor, which is a real, separate "map this field" prompt this
 * module does not invent (the existing Fields screen already owns
 * that), not a Field Awareness attention concern.
 *
 * `isProviderOutage` (Codex audit MEDIUM, round 2): a genuine CDSE
 * provider outage/timeout (`EngineOutcome`'s `UNKNOWN` status) and a
 * confirmed 30-day absence of usable coverage
 * (`BLOCKED_INSUFFICIENT_EVIDENCE`) both produce `freshness ===
 * "unavailable"`, but they are not the same fact: the first tells a
 * farmer nothing about this field at all (Farm Return simply couldn't
 * reach the satellite service just now — try again shortly, no reason
 * to believe monitoring has genuinely lapsed), while the second is a
 * real, disclosed monitoring gap worth surfacing. Only the second
 * raises attention; a transient outage stays `"normal"` rather than
 * manufacturing field-directed advice out of a request failure.
 */
export function classifyFieldAwarenessAttention(
  hasMappedBoundary: boolean,
  freshness: FieldAwarenessFreshness,
  isProviderOutage = false,
): FieldAwarenessAttention {
  if (!hasMappedBoundary) return "normal";
  if (freshness === "unavailable" && isProviderOutage) return "normal";
  if (freshness === "stale" || freshness === "unavailable") return "worth_checking";
  if (freshness === "ageing") return "worth_watching";
  return "normal";
}

export interface FieldAwarenessInputs {
  fieldId: string;
  farmId: string;
  hasMappedBoundary: boolean;
  coverage: EngineOutcome<SatelliteFieldCoverage>;
  /** Not required to be pre-filtered to this field — see this
   * interface's own `FieldAwarenessRecentActivity.fieldId` doc comment. */
  recentActivity: readonly FieldAwarenessRecentActivity[];
  /** True when the caller's own confirmed-activity source was truncated
   * before `recentActivity` was ever assembled (Codex audit MEDIUM,
   * round 3: `listConfirmedJobSessionsForFarm`'s own real
   * `MAX_CONFIRMED_JOB_SESSIONS` cap) — surfaced as a real, honest
   * warning rather than silently presenting a possibly-incomplete
   * activity list as complete. */
  recentActivityTruncated?: boolean;
  /** True when the caller's own confirmed-activity read genuinely
   * failed (Codex audit MEDIUM, round 7) — a real database/network
   * error, distinct from a real, successful "zero matching activity"
   * result. Surfaced as its own honest warning; never conflated with
   * `recentActivityTruncated` above (a different real cause). */
  recentActivityUnavailable?: boolean;
}

/**
 * Pure assembly — no I/O, fully deterministic given its arguments. The
 * one real place `coverage`'s own acquisition timestamp becomes an
 * "age in days", and the one real place a mismatched `recentActivity`
 * entry gets dropped rather than trusted.
 */
export function buildFieldAwarenessSnapshot(inputs: FieldAwarenessInputs, generatedAt: string): FieldAwarenessSnapshot {
  const warnings: string[] = [];
  let observationAgeDays: number | undefined;

  if (!inputs.hasMappedBoundary) {
    warnings.push("Field boundary is not mapped yet — satellite coverage cannot be checked.");
  } else if (isOk(inputs.coverage)) {
    const acquiredMs = new Date(inputs.coverage.value.acquisitionTimestamp).getTime();
    const generatedMs = new Date(generatedAt).getTime();
    observationAgeDays = Math.max(0, Math.floor((generatedMs - acquiredMs) / (1000 * 60 * 60 * 24)));
  } else if (inputs.coverage.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
    warnings.push(`No usable satellite observation found in the last ${FIELD_AWARENESS_SATELLITE_LOOKBACK_DAYS} days.`);
  } else if (inputs.coverage.status === "UNKNOWN") {
    // Codex audit MEDIUM (round 1, Farm Awareness / Satellite Field
    // Intelligence campaign): a real provider outage/timeout is a
    // genuinely different, honest state from "we checked and there is
    // no usable observation" — the orchestration layer now reports it
    // as `UNKNOWN`, not `BLOCKED_INSUFFICIENT_EVIDENCE`, specifically so
    // this branch can say so, rather than telling a farmer "no
    // observation exists" when the truth is "we couldn't check".
    warnings.push("Could not reach the satellite service to check this field just now.");
  } else {
    warnings.push("Satellite coverage could not be assessed.");
  }

  if (inputs.recentActivityUnavailable) {
    warnings.push(FIELD_AWARENESS_ACTIVITY_UNAVAILABLE_WARNING);
  } else if (inputs.recentActivityTruncated) {
    warnings.push(FIELD_AWARENESS_ACTIVITY_TRUNCATED_WARNING);
  }

  const freshness = classifyFieldAwarenessFreshness(observationAgeDays);
  const confidence = classifyFieldAwarenessConfidence(freshness);
  const attention = classifyFieldAwarenessAttention(inputs.hasMappedBoundary, freshness, inputs.coverage.status === "UNKNOWN");

  // Codex audit MEDIUM (round 2): defensively re-verify field ownership
  // (as before) AND apply a real recency window, then sort — this
  // interface's own `FieldAwarenessSnapshot.recentActivity` doc comment
  // promises "most recent first", which a caller's own pre-sorted order
  // (e.g. by session `updated_at`, not `confirmedAt`) does not
  // necessarily guarantee.
  const activityCutoffMs = new Date(generatedAt).getTime() - FIELD_AWARENESS_ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const recentActivity = inputs.recentActivity
    .filter((activity) => {
      if (activity.fieldId !== inputs.fieldId) return false;
      const confirmedMs = new Date(activity.confirmedAt).getTime();
      return !Number.isNaN(confirmedMs) && confirmedMs >= activityCutoffMs && confirmedMs <= new Date(generatedAt).getTime();
    })
    .sort((a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime());

  return {
    fieldId: inputs.fieldId,
    farmId: inputs.farmId,
    generatedAt,
    hasMappedBoundary: inputs.hasMappedBoundary,
    coverage: inputs.coverage,
    freshness,
    ...(observationAgeDays !== undefined ? { observationAgeDays } : {}),
    confidence,
    attention,
    recentActivity,
    warnings,
  };
}
