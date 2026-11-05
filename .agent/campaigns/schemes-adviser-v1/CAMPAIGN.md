# Schemes Adviser v1 — Campaign Contract

## Purpose

Turn Farm Return Schemes into one canonical, source-pinned, database-backed adviser. For each scheme it answers: is this relevant, what can Farm Return already prove, what is missing, what is the eligibility state, what is it worth where the sources support a calculation, and what must happen by when.

This campaign builds on `docs/product/schemes/SCHEMES_ARCHITECTURE_V1.md` and the commits `af3b547`, `cf9a4b3` and `a5d049b`. It is run by `scripts/agent-campaign-run schemes-adviser-v1` under `AUTONOMY.md`.

## Approved scope (product-owner direction, 2026-11-05)

1. One canonical source-pinned, database-backed Schemes architecture. The older parallel eligibility implementation (`src/domain/scheme-registry.ts`, `scheme-eligibility.ts`) is migrated away from, not expanded.
2. Schemes are implemented one at a time against the formal Scheme Implementation Standard (S0).
3. Every material eligibility condition, obligation, deadline, payment rule, cap, exception, exclusion, reduction, penalty and evidence requirement is a row in a Requirement Register, or is explicitly recorded as unsupported.
4. Canonical Farm/Fields/Cattle/Soil facts are reused. Schemes owns only scheme-specific facts.
5. Deterministic engines own eligibility, payment/value, deadlines and readiness. AI may explain; it never decides or overrides.
6. Farmer-facing scheme detail shows overview, current eligibility, maximum/current/confirmed value where supported, requirements, actions/deadlines, missing information and source/provenance.
7. Missing canonical data routes to the exact owning workflow and returns to the originating requirement.
8. Combined value distinguishes recurring annual support, capital grants and other incomparable value types. Incomparable values are never summed into one figure.
9. Opportunity discovery is conservative and deterministic.
10. The AI Scheme Adviser uses retrieval over pinned scheme sources plus deterministic engine outputs and authorised farm context. Model memory is never a rule source.
11. Scheme versions are year/version specific. A historical result retains the version it used.
12. No scheme becomes LIVE until source completeness, requirement completeness, rule correctness, payment correctness and UI honesty are independently audited.

## Invariants

- SCH-INV-001: UNKNOWN is never zero, false, empty or assumed. Missing, conflicting, invalid and unsupported stay distinct.
- SCH-INV-002: every rule, threshold, date, rate, cap and penalty traces to one pinned source version with a content fingerprint. No fallback to an unsourced, stale or other-year value.
- SCH-INV-003: every fact has one canonical owner. A farmer is never asked again for a fact Farm Return can safely read from its owner.
- SCH-INV-004: a missing integration is a system gap, never presented as farmer-missing data.
- SCH-INV-005: 100% readiness never means eligible. Readiness is computed over unique applicable data points.
- SCH-INV-006: value is classified as maximum, current or confirmed. A figure is never promoted to a stronger class than its evidence supports.
- SCH-INV-007: formulas live in `src/domain/`. UI renders engine output and never recomputes it.
- SCH-INV-008: results are reproducible for the version they used. A new version adds a row; it never rewrites an old one.
- SCH-INV-009: farm identity is bound server-side. No cross-farm read or write, and adviser access is not widened by this campaign.
- SCH-INV-010: AI output cannot change, replace or fabricate an eligibility state, a value, a deadline or a requirement.
- SCH-INV-011: a recommended window is not a hard deadline. A hard deadline needs an exact versioned source.
- SCH-INV-012: no mock or fabricated figure reaches a real signed-in account.

## Source hierarchy

Highest authority first:

1. EU and Irish legislation, and the official scheme terms and conditions for the exact scheme year.
2. DAFM official scheme publications, circulars and service pages for that year.
3. Delivery-body material named by DAFM for that scheme (for example ICBF for SCEP actions).
4. Teagasc and other recognised advisory material, as explanation and worked examples only. It never overrides tiers 1–3.

Model memory, unsourced summaries, press coverage and other-year documents are not rule sources. A press release can establish a date or announcement only where no higher tier addresses it. Where two sources disagree, or a lower tier appears to extend a higher one, the phase stops for a source-precedence decision. The builder does not choose.

## Evidence intake

