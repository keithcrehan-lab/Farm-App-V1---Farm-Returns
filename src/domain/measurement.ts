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
import type { ExternalReference } from "./external-reference";
import { isSameSubject, type SubjectRef } from "./subject";

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
  /** `readonly` — `measurement()`/`reviseMeasurement()` always return a
   * frozen array of frozen items (Codex audit CRITICAL, round 3,
   * 2026-09-08 — see `freezeMeasurementMetadata`'s own doc comment). */
  evidence?: readonly EvidenceItem[];
  /** Never overwritten — see this module's own header comment. */
  previous?: Measurement<T>;
}

/**
 * Codex audit CRITICAL (round 1, 2026-09-08): every piece of evidence
 * attached to a measurement must belong to the *same* farm as the
 * measurement itself — an `EvidenceItem.externalReference` citing a
 * different farm would let one farm's `Measurement` relate to another
 * farm's data, exactly the cross-farm relation this checkpoint's own
 * non-negotiable invariant forbids.
 */
function assertEvidenceBelongsToFarm(farmId: string, evidence: readonly EvidenceItem[] | undefined): void {
  if (!evidence) return;
  for (const item of evidence) {
    if (item.externalReference && item.externalReference.farmId !== farmId) {
      throw new Error(
        `measurement: evidence's own externalReference belongs to farm ${item.externalReference.farmId}, not this measurement's farm ${farmId} — cross-farm evidence is never attached.`,
      );
    }
  }
}

/**
 * Codex audit CRITICAL (round 2, 2026-09-08): round 1's own fix only
 * validated `reviseMeasurement`'s two top-level arguments — `measurement()`
 * itself (the more primitive constructor `reviseMeasurement` is not the
 * only caller of) accepted an arbitrary `previous` with no validation at
 * all, so a caller building a farm-A measurement with `previous:
 * someFarmBMeasurement` directly still silently succeeded, bypassing
 * `reviseMeasurement` entirely. Walks the *whole* inherited chain (not
 * just the immediate `previous`) checking every node's own `farmId`,
 * `subject`, and evidence — a mismatch buried two or more revisions deep
 * is caught exactly the same as one at the first level.
 *
 * Codex audit MEDIUM (round 3, 2026-09-08): an arbitrary (hand-crafted,
 * not built through `measurement()`/`reviseMeasurement()`) `previous`
 * chain could be cyclic, which would make this walk loop forever. A
 * `Set` of already-visited nodes turns that into a clear, immediate
 * error instead of a hang.
 */
function assertProvenanceChainBelongsToFarm<T>(farmId: string, subject: SubjectRef, chain: Measurement<T> | undefined): void {
  const visited = new Set<Measurement<T>>();
  let node = chain;
  while (node) {
    if (visited.has(node)) {
      throw new Error("measurement: this measurement's own .previous chain contains a cycle — provenance history must be a simple, finite chain, never a loop.");
    }
    visited.add(node);
    if (node.farmId !== farmId) {
      throw new Error(`measurement: a value in this measurement's own .previous chain belongs to farm ${node.farmId}, not ${farmId} — cross-farm provenance is never attached.`);
    }
    if (!isSameSubject(node.subject, subject)) {
      throw new Error(`measurement: a value in this measurement's own .previous chain is about a different subject (${node.subject.type}:${node.subject.id}, expected ${subject.type}:${subject.id}) — cross-subject provenance is never attached.`);
    }
    assertEvidenceBelongsToFarm(farmId, node.evidence);
    node = node.previous;
  }
}

function freezeSubjectCopy(subject: SubjectRef): SubjectRef {
  return Object.freeze({ ...subject });
}

function freezeExternalReferenceCopy(ref: ExternalReference): ExternalReference {
  return Object.freeze({ ...ref, subject: freezeSubjectCopy(ref.subject) });
}

function freezeEvidenceItemCopy(item: EvidenceItem): EvidenceItem {
  return Object.freeze({
    ...item,
    ...(item.externalReference ? { externalReference: freezeExternalReferenceCopy(item.externalReference) } : {}),
  });
}

/**
 * Codex audit CRITICAL (round 3, 2026-09-08): round 2's own fix copied
 * the `evidence` *array*, but each `EvidenceItem` inside it, that item's
 * own `externalReference`, and the measurement's own `subject` were all
 * still the caller's exact same objects — mutating
 * `evidence[0].externalReference.farmId` (or `subject.id`) *after*
 * `measurement()` already validated and returned would silently reopen
 * the same cross-farm invariant just checked, without ever calling
 * `measurement()`/`reviseMeasurement()` again. Every mutable piece of
 * this metadata is now copied into a fresh object and frozen —
 * `Object.freeze` makes a later mutation attempt throw immediately
 * (this is genuine ES module strict-mode code) rather than silently
 * succeed. Deliberately does **not** freeze `.value` itself: an
 * arbitrary generic `T` is not necessarily safe to freeze (it might be a
 * `Date`, a `Map`, or some other structure a caller legitimately still
 * needs to use elsewhere), and no finding has ever been about `.value`'s
 * own mutability — only about the farm/subject/evidence metadata a
 * mutation could use to fabricate a cross-farm relation, which this
 * function fully covers.
 */
