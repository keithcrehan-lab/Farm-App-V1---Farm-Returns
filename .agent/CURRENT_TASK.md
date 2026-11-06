# Task: Schemes S0 - Implementation Standard and Migration Contract

Task ID: schemes-s0-implementation-standard-and-migration-contract-20261105
Starting HEAD: 8e1e716e96584d45b42d45ac4cd791cfd90a6189
Verify command: `npx vitest run schemes/ --maxWorkers=1 && npm run typecheck && npm run lint`

# Schemes S0 — Scheme Implementation Standard and Migration Contract

Predecessor: none (builds on the Schemes foundation at `a5d049b`)
Phase directories (new): `docs/product/schemes/standard/`, `src/domain/schemes/standard/`

Binding: `.agent/campaigns/schemes-adviser-v1/CAMPAIGN.md` (invariants, common phase rules, gate-token discipline, audit focus) and `AUTONOMY.md`.

## Objective

Establish the standard every later scheme phase is built and audited against, and the safe path away from the legacy registry. This phase adds no scheme business rules, and no farmer-visible behaviour changes.

## Scope

Create these documents, at these exact paths (later phases name them as contracts):

- `docs/product/schemes/standard/SCHEME_IMPLEMENTATION_STANDARD.md`:
  - **Requirement Register contract.** One row per atomic requirement. Fields: stable id; scheme and version; kind (eligibility condition, obligation, deadline, payment rule, cap, exception, exclusion, reduction, penalty, evidence requirement); source id, version and locator; exact source wording reference; applicability; data keys and owners; implementation status (`IMPLEMENTED`, `UNSUPPORTED`, `NOT_APPLICABLE` with reason); engine rule reference; test reference.
  - **Source-pack contract.** Authority tier, publisher, title, URL, publication date, retrieval date, review record, SHA-256 fingerprint, archived location, the scheme year it governs, and what a completeness claim requires.
  - **Data ownership.** Canonical owners, the scheme-owned facts rule, and conflict handling, consistent with `SCHEMES_ARCHITECTURE_V1.md` §2–§4.
  - **Value taxonomy.** Recurring annual support, capital grant and other incomparable types; maximum, current and confirmed classes; what evidence each class needs; the rule that incomparable types are never summed.
  - **Eligibility states.** The closed set, with precedence between unknown, missing, conflicting, unsupported and review-required, reconciled against the existing `src/domain/schemes/` states. Extend those states rather than creating a competing vocabulary.
  - **AI trust boundary.** Inputs permitted, outputs permitted, and what AI may never decide.
  - **Version and update process.** New source release → new version; superseded versions retained; how historical results keep the version used.
  - **Content pack and seed packet format**, per `CAMPAIGN.md`.
  - **Phase checklist** the P1 and P2 briefs apply.
- `docs/product/schemes/standard/LEGACY_MIGRATION_CONTRACT.md`: a map of the legacy `scheme-registry.ts`/`scheme-eligibility.ts`/`support-opportunity.ts`/`support-profile.ts` exports and every current caller (including `src/app/(app)/schemes/page.tsx`, `SchemesPageClient.tsx`, `src/app/actions/support-profile.ts`, `src/lib/scheme-farmer-text.ts`, `src/domain/farm-strategy.ts`); the per-scheme cutover rule from `CAMPAIGN.md`; which phase cuts over each legacy seeded version (BISS S4P2, ANC S7P2, TAMS 3 general and YFCIS S8P2, National Reserve Young Farmer S10P2); what stays until a separately authorised removal task.

Create `src/domain/schemes/standard/`: pure TypeScript contracts and validators for the Requirement Register, source pack, content pack and seed packet, with fail-closed validation. Reuse `src/domain/schemes/contracts.ts` and `validation.ts` rather than duplicating them. Append one section to `DOMAIN_CONTRACTS.md`.

## Out of scope

- Any real scheme rule, threshold, date, rate or requirement. Fixtures use `SYNTH-*` content.
- Deleting or changing legacy functionality, any UI change, any database or migration work.
- Editing existing `src/domain/schemes/` modules. If the standard truly needs that, stop for scope.

## Acceptance criteria

- Both documents exist at the exact paths and cover every item above.
- Register, source-pack, content-pack and seed-packet validators reject: a row with no source; a source with no fingerprint or year; a source from another version; duplicate ids; an `UNSUPPORTED` row with no reason; a `NOT_APPLICABLE` row with no reason; a completeness claim with no review record.
- The legacy map is checked against actual imports and is complete.
- Existing behaviour is unchanged: all existing `schemes/` tests still pass unmodified.

## Required tests

- Table-driven validator tests: one positive control and one negative for each rejection above.
- Version isolation: a register row cannot cite a source pinned to another version.
- The verify command.

## STOP conditions

Stop with `BUILD_RESULT: BLOCKED <reason>` if the standard cannot be made consistent with `SCHEMES_ARCHITECTURE_V1.md` or the frozen contracts without a product decision, or if any requirement here needs a migration, a frozen-contract change or a real scheme fact. Follow the gate-token discipline in `CAMPAIGN.md`.
