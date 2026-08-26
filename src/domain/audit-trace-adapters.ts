/**
 * Scientific engine V3 — Phase B: the last piece of foundation
 * `audit-trace.ts` needs before a real calculation can start emitting a
 * real `DecisionRecord` (Phase E onward). Bridges the existing
 * farmer-facing provenance model (`TrackedValue`, `types.ts`) to the V3
 * `InputEvidence` shape, and provides a deterministic farm-snapshot
 * fingerprint and a calculation-step sequence helper.
 *
 * Still imported by nothing in `src/app`/`src/components`/`src/store` as
 * of this phase — real wiring happens once a specific calculation is
 * fixed/built (Phase E onward) and needs these to construct its trace.
 */

import { canonicalSha256 } from "./audit-trace";
import type { InputEvidence } from "./audit-trace";
import type { EvidenceState } from "./evidence";
import type { TrackedValue } from "./types";

/**
 * Builds an `InputEvidence` record from an existing `TrackedValue`.
 * `evidenceState` and `sourceKind` are always caller-supplied, never
 * inferred from `TrackedValue.status` — this is the same deliberate
 * non-goal Phase 1's plan recorded (§6 "One explicit non-goal"): the two
 * vocabularies don't line up 1:1 (a `"farmer_adjusted"` or `"estimated"`
 * status can plausibly map to more than one real `EvidenceState`
 * depending on *what* was actually adjusted or estimated), so a blind
 * automatic mapping would itself be exactly the kind of invented
 * classification V3 exists to prevent. Every call site makes an explicit,
 * reviewed choice instead.
 *
 * `override`/`originalValueBeforeOverride` are derived directly from the
 * existing, already-correct `TrackedValue.status`/`.previous` provenance
 * chain (`src/domain/provenance.ts`'s `farmerAdjust`) — that mapping IS
 * safe to automate, since "was this farmer-overridden" and "what was it
 * before" are exactly what `status`/`previous` already, unambiguously
 * record, unlike evidence *quality*.
 */
export function trackedValueToInputEvidence<T>(
  name: string,
  tv: TrackedValue<T>,
  evidenceState: EvidenceState,
  sourceKind: InputEvidence["sourceKind"],
  options: { unit?: string | null; normalisedValue?: unknown } = {},
): InputEvidence {
  return {
    name,
    rawValue: tv.value,
    normalisedValue: options.normalisedValue ?? tv.value,
    unit: options.unit ?? null,
    sourceKind,
    evidenceState,
    recordedAt: tv.sourceDate ?? tv.retrievedAt,
    override: tv.status === "farmer_adjusted",
    originalValueBeforeOverride: tv.status === "farmer_adjusted" ? tv.previous?.value : undefined,
    sourceDocument: tv.source,
  };
}

/**
 * Deterministic farm-snapshot fingerprint — a SHA-256 over the exact,
 * canonicalised set of input values a calculation actually consumed (a
 * caller-supplied record, not this app's whole farm object graph, most of
 * which is irrelevant to any one calculation), so the same inputs always
 * produce the same snapshot id and any change to them produces a
 * different one. This is a reproducibility fingerprint for
 * `CalculationRun.farmSnapshotId` (report spec §3), not a persisted
 * "farm version" concept — this app has no versioned farm-state history
 * to point to yet (`farm-store.tsx` holds one current state), so a
 * content hash of what was actually used is the honest, buildable
 * alternative to inventing a snapshot-versioning system this phase has no
 * evidence basis to design.
 */
export function computeFarmSnapshotId(inputs: Record<string, unknown>): Promise<string> {
  return canonicalSha256(inputs);
}

/** Next 1-based sequence number for a `CalculationStep[]` array — steps
 * must be ordered, per the report spec's "no hidden arithmetic or 'magic'
 * numbers" (§4D). */
export function nextStepSequence(steps: { sequence: number }[]): number {
  return steps.length === 0 ? 1 : Math.max(...steps.map((s) => s.sequence)) + 1;
}
