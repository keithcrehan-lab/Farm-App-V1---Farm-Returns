# Schemes S11P1 — Dashboard, Value Taxonomy and Opportunity Discovery

Predecessor: S10P2 (frozen by `receipts/S10P2.json`)
Phase directories (new): `docs/product/schemes/portfolio/`, `src/domain/schemes/portfolio/`, `src/components/schemes-portfolio/`
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md`, `AUTONOMY.md`, `.agent/PRODUCT_RULES.md` and the S0 value taxonomy. Read the relevant `node_modules/next/dist/docs/` guide before writing route code.

## Objective

Give the farmer a farm-level view across frozen schemes, with a defensible aggregate-value taxonomy and conservative, deterministic opportunity discovery.

## Scope

- Pure aggregate in `src/domain/schemes/portfolio/`: recurring annual support, capital grants and other incomparable types are grouped separately; maximum, current and confirmed classes are separate; unresolved values are shown as unresolved and excluded from totals with a visible count.
- Exclusions and interactions between schemes applied only where the frozen registers state them.
- Deterministic opportunity discovery: a scheme is surfaced only from stored verified versions, register rules and canonical facts, with its reason. Insufficient data yields "cannot assess yet", never a suggestion that the farmer qualifies.
- Dashboard on `/schemes`, linking to scheme detail. Legacy cutover behaviour stays intact.
- One appended `DOMAIN_CONTRACTS.md` section.

## Out of scope

- Any new scheme rule. AI (S11P2). Any migration. Financial advice or a recommendation to enter a scheme.

## Acceptance criteria

- No single headline figure sums incomparable types or classes.
- A total is never presented as complete while a contributing value is unresolved.
- Discovery produces nothing from an unverified version or a legacy assessment.
- UI contains no formula. With no stored versions the dashboard is honest and empty of figures.

## Required tests

- Aggregate table: mixed types and classes, unresolved exclusion, mutually exclusive schemes, version isolation.
- Discovery: a positive case; negative controls for missing data, unverified version and closed window.
- No fabricated figure on a real account with empty data.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: a cross-scheme interaction is not stated by the frozen registers; an aggregate presentation needs a product decision; a change would touch a frozen scheme phase; acceptance cannot be met without a migration.
