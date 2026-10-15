/**
 * Cattle C8 — phase-local fingerprint wrapper (FINGERPRINTS.md; template: C2
 * `regulatory/obligation-integrity.ts`).
 *
 * Reuses the `assessment-integrity.ts` canonicalisation and SHA-256 pipeline
 * unchanged, wrapping each payload as
 * `{kind, recommendationPayloadVersion, payload}` — a wrapper key distinct
 * from C0 `cattlePayloadVersion`, C1 `animalSnapshotPayloadVersion`, C2
 * `obligationPayloadVersion`, C3 `healthPayloadVersion`, C4
 * `weightPayloadVersion`, C5 `performancePayloadVersion`, C6
 * `goalPayloadVersion` and C7 `programmePayloadVersion`, so no existing kind,
 * payload version or canonicalisation changes.
 *
 * Kinds (FINGERPRINTS.md purposes):
 * - `CATTLE_RECOMMENDATION_CONTEXT` — one animal's sealed evaluation context
 *   (both canonical times, every consumed predecessor output binding, the
 *   admitted C8 registry, models, sources, reviews and economic resolutions);
 * - `CATTLE_RECOMMENDATION_RECORD` — one animal's recommendation (context,
 *   candidate evaluations, ranking, C0 pack and record);
 * - `CATTLE_RECOMMENDATION_HERD` — the herd result (per-animal record
 *   fingerprints and the herd ordering);
 * - `CATTLE_RECOMMENDATION_MODEL_CONTENT` — a model's material content
 *   (role, expected effect, value form), bound into its reviewed C0 rule
 *   version's `assumptions` (semantic fingerprint, purpose 2; keys as sets).
 * A fingerprint is change detection, never a signature.
 */

import {
  computeAssessmentFingerprint,
  verifyAssessmentFingerprint,
  type AssessmentFingerprint,
  type FingerprintVerificationResult,
} from "../../assessment-integrity";
import type { CattleHash } from "../integrity";

export const CATTLE_RECOMMENDATION_PAYLOAD_VERSION = 1;

export type CattleRecommendationFingerprintKind =
  | "CATTLE_RECOMMENDATION_CONTEXT"
  | "CATTLE_RECOMMENDATION_RECORD"
  | "CATTLE_RECOMMENDATION_HERD"
  | "CATTLE_RECOMMENDATION_MODEL_CONTENT";

function wrap(kind: CattleRecommendationFingerprintKind, payload: unknown): unknown {
  return { kind, recommendationPayloadVersion: CATTLE_RECOMMENDATION_PAYLOAD_VERSION, payload };
}

export function computeRecommendationFingerprint(kind: CattleRecommendationFingerprintKind, payload: unknown, hash: CattleHash): AssessmentFingerprint {
  return computeAssessmentFingerprint(wrap(kind, payload), hash);
}

export function verifyRecommendationFingerprint(
  kind: CattleRecommendationFingerprintKind,
  payload: unknown,
  expected: AssessmentFingerprint,
  hash: CattleHash,
): FingerprintVerificationResult {
  return verifyAssessmentFingerprint(wrap(kind, payload), expected, hash);
}
