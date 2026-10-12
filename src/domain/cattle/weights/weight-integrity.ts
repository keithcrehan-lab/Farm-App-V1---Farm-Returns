/**
 * Cattle C4 — weight and scope fingerprints.
 *
 * C0's `computeCattleFingerprint` takes a closed `CattleFingerprintKind`
 * union that cannot gain a new kind without editing frozen `integrity.ts`.
 * Following the C1–C3 precedent (template: C2 `obligation-integrity.ts`), C4
 * reuses the `assessment-integrity.ts` canonicalisation and SHA-256 pipeline
 * unchanged, wrapped as `{kind, weightPayloadVersion, payload}` — a wrapper
 * key distinct from C0's `cattlePayloadVersion`, C1's
 * `animalSnapshotPayloadVersion`, C2's `obligationPayloadVersion` and C3's
 * `healthPayloadVersion`, so no fingerprint can collide with, or
 * reinterpret, an existing one.
 *
 * All three kinds are RESULT fingerprints (FINGERPRINTS.md purpose 3) over
 * semantic payloads: instants are canonical keys, unordered sets sorted,
 * unknown values explicit states. Change detection only — not a digital
 * signature.
 */

import {
  computeAssessmentFingerprint,
  verifyAssessmentFingerprint,
  type AssessmentFingerprint,
  type FingerprintVerificationResult,
} from "../../assessment-integrity";
import type { CattleHash } from "../integrity";

/** Increment when a C4 fingerprinted payload's fields or normalisation change. */
export const CATTLE_WEIGHT_PAYLOAD_VERSION = 1;

export type CattleWeightFingerprintKind = "CATTLE_WEIGHT_SERIES" | "CATTLE_GROUP_SCOPE" | "CATTLE_WEIGHT_READ_CONTRACT";

function wrap(kind: CattleWeightFingerprintKind, payload: unknown): unknown {
  return { kind, weightPayloadVersion: CATTLE_WEIGHT_PAYLOAD_VERSION, payload };
}

export function computeWeightFingerprint(kind: CattleWeightFingerprintKind, payload: unknown, hash: CattleHash): AssessmentFingerprint {
  return computeAssessmentFingerprint(wrap(kind, payload), hash);
}

export function verifyWeightFingerprint(
  kind: CattleWeightFingerprintKind,
  payload: unknown,
  expected: AssessmentFingerprint,
  hash: CattleHash,
): FingerprintVerificationResult {
  return verifyAssessmentFingerprint(wrap(kind, payload), expected, hash);
}