- Source material lives in `docs/evidence/schemes/<scheme>/` (`scep-2026*` for the existing SCEP extracts).
- Builders and fixers do not browse the web or fetch sources. They use what the repository holds. The human adds source material between phases as a docs commit; the runner allows docs commits between phases.
- A local extract that says it is not a copy of the source proves only the facts it lists. It cannot prove completeness. A completeness claim needs the whole source document, or a repository record of who reviewed the whole document against the register and when.

## Requirement semantics: unsupported or stop

Two different situations, never confused:

- **Unsupported, no stop.** The authoritative source is present and clear, but Farm Return cannot evaluate the requirement (for example no data feed, or only DAFM can determine it). Record the row as `UNSUPPORTED` with the source reference. The engine returns an unresolved state for it, never a pass. The scheme stays not LIVE where the row is material to the claim being made.
- **Stop.** The source is absent, incomplete, ambiguous or conflicting, so Farm Return cannot establish what the requirement says. This is a STOP with the matching gate token, never an assumption.

## Database content and migrations (runner constraint)

The runner refuses any `.sql` or `supabase/migrations/` path in a campaign phase, and a receipt can only record migration status NONE. No manifest entry can change that. Also, only docs/tooling commits may sit between phases, so a migration commit cannot be placed mid-campaign. Therefore:

- No phase writes or applies a migration, or changes the schema.
- Each scheme phase produces a typed, fingerprinted **content pack** in its own domain directory and a **seed packet** document giving the exact rows a later migration must load.
- Content packs are reviewed inputs and test fixtures. Runtime code reads scheme content from the database only and never falls back to a content pack.
- A scheme with no verified, enabled stored version shows nothing new to the farmer. Audited and frozen here means **ready for seeding**; it does not mean LIVE.
- S11P2 consolidates every seed packet. Loading them is a separately authorised migration task after this campaign. A phase whose acceptance truly cannot be met without a schema or data migration stops for migration approval.

## Legacy migration rule

`scheme-registry.ts`, `scheme-eligibility.ts`, `support-opportunity.ts` and `support-profile.ts` are in the frozen contract inventory, so the runner permits only additive edits to them. This campaign never deletes or rewrites them.

- Cutover is per scheme and in the Schemes UI. The legacy assessment for a scheme is suppressed only when a verified, enabled stored version exists for that scheme. Until then existing behaviour stays, so no farmer loses a result, and one scheme is never shown from both systems.
- Removing the frozen modules is a separately authorised task after the campaign.

## Phase sequence

A later phase depends only on frozen predecessor contracts. P1 of a scheme freezes its source pack and register; P2 implements against that frozen register.

| Phase | Outcome |
|---|---|
| S0 | Scheme Implementation Standard and canonical architecture/migration contract |
| S1 | SCEP 2026 source completeness and exhaustive atomic Requirement Register |
| S2 | SCEP deterministic completion and canonical Farm/Cattle integration |
| S3P1 | Scheme detail experience, exact missing-data routing and return, source disclosure |
| S3P2 | AI adviser interface and retrieval contract |
| S4P1 / S4P2 | BISS source pack and register / deterministic implementation and legacy cutover |
| S5P1 / S5P2 | CRISS source pack and register / implementation |
| S6P1 / S6P2 | Eco Scheme source pack and register / implementation |
| S7P1 / S7P2 | ANC source pack, register and designation evidence / implementation and legacy cutover |
| S8P1 / S8P2 | TAMS 3 source pack and register / standard and Young Farmer paths, legacy cutover |
| S9P1 / S9P2 | ACRES source pack and register / implementation preserving programme complexity |
| S10P1 / S10P2 | Young Farmer supports source pack and register / implementation and legacy cutover |
| S11P1 | Farm-level dashboard, aggregate-value taxonomy, opportunity discovery |
| S11P2 | Cross-scheme adviser queries and consolidated seed readiness |

## Common phase rules (binding on every brief)

