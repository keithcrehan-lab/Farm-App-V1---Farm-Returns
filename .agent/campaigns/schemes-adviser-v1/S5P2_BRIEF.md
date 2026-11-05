# Schemes S5P2 — CRISS Deterministic Implementation

Predecessor: S5P1 (frozen by `receipts/S5P1.json`)
Phase directories (new): `docs/product/schemes/criss-implementation/`, `src/domain/schemes/criss/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md`, `AUTONOMY.md`, the S0 standard and the frozen CRISS register.

## Objective

Implement CRISS in the canonical architecture against its frozen register.

## Scope

- Deterministic eligibility, value, deadline and readiness rules in `src/domain/schemes/criss/`, reusing the shared Schemes engine and the view registry.
- Compose the frozen S4P2 BISS output wherever CRISS depends on BISS. Never re-derive it.
- Value classed under the S0 taxonomy. Unobtainable inputs give an unresolved value, not an estimate.
- `docs/product/schemes/criss-implementation/SEED_PACKET.md`. One appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Any migration. Changes to BISS. Rules not in the frozen register.

## Acceptance criteria

- Every register row maps to an engine rule and test, or to a visible unresolved state.
- With no stored CRISS version the farmer sees no canonical result, and runtime never falls back to the content pack.
- UI contains no formula. Unknown is never zero or a pass.

## Required tests

- Each threshold and date at the boundary and on each side; value, caps and reductions.
- UNKNOWN, missing, conflicting and unsupported each stay distinct; an unresolved BISS dependency stays unresolved.
- Version isolation and a register-coverage test.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the register is insufficient for a material rule; a dependency needs a frozen-contract change; acceptance cannot be met without a migration; a choice is a product or regulatory decision.
