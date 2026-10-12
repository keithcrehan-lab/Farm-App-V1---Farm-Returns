# Cattle C10 — Cattle UX

Predecessor: C9 (frozen by the campaign receipt `receipts/C9.json`)
Phase directories (new): `src/app/(app)/cattle/`, `src/components/cattle/`, `src/domain/cattle/presentation/`
Verify command: `npx vitest run cattle src/components/shell --maxWorkers=1 && npm run typecheck && npm run lint`

## Phase contract (Shared Cattle Architecture & Conformance v1)

Read `docs/farm-return-next/cattle/index.md` first, then only the shared documents it routes you to. CAT-INV ids are defined in `docs/farm-return-next/cattle/INVARIANTS.md`; this phase's interface contract is its section of `docs/farm-return-next/cattle/PHASE_INTERFACES.md`. The canonical input boundary (CAMPAIGN.md, "Canonical input contract", 2026-10-12) applies: entry points check the complete input with `toCanonicalPlainData` and reject non-canonical input; engines reason only over detached canonical plain data; malformed canonical data fails closed. This contract does not expand the scope below.

- **Outcome:** farmer-facing herd/animal/timeline experience rendering canonical Cattle outputs honestly.
- **Owner:** presentation view-models, screens, display formatting.
- **Inputs:** published C1–C8 outputs and evidence packs only.
- **Outputs:** display structures with distinct honest states; screens.
- **Invariants:** CAT-INV-009, 014, 017, 019, 022, 023.
- **Temporal model:** renders the `effectiveAt`/`knowledgeCutoff` it was given; never computes them; UTC values rendered deterministically.
- **Identity model:** displays domain ids; never derives new ones.
- **Semantic equality:** display only; formatting never feeds back into domain calls.
- **Status / evidence precedence:** `docs/farm-return-next/cattle/ARCHITECTURE.md` §Status and evidence precedence: declare the REQUIRED inputs of every authoritative outcome and document/test this phase's own precedence list; unresolved required evidence never surfaces as a resolved-looking state (CAT-INV-009).
- **Units / precision:** display rounding documented in view-models only (CAT-INV-019).
- **Provenance:** shows sources, evidence strength/type, assumptions and limitations from the pack.
- **Forbidden dependencies:** formulas in components; independent eligibility, ADG, obligation state or ranking; mock data for real accounts. See also `PHASE_INTERFACES.md` common contract.
- **Human gates:** product decision gate (UX meaning); frozen-contract gate. Use the stop conditions and gate-token discipline below.
- **FAIL_TO_PASS test matrix:** every unknown/conflict/blocked/review/no-target/no-goal/in-withdrawal/no-recommendation state has a distinct honest display state; real-account mode renders no synthetic data; view-models perform no calculation (inputs → identical semantic values). Use the shared kit (`src/tooling/cattle-conformance`) where a check fits; table-driven, no Cartesian suites.
- **PASS_TO_PASS regression surface:** frozen C0/C1/C2 suites and every earlier frozen phase suite under `src/domain/cattle`; conformance kit self-tests (`src/tooling/cattle-conformance`); directly affected predecessor integrity tests.
- **Freeze definition:** `docs/farm-return-next/cattle/VERIFICATION.md` §Freeze definition (targeted + required conformance checks + PASS_TO_PASS + full quality gate + strict whole-phase audit CRITICAL=HIGH=MEDIUM=0).

## Campaign context

- Campaign contract: `.agent/campaigns/cattle-engine-v1/CAMPAIGN.md` (locked architecture, rule classes, hard-gate principle, veterinary boundary, evidence-pack contract).
- Build skill: `.agent/skills/cattle-evidence-rules.md`.
- C0 (evidence/rule architecture) is FROZEN at `61c1124d8f206fc4d442fe7814e010a2edb0a186`; C1 (canonical animal lifecycle) is FROZEN at `c5b25f23aefbd11267fc9ef53d235548de84cc27`. Read the "Cattle C0" and "Cattle C1" sections of `docs/farm-return-next/DOMAIN_CONTRACTS.md` and every earlier campaign phase section (Cattle C2 onwards) before designing; this phase builds on those exports and must not re-implement them.
- Product thesis: Farm Return understands what is physically happening on the farm, translates it into financial value and tells the farmer which action most likely improves return next (Observe → Understand → Value → Prioritise → Explain → Act → Measure → Learn). Cattle owns animal truth; Plan consumes Cattle outputs later and never holds a second copy.

