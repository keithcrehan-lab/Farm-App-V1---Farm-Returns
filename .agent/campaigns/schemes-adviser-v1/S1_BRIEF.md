# Schemes S1 — SCEP 2026 Source Completeness and Requirement Register

Predecessor: S0 (frozen by `receipts/S0.json`)
Phase directories (new): `docs/product/schemes/scep-2026/`, `src/domain/schemes/scep-2026-register/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md` (invariants, source hierarchy, evidence intake, requirement semantics, common rules, gate-token discipline, audit focus), `AUTONOMY.md`, and the S0 standard.

## Objective

Reconcile SCEP 2026 source-pinned material against every eligibility, payment, obligation, deadline, penalty, reduction and exception rule, and publish an exhaustive atomic Requirement Register. Unsupported requirements are surfaced explicitly, never guessed.

## Scope

- Inventory the SCEP sources in the repository: `docs/evidence/schemes/scep-2026*`, the seed migrations `20261105173128_scep_2026_seed.sql` and `20261105173401_scep_2026_weighing_source_repair.sql` (read only), `src/domain/schemes/scep-2026.ts` and its source-integrity test.
- `docs/product/schemes/scep-2026/SOURCE_PACK.md`: the pack per the S0 contract, with what each source does and does not prove, and any gap to scheme terms and conditions.
- `docs/product/schemes/scep-2026/REQUIREMENT_REGISTER.md` at this exact path: every material requirement as one atomic row.
- `docs/product/schemes/scep-2026/CODE_RECONCILIATION.md`: every existing SCEP rule, threshold, date and rate in code and seed, mapped to its register row; every mismatch listed for S2.
- `src/domain/schemes/scep-2026-register/`: the typed, fingerprinted register as a content pack, validated by the S0 validators.
- Register the sources in `docs/evidence-register.md` and append one section to `DOMAIN_CONTRACTS.md`.

The existing extracts state what they did not encode, including penalties and a determined eligible forage area below 80% of the maximum payable area. Those gaps must each be resolved from the source pack or reach a STOP. They must not be left silent.

## Out of scope

- Changing SCEP engine, payment or UI behaviour (S2 and S3P1).
- Fetching sources from the web. Any migration.
- Interpreting ambiguous wording. That is a STOP.

## Acceptance criteria

- The source pack makes a defensible completeness claim for SCEP 2026 under the S0 contract, or the phase has stopped.
- Every requirement in the pack has a row, and every row has a source locator.
- Every code/seed rule maps to a row; no row or rule is orphaned without an explicit reason.
- Every row is implementable, `UNSUPPORTED` with reason, or `NOT_APPLICABLE` with reason.

## Required tests

- The content pack passes the S0 validators and its fingerprint is pinned.
- Reconciliation test: every SCEP rule key in the existing code appears in the register.
- Negative control: removing a row or altering a source fingerprint fails.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the repository lacks the scheme terms or other material needed for a completeness claim; a material requirement cannot be confidently mapped to authoritative evidence; sources conflict; wording needs regulatory interpretation.
