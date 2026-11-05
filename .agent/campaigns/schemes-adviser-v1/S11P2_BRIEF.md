# Schemes S11P2 — Cross-Scheme Adviser Queries and Seed Readiness

Predecessor: S11P1 (frozen by `receipts/S11P1.json`)
Phase directories (new): `docs/product/schemes/seed-readiness/`, `src/domain/schemes/adviser-portfolio/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md` (especially SCH-INV-010 and the database content rule), `AUTONOMY.md`, `.agent/PRODUCT_RULES.md` and the frozen S3P2 adviser contract.

## Objective

Extend the frozen adviser to cross-scheme questions under the same trust boundary, and publish the consolidated record that a separately authorised migration task needs in order to load the schemes.

## Scope

- Compose the frozen adviser and S11P1 portfolio output in `src/domain/schemes/adviser-portfolio/` so cross-scheme answers consume only deterministic results and pinned sources for each scheme's own version. Each statement cites its scheme and version.
- `docs/product/schemes/seed-readiness/SEED_READINESS.md`: per scheme, its receipt, register and content-pack fingerprints, seed packet location, unsupported rows, and the post-load audit required before LIVE; the order for loading; the legacy modules that become removable after each scheme is LIVE.
- Tests proving every seed packet and content-pack fingerprint named in the record matches the repository.
- One appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Writing or applying a migration. Marking any scheme LIVE. Removing legacy modules. Connecting a model provider. New scheme rules.

## Acceptance criteria

- A cross-scheme answer cannot state a combined figure the S11P1 aggregate does not produce, or mix versions.
- A stubbed model fabricating an interaction between schemes is rejected.
- The seed readiness record covers every scheme phase, and states clearly that no scheme is LIVE.

## Required tests

- Adversarial stub table for cross-scheme fabrication, mixed-version citation and incomparable sums.
- Fingerprint reconciliation of the seed readiness record; a negative control fails on any altered pack.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: a frozen adviser or portfolio contract would need changing; a scheme lacks a complete seed packet; adviser behaviour needs a product decision.
