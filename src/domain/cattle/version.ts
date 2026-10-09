/**
 * Cattle Engine v1, C0 — the evidence/rule architecture version stamped on
 * every rule evaluation record and Recommendation Evidence Pack, so a
 * recorded result can be reproduced against the exact contract that built it.
 */
export const CATTLE_EVIDENCE_ARCHITECTURE_VERSION = "cattle_evidence_v0.1.0" as const;

export type CattleEvidenceArchitectureVersion = typeof CATTLE_EVIDENCE_ARCHITECTURE_VERSION;

/** Increment when a fingerprinted payload's fields or normalisation change,
 * so a historical fingerprint is never silently reinterpreted. */
export const CATTLE_INTEGRITY_PAYLOAD_VERSION = 1;
