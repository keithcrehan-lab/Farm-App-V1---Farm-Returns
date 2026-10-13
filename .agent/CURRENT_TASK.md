# Task: Cattle C5 - Performance Engine

Task ID: cattle-c5-performance-engine-20261013
Starting HEAD: 41ee7a1670985749c6ee21f12dcbdb6b64ebffb6
Verify command: `npx vitest run src/domain/cattle src/tooling/cattle-conformance --maxWorkers=1 && npm run typecheck && npm run lint`

# Cattle C5 — Performance Engine

Predecessor: C4 (frozen by the campaign receipt `receipts/C4.json`)
Phase directory (new): `src/domain/cattle/performance/`

## Phase contract (Shared Cattle Architecture & Conformance v1)

Read `docs/farm-return-next/cattle/index.md` first, then only the shared documents it routes you to. CAT-INV ids are defined in `docs/farm-return-next/cattle/INVARIANTS.md`; this phase's interface contract is its section of `docs/farm-return-next/cattle/PHASE_INTERFACES.md`. The canonical input boundary (CAMPAIGN.md, "Canonical input contract", 2026-10-12) applies: entry points check the complete input with `toCanonicalPlainData` and reject non-canonical input; engines reason only over detached canonical plain data; malformed canonical data fails closed. This contract does not expand the scope below.

- **Outcome:** deterministic performance derivation (gain, ADG, coverage, explicit target comparison) over C4 outputs, reproducible historically.
- **Owner:** derived performance values and target comparisons.
- **Inputs:** C4 series/latest-known/quality and group scopes ONLY (never raw weight records — CAT-INV-023); supplied provenance-bound `PerformanceTarget` records; explicit supplied policies (trend, thresholds, tolerances).
- **Outputs:** `DERIVED_VALUE`s with calculation traces (gain kg, ADG kg/day), series metrics, target comparison states, optional labelled `PREDICTION`, scope aggregates over KNOWN results with unknown counts; fingerprint (new kind).
- **Invariants:** CAT-INV-009, 010, 012, 014, 018–023, 025, 027 (and 001–006 for targets/policies as supplied records).
- **Temporal model:** passes `effectiveAt`/`knowledgeCutoff` through to C4; targets and policies admitted by their own knowledge time; a later target revision never changes a historical comparison.
- **Identity model:** derived value = source observation ids + convention version; target = id + version.
- **Semantic equality:** numeric meaning in canonical units; comparisons on unrounded values.
- **Status / evidence precedence:** `docs/farm-return-next/cattle/ARCHITECTURE.md` §Status and evidence precedence: declare the REQUIRED inputs of every authoritative outcome and document/test this phase's own precedence list; unresolved required evidence never surfaces as a resolved-looking state (CAT-INV-009).
- **Units / precision:** ADG kg/day; elapsed-days convention defined, documented and tested here; tolerance only as supplied with the target; no decision rounding (CAT-INV-019).
- **Provenance:** target without provenance rejected; unreviewed target ⇒ TARGET_UNVERIFIED; trace names every input observation.
- **Forbidden dependencies:** raw C4 inputs; universal targets; legacy `livestock.ts` constants as per-animal targets; undocumented epsilon; presentation rounding in logic. See also `PHASE_INTERFACES.md` common contract.
- **Human gates:** scientific decision gate (any target, threshold or trend boundary needing a value); external evidence gate; frozen-contract gate. Use the stop conditions and gate-token discipline below.
- **FAIL_TO_PASS test matrix:** <2 usable observations ⇒ insufficient; zero/negative elapsed ⇒ invalid; conflict propagated; mixed methods reported; no target ⇒ NO_TARGET never ON_TRACK (`checkUnresolvedEvidenceNotMasked`); exact boundary comparisons unrounded; later target revision invisible at earlier cutoff; input order; fingerprint variants; aggregates never average unknown into zero. Use the shared kit (`src/tooling/cattle-conformance`) where a check fits; table-driven, no Cartesian suites.
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
8. Fingerprints reuse the `assessment-integrity.ts` canonicalisation/SHA-256 pipeline unchanged with a NEW distinct `kind` string and payload version for each new payload type. Because C0's `CattleFingerprintKind` union is closed, new kinds go through a phase-local wrapper following the C1/C2 pattern (template: C2 `regulatory/obligation-integrity.ts`, with a wrapper version key distinct from every earlier phase's); C0 `computeCattleFingerprint`/`verifyCattleFingerprint` are used only for their existing kinds (`docs/farm-return-next/cattle/FINGERPRINTS.md`). Never alter an existing kind, payload version or canonicalisation rule. A fingerprint is change detection, never a signature.
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

Build deterministic animal (and explicit-scope) performance derivation over C4 weight series: interval gain, average daily gain, trend, observation coverage, evidence completeness, comparison with an EXPLICIT provenance-bound target, uncertainty and unknown states — reproducible historically. No universal cattle target exists in this engine.

## Scope

