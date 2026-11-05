# Schemes S9P2 — ACRES Canonical Implementation

Predecessor: S9P1 (frozen by `receipts/S9P1.json`)
Phase directories (new): `docs/product/schemes/acres-implementation/`, `src/domain/schemes/acres/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md`, `AUTONOMY.md`, the S0 standard and the frozen ACRES register.

## Objective

Implement ACRES in the canonical architecture so the farmer sees each programme strand's state, with no single yes/no hiding its complexity.

## Scope

- Deterministic eligibility, value, deadline and readiness rules, per strand, in `src/domain/schemes/acres/`, reusing the shared Schemes engine and the view registry.
- Canonical facts read from their owners. Scheme participation and plan details as scheme-owned facts.
- Determinations only an external body can make are unresolved external states, never inferred.
- Value classed under the S0 taxonomy. Any figure dependent on an unresolved determination stays unresolved.
- `docs/product/schemes/acres-implementation/SEED_PACKET.md`. One appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Any migration. Adviser access or RLS changes. Field or spatial contract changes. Rules not in the frozen register.

## Acceptance criteria

- Every register row maps to an engine rule and test, or to a visible unresolved state.
- Strand results stay separate. An overall summary never overstates its least certain strand.
- With no stored version the farmer sees no canonical result, and runtime never falls back to the content pack. UI contains no formula.

## Required tests

- Each threshold and date at the boundary and on each side, per strand; value, caps and reductions.
- Mixed strand outcomes. External determination pending.
- UNKNOWN, missing, conflicting and unsupported each stay distinct.
- Version isolation and a register-coverage test.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the register is insufficient for a material rule; a canonical fact needs a frozen-contract change; acceptance cannot be met without a migration; a choice is a product or regulatory decision.
