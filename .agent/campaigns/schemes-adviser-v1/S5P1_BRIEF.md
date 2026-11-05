# Schemes S5P1 — CRISS Source Pack and Requirement Register

Predecessor: S4P2 (frozen by `receipts/S4P2.json`)
Phase directories (new): `docs/product/schemes/criss/`, `src/domain/schemes/criss-register/`
Evidence intake: `docs/evidence/schemes/criss/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md` (invariants, source hierarchy, evidence intake, requirement semantics, common rules, gate-token discipline, audit focus), `AUTONOMY.md`, and the S0 standard.

## Objective

Publish the source pack and exhaustive atomic Requirement Register for the current CRISS version.

## Scope

- `docs/product/schemes/criss/SOURCE_PACK.md`, per the S0 contract.
- `docs/product/schemes/criss/REQUIREMENT_REGISTER.md` at this exact path, including any dependency on BISS, expressed against the frozen S4 register.
- `src/domain/schemes/criss-register/`: the typed, fingerprinted content pack.
- `docs/evidence-register.md` rows, and one appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Engine or UI behaviour (S5P2). Fetching sources from the web. Any migration.

## Acceptance criteria

- The pack makes a defensible completeness claim for the named year, or the phase has stopped.
- Every requirement has a row with a source locator. Every row is implementable, `UNSUPPORTED` with reason, or `NOT_APPLICABLE` with reason.

## Required tests

- The content pack passes the S0 validators and its fingerprint is pinned.
- Negative control: removing a row or altering a source fingerprint fails.
- Version isolation.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the source material is absent or insufficient for a completeness claim; a material requirement cannot be confidently mapped to authoritative evidence; sources conflict; wording needs regulatory interpretation.
