/**
 * Farm Return Next — per-value provenance assembly for a Job Session's
 * resulting Record (`docs/product/farm-return-next-v1.1/
 * GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §15). "Do not flatten all values
 * into one generic 'confirmed' state" — this module's one job is
 * producing a real, inspectable list distinguishing exactly where each
 * material value in a Job Session record actually came from, for Ask AI,
 * a future Calculation & Evidence report, and plain on-screen disclosure.
 *
 * Pure and presentation-agnostic: this module never renders anything, it
 * only classifies. It also never invents an entry for a value that is
 * absent — a field with no known value has no provenance entry at all,
 * rather than a fabricated placeholder.
 */
import type { JobEvidenceTier } from "./job-session-evidence";

export type ProvenanceOrigin = JobEvidenceTier | "farm_data" | "external_source";

export interface ProvenanceEntry {
  /** A short, stable field key — e.g. "date", "startEnd", "field",
   * "activity", "quantity", "mappedFieldArea", "weather", "prompt",
   * "gpsTrace". Not farmer-facing copy on its own; a UI/Ask AI layer maps
   * this to real language. */
  field: string;
  origin: ProvenanceOrigin;
  /** A short, plain description of the source — e.g. "Phone GPS",
   * "Farm Return estimate", "Farmer confirmed", "Met Éireann". */
  description: string;
}

export interface JobSessionProvenanceInput {
  /** Whether real device timestamps exist for this session (its own
   * active intervals) — false for a manually-started, untracked session. */
  hasDeviceTimestamps: boolean;
  /** Whether a real field was GPS-inferred at any point during the
   * session (vs. purely farmer-selected with no location evidence). */
  fieldGpsInferred: boolean;
  /** Whether the field/activity was ever farmer-confirmed (true for every
   * real Confirm Actual — this module is normally only called once one
   * exists, but stays honest either way). */
  farmerConfirmed: boolean;
  /** Whether the originating Prompt/Plan supplied an activity/field
   * suggestion at all (false for a fully manual start). */
  hasPromptOrPlanOrigin: boolean;
  /** True when the record carries at least one farmer-entered Actual
   * quantity (product amount, slurry volume, bales, ...). */
  hasActualQuantity: boolean;
  /** True when a field's real mapped area (`Field.areaHa`) contributed to
   * the record (a "whole field" completion). */
  usesMappedFieldArea: boolean;
  /** True when a real weather observation/forecast value is attached. */
  hasWeatherContext: boolean;
  /** True when a real raw GPS trace (telemetry_events linked to this
   * session) exists, regardless of whether it was used to infer the
   * field. */
  hasGpsTrace: boolean;
}

/**
 * Builds the real, present-only provenance list for one Job Session
 * record. Each `if` below corresponds 1:1 to one row of
 * `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §15's worked example — kept as
 * separate, individually-testable conditions rather than one opaque loop,
 * so a missing/wrong entry is traceable to exactly one line.
 */
export function buildJobSessionProvenance(input: JobSessionProvenanceInput): ProvenanceEntry[] {
  const entries: ProvenanceEntry[] = [];

  if (input.hasDeviceTimestamps) {
    entries.push({ field: "date", origin: "observed", description: "Phone GPS (device timestamp)" });
    entries.push({ field: "startEnd", origin: "observed", description: "Phone GPS (device timestamp)" });
  }

  if (input.fieldGpsInferred && input.farmerConfirmed) {
    entries.push({ field: "field", origin: "actual", description: "GPS inferred, farmer confirmed" });
  } else if (input.fieldGpsInferred) {
    entries.push({ field: "field", origin: "observed", description: "GPS inferred" });
  } else if (input.farmerConfirmed) {
    entries.push({ field: "field", origin: "actual", description: "Farmer confirmed" });
  }

  if (input.hasPromptOrPlanOrigin && input.farmerConfirmed) {
    entries.push({ field: "activity", origin: "actual", description: "Plan/Prompt, farmer confirmed" });
  } else if (input.farmerConfirmed) {
    entries.push({ field: "activity", origin: "actual", description: "Farmer confirmed" });
  }

  if (input.hasActualQuantity) {
    entries.push({ field: "quantity", origin: "actual", description: "Farmer Actual" });
  }

  if (input.usesMappedFieldArea) {
    entries.push({ field: "mappedFieldArea", origin: "farm_data", description: "Farm data (mapped field boundary)" });
  }

  if (input.hasWeatherContext) {
    entries.push({ field: "weather", origin: "external_source", description: "Authoritative external source" });
  }

  if (input.hasPromptOrPlanOrigin) {
    entries.push({ field: "prompt", origin: "estimated", description: "Farm Return estimate" });
  }

  if (input.hasGpsTrace) {
    entries.push({ field: "gpsTrace", origin: "observed", description: "Device evidence" });
  }

  return entries;
}

export const JOB_SESSION_PROVENANCE_VERSION = "job_session_provenance_v1.0.0";
