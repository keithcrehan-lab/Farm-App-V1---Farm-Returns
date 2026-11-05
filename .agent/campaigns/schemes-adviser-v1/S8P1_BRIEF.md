# Schemes S8P1 — TAMS 3 Source Pack and Requirement Register

Predecessor: S7P2 (frozen by `receipts/S7P2.json`)
Phase directories (new): `docs/product/schemes/tams3/`, `src/domain/schemes/tams3-register/`
Evidence intake: `docs/evidence/schemes/tams3/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md` (invariants, source hierarchy, evidence intake, requirement semantics, common rules, gate-token discipline, audit focus), `AUTONOMY.md`, and the S0 standard.

## Objective

Publish the source pack and register for TAMS 3, covering the standard and Young Farmer paths, and record exactly how complete the item and reference-cost material is.

## Scope

- `docs/product/schemes/tams3/SOURCE_PACK.md`, per the S0 contract.
- `docs/product/schemes/tams3/REQUIREMENT_REGISTER.md` at this exact path, with path-specific rows clearly separated and shared rows not duplicated.
- `docs/product/schemes/tams3/ITEM_COVERAGE.md`: which items and reference costs are completely sourced. Anything not complete is excluded and listed, not approximated.
- `docs/product/schemes/tams3/LEGACY_RECONCILIATION.md`, for the legacy TAMS 3 general (`RULES_UNVERIFIED`) and YFCIS (`CONFIRMED`) versions. Legacy status is not evidence: re-verify each legacy YFCIS value against the pack.
- `src/domain/schemes/tams3-register/`: the typed, fingerprinted content pack.
- `docs/evidence-register.md` rows, and one appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Engine or UI behaviour (S8P2). Fetching sources from the web. Any migration.

## Acceptance criteria

- The pack makes a defensible completeness claim for the named tranche or version, or the phase has stopped.
- Every requirement has a row with a source locator.
- Item coverage is explicit. Legacy reconciliation has no unexplained entry.

## Required tests

- The content pack passes the S0 validators and its fingerprint is pinned.
- Negative control: removing a row or altering a source fingerprint fails.
- Version and path isolation.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the source material is absent or insufficient for a completeness claim; a material requirement cannot be confidently mapped to authoritative evidence; sources conflict; wording needs regulatory interpretation.
