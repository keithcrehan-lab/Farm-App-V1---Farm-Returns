/**
 * Farm Return Next — Checkpoint 1.5 (Intelligence & Extensibility
 * Architecture). A minimal, reusable "proof this value is real" record —
 * for `Measurement` (`src/domain/measurement.ts`) today, and any future
 * observation/activity/actual that needs to say what backs it.
 *
 * **Deliberately a different concept from `src/domain/evidence.ts`'s
 * `EvidenceState`**, despite the similar name. `EvidenceState`
 * (MEASURED/DERIVED/IRISH_MODEL/.../INSUFFICIENT) answers "how strong is
 * the scientific/statutory basis for this calculated figure" — a tier on
 * a fixed, ordered scale. `EvidenceItem` here answers a structurally
 * different question: "what concrete thing, if anything, backs this
 * particular value" — a GPS trace, a photo, a receipt, a lab result. A
 * `Measurement` can have zero, one or several `EvidenceItem`s regardless
 * of its own confidence tier; the two are complementary, not
 * interchangeable, the same way this codebase already keeps
 * `JobEvidenceTier` (`src/domain/job-session-evidence.ts`) and
 * `ProvenanceOrigin` (`src/domain/job-session-provenance.ts`) as distinct,
 * purpose-built vocabularies rather than one overloaded enum — see
 * `docs/farm-return-next/CHECKPOINT_1_5_ARCHITECTURE.md` for the full
 * inventory and why no fourth/fifth confidence enum was invented here
 * either.
 *
 * No media upload or hardware integration is implemented by this file —
 * `EvidenceItem` only describes that a piece of evidence exists and, when
 * relevant, which `ExternalReference` (`src/domain/external-reference.ts`)
 * it came through; storing the actual photo/file is explicitly out of
 * this checkpoint's scope.
 */

import type { ExternalReference } from "./external-reference";

export type EvidenceKind =
  | "gps_trace"
  | "farmer_confirmation"
  | "photo"
  | "receipt"
  | "weigh_head_measurement"
  | "sensor_reading"
  | "laboratory_result"
  | "other";

export interface EvidenceItem {
  kind: EvidenceKind;
  /** Short, human-readable description — e.g. "Phone GPS trace for this
   * session", "Farmer confirmed in Confirm Actual", "Lab report
   * FR-2026-0142". Never fabricated; absent evidence means no
   * `EvidenceItem`, not one with an empty/placeholder description. */
  description: string;
  /** When this evidence was itself captured, if known and different from
   * whatever it's attached to. */
  capturedAt?: string;
  /** Set when this evidence came through a real external system — e.g. a
   * weigh-head reading's own device id. */
  externalReference?: ExternalReference;
}

export function evidenceItem(kind: EvidenceKind, description: string, extra: Partial<Omit<EvidenceItem, "kind" | "description">> = {}): EvidenceItem {
  return { kind, description, ...extra };
}
