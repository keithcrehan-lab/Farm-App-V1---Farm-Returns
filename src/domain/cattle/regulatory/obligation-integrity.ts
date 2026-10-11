/**
 * Cattle C2 — obligation fingerprints.
 *
 * C0's `computeCattleFingerprint` takes a closed `CattleFingerprintKind`
 * union that cannot gain a new kind without editing frozen `integrity.ts`.
 * Following C1's precedent (`CATTLE_ANIMAL_SNAPSHOT`), C2 reuses the same
 * `assessment-integrity.ts` canonicalisation and SHA-256 pipeline unchanged,
 * wrapped as `{kind, obligationPayloadVersion, payload}` — a wrapper shape
 * distinct from C0's `{kind, cattlePayloadVersion, payload}` and C1's
 * `{kind, animalSnapshotPayloadVersion, payload}`, so no fingerprint can
 * collide with, or reinterpret, an existing one. Change detection only — not
 * a digital signature.
 */

import {
  computeAssessmentFingerprint,
  verifyAssessmentFingerprint,
  type AssessmentFingerprint,
  type FingerprintVerificationResult,
} from "../../assessment-integrity";
import type { CattleHash } from "../integrity";

/** Increment when a C2 fingerprinted payload's fields or normalisation change. */
export const CATTLE_OBLIGATION_PAYLOAD_VERSION = 1;

export type CattleObligationFingerprintKind = "CATTLE_OBLIGATION_TERMS" | "CATTLE_OBLIGATION_STATE";

function wrap(kind: CattleObligationFingerprintKind, payload: unknown): unknown {
  return { kind, obligationPayloadVersion: CATTLE_OBLIGATION_PAYLOAD_VERSION, payload };
}

export function computeObligationFingerprint(kind: CattleObligationFingerprintKind, payload: unknown, hash: CattleHash): AssessmentFingerprint {
  return computeAssessmentFingerprint(wrap(kind, payload), hash);
}

export function verifyObligationFingerprint(
  kind: CattleObligationFingerprintKind,
  payload: unknown,
  expected: AssessmentFingerprint,
  hash: CattleHash,
): FingerprintVerificationResult {
  return verifyAssessmentFingerprint(wrap(kind, payload), expected, hash);
}
