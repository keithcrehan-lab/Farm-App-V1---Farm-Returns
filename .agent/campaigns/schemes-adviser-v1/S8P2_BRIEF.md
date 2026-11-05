# Schemes S8P2 — TAMS 3 Canonical Implementation and Legacy Cutover

Predecessor: S8P1 (frozen by `receipts/S8P1.json`)
Phase directories (new): `docs/product/schemes/tams3-implementation/`, `src/domain/schemes/tams3/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md` (including the legacy migration rule), `AUTONOMY.md`, the S0 standard and `LEGACY_MIGRATION_CONTRACT.md`, the frozen TAMS 3 register and `ITEM_COVERAGE.md`.

## Objective

Implement TAMS 3 in the canonical architecture, on both the standard and Young Farmer paths, as a capital grant under the value taxonomy. Offer item and reference-cost capability only where the source material is complete.

## Scope

- Deterministic eligibility, value, deadline and readiness rules for each path in `src/domain/schemes/tams3/`, reusing the shared Schemes engine and the view registry.
- Canonical facts read from their owners; investment details as scheme-owned facts.
- Grant value computed only for fully covered items. Every other item is explicitly unresolved.
- Per-scheme cutover from the legacy TAMS 3 general and YFCIS assessments, under the same rule as BISS. `support-opportunity.ts` and `farm-strategy.ts` remain unchanged.
- `docs/product/schemes/tams3-implementation/SEED_PACKET.md`. One appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Any migration. Changes to frozen modules. Quote or procurement workflows. Approximate reference costs. Rules not in the frozen register.

## Acceptance criteria

- Every register row maps to an engine rule and test, or to a visible unresolved state.
- Capital value is never classed or summed as recurring support.
- Never shown from both systems. Runtime never falls back to the content pack. UI contains no formula.

## Required tests

- Each threshold, ceiling, rate and date at the boundary and on each side, per path.
- A farmer qualifying on one path and not the other. Covered and uncovered items.
- UNKNOWN, missing, conflicting and unsupported each stay distinct.
- Cutover with and without a stored version. Version isolation and a register-coverage test.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the register is insufficient for a material rule; a canonical fact needs a frozen-contract change; acceptance cannot be met without a migration; a choice is a product or regulatory decision.
