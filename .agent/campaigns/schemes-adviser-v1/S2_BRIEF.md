# Schemes S2 — SCEP Deterministic Completion

Predecessor: S1 (frozen by `receipts/S1.json`)
Phase directories (new): `docs/product/schemes/scep-2026-implementation/`, `src/domain/schemes/scep-2026-engine/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md`, `AUTONOMY.md`, the S0 standard and the frozen S1 register.

## Objective

Complete SCEP rule, payment, action and readiness behaviour and canonical Farm/Cattle integration against the frozen S1 register, so every register row is implemented or shown as unresolved.

## Scope

- Resolve every mismatch in `docs/product/schemes/scep-2026/CODE_RECONCILIATION.md`.
- Evaluate every implementable row deterministically, in `src/domain/schemes/scep-2026-engine/` or by extending the existing SCEP and shared Schemes modules the manifest lists.
- Read Farm, Fields and Cattle facts from their canonical owners through existing frozen exports. Remove farmer re-entry wherever canonical data safely exists. Preserve UNKNOWN semantics.
- Classify payment as maximum, current or confirmed under the S0 taxonomy, with caps and reductions from the register.
- `docs/product/schemes/scep-2026-implementation/SEED_PACKET.md`: the exact stored rows a later migration must load so the database matches the frozen register, including any difference from the rows already seeded.
- Update existing tests only where the register proves the old expectation wrong, and cite the row.
- Append one section to `DOMAIN_CONTRACTS.md`.

## Out of scope

- Dedicated detail page and return wiring (S3P1), and any AI (S3P2).
- Any migration, or editing the seed files. Changes to Cattle, fertiliser or other frozen contracts.
- A rule that is not in the frozen register. A missing row is a STOP, not an added rule.

## Acceptance criteria

- Every register row maps to an engine rule and test, or to a visible unresolved state.
- Stored scheme content that differs from the register fails closed for the affected requirement. It never yields a confident result, and runtime never falls back to the content pack.
- A farmer is not asked for a fact whose canonical owner holds a usable value.
- Page and card render engine output and contain no formula.

## Required tests

- Each threshold and date from the register, at the boundary and on each side of it.
- Payment: each tier, the cap, each reduction, and the area cases the register defines, with expected values from the source's own rule.
- UNKNOWN, missing, conflicting and unsupported each produce a distinct unresolved result, never a pass and never zero.
- Version isolation: a 2026 result is unaffected by data for another version.
- Register-coverage test: a row with no implementation or unresolved mapping fails.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the register is insufficient for a material rule; a canonical fact needs a frozen-contract change; acceptance truly cannot be met without a migration; a choice is a product or regulatory decision.