function freezeMeasurementMetadata<T>(input: Omit<Measurement<T>, "previous"> & { previous?: Measurement<T> }): Measurement<T> {
  const result: Measurement<T> = {
    ...input,
    subject: freezeSubjectCopy(input.subject),
    ...(input.evidence ? { evidence: Object.freeze(input.evidence.map(freezeEvidenceItemCopy)) } : {}),
    ...(input.previous ? { previous: freezePreviousChain(input.previous) } : {}),
  };
  return Object.freeze(result);
}

/**
 * Freezes an inherited `.previous` chain in place, recursively — a
 * measurement built through `measurement()`/`reviseMeasurement()` is
 * already frozen from its own construction, so every one of these calls
 * is then a genuine no-op (`Object.freeze` on an already-frozen object
 * does nothing). This is defence in depth against a caller who
 * hand-constructed a `previous` value directly rather than through these
 * functions.
 *
 * Codex audit CRITICAL (round 4, 2026-09-08): the first version of this
 * function returned early whenever `Object.isFrozen(m)` was already
 * `true`, treating that as proof the *whole* subtree under `m` was
 * already safe. `Object.freeze` is famously shallow — it only prevents
 * reassigning `m`'s own direct properties, not the objects those
 * properties point to — so a caller could hand in
 * `Object.freeze({ ...someMeasurement, subject: mutableSubject, evidence:
 * [mutableItem] })`: `m` itself reads as frozen, this function returned
 * immediately without ever touching `subject`/`evidence`, and the
 * invariant round 3 believed fully closed was still open through this
 * one exact path. The shortcut is removed entirely — every node is now
 * unconditionally walked and frozen, exactly as expensive (freezing an
 * already-frozen object is a genuine no-op) but no longer spoofable by
 * a shallow, hand-crafted wrapper.
 */
function freezePreviousChain<T>(m: Measurement<T>): Measurement<T> {
  Object.freeze(m.subject);
  if (m.evidence) {
    for (const item of m.evidence) {
      Object.freeze(item);
      if (item.externalReference) {
        Object.freeze(item.externalReference);
        Object.freeze(item.externalReference.subject);
      }
    }
    Object.freeze(m.evidence);
  }
  if (m.previous) freezePreviousChain(m.previous);
  return Object.freeze(m);
}

export function measurement<T>(
  input: Omit<Measurement<T>, "previous"> & { previous?: Measurement<T> },
): Measurement<T> {
  assertEvidenceBelongsToFarm(input.farmId, input.evidence);
  assertProvenanceChainBelongsToFarm(input.farmId, input.subject, input.previous);
  return freezeMeasurementMetadata(input);
}

/**
 * Revises a Measurement, chaining the prior value into `.previous` rather
 * than discarding it — the same discipline `farmerAdjust`/`verify`
 * (`src/domain/provenance.ts`) and `reviseActualValue`
 * (`src/domain/job-session-evidence.ts`) already apply to their own
 * value-with-provenance shapes.
 *
 * Codex audit CRITICAL (round 1, 2026-09-08): the first version of this
 * function let `next` carry a *different* `farmId`/`subject` from
 * `existing`, embedding the old (possibly different-farm) measurement
 * under the new one's own `.previous` — a real cross-farm relation this
 * checkpoint's own non-negotiable invariant forbids, and exactly the
 * class of identifier-handling bug the campaign brief specifically warns
 * against repeating. A revision is, by definition, a correction to the
 * *same* real-world measurement (the same farm, the same subject) — a
 * different farm or subject is a new `Measurement`, never a "revision"
 * of this one, so both are now rejected outright rather than silently
 * accepted. Delegates its final construction to `measurement()` itself
 * (round 2, 2026-09-08) rather than duplicating its own evidence/chain
 * validation and defensive copy — one real choke point, not two.
 */
export function reviseMeasurement<T>(existing: Measurement<T>, next: Omit<Measurement<T>, "previous">): Measurement<T> {
  if (next.farmId !== existing.farmId) {
    throw new Error(`reviseMeasurement: cannot revise a measurement into a different farm (${existing.farmId} -> ${next.farmId}) — this would embed one farm's data inside another farm's own provenance chain.`);
  }
  if (!isSameSubject(next.subject, existing.subject)) {
    throw new Error(`reviseMeasurement: cannot revise a measurement into a different subject (${existing.subject.type}:${existing.subject.id} -> ${next.subject.type}:${next.subject.id}) — construct a new Measurement instead.`);
  }
  return measurement({ ...next, previous: existing });
}