## Engineering constraints (every cattle phase)

1. Pure, deterministic TypeScript domain modules with focused Vitest tests. No React, no persistence, no database schema, no migration, no network call, no AI/model call, no connector, no new npm dependency (unless this brief explicitly says otherwise).
2. Frozen code: do not modify any existing module under `src/domain/cattle/` that an earlier phase created. The only permitted change to earlier-phase files is appending additive `export * from "./<new module>";` lines to `src/domain/cattle/index.ts`. Reuse earlier exports (C0 `rule.ts`, `evaluation.ts`, `evidence-pack.ts`, `source.ts`, `information.ts`, `integrity.ts`; C1 `animal-ledger.ts`, `animal-snapshot.ts`, `animal-register.ts`; and the modules of every frozen later phase). If correctness genuinely requires changing an earlier module, stop with the frozen-contract gate (see "Stop conditions").
3. Never create a file named `types.ts` anywhere under `src/domain/` (the harness classifies it as a shared contract); use descriptive module names. Never edit `src/lib/farm-data/`, `src/types/`, `src/domain/types.ts`, `package.json`, lockfiles, `tsconfig.json`, lint/test/Next configs, `supabase/` or any `.sql` file.
4. `docs/farm-return-next/DOMAIN_CONTRACTS.md`: append exactly one new section for this phase at the end of the file (same style as the "Cattle C1" section: modules, contracts, reuse decisions, known limitations, exclusions). Never edit or remove an existing line. Do not edit `BUILD_STATE.json`, `IMPLEMENTATION_LOG.md`, campaign files, receipts or harness scripts — the campaign closure records the phase.
5. Bitemporal discipline: every projection takes explicit `effectiveAt` (valid time) and `knowledgeCutoff` (knowledge time) arguments; no clock read (`Date.now`, `new Date()` without an argument, `performance.now`) anywhere in the deterministic path. Instants are strict UTC strings compared by instant using C1's comparison convention (`animalInstantKey`), never by spelling and never through locale/timezone conversion. Effective time is separate from received/knowledge time. A projection at an earlier knowledge cutoff stays reproducible after later corrections.
6. Append-only history: corrections and supersession are new records that reference earlier ids; nothing is deleted or rewritten. Same id + identical content is idempotent; same id + different content fails closed. Competing live corrections remain CONFLICTING (no latest-wins, no source precedence) unless an explicit, sourced precedence rule exists — and no such rule exists in this campaign.
7. Determinism and aliasing: input cloned once, validated, rebuilt from known fields and deep-frozen; caller objects never retained or re-read; output order independent of input order; returned values detached and frozen.
8. Fingerprints reuse `computeCattleFingerprint`/`verifyCattleFingerprint` (C0, built on `assessment-integrity.ts` canonicalisation) with a NEW distinct `kind` string and payload version for each new payload type. Never alter an existing kind, payload version or canonicalisation rule. A fingerprint is change detection, never a signature.
9. UNKNOWN is never zero, false, empty, assumed or a plausible-looking value. Missing evidence ⇒ an explicit UNKNOWN / INSUFFICIENT_EVIDENCE state; malformed evidence ⇒ fail closed (INVALID / rejected), never repaired or coerced. Conflicting evidence stays CONFLICTING.
10. Keep the information classes distinct (FACT, OBSERVATION, INTENT, RULE, DERIVED_VALUE, PREDICTION, OBLIGATION_OR_CONSTRAINT, RECOMMENDATION). Never promote an inference to a fact, advice to law, intent to fact or a prediction to an observation.
11. Content discipline: tests and examples use obviously fictional `SYNTH-*` identifiers, synthetic rules, synthetic sources and synthetic numbers. Never encode a real Irish/EU legal duty, deadline, scheme condition, veterinary schedule, medicine/product fact, withdrawal period, dose, biological target, growth constant, price or cost. The engine ships with an EMPTY production catalogue for any such content; real content arrives later through a separately authorised, evidence-reviewed task using the C0 rule/source/review lifecycle.
12. Hard gates precede optimisation: a FAIL, UNKNOWN, CONFLICTING, UNSUPPORTED or REVIEW_REQUIRED hard gate is never overridden by a favourable performance or economic result.
13. No AI layer is authoritative. Nothing in this phase calls a model.
14. Never duplicate an existing `src/domain/` or `src/lib/farm-data/` calculation or query — call the existing export. If generic machinery (for example an append-only bitemporal record ledger) is needed by more than one cattle phase and no earlier phase exports it, the first phase that needs it implements it once as a generic module inside its own directory; later phases import it rather than copying it.

