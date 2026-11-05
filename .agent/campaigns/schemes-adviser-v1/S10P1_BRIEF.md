# Schemes S10P1 — Young Farmer Supports Source Pack and Requirement Register

Predecessor: S9P2 (frozen by `receipts/S9P2.json`)
Phase directories (new): `docs/product/schemes/young-farmer/`, `src/domain/schemes/young-farmer-register/`
Evidence intake: `docs/evidence/schemes/young-farmer/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md` (invariants, source hierarchy, evidence intake, requirement semantics, common rules, gate-token discipline, audit focus), `AUTONOMY.md`, and the S0 standard.

## Objective

Publish the source pack and register for the National Reserve, CIS-YF or their current equivalent supports, establishing from the sources which supports exist for the named year.

## Scope

- `docs/product/schemes/young-farmer/SOURCE_PACK.md`, per the S0 contract, naming the current support(s) from authoritative material.
- `docs/product/schemes/young-farmer/REQUIREMENT_REGISTER.md` at this exact path, with per-support rows and shared young-farmer facts defined once.
- `docs/product/schemes/young-farmer/LEGACY_RECONCILIATION.md`, for the legacy National Reserve Young Farmer version, which is `RULES_UNVERIFIED` and is not a source.
- `src/domain/schemes/young-farmer-register/`: the typed, fingerprinted content pack.
- `docs/evidence-register.md` rows, and one appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Engine or UI behaviour (S10P2). Fetching sources from the web. Any migration. Reusing a legacy date or age calculation as evidence.

## Acceptance criteria

- The pack makes a defensible completeness claim per support, or the phase has stopped.
- Every requirement has a row with a source locator, including exact age, head-of-holding and qualification definitions.
- Legacy reconciliation has no unexplained entry.

## Required tests

- The content pack passes the S0 validators and its fingerprint is pinned.
- Negative control: removing a row or altering a source fingerprint fails.
- Version and support isolation.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the source material is absent or insufficient for a completeness claim; which support is current cannot be established; a material requirement cannot be confidently mapped to authoritative evidence; sources conflict; wording needs regulatory interpretation.
