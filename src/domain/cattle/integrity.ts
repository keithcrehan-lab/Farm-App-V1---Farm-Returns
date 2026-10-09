/**
 * Cattle C0 — integrity helpers.
 *
 * Reuses `assessment-integrity.ts`'s established, fail-closed canonical form
 * (`canonicalizeValue`: sorted keys, preserved array order, `undefined`/
 * NaN/class instances rejected) and its SHA-256 fingerprint pipeline
 * (`computeAssessmentFingerprint`/`verifyAssessmentFingerprint`, caller-
 * supplied `hash`, digest-shape check) unchanged. Every cattle payload is
 * wrapped with a `kind` discriminator and `CATTLE_INTEGRITY_PAYLOAD_VERSION`
 * so a source, a rule and an evidence pack can never share a fingerprint by
 * accident. A fingerprint is a reproducibility/change-detection value, not a
 * digital signature.
 *
 * `audit-trace.ts`'s `canonicalSha256` was not chosen: its canonicaliser
 * silently drops `undefined` and coerces NaN to `null`, which would let a
 * missing value disappear from a fingerprint instead of failing closed.
 */

import {
  computeAssessmentFingerprint,
  verifyAssessmentFingerprint,
  type AssessmentFingerprint,
  type FingerprintVerificationResult,
} from "../assessment-integrity";
import { CATTLE_INTEGRITY_PAYLOAD_VERSION } from "./version";

export type CattleHash = (input: string) => string;

export type CattleFingerprintKind =
  | "CATTLE_SOURCE_MATERIAL"
  | "CATTLE_RULE_DEFINITION"
  | "CATTLE_RULE_IMPLEMENTATION"
  | "CATTLE_EVIDENCE_PACK";

function wrap(kind: CattleFingerprintKind, payload: unknown): unknown {
  return { kind, cattlePayloadVersion: CATTLE_INTEGRITY_PAYLOAD_VERSION, payload };
}

export function computeCattleFingerprint(kind: CattleFingerprintKind, payload: unknown, hash: CattleHash): AssessmentFingerprint {
  return computeAssessmentFingerprint(wrap(kind, payload), hash);
}

export function verifyCattleFingerprint(
  kind: CattleFingerprintKind,
  payload: unknown,
  expected: AssessmentFingerprint,
  hash: CattleHash,
): FingerprintVerificationResult {
  return verifyAssessmentFingerprint(wrap(kind, payload), expected, hash);
}

export function sameFingerprint(a: AssessmentFingerprint, b: AssessmentFingerprint): boolean {
  return a.schemaVersion === b.schemaVersion && a.algorithm === b.algorithm && a.digest === b.digest;
}

/** Lexicographic comparator for deterministic ordering of unordered sets. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareStrings);
}