## Gate-token discipline (mandatory)

The campaign orchestrator treats any of the following exact tokens appearing ANYWHERE in a build/fix report or an audit artifact as a human stop:
`SCIENTIFIC_DECISION_REQUIRED`, `REGULATORY_INTERPRETATION_REQUIRED`, `VETERINARY_DECISION_REQUIRED`, `EXPERT_VALIDATION_REQUIRED`, `EXTERNAL_EVIDENCE_REQUIRED`, `SOURCE_PRECEDENCE_DECISION_REQUIRED`, `PRODUCT_DECISION_REQUIRED`, `MIGRATION_APPROVAL_REQUIRED`, `FROZEN_CONTRACT_CHANGE_REQUIRED`, `TASK_SCOPE_EXPANSION_REQUIRED`, `DESTRUCTIVE_GIT_ACTION_REQUIRED`, `PUSH_OR_DEPLOY_REQUIRED`, `UNSUPPORTED_EXTERNAL_API_ASSUMPTION`, `SECRETS_OR_CREDENTIALS_REQUIRED`, `PRODUCTION_ACCESS_REQUIRED`, `CONFLICTING_EVIDENCE`.

Therefore:
- Builders/fixers write one of these tokens only when genuinely stopping, as a line `STOP: <TOKEN> — <one-sentence reason>` (or `BUILD_RESULT: BLOCKED <TOKEN> — <reason>`), and never mention them otherwise (never "no X was needed", never quoting this list).
- In code, identifiers/state names must not equal these tokens. Use the domain vocabulary in this brief (for example the C1 state name for conflicting evidence lives in already-frozen code and is fine; new code should use names such as `CONFLICT` / `EVIDENCE_CONFLICT` for new states, `INSUFFICIENT_EVIDENCE`, `UNKNOWN`, `BLOCKED`, `REVIEW_REQUIRED`). In reports, describe conflict handling in lower-case prose.
- Auditors raise a gate token only to raise that gate.

## Objective

Build the farmer-facing Cattle experience over the completed, verified cattle domain engines. Product promise: Know every animal. Know where it's going. Know whether it's on track. The UI displays domain outputs; it never calculates science or money and never invents a value.

## Required reading before UI work

- `.agent/PRODUCT_RULES.md` (binding product principles and screen workflow) and the relevant `node_modules/next/dist/docs/` guides for any Next.js API used (this Next.js version has breaking changes).
- Existing visual system and patterns: `src/components/shell/*` (PageHeader, nav-items, AppShell), `src/components/ui/*`, `src/app/(app)/livestock/*`, `src/components/farm/*`, `src/app/globals.css` tokens. Reuse them; do not introduce a new design system, generic SaaS dashboard chrome, chart library or dependency.

## Scope

1. Presentation view-models (`src/domain/cattle/presentation/`): pure functions that select and shape already-derived domain outputs (C1 snapshot, C2 obligation states, C3 health timeline/withdrawal gate, C4 weights, C5 performance results, C6 goals, C7 programme status, C8 recommendations + evidence packs) into display structures with explicit status labels. Formatting only (units, dates as supplied UTC values rendered deterministically, rounding for display explicitly documented); no new calculation. Every UNKNOWN/INSUFFICIENT/CONFLICT/BLOCKED/REVIEW state maps to a distinct, honest display state — never zero, blank-as-OK, a default or a green tick.
2. Screens under `src/app/(app)/cattle/` using existing app layout conventions:
   - Herd overview: animals with official identity, current goal, latest-known weight (with method/source), performance status vs explicit target (or "no target"), outstanding obligations/programme actions count by state, top recommendation status; filters by group scope.
   - Animal detail: official identity (all schemes, history), lifecycle, goal(s) and history, weights series, performance (ADG with trace summary), obligations, health programme status, health/medicine timeline with withdrawal status, recommendations with evidence/explanation (deterministic structured explanation from the evidence pack: reason, regulatory status, evidence strength/type, sources, assumptions, limitations, unknowns).
   - Animal timeline: unified chronological view (facts, observations, health events, goals) distinguishing information classes visually (fact vs observation vs intent vs derived vs recommendation).
