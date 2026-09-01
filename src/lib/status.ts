import type { AlertSeverity, DataStatus, FieldUse } from "@/domain/types";
import type { MapTone } from "@/components/farm/FieldMap";
import type { ObservationFreshness } from "@/domain/weather-observations";

/**
 * Central status-colour semantics. Per design/design-system.md: green = good/
 * optimal/confirmed, amber = attention/marginal, red = blocked/risk, blue =
 * information/data/weather. Never repurpose these tokens for anything else.
 */
export type StatusTone = "good" | "attention" | "risk" | "info" | "neutral";

export const toneClasses: Record<StatusTone, { bg: string; text: string; ring?: string }> = {
  good: { bg: "bg-fr-good-bg", text: "text-fr-good" },
  attention: { bg: "bg-fr-attention-bg", text: "text-fr-attention" },
  risk: { bg: "bg-fr-risk-bg", text: "text-fr-risk" },
  info: { bg: "bg-fr-info-bg", text: "text-fr-info" },
  neutral: { bg: "bg-fr-surface-alt", text: "text-fr-ink-600" },
};

export function dataStatusTone(status: DataStatus): StatusTone {
  switch (status) {
    case "verified":
      return "good";
    case "farmer_adjusted":
      return "attention";
    case "estimated":
      return "neutral";
    case "mapped":
      return "info";
    case "unavailable":
      return "neutral";
  }
}

export function dataStatusLabel(status: DataStatus): string {
  switch (status) {
    case "verified":
      return "Verified";
    case "farmer_adjusted":
      return "Farmer adjusted";
    case "estimated":
      return "Estimated";
    case "mapped":
      return "Mapped";
    case "unavailable":
      return "Unavailable";
  }
}

export function alertSeverityTone(severity: AlertSeverity): StatusTone {
  switch (severity) {
    case "risk":
      return "risk";
    case "attention":
      return "attention";
    case "info":
      return "info";
  }
}

/** Spreading/soil-health style 0-100 score → status tone band. */
export function scoreTone(score: number): StatusTone {
  if (score <= 0) return "risk";
  if (score < 65) return "attention";
  return "good";
}

/**
 * Band label — thresholds deliberately match scoreTone()'s so a ring's
 * colour and its text label never disagree (an amber ring reading "Good"
 * would contradict its own colour).
 */
export function scoreBandLabel(score: number): string {
  if (score <= 0) return "Do not spread";
  if (score < 65) return "Marginal";
  if (score < 80) return "Good";
  return "Very good";
}

/** Field-map land-use legend colour — see globals.css's note on why this
 * is separate from the status-semantic tones above. */
export function landUseTone(use: FieldUse): MapTone {
  switch (use) {
    case "grazing":
      return "good";
    case "silage_1st_cut":
    case "silage_2nd_cut":
    case "silage_3rd_cut":
      return "silage";
    case "tillage":
      return "attention";
    case "mixed":
    case "other":
      return "neutral";
  }
}

/**
 * Presentational pH band label only — not a production agronomic rule.
 * Real thresholds belong in docs/agronomy-engine.md's versioned rule set
 * (Phase 3); this is just Phase 1 UI copy.
 */
export function phStatusLabel(pH: number): string {
  if (pH < 5.5) return "Acidic";
  if (pH <= 6.2) return "Slightly acidic";
  if (pH <= 6.8) return "Optimal";
  return "Alkaline";
}

/**
 * Farm Return Next canonical activity lifecycle
 * (`FARM_RETURN_NEXT_SPEC_v1_1.md` §5/§18): "Suggested → Planned → Window
 * approaching → Ready → In progress/Active → Completed—estimated →
 * Completed—actual/confirmed", plus the two states §18's own table adds
 * (`Constraint`, `Unknown / insufficient evidence`). This is a
 * presentation-only ordering/colour convention, the same kind of thing
 * `alertSeverityTone`/`dataStatusTone` above already are — it classifies
 * which real lifecycle state something is already in, it does not compute
 * or invent that state itself (no scientific/financial number lives
 * here).
 */
export type ActivityState =
  | "suggested"
  | "planned"
  | "window_approaching"
  | "ready"
  | "active"
  | "completed_estimated"
  | "completed_actual"
  | "constraint"
  | "unknown";

/** §18's own "UI treatment" column, translated to this app's real tone
 * vocabulary — green readiness (`ready`/`completed_actual`), amber
 * attention (`window_approaching`/`completed_estimated`/`constraint`
 * itself defaults amber; a genuinely hard/legal restriction should be
 * passed as `risk` by the caller, the same "amber vs red severity is the
 * caller's call" pattern `alertSeverityTone` already leaves to
 * `AlertSeverity`), blue active/information (`active`), and neutral for
 * anything not yet committed or evidenced (`suggested`/`planned`/
 * `unknown`). */
export function activityStateTone(state: ActivityState): StatusTone {
  switch (state) {
    case "ready":
    case "completed_actual":
      return "good";
    case "window_approaching":
    case "completed_estimated":
    case "constraint":
      return "attention";
    case "active":
      return "info";
    case "suggested":
    case "planned":
    case "unknown":
      return "neutral";
  }
}

/** §18's own "Meaning" column, as short farmer-facing labels (§18's own
 * "Language rules": no false certainty, prefer plain words). */
export function activityStateLabel(state: ActivityState): string {
  switch (state) {
    case "suggested":
      return "Suggested";
    case "planned":
      return "Planned";
    case "window_approaching":
      return "Window approaching";
    case "ready":
      return "Ready";
    case "active":
      return "Active";
    case "completed_estimated":
      return "Needs confirmation";
    case "completed_actual":
      return "Confirmed";
    case "constraint":
      return "Restricted";
    case "unknown":
      return "Unknown";
  }
}

/** `WeatherForFieldResult.status` tone/label — distinct from `DataStatus`
 * above (that's provenance of a *value*; this is freshness of a *live
 * fetch*). CLAUDE.md: never let this be confused with an in-field sensor
 * reading — always paired with the source station name/distance in the UI. */
export function weatherFreshnessTone(status: ObservationFreshness): StatusTone {
  switch (status) {
    case "LIVE":
      return "good";
    case "STALE":
      return "attention";
    case "UNAVAILABLE":
      return "risk";
    case "UNVERIFIED":
      return "neutral";
  }
}

export function weatherFreshnessLabel(status: ObservationFreshness): string {
  switch (status) {
    case "LIVE":
      return "Live";
    case "STALE":
      return "Stale";
    case "UNAVAILABLE":
      return "Unavailable";
    case "UNVERIFIED":
      return "Unverified";
  }
}

export function landUseLabel(use: FieldUse): string {
  switch (use) {
    case "grazing":
      return "Grazing";
    case "silage_1st_cut":
      return "1st cut silage";
    case "silage_2nd_cut":
      return "2nd cut silage";
    case "silage_3rd_cut":
      return "3rd cut silage";
    case "tillage":
      return "Tillage";
    case "mixed":
      return "Mixed";
    case "other":
      return "Other";
  }
}
