/**
 * Cattle C6 — production-goal fingerprints.
 *
 * C0's `computeCattleFingerprint` takes a closed `CattleFingerprintKind`
 * union that cannot gain a new kind without editing frozen `integrity.ts`.
 * Following the C1–C5 precedent (template: C2 `obligation-integrity.ts`), C6
 * reuses the `assessment-integrity.ts` canonicalisation and SHA-256 pipeline
 * unchanged, wrapped as `{kind, goalPayloadVersion, payload}` — a wrapper key
 * distinct from C0's `cattlePayloadVersion`, C1's
 * `animalSnapshotPayloadVersion`, C2's `obligationPayloadVersion`, C3's
 * `healthPayloadVersion`, C4's `weightPayloadVersion` and C5's
 * `performancePayloadVersion`, so no fingerprint can collide with, or
 * reinterpret, an existing one.
 *
 * Every kind is a RESULT fingerprint (FINGERPRINTS.md purpose 3) over a
 * semantic payload: every instant in a C6 output is emitted in the one
 * canonical nine-digit spelling, sets are sorted, unknown values are explicit
 * states, and the payload carries `effectiveAt` / `knowledgeCutoff`.
 * Change detection only — not a digital signature.
 */

import {
  computeAssessmentFingerprint,
  verifyAssessmentFingerprint,
  type AssessmentFingerprint,
  type FingerprintVerificationResult,
} from "../../assessment-integrity";
import type { CattleHash } from "../integrity";

/** Increment when a C6 fingerprinted payload's fields or normalisation change. */
export const CATTLE_GOAL_PAYLOAD_VERSION = 1;

export type CattleGoalFingerprintKind = "CATTLE_GOAL_SNAPSHOT" | "CATTLE_GOAL_PROJECTION" | "CATTLE_GOAL_ROUTING" | "CATTLE_GOAL_TARGET_APPLICABILITY";

function wrap(kind: CattleGoalFingerprintKind, payload: unknown): unknown {
  return { kind, goalPayloadVersion: CATTLE_GOAL_PAYLOAD_VERSION, payload };
}

export function computeGoalFingerprint(kind: CattleGoalFingerprintKind, payload: unknown, hash: CattleHash): AssessmentFingerprint {
  return computeAssessmentFingerprint(wrap(kind, payload), hash);
}

export function verifyGoalFingerprint(
  kind: CattleGoalFingerprintKind,
  payload: unknown,
  expected: AssessmentFingerprint,
  hash: CattleHash,
): FingerprintVerificationResult {
  return verifyAssessmentFingerprint(wrap(kind, payload), expected, hash);
}
