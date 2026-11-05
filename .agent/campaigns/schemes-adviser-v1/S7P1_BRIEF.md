# Schemes S7P1 — ANC Source Pack, Requirement Register and Designation Evidence

Predecessor: S6P2 (frozen by `receipts/S6P2.json`)
Phase directories (new): `docs/product/schemes/anc/`, `src/domain/schemes/anc-register/`
Evidence intake: `docs/evidence/schemes/anc/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md` (invariants, source hierarchy, evidence intake, requirement semantics, common rules, gate-token discipline, audit focus), `AUTONOMY.md`, and the S0 standard.

## Objective

Publish the source pack and register for the current ANC version, and establish what authoritative designation/geographic evidence exists before any eligibility or value claim can be made.

## Scope

- `docs/product/schemes/anc/SOURCE_PACK.md`, per the S0 contract.
- `docs/product/schemes/anc/REQUIREMENT_REGISTER.md` at this exact path.
- `docs/product/schemes/anc/DESIGNATION_EVIDENCE.md`: the authoritative designation source; its version and date; how a farm's land can be resolved against it using canonical Fields data; what happens if it cannot.
- `docs/product/schemes/anc/LEGACY_RECONCILIATION.md`, for the legacy ANC `SchemeVersion`, which is `RULES_UNVERIFIED` and is not a source.
- `src/domain/schemes/anc-register/`: the typed, fingerprinted content pack.
- `docs/evidence-register.md` rows, and one appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Engine or UI behaviour (S7P2). Fetching sources or geodata from the web. Any migration. Inferring designation from location, county or farmer belief.

## Acceptance criteria

- The pack makes a defensible completeness claim for the named year, or the phase has stopped.
- Designation evidence is pinned, or designation-dependent rows are explicitly `UNSUPPORTED` and S7P2 is told to make no eligibility or value claim from them.
- Every requirement has a row with a source locator.

## Required tests

- The content pack passes the S0 validators and its fingerprint is pinned.
- Negative control: removing a row or altering a source fingerprint fails.
- Version isolation.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the source material is absent or insufficient for a completeness claim; a material requirement cannot be confidently mapped to authoritative evidence; sources conflict; wording needs regulatory interpretation.
