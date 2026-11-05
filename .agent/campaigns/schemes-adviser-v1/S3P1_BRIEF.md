# Schemes S3P1 — SCEP Adviser Experience and Missing-Data Routing

Predecessor: S2 (frozen by `receipts/S2.json`)
Phase directories (new): `src/app/(app)/schemes/[schemeKey]/`, `src/components/schemes/`, `src/domain/schemes/detail/`, `docs/product/schemes/adviser-experience/`; new files `src/domain/schemes/scheme-view-registry.ts` and its test
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

Binding: `CAMPAIGN.md`, `AUTONOMY.md`, `.agent/PRODUCT_RULES.md`, the S0 standard and the frozen SCEP register. Read the relevant `node_modules/next/dist/docs/` guide before writing route code.

## Objective

Give SCEP a dedicated scheme detail experience with exact missing-data routing and return, and source/provenance disclosure, on a generic structure later schemes reuse.

## Scope

- A generic detail route and presentation model showing: overview, current eligibility, maximum/current/confirmed value where supported, requirements, actions and deadlines, missing information, and source/provenance including scheme version.
- `scheme-view-registry.ts`: the additive registry each later scheme joins, so scheme phases need no change to this phase's route.
- Exact routing: each missing canonical item links to the owning workflow's exact editor, using `src/domain/schemes/routing.ts`. After a successful save, the owner screen returns to the originating requirement.
- Wire return only in owner screens that a SCEP register requirement actually routes to. Keep the change small and additive: read `returnTo`, validate it as an internal path, and offer the return. Owner-screen domain logic and server actions stay unchanged.
- Scheme-owned facts are completed in Schemes; canonical facts only in their owner.
- Append one section to `DOMAIN_CONTRACTS.md`.

## Out of scope

- AI (S3P2). Other schemes' content. Dashboard (S11P1).
- Cattle, field or soil domain logic and persistence, even in allow-listed directories. Any migration.
- Visual claims the engine does not support.

## Acceptance criteria

- UI renders engine output only. Nothing is recomputed in a component.
- Unknown renders as unresolved, never as zero or a pass. Readiness is never presented as eligibility.
- `returnTo` rejects external and protocol-relative targets, and preserves scheme, version and requirement.
- A system gap is shown as a Farm Return gap, not as something the farmer must supply.
- Deadlines distinguish recommended windows from sourced hard deadlines.

## Required tests

- Presentation model: each eligibility state and value class renders honestly; unsupported rows are visible.
- Routing: exact owner and return for each requirement kind; open-redirect negative controls.
- Return after save in each wired owner screen; no return after a failed save.
- No fabricated figure with an empty or absent stored scheme version.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>`, using the matching gate token from `CAMPAIGN.md`, when: an owner workflow does not exist for a canonical fact; return wiring needs a change to owner domain logic or frozen contracts; farmer-facing wording or layout needs a product decision the rules do not settle.
