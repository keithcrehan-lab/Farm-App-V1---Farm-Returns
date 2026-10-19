/**
 * Cattle C9 — phase-local fingerprint wrapper (FINGERPRINTS.md; template: C2
 * `regulatory/obligation-integrity.ts`).
 *
 * Reuses the `assessment-integrity.ts` canonicalisation and SHA-256 pipeline
 * unchanged, wrapping each payload as `{kind, cattlePlanPayloadVersion,
 * payload}` — a wrapper key distinct from C0 `cattlePayloadVersion`, C1
 * `animalSnapshotPayloadVersion`, C2 `obligationPayloadVersion`, C3
 * `healthPayloadVersion`, C4 `weightPayloadVersion`, C5
 * `performancePayloadVersion`, C6 `goalPayloadVersion`, C7
 * `programmePayloadVersion` and C8 `recommendationPayloadVersion`, so no
 * existing kind, payload version or canonicalisation changes.
 *
 * Kind (FINGERPRINTS.md purpose 3, result fingerprint):
 * - `CATTLE_PLAN_INTERFACE_RESULT` — the canonical C9 objects (work items,
 *   proposal groups, group scopes, canonical completion evidence, items that
 *   produced no proposal) with both canonical times. Each work item carries
 *   the id and fingerprint of the upstream output it consumed, so a consumed
 *   upstream change changes the result; an input no consumed output depends
 *   on leaves it unchanged. The lossy Plan projections are not hashed.
 * A fingerprint is change detection, never a signature.
 */

import {
  computeAssessmentFingerprint,
  verifyAssessmentFingerprint,
  type AssessmentFingerprint,
  type FingerprintVerificationResult,
} from "../../assessment-integrity";
import type { CattleHash } from "../integrity";

export const CATTLE_PLAN_PAYLOAD_VERSION = 1;

export type CattlePlanFingerprintKind = "CATTLE_PLAN_INTERFACE_RESULT";

function wrap(kind: CattlePlanFingerprintKind, payload: unknown): unknown {
  return { kind, cattlePlanPayloadVersion: CATTLE_PLAN_PAYLOAD_VERSION, payload };
}

export function computeCattlePlanFingerprint(kind: CattlePlanFingerprintKind, payload: unknown, hash: CattleHash): AssessmentFingerprint {
  return computeAssessmentFingerprint(wrap(kind, payload), hash);
}

export function verifyCattlePlanFingerprint(kind: CattlePlanFingerprintKind, payload: unknown, expected: AssessmentFingerprint, hash: CattleHash): FingerprintVerificationResult {
  return verifyAssessmentFingerprint(wrap(kind, payload), expected, hash);
}
