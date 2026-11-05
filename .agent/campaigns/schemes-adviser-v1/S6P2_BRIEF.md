# Schemes S6P2 — Eco Scheme Deterministic Implementation

Predecessor: S6P1 (frozen by `receipts/S6P1.json`)
Phase directories (new): `docs/product/schemes/eco-scheme-implementation/`, `src/domain/schemes/eco-scheme/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md`, `AUTONOMY.md`, the S0 standard and the frozen Eco Scheme register.

## Objective

Implement Eco Scheme in the canonical architecture against its frozen register.

## Scope

- Deterministic eligibility, value, deadline and readiness rules in `src/domain/schemes/eco-scheme/`, reusing the shared Schemes engine and the view registry.
- Canonical field and farm facts read from their owners. Farmer practice choices are scheme-owned facts.
- Compose the frozen BISS output wherever the register depends on it.
- Value classed under the S0 taxonomy. A rate the source does not fix for the year stays unresolved.
- `docs/product/schemes/eco-scheme-implementation/SEED_PACKET.md`. One appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Any migration. Changes to Fields or Nutrients modules. Recommending which practice to adopt. Rules not in the frozen register.

## Acceptance criteria

- Every register row maps to an engine rule and test, or to a visible unresolved state.
- With no stored version the farmer sees no canonical result, and runtime never falls back to the content pack.
- UI contains no formula. Unknown is never zero or a pass.

## Required tests

- Each threshold and date at the boundary and on each side; each practice or option; value, caps and reductions.
- UNKNOWN, missing, conflicting and unsupported each stay distinct.
- Version isolation and a register-coverage test.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the register is insufficient for a material rule; a canonical fact needs a frozen-contract change; acceptance cannot be met without a migration; a choice is a product or regulatory decision.