1. Interval gain and ADG between two live observations: gain = later − earlier (kg), days = exact elapsed instant difference expressed in days with a documented, tested convention (no rounding inside the calculation; any presentation rounding is a separate explicit step), ADG = gain / days. Every derived value is a `DERIVED_VALUE` carrying a calculation trace (formula, substituted inputs with observation ids, units, convention) and inherits the weakest evidence quality of its inputs.
2. Validity rules (documented, tested): fewer than two usable observations ⇒ INSUFFICIENT_EVIDENCE; zero/negative elapsed time ⇒ INVALID; any input in conflict ⇒ EVIDENCE_CONFLICT; mixed collection methods (for example an estimate and a scale reading) are reported as a quality limitation — the engine never silently excludes or upgrades them; a minimum interval or quality threshold is applied ONLY when supplied as an explicit, provenance-bound parameter (otherwise no threshold, and the limitation is reported).
3. Series metrics over a window: lifetime/period ADG from first and last usable observations, per-interval ADG list, observation count, coverage (span, largest gap, intervals) — descriptive only. A trend classification (for example rising/falling/flat) is produced only from an explicit supplied trend policy (thresholds with provenance); absent a policy ⇒ no classification (`NO_POLICY`), never a default.
4. Target comparison: `PerformanceTarget` input contract — target metric (ADG or weight-at-date), value + unit, applicability (animal intent/goal ref, production system ref, animal constraints as supplied), validity period, provenance/source binding (C0 `SourceVersionRef` / rule version) and review state. Comparison yields `ON_TRACK` / `BEHIND` / `AHEAD` (exact, documented tolerance supplied with the target, or none) / `NO_TARGET` / `TARGET_NOT_APPLICABLE` / `TARGET_UNVERIFIED` (non-production/unreviewed target) / `INSUFFICIENT_EVIDENCE`. A target without provenance is rejected. A comparison never supplies a target itself.
5. Prediction boundary: if a projected weight at a date is produced, it is labelled `PREDICTION`, carries method and assumptions (simple linear extrapolation from observed ADG only, with explicit limitation), and is never presented as an observation; the projection is optional and must not be required by acceptance.
6. Scope aggregation: per-animal results for an explicit animal set or a C4 group scope at an instant, with distribution statistics only over animals with KNOWN results and counts of unknown/insufficient animals reported alongside (never averaged into zero).
7. Historical reconstruction at explicit `effectiveAt`/`knowledgeCutoff`; deterministic fingerprint (new kind e.g. `CATTLE_PERFORMANCE_RESULT`).
8. Barrel exports; DOMAIN_CONTRACTS.md section "Cattle C5 — Performance engine".

Reuse note: `src/domain/livestock.ts` holds legacy group-level finishing constants (for example `targetADGForAnimalType`). Do NOT import them as universal per-animal targets and do not duplicate them. A future target catalogue may wrap a sourced value as a `PerformanceTarget` only through an explicitly authorised content task.

## Out of scope

- Any built-in biological target, growth curve, breed/sex standard, ADG constant, tolerance or trend threshold.
- Goals/intent management (C6), recommendations or economics (C8), feed/concentrate modelling, UI, persistence, migrations, AI.
- Modifying `src/domain/livestock.ts`, legacy types or earlier cattle phases (except additive barrel exports).

## Required tests

Synthetic data only. At least:
1. exact ADG for known pairs (including sub-day and multi-month intervals) with the documented day convention; trace contents;
2. fewer than two observations ⇒ INSUFFICIENT_EVIDENCE; same-instant ⇒ INVALID or conflict per contract; conflicting input ⇒ EVIDENCE_CONFLICT;
3. weight loss yields negative gain (not clamped to zero);
4. mixed methods reported as limitation; explicit threshold parameter honoured; absent threshold ⇒ none applied;
5. trend: no policy ⇒ NO_POLICY; supplied policy boundaries exact;
6. target comparison: each outcome state; target lacking provenance rejected; unreviewed target ⇒ TARGET_UNVERIFIED; inapplicable intent/system ⇒ TARGET_NOT_APPLICABLE;
7. aggregation excludes unknowns from statistics and reports their counts;
8. late correction to a weight changes current result but not a result at an earlier knowledge cutoff (fingerprint reproduced);
9. prediction (if implemented) labelled PREDICTION with assumptions;
10. input-order independence, alias safety, deep-frozen outputs, deterministic fingerprints, no clock read, no AI dependency.

## Acceptance criteria

- Performance derivation, quality/coverage reporting and explicit target comparison implemented as above; tests pass.
- No universal target or invented constant; legacy livestock constants not imported as targets.
- Unknown never zero; derived values traceable; historical reproducibility proven.
- Earlier phases unchanged except additive barrel exports; DOMAIN_CONTRACTS.md "Cattle C5" section appended; verify passes; strict full-phase audit CRITICAL=0 HIGH=0 MEDIUM=0.

## Stop conditions

Stop with a `STOP: <TOKEN> — reason` line instead of improvising when:
- a biological target, threshold, trend rule or acceptance rule for estimates is needed — scientific decision gate;
- scientific evidence or expert validation would be needed to make a claim — external evidence or expert validation gate;
- an earlier phase's module or legacy livestock code must change — frozen-contract gate;
- scope would leak into C6–C10 — scope-expansion gate.
