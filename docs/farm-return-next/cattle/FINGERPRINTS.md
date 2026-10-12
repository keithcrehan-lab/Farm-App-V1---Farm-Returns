# Cattle fingerprint model

Every Cattle fingerprint uses the `assessment-integrity.ts`
canonicalisation and SHA-256 pipeline unchanged
(`computeAssessmentFingerprint` / `verifyAssessmentFingerprint`). The
result is an `AssessmentFingerprint`: SHA-256 with 64 lowercase hex
digits.

- **New kinds use a phase-local wrapper.** C0 `computeCattleFingerprint`
  takes a closed `CattleFingerprintKind` union, so it cannot gain a kind
  without editing frozen `integrity.ts`. A phase that adds a fingerprinted
  payload therefore follows the C1/C2 pattern:
  - It adds a small phase-local wrapper module. C2's
    `regulatory/obligation-integrity.ts` is the template; C1 has
    `snapshotPayload` in `animal-snapshot.ts`.
  - The wrapper calls the assessment-integrity functions with
    `{kind, <phase>PayloadVersion, payload}`.
  - The wrapper's version key must be distinct from C0's
    `cattlePayloadVersion`, C1's `animalSnapshotPayloadVersion`, C2's
    `obligationPayloadVersion` and those of any earlier phase.
  - The wrapper exports its own `kind` union of new kind strings.

  Use C0 `computeCattleFingerprint` only for the four C0 kinds it already
  defines.
- **Existing definitions are frozen.** Existing kinds, payload versions
  and the canonicalisation rules are frozen.
- **A fingerprint detects change, nothing more.** It is a plain hash, not
  a digital signature. It proves neither authenticity nor authorship.

## Three purposes

There are three purposes. Decide which one a fingerprint serves before
designing its payload.

Existing fingerprints keep their implemented behaviour: the last column
gives the closest analogue, not a retrofit. The C1 snapshot fingerprint
hashes the whole snapshot, including retained instant spellings and the
query's `effectiveAt`/`knowledgeCutoff`. It is therefore
representation-sensitive: equivalent instant spellings in the input can
change it. Semantic normalisation (rule 2) applies to payloads that C3–C10
newly define.

| Purpose | Tracks | Changes when | Does NOT change when | Closest existing analogue |
|---|---|---|---|---|
| **1. Evidence fingerprint** | Exact retained evidence/source material | Any byte of the retained material changes | — (it is exact by design) | C0 `computeSourceContentFingerprint` (`CATTLE_SOURCE_MATERIAL`); source `contentFingerprint` |
| **2. Semantic / evaluation fingerprint** | Canonical meaning used by authoritative evaluation | A material value, unit, identity, version, effective/knowledge time or status changes | Key order, input order, equivalent instant spelling, presentation formatting | C2 obligation terms (`computeObligationTermsFingerprint`, `CATTLE_OBLIGATION_TERMS`) — none existing is fully spelling-normalised; new payloads must be |
| **3. Result fingerprint** | Authoritative output bound to its evaluation context, rules and versions | Any input fingerprint, rule/source version, `effectiveAt`/`knowledgeCutoff`, engine/payload version or output field changes | Recomputing the same context | C0 `CATTLE_EVIDENCE_PACK`, C1 animal snapshot (`CATTLE_ANIMAL_SNAPSHOT`, representation-sensitive), C2 obligation state record (`CATTLE_OBLIGATION_STATE`) |

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
