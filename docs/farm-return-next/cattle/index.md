# Cattle shared architecture — index

Shared Cattle Architecture & Conformance v1 (2026-10-12). Binding for
campaign phases C3–C10 of `cattle-engine-v1`. It records the
cross-cutting lessons of C0–C2 once so later phases do not rediscover
them through audits. It does not change C0, C1 or C2.

This file is a map. Read only the documents your problem needs.

| If you are… | Read |
|---|---|
| starting any phase | this index → your phase row in `PHASE_INTERFACES.md` → the CAT-INV ids your brief lists in `INVARIANTS.md` |
| designing what a phase owns, consumes or emits | `PHASE_INTERFACES.md` (ownership, per-phase input/output contracts, forbidden dependencies) |
| deciding where input is validated or what an engine may assume | `ARCHITECTURE.md` §Canonical input boundary |
| handling `effectiveAt`, `knowledgeCutoff`, corrections, supersession, late or malformed records | `TEMPORAL_EVIDENCE.md` |
| choosing a status when required evidence is missing / conflicting / invalid | `ARCHITECTURE.md` §Status and evidence precedence |
| comparing instants, dates, identifiers, quantities, money | `NUMERIC_SEMANTICS.md` |
| touching weights, ADG, rounding, prices, exchange rates | `NUMERIC_SEMANTICS.md` |
| deciding what a fingerprint must or must not change with | `FINGERPRINTS.md` |
| writing tests, choosing what to run, classifying an audit finding | `VERIFICATION.md` |
| building C8 context assembly | `ARCHITECTURE.md` §Cattle evaluation context |

## Authority and precedence

1. `AGENTS.md`, then `.agent/campaigns/cattle-engine-v1/CAMPAIGN.md` (campaign
   contract, including the canonical input decision of 2026-10-12).
2. Frozen code and the "Cattle C0/C1/C2" sections of
   `docs/farm-return-next/DOMAIN_CONTRACTS.md` — the exact signatures this
   area refers to. Those sections win over this area on any conflict about
   frozen behaviour. Report the conflict; never "fix" frozen code.
3. This area: shared invariants and phase contracts for C3–C10.
4. The phase brief: scope, required tests, stop conditions.

Nothing here authorises real scientific, legal, veterinary or economic
content. Production catalogues stay empty until a separately authorised,
evidence-reviewed content task fills them.

## Shared executable support

- Canonical input check: `toCanonicalPlainData` in
  `src/domain/cattle/regulatory/canonical-input.ts` (frozen C2 export).
- Instants: `isValidAnimalInstant`, `animalInstantKey`, `compareInstants`
  (C1 `animal-ledger.ts`); exact UTC arithmetic in C2 `obligation-time.ts`.
- Append-only bitemporal records: `collectBitemporalRecords` /
  `resolveBitemporalRecords` (C2 `bitemporal-records.ts`).
- Fingerprints: `computeCattleFingerprint` / `verifyCattleFingerprint`
  (C0 `integrity.ts`).
- Conformance test kit (tests only):
  `src/tooling/cattle-conformance/cattle-conformance.ts`.

## Documents

- `ARCHITECTURE.md`: the canonical input boundary, trusted rule bindings,
  status precedence, the evaluation context, economic context and the AI
  boundary.
- `INVARIANTS.md`: the catalogue of invariants CAT-INV-001 to CAT-INV-027.
- `TEMPORAL_EVIDENCE.md`: the bitemporal model, admission order,
  corrections and the patterns proven in C2.
- `PHASE_INTERFACES.md`: ownership, and the C3–C10 interface contracts.
- `NUMERIC_SEMANTICS.md`: units, precision, rounding, money and semantic
  equality.
- `FINGERPRINTS.md`: evidence, semantic and result fingerprints.
- `VERIFICATION.md`: FAIL_TO_PASS and PASS_TO_PASS tests, the conformance
  kit, finding classification and the freeze definition.
