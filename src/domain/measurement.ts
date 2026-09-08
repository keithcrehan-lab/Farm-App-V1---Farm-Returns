/**
 * Farm Return Next — Checkpoint 1.5 (Intelligence & Extensibility
 * Architecture). A generic "one real reading about a farm entity, at a
 * point in time" concept — animal weight, grass cover, soil moisture,
 * yield, machinery output, whatever future measurement kind Farm Return
 * needs — so a new one never has to invent its own value/provenance
 * shape from scratch.
 *
 * **Reuses, rather than reinvents, this app's existing primitives**:
 * - `subject` (`src/domain/subject.ts`'s `SubjectRef`) — what was
 *   measured, not limited to a field.
 * - `status` (`src/domain/types.ts`'s `DataStatus`) — the same
 *   verified/farmer_adjusted/estimated/mapped/unavailable tier every
 *   other farm reference value in this app already uses. No new
 *   confidence enum was invented for `Measurement` — see
 *   `docs/farm-return-next/CHECKPOINT_1_5_ARCHITECTURE.md` for the full
 *   accounting of this app's existing confidence/evidence-tier
 *   vocabularies and why a fourth wasn't added here.
 * - `evidence` (`src/domain/evidence-item.ts`'s `EvidenceItem`) — what, if
 *   anything, concretely backs this value.
 * - `previous` — the exact "never overwrite provenance" chain
 *   `TrackedValue.previous` (`src/domain/types.ts`) and
 *   `JobEvidenceValue.previous` (`src/domain/job-session-evidence.ts`)
 *   already use, applied to the same idea here: a corrected/re-measured
 *   value never discards the one it replaces.
 *
 * **What this is not**: a replacement for `WeightObservation`
 * (`src/domain/types.ts`) or its real, live, cross-farm-enforced table
 * (`livestock_weight_observations`,
 * `src/lib/farm-data/individual-animals.ts`). `WeightObservation` already
 * works, is tested, and is exactly the shape a `Measurement<number>` for
 * animal weight *would* have (a subject, a value, when it happened, a
 * source) — it is simply not literally retyped as one, because doing so
 * would touch a live, working, already-migrated feature for no functional
 * benefit (this checkpoint's own "prefer additive changes... do not
 * create migrations simply to satisfy theoretical future needs" rule).
 * `Measurement<T>` is the pattern a *genuinely new* measurement kind
 * (one with no existing bespoke table yet) should follow; it is not yet
 * backed by any persistence of its own — matching `src/domain/types.ts`'s
 * own `ConcentrateFeedSpec` precedent ("not yet a stored farm entity ...
 * a parameter shape ... to accept").
 */

import type { DataStatus } from "./types";
import type { EvidenceItem } from "./evidence-item";
import type { SubjectRef } from "./subject";

/**
 * Where a Measurement's own value actually came from — a closed,
 * reviewable vocabulary distinct from this app's other purpose-built
 * origin vocabularies (`ObservationSource` in `src/orchestration/observe/
 * index.ts`, `JobEvidenceValue.source`/`ProvenanceEntry.description` free
 * text elsewhere) because none of those was designed for "which kind of
 * external or computed origin produced this specific reading" — the
 * question a future AI/explainability surface needs a real, closed answer
 * to, not a free-text guess.
 */
export type MeasurementOrigin =
  | "farmer_entered"
  | "phone_gps"
  | "farm_return_calculation"
  | "met_eireann"
  | "teagasc"
  | "satellite_estimate"
  | "laboratory_result"
  | "sensor"
  | "eid_or_weigh_head"
  | "imported_dataset"
  | "external_api"
  | "ai_inferred";

export interface Measurement<T> {
  /** Absent for a not-yet-persisted measurement (this type has no real
   * table of its own yet — see this module's own header comment). */
  id?: string;
  farmId: string;
  subject: SubjectRef;
  /** Free text, deliberately not a closed enum yet — e.g.
   * "animal_weight", "grass_cover_cm", "soil_moisture_pct", "silage_yield".
   * Mirrors `job_sessions.activityType`'s own "string now, a real closed
   * vocabulary once enough real kinds exist to know its shape" choice,
   * rather than guessing a taxonomy ahead of any real measurement kind
   * needing one. */
  kind: string;
  value: T;
  unit?: string;
  /** When the real-world event happened. */
  occurredAt: string;
  /** When Farm Return captured/derived this value — may be later than
   * `occurredAt` (a farmer logging yesterday's weighing today). */
  recordedAt: string;
  origin: MeasurementOrigin;
  /** Human-readable description of the source, e.g. "Farmer entered",
   * "Weighbridge", "Met Éireann station 3723" — the same free-text
   * companion every other provenance field in this app already pairs
   * with its own closed tier/origin enum. */
  source: string;
  status: DataStatus;
  evidence?: EvidenceItem[];
  /** Never overwritten — see this module's own header comment. */
  previous?: Measurement<T>;
}

export function measurement<T>(
  input: Omit<Measurement<T>, "previous"> & { previous?: Measurement<T> },
): Measurement<T> {
  return { ...input };
}

/**
 * Revises a Measurement, chaining the prior value into `.previous` rather
 * than discarding it — the same discipline `farmerAdjust`/`verify`
 * (`src/domain/provenance.ts`) and `reviseActualValue`
 * (`src/domain/job-session-evidence.ts`) already apply to their own
 * value-with-provenance shapes.
 */
export function reviseMeasurement<T>(existing: Measurement<T>, next: Omit<Measurement<T>, "previous">): Measurement<T> {
  return { ...next, previous: existing };
}
