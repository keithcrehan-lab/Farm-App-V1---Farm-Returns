# Cattle fingerprint model

Every Cattle fingerprint uses C0 `computeCattleFingerprint` /
`verifyCattleFingerprint`, which build on `assessment-integrity.ts`
canonicalisation and its `AssessmentFingerprint`, with SHA-256 and 64
lowercase hex digits.

- **New payloads get a new kind.** Each new payload type gets a new,
  distinct `kind` string and payload version.
- **Existing definitions are frozen.** Existing kinds, payload versions
  and the canonicalisation rules are frozen.
- **A fingerprint detects change, nothing more.** It is a plain hash, not
  a digital signature. It proves neither authenticity nor authorship.

## Three purposes

There are three purposes. Decide which one a fingerprint serves before
designing its payload.

| Purpose | Tracks | Changes when | Does NOT change when | Existing examples |
|---|---|---|---|---|
| **1. Evidence fingerprint** | Exact retained evidence/source material | Any byte of the retained material changes | — (it is exact by design) | C0 `computeSourceContentFingerprint` (`CATTLE_SOURCE_MATERIAL`); source `contentFingerprint` |
| **2. Semantic / evaluation fingerprint** | Canonical meaning used by authoritative evaluation | A material value, unit, identity, version, effective/knowledge time or status changes | Key order, input order, equivalent instant spelling, presentation formatting | C0 `CATTLE_RULE_DEFINITION`, C1 animal snapshot, C2 obligation terms (`computeObligationTermsFingerprint`) |
| **3. Result fingerprint** | Authoritative output bound to its evaluation context, rules and versions | Any input fingerprint, rule/source version, `effectiveAt`/`knowledgeCutoff`, engine/payload version or output field changes | Recomputing the same context | C0 `CATTLE_EVIDENCE_PACK`, C2 obligation state record |

## Rules for C3 to C10

1. **Decide what changes the fingerprint.** For every new kind, document
   which of the three purposes it serves, and list the material fields
   that must change it and the representational differences that must
   not.
2. **Semantic payloads use canonical forms.** Put instant keys or
   canonical instants into the payload, not the raw spelling. Sort
   unordered sets, and use canonical units.
3. **Evidence payloads keep the raw material.** Never normalise retained
   source material before hashing it.
4. **Result payloads carry their context.** Include `effectiveAt`,
   `knowledgeCutoff`, the input fingerprints or refs, the exact rule and
   source version refs, and the engine or payload version. A result
   fingerprint then binds the result to its context (CAT-INV-021).
5. **Unknown values are hashed explicitly.** An UNKNOWN value is an
   explicit state in the payload. It is never omitted, and never `0` or
   `""`. A literal `undefined` must never reach canonicalisation.
6. **Test both directions.** Use `checkFingerprintStability` from the
   conformance kit, with equivalent variants that must keep the
   fingerprint and material variants that must change it.
7. **Validate before trusting.** A fingerprint read from input (provenance
   or a source binding) is validated for shape before use (CAT-INV-024):
   the current schema version, `SHA-256` and `/^[0-9a-f]{64}$/`.
