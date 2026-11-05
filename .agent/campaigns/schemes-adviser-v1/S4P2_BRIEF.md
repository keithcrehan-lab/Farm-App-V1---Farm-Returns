# Schemes S4P2 — BISS Deterministic Implementation and Legacy Cutover

Predecessor: S4P1 (frozen by `receipts/S4P1.json`)
Phase directories (new): `docs/product/schemes/biss-implementation/`, `src/domain/schemes/biss/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md` (including the legacy migration rule and database content rule), `AUTONOMY.md`, the S0 standard and `LEGACY_MIGRATION_CONTRACT.md`, and the frozen BISS register.

## Objective

Implement BISS in the canonical architecture against its frozen register and prepare the per-scheme cutover from the legacy assessment.

## Scope

- Deterministic eligibility, value, deadline and readiness rules in `src/domain/schemes/biss/`, reusing the shared Schemes engine and the view registry.
- Canonical Farm and Fields facts read from their owners; scheme-owned facts only where the register requires them.
- Value classed under the S0 taxonomy. If entitlement or payment figures depend on data Farm Return cannot obtain, the value is unresolved rather than estimated.
- Per-scheme cutover: `page.tsx` suppresses the legacy BISS assessment only when a verified, enabled stored BISS version exists, so BISS is never shown from both systems and existing behaviour is otherwise unchanged.
- `docs/product/schemes/biss-implementation/SEED_PACKET.md`. One appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Any migration. Editing or deleting frozen legacy modules. BISS-derived data for other schemes (later phases consume this phase's published output). Rules not in the frozen register.

## Acceptance criteria

- Every register row maps to an engine rule and test, or to a visible unresolved state.
- With no stored BISS version, the farmer sees existing behaviour and no canonical result. Runtime never falls back to the content pack.
- UI contains no formula. Unknown is never zero or a pass.

## Required tests

- Each threshold and date at the boundary and on each side; value, caps and reductions.
- UNKNOWN, missing, conflicting and unsupported each stay distinct.
- Cutover: with and without a stored version; never both systems; never neither where legacy existed.
- Version isolation and a register-coverage test.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the register is insufficient for a material rule; a canonical fact needs a frozen-contract change; acceptance cannot be met without a migration; a choice is a product or regulatory decision.
