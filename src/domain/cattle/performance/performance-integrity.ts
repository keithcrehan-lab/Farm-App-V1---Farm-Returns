/**
 * Cattle C5 — performance fingerprints.
 *
 * C0's `computeCattleFingerprint` takes a closed `CattleFingerprintKind`
 * union that cannot gain a new kind without editing frozen `integrity.ts`.
 * Following the C1–C4 precedent (template: C2 `obligation-integrity.ts`), C5
 * reuses the `assessment-integrity.ts` canonicalisation and SHA-256 pipeline
 * unchanged, wrapped as `{kind, performancePayloadVersion, payload}` — a
 * wrapper key distinct from C0's `cattlePayloadVersion`, C1's
 * `animalSnapshotPayloadVersion`, C2's `obligationPayloadVersion`, C3's
 * `healthPayloadVersion` and C4's `weightPayloadVersion`, so no fingerprint
 * can collide with, or reinterpret, an existing one.
 *
 * Both kinds are RESULT fingerprints (FINGERPRINTS.md purpose 3) over
 * semantic payloads: every instant in a C5 output is emitted in the one
 * canonical nine-digit spelling, sets are sorted, unknown values are
 * explicit states. Change detection only — not a digital signature.
 */

import {
  computeAssessmentFingerprint,
  verifyAssessmentFingerprint,
  type AssessmentFingerprint,
  type FingerprintVerificationResult,
} from "../../assessment-integrity";
import type { CattleHash } from "../integrity";

/** Increment when a C5 fingerprinted payload's fields or normalisation change. */
export const CATTLE_PERFORMANCE_PAYLOAD_VERSION = 1;

export type CattlePerformanceFingerprintKind = "CATTLE_PERFORMANCE_ANIMAL_RESULT" | "CATTLE_PERFORMANCE_RESULT";

function wrap(kind: CattlePerformanceFingerprintKind, payload: unknown): unknown {
  return { kind, performancePayloadVersion: CATTLE_PERFORMANCE_PAYLOAD_VERSION, payload };
}

export function computePerformanceFingerprint(kind: CattlePerformanceFingerprintKind, payload: unknown, hash: CattleHash): AssessmentFingerprint {
  return computeAssessmentFingerprint(wrap(kind, payload), hash);
}

export function verifyPerformanceFingerprint(
  kind: CattlePerformanceFingerprintKind,
  payload: unknown,
  expected: AssessmentFingerprint,
  hash: CattleHash,
): FingerprintVerificationResult {
  return verifyAssessmentFingerprint(wrap(kind, payload), expected, hash);
}