3. Data source honesty: there is no canonical cattle persistence yet (no migration is authorised). For a configured/real signed-in account the Cattle screens must render an honest empty/unavailable state ("no canonical cattle records connected yet") and must never render synthetic or mock data. Only when Supabase is NOT configured (local demonstration mode, `isSupabaseConfigured()` false) may the screens render a clearly labelled synthetic demonstration herd built from `SYNTH-*` fixtures through the real domain engines. Do not adapt the legacy `livestock_individuals` data into canonical records (it lacks required knowledge-time provenance); do not modify `src/lib/farm-data/`.
4. Entry point: add the Cattle screens to navigation following `src/components/shell/nav-items.ts` conventions (and its tests), and/or a link from the existing Livestock page; do not remove or rename existing Livestock navigation or behaviour.
5. Accessibility and responsiveness consistent with existing screens (semantic headings, labels, keyboard focus, mobile layout via existing shell).
6. Component tests (Vitest + existing testing-library setup) with synthetic data for each screen and every honest state (unknown, conflict, blocked, review required, no target, no goal, in withdrawal, no recommendation), plus a test proving real-account mode renders no synthetic data.
7. DOMAIN_CONTRACTS.md section "Cattle C10 — Cattle UX" (presentation contracts, data-source honesty, limitations); no other docs required.

## Out of scope

- Any calculation (science, finance, performance, obligation logic) in React components or presentation modules beyond display formatting.
- Persistence, server actions writing data, API routes, migrations, schema, connectors, auth changes.
- Changing earlier cattle modules (except additive barrel exports), Plan kernel, legacy Livestock behaviour, `src/lib/farm-data/`, `src/domain/types.ts`, configs, `package.json`.
- AI/LLM narrative; new dependencies; generic dashboard UI.

## Required tests

1. presentation view-models: each domain state maps to its distinct display state; unknown never rendered as zero/OK; snapshot of structured explanation derived only from evidence-pack fields;
2. herd overview, animal detail and timeline render with synthetic data;
3. honest-state rendering for unknown, conflict, blocked, review required, no goal, no target, in withdrawal, no recommendation;
4. real-account mode (Supabase configured) renders the honest unavailable state and no `SYNTH-*` data;
5. information classes visually distinguished (fact vs observation vs intent vs derived vs recommendation) — assert labels;
6. navigation entry present; existing navigation tests still pass;
7. no domain calculation imported into components except presentation view-model calls (static import test or review).

## Acceptance criteria

- Cattle screens implemented over domain outputs per the product promise using the existing visual system; tests pass; typecheck, lint and (at freeze) build pass.
- No calculation in UI; no fabricated/mock figure to a real account; unknown states honest.
- No persistence/migration/schema/connector/dependency change; earlier phases and Plan unchanged.
- DOMAIN_CONTRACTS.md "Cattle C10" section appended; strict full-phase audit CRITICAL=0 HIGH=0 MEDIUM=0.
- Manual checks documented in the build report: `/cattle` herd overview, an animal detail page and the timeline in local demonstration mode; real-account empty state.

## Stop conditions

Stop with a `STOP: <TOKEN> — reason` line instead of improvising when:
- delivering the experience requires persistence or a schema change — migration gate;
- a product/UX choice is not settled by PRODUCT_RULES or existing patterns (for example replacing Livestock navigation) — product decision gate;
- an earlier phase's module, the Plan kernel or a shared contract must change — frozen-contract gate;
- production data access or credentials would be needed — production access gate.
