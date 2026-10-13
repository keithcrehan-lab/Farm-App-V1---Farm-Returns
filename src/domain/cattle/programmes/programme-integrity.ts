/**
 * Cattle C7 — veterinary health-programme fingerprints.
 *
 * C0's `computeCattleFingerprint` takes a closed `CattleFingerprintKind`
 * union that cannot gain a new kind without editing frozen `integrity.ts`.
 * Following the C1–C6 precedent (template: C2 `obligation-integrity.ts`), C7
 * reuses the `assessment-integrity.ts` canonicalisation and SHA-256 pipeline
 * unchanged, wrapped as `{kind, programmePayloadVersion, payload}` — a wrapper
 * key distinct from C0's `cattlePayloadVersion`, C1's
 * `animalSnapshotPayloadVersion`, C2's `obligationPayloadVersion`, C3's
 * `healthPayloadVersion`, C4's `weightPayloadVersion`, C5's
 * `performancePayloadVersion` and C6's `goalPayloadVersion`, so no
 * fingerprint can collide with, or reinterpret, an existing one.
 *
 * Kinds (FINGERPRINTS.md purposes):
 * - `CATTLE_PROGRAMME_DEFINITION` — SEMANTIC (purpose 2): the reviewed
 *   content of one programme version (instants canonical, sets sorted);
 *   veterinary reviews bind to it, so approval is version- and
 *   content-bound (CAT-INV-025).
 * - `CATTLE_PROGRAMME_ANIMAL_STATUS` / `CATTLE_PROGRAMME_STATUS` — RESULT
 *   (purpose 3): the programme state of one animal / the whole evaluation,
 *   bound to `effectiveAt`, `knowledgeCutoff`, the governing definition
 *   fingerprints and the input fingerprints (C1 snapshot, C3 projection, C2
 *   obligation records).
 * Every instant in a C7 output is in the one canonical nine-digit spelling.
 * Change detection only — not a digital signature.
 */

import {
  computeAssessmentFingerprint,
  verifyAssessmentFingerprint,
  type AssessmentFingerprint,
  type FingerprintVerificationResult,
} from "../../assessment-integrity";
import type { CattleHash } from "../integrity";

/** Increment when a C7 fingerprinted payload's fields or normalisation change. */
export const CATTLE_PROGRAMME_PAYLOAD_VERSION = 1;

export type CattleProgrammeFingerprintKind = "CATTLE_PROGRAMME_DEFINITION" | "CATTLE_PROGRAMME_ANIMAL_STATUS" | "CATTLE_PROGRAMME_STATUS";

function wrap(kind: CattleProgrammeFingerprintKind, payload: unknown): unknown {
  return { kind, programmePayloadVersion: CATTLE_PROGRAMME_PAYLOAD_VERSION, payload };
}

export function computeProgrammeFingerprint(kind: CattleProgrammeFingerprintKind, payload: unknown, hash: CattleHash): AssessmentFingerprint {
  return computeAssessmentFingerprint(wrap(kind, payload), hash);
}

export function verifyProgrammeFingerprint(
  kind: CattleProgrammeFingerprintKind,
  payload: unknown,
  expected: AssessmentFingerprint,
  hash: CattleHash,
): FingerprintVerificationResult {
  return verifyAssessmentFingerprint(wrap(kind, payload), expected, hash);
}