1. Stay inside the manifest `scope_guard` and `allowed_shared_paths`. The runner enforces this mechanically. Earlier phases' directories are frozen.
2. Never edit `src/domain/cattle/`, fertiliser/nutrient modules, `package.json`, lockfiles, configs, `supabase/` or any `.sql` file. Never create a file named `types.ts` under `src/domain/`. No new npm dependency.
3. `src/lib/farm-data/` and `docs/farm-return-next/DOMAIN_CONTRACTS.md` accept added lines only, where the manifest lists them. Removing a line stops the campaign. Append one section per phase to `DOMAIN_CONTRACTS.md`.
4. Production numbers need a `docs/evidence-register.md` row and a source reference. Tests use exact boundary values from the pinned source, and `SYNTH-*` fixtures wherever the test does not depend on a real rule.
5. Do not edit `BUILD_STATE.json`, `IMPLEMENTATION_LOG.md`, this directory's files, receipts or harness scripts. The runner records closure. A brief is immutable once its phase has started.
6. No push, deploy, production access or secrets. No clock read in deterministic paths; the evaluation date is an input.
7. Reuse existing exports. Do not duplicate a `src/domain/` or `src/lib/farm-data/` calculation or query. Consume canonical owners rather than copying their data.

## Gate-token discipline

The runner treats these exact tokens anywhere in a build/fix report or audit artifact as a human stop:
`SCIENTIFIC_DECISION_REQUIRED`, `REGULATORY_INTERPRETATION_REQUIRED`, `VETERINARY_DECISION_REQUIRED`, `EXPERT_VALIDATION_REQUIRED`, `EXTERNAL_EVIDENCE_REQUIRED`, `SOURCE_PRECEDENCE_DECISION_REQUIRED`, `PRODUCT_DECISION_REQUIRED`, `MIGRATION_APPROVAL_REQUIRED`, `FROZEN_CONTRACT_CHANGE_REQUIRED`, `TASK_SCOPE_EXPANSION_REQUIRED`, `DESTRUCTIVE_GIT_ACTION_REQUIRED`, `PUSH_OR_DEPLOY_REQUIRED`, `UNSUPPORTED_EXTERNAL_API_ASSUMPTION`, `SECRETS_OR_CREDENTIALS_REQUIRED`, `PRODUCTION_ACCESS_REQUIRED`, `CONFLICTING_EVIDENCE`.

- Builders and fixers write a token only when genuinely stopping, as `STOP: <TOKEN> — <one-sentence reason>` or `BUILD_RESULT: BLOCKED <TOKEN> — <reason>`. They never mention one otherwise, including "none was needed" or quoting this list.
- Code identifiers and register states never equal a token. Use `UNSUPPORTED`, `UNKNOWN`, `REVIEW_REQUIRED`, `EVIDENCE_CONFLICT`, `INSUFFICIENT_EVIDENCE`.
- Auditors raise a token only to raise that gate.

## Audit focus (binding on Codex for every phase, as applicable)

Test and report on:

- source completeness and source-to-rule traceability;
- Requirement Register completeness against the source pack;
- exact threshold and date boundaries, including the value on each side of every boundary;
- UNKNOWN, missing and conflicting evidence semantics;
- canonical data ownership and duplicate-data avoidance;
- payment/value maths, caps and reductions, and classification as maximum/current/confirmed;
- version/year isolation and historical reproducibility;
- no stale or unsourced rule fallback, including no runtime fallback to a content pack;
- no UI/domain formula divergence;
- no AI path that can override or fabricate a deterministic result;
- exact missing-data routing and return behaviour;
- source/version mismatch and source-fingerprint integrity.

A finding needing regulatory interpretation, source precedence, external evidence or a product decision carries a `STOP:` line. It is not an engineering repair.

## Definition of done

**Phase:** build, deterministic verification, primary audit, bounded remediation, then a strict whole-phase Codex audit with `CRITICAL=0 HIGH=0 MEDIUM=0`, phase verify and full quality gate passing at the freeze SHA, clean tree, valid receipt and docs closure commit. Low findings are recorded in the receipt.

**Scheme ready for seeding:** frozen P2 (or S2 for SCEP); register reconciled to its source pack; every row implemented, or recorded as unsupported and shown as unresolved; seed packet complete.

**Scheme LIVE:** the above, plus a separately authorised migration has loaded the seed packet and a post-load audit has confirmed source completeness, requirement completeness, rule correctness, payment correctness and UI honesty. LIVE is outside this campaign.

**Campaign:** every phase has a valid receipt in chain order and S11P2 has published the consolidated seed readiness record.

## Stop policy

See `AUTONOMY.md`. Ordinary engineering defects never stop the campaign unless they exhaust the runner's bounded repair budgets.
