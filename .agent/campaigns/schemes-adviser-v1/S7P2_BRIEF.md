# Schemes S7P2 — ANC Deterministic Implementation and Legacy Cutover

Predecessor: S7P1 (frozen by `receipts/S7P1.json`)
Phase directories (new): `docs/product/schemes/anc-implementation/`, `src/domain/schemes/anc/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md` (including the legacy migration rule), `AUTONOMY.md`, the S0 standard and `LEGACY_MIGRATION_CONTRACT.md`, the frozen ANC register and `DESIGNATION_EVIDENCE.md`.

## Objective

Implement ANC in the canonical architecture against its frozen register, making no eligibility or value claim without authoritative designation evidence.

## Scope

- Deterministic eligibility, value, deadline and readiness rules in `src/domain/schemes/anc/`, reusing the shared Schemes engine and the view registry.
- Designation resolved only as `DESIGNATION_EVIDENCE.md` specifies. Otherwise a visible unresolved state.
- Canonical Fields and Cattle facts read from their owners through existing frozen exports.
- Per-scheme cutover from the legacy ANC assessment, under the same rule as BISS.
- `docs/product/schemes/anc-implementation/SEED_PACKET.md`. One appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Any migration. Spatial reference changes. Cattle or Fields contract changes. Rules not in the frozen register.

## Acceptance criteria

- No ANC eligibility or value is stated when designation is unresolved.
- Every register row maps to an engine rule and test, or to a visible unresolved state.
- Never shown from both systems. Runtime never falls back to the content pack. UI contains no formula.

## Required tests

- Each threshold and date at the boundary and on each side; value, caps and reductions.
- Designation known, not designated, partial, stale version and unresolved.
- UNKNOWN, missing, conflicting and unsupported each stay distinct.
- Cutover with and without a stored version. Version isolation and a register-coverage test.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: the register is insufficient for a material rule; a canonical fact or spatial resolution needs a frozen-contract change; acceptance cannot be met without a migration; a choice is a product or regulatory decision.
