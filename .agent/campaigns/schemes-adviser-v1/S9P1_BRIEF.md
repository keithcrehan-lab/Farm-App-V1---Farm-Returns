# Schemes S9P1 — ACRES Source Pack and Requirement Register

Predecessor: S8P2 (frozen by `receipts/S8P2.json`)
Phase directories (new): `docs/product/schemes/acres/`, `src/domain/schemes/acres-register/`
Evidence intake: `docs/evidence/schemes/acres/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md` (invariants, source hierarchy, evidence intake, requirement semantics, common rules, gate-token discipline, audit focus), `AUTONOMY.md`, and the S0 standard.

## Objective

Publish the source pack and register for ACRES, preserving its programme complexity rather than collapsing it into one yes/no rule.

## Scope

- `docs/product/schemes/acres/SOURCE_PACK.md`, per the S0 contract.
- `docs/product/schemes/acres/REQUIREMENT_REGISTER.md` at this exact path, with each programme strand, action, tranche and adviser dependency the sources define represented in its own rows.
- `src/domain/schemes/acres-register/`: the typed, fingerprinted content pack.
- `docs/evidence-register.md` rows, and one appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Engine or UI behaviour (S9P2). Fetching sources from the web. Any migration. The adviser relationship access model, which is not widened here.

## Acceptance criteria

- The pack makes a defensible completeness claim for the named tranche or version, or the phase has stopped.
- Every requirement has a row with a source locator. No strand is collapsed into a single outcome.
- Every row is implementable, `UNSUPPORTED` with reason, or `NOT_APPLICABLE` with reason.

## Required tests

- The content pack passes the S0 validators and its fingerprint is pinned.
- Negative control: removing a row or altering a source fingerprint fails.
- Version and strand isolation.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the source material is absent or insufficient for a completeness claim; a material requirement cannot be confidently mapped to authoritative evidence; sources conflict; wording needs regulatory interpretation.
