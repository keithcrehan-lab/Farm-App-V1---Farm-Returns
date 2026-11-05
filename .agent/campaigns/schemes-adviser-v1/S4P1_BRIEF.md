# Schemes S4P1 — BISS Source Pack and Requirement Register

Predecessor: S3P2 (frozen by `receipts/S3P2.json`)
Phase directories (new): `docs/product/schemes/biss/`, `src/domain/schemes/biss-register/`
Evidence intake: `docs/evidence/schemes/biss/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md` (invariants, source hierarchy, evidence intake, requirement semantics, common rules, gate-token discipline, audit focus), `AUTONOMY.md`, and the S0 standard.

## Objective

Publish the source pack and exhaustive atomic Requirement Register for the current BISS version, so S4P2 can implement against a frozen, source-traced contract.

## Scope

- `docs/product/schemes/biss/SOURCE_PACK.md`, per the S0 contract, from material in `docs/evidence/schemes/biss/`.
- `docs/product/schemes/biss/REQUIREMENT_REGISTER.md` at this exact path: every material requirement as one atomic row.
- `docs/product/schemes/biss/LEGACY_RECONCILIATION.md`: each rule in the legacy BISS `SchemeVersion` (`src/domain/scheme-registry.ts`) mapped to a register row or marked as not supported by the pack.
- `src/domain/schemes/biss-register/`: the typed, fingerprinted content pack, validated by the S0 validators.
- `docs/evidence-register.md` rows, and one appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Engine, payment or UI behaviour (S4P2). Fetching sources from the web. Any migration.
- Treating a legacy registry value as evidence. Legacy BISS is `RULES_UNVERIFIED` and is not a source.

## Acceptance criteria

- The pack makes a defensible completeness claim for the named year under the S0 contract, or the phase has stopped.
- Every requirement has a row with a source locator. Every row is implementable, `UNSUPPORTED` with reason, or `NOT_APPLICABLE` with reason.
- Legacy reconciliation has no unexplained entry.

## Required tests

- The content pack passes the S0 validators and its fingerprint is pinned.
- Negative control: removing a row or altering a source fingerprint fails.
- Version isolation against SCEP and other-year content.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the source material is absent or insufficient for a completeness claim; a material requirement cannot be confidently mapped to authoritative evidence; sources conflict; wording needs regulatory interpretation.
