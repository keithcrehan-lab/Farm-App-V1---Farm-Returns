# Schemes S10P2 — Young Farmer Supports Implementation and Legacy Cutover

Predecessor: S10P1 (frozen by `receipts/S10P1.json`)
Phase directories (new): `docs/product/schemes/young-farmer-implementation/`, `src/domain/schemes/young-farmer/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md` (including the legacy migration rule), `AUTONOMY.md`, the S0 standard and `LEGACY_MIGRATION_CONTRACT.md`, and the frozen Young Farmer register.

## Objective

Implement the Young Farmer supports in the canonical architecture using shared canonical facts, reusing the TAMS 3 Young Farmer facts rather than creating a second copy.

## Scope

- Deterministic eligibility, value, deadline and readiness rules per support in `src/domain/schemes/young-farmer/`, reusing the shared Schemes engine and the view registry.
- One definition of each shared young-farmer fact across TAMS 3 and these supports. Compose frozen BISS output where the register depends on it.
- Exact calendar boundaries for age and head-of-holding rules, as the register defines them.
- Per-scheme cutover from the legacy National Reserve Young Farmer assessment, under the same rule as BISS.
- `docs/product/schemes/young-farmer-implementation/SEED_PACKET.md`. One appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Any migration. Changes to frozen TAMS 3 or BISS phases. Rules not in the frozen register.

## Acceptance criteria

- Every register row maps to an engine rule and test, or to a visible unresolved state.
- A farmer enters a shared fact once. Declared facts cannot reach a stronger state than the register allows.
- Never shown from both systems. Runtime never falls back to the content pack. UI contains no formula.

## Required tests

- Each age, date and threshold exactly at the boundary and on each side, including leap-day anniversaries.
- UNKNOWN, missing, conflicting and unsupported each stay distinct.
- Shared fact reuse across TAMS 3 and this phase.
- Cutover with and without a stored version. Version isolation and a register-coverage test.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the register is insufficient for a material rule; a shared fact needs a frozen-contract change; acceptance cannot be met without a migration; a choice is a product or regulatory decision.
