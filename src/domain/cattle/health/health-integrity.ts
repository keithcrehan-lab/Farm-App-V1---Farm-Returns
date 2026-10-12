/**
 * Cattle C3 — health and medicine fingerprints.
 *
 * C0's `computeCattleFingerprint` takes a closed `CattleFingerprintKind`
 * union that cannot gain a new kind without editing frozen `integrity.ts`.
 * Following the C1/C2 precedent (template: C2 `obligation-integrity.ts`), C3
 * reuses the `assessment-integrity.ts` canonicalisation and SHA-256 pipeline
 * unchanged, wrapped as `{kind, healthPayloadVersion, payload}` — a wrapper
 * key distinct from C0's `cattlePayloadVersion`, C1's
 * `animalSnapshotPayloadVersion` and C2's `obligationPayloadVersion`, so no
 * fingerprint can collide with, or reinterpret, an existing one.
 *
 * All three kinds are RESULT fingerprints (FINGERPRINTS.md purpose 3) over
 * semantic payloads: instants are canonical spellings, unordered sets sorted,
 * unknown values explicit `null` states. Change detection only — not a
 * digital signature.
 */

import {
  computeAssessmentFingerprint,
  verifyAssessmentFingerprint,
  type AssessmentFingerprint,
  type FingerprintVerificationResult,
} from "../../assessment-integrity";
import type { CattleHash } from "../integrity";

/** Increment when a C3 fingerprinted payload's fields or normalisation change. */
export const CATTLE_HEALTH_PAYLOAD_VERSION = 1;

export type CattleHealthFingerprintKind = "CATTLE_HEALTH_TIMELINE" | "CATTLE_MEDICINE_LEDGER" | "CATTLE_WITHDRAWAL_GATE";

function wrap(kind: CattleHealthFingerprintKind, payload: unknown): unknown {
  return { kind, healthPayloadVersion: CATTLE_HEALTH_PAYLOAD_VERSION, payload };
}

export function computeHealthFingerprint(kind: CattleHealthFingerprintKind, payload: unknown, hash: CattleHash): AssessmentFingerprint {
  return computeAssessmentFingerprint(wrap(kind, payload), hash);
}

export function verifyHealthFingerprint(
  kind: CattleHealthFingerprintKind,
  payload: unknown,
  expected: AssessmentFingerprint,
  hash: CattleHash,
): FingerprintVerificationResult {
  return verifyAssessmentFingerprint(wrap(kind, payload), expected, hash);
}
