# Cattle C8 — Recommendation Engine

Predecessor: C7 (frozen by the campaign receipt `receipts/C7.json`)
Phase directory (new): `src/domain/cattle/recommendations/`
Verify command: `npx vitest run src/domain/cattle src/tooling/cattle-conformance --maxWorkers=1 && npm run typecheck && npm run lint`

## Phase contract (Shared Cattle Architecture & Conformance v1)

Read `docs/farm-return-next/cattle/index.md` first, then only the shared documents it routes you to. CAT-INV ids are defined in `docs/farm-return-next/cattle/INVARIANTS.md`; this phase's interface contract is its section of `docs/farm-return-next/cattle/PHASE_INTERFACES.md`. The canonical input boundary (CAMPAIGN.md, "Canonical input contract", 2026-10-12) applies: entry points check the complete input with `toCanonicalPlainData` and reject non-canonical input; engines reason only over detached canonical plain data; malformed canonical data fails closed. This contract does not expand the scope below.

- **Outcome:** deterministic, evidence-first recommendation engine emitting verified C0 Recommendation Evidence Packs from one sealed context.
- **Owner:** candidate actions, constraint-aware ranking, recommendation records, evidence-pack assembly (via C0 `buildRecommendationEvidencePack`).
- **Inputs:** ONE sealed `CattleEvaluationContext` (`ARCHITECTURE.md`) built only from published C1–C7 outputs + bound economic observations; `CandidateActionDefinition` registry as data.
- **Outputs:** per-animal recommendation records, herd ordering, verified evidence packs.
- **Invariants:** CAT-INV-001–027 (015 and 020 are primary).
- **Temporal model:** exactly one `effectiveAt` and one `knowledgeCutoff` for every context part; no fetch or re-read of mutable inputs mid-evaluation (CAT-INV-015); economic observations admitted by their knowledge time.
- **Identity model:** action = kind + target scope; pack id/fingerprint from C0; ties broken by stable action identity, recorded.
- **Semantic equality:** ranking compares canonical unrounded values; money = amount + currency + economic context.
- **Status / evidence precedence:** `docs/farm-return-next/cattle/ARCHITECTURE.md` §Status and evidence precedence: declare the REQUIRED inputs of every authoritative outcome and document/test this phase's own precedence list; unresolved required evidence never surfaces as a resolved-looking state (CAT-INV-009).
- **Units / precision:** money representation decided and documented here (`NUMERIC_SEMANTICS.md`); no currency mixing without a bound exchange-rate observation; no decision rounding.
- **Provenance:** every economic value is a bound observation (value, currency/unit, source, observed/retrieved time, knowledge time, version/fingerprint — CAT-INV-020); every pack lists exact rule/source versions.
- **Forbidden dependencies:** raw upstream records (CAT-INV-023) — meaning C8 reading or reinterpreting predecessor records with its own logic; passing canonical records to the frozen predecessor engines inside the one construction boundary is delegation and is required (see "Predecessor composition" and "Pre-start clarifications"); live price/market calls; new price/cost/probability/effect constants; forking the C0 pack builder; AI explanation. See also `PHASE_INTERFACES.md` common contract.
- **Human gates:** scientific decision gate (effect model values); external evidence gate (economic sources); veterinary decision gate; frozen-contract gate. Use the stop conditions and gate-token discipline below.
- **FAIL_TO_PASS test matrix:** pipeline order hard gates → eligibility → candidates → effect → value → ranking → pack; any FAIL/UNKNOWN/conflict/REVIEW gate ⇒ non-actionable (`checkUnresolvedEvidenceNotMasked` with ACTIONABLE forbidden); unknown value never ranks as zero/best; same context ⇒ identical pack fingerprint; later upstream change at a later cutoff never alters a stored recommendation; context parts with mismatched cutoffs rejected; input order; detached frozen output. Use the shared kit (`src/tooling/cattle-conformance`) where a check fits; table-driven, no Cartesian suites.
- **PASS_TO_PASS regression surface:** frozen C0/C1/C2 suites and every earlier frozen phase suite under `src/domain/cattle`; conformance kit self-tests (`src/tooling/cattle-conformance`); directly affected predecessor integrity tests.
- **Freeze definition:** `docs/farm-return-next/cattle/VERIFICATION.md` §Freeze definition (targeted + required conformance checks + PASS_TO_PASS + full quality gate + strict whole-phase audit CRITICAL=HIGH=MEDIUM=0).

## Predecessor composition (inherited from the C7 architecture review, 2026-10-14)

Binding for C8 design (`.agent/campaigns/cattle-engine-v1/C7_ARCHITECTURE_REVIEW.md`; CAT-INV-023 / 028):
- Construct the sealed `CattleEvaluationContext` from canonical evidence by invoking the frozen C1–C7
  engines in ONE construction boundary ("published outputs" = outputs produced by invoking the published
  engines); never accept a caller-supplied derived predecessor output as authoritative, and never restate
  a predecessor's derivation semantics to authenticate one.
- Predecessor outputs are untrusted until their consumed fields are validated: one consumed-field
  schema per consumed surface; fingerprints are integrity / replay identity, never semantic validity or
  authenticity; runtime enum / state validation; fail-closed exhaustive translations; generated
  malformed-output matrices from the schema; trusted non-canonical inputs (e.g. C2's implementation
  registry) only as explicit trusted parameters.
- Downstream binding rule (CAT-INV-021 / 023, after C7 finding F009): bind each owner's canonical admitted
  output (C1–C7 result fingerprints), never raw predecessor inputs; never re-perform predecessor
  admission, normalisation, ordering or equivalence; treat each owner's equality semantics as given (C1's
  snapshot fingerprint is representation-sensitive by design). C8's binding guard classifies every input
  leaf by owner (A own / B upstream: compare the owner's recomputed canonical output; C explicit
  `{path, owningPhase, reason}` non-dependency proven unchanged).
- Avoid recursive recomputation where practical (C7 composes C2 / C3 itself; duplicate deterministic
  computation is acceptable, inconsistency is not).

## Pre-start clarifications (human-authorised, 2026-10-15)

Binding for C8. They resolve ambiguities found in the read-only C8 preflight and add no new scope.

1. **Raw records versus composition.** "Raw upstream records" are forbidden only as something C8 reads or interprets itself. C8 must pass canonical predecessor records to the frozen C1–C7 engines inside its one context-construction boundary (CAT-INV-023 delegation clarification). No other C8 module touches those records, and no C8 module restates a predecessor's admission, normalisation, ordering, equivalence or derivation rules. `PHASE_INTERFACES.md` §C8 carries the same note.
2. **Economic value.** A Farm Return export is eligible as an economic model only if every number it uses comes from supplied, bound economic observations (CAT-INV-020). A function that embeds a price, cost, rate, weight, growth or other constant is never eligible — for example `src/domain/livestock.ts` `calculateFinishingBudget`, `calculateSellNowVsFinish`, `targetADGForAnimalType`, `concentrateKgPerDay` and its `FINISHING_KILL_OUT_PCT` / `WEANLING_*` constants. The shipped default has no economic model, so every value is `VALUE_UNKNOWN`. Only an explicitly supplied, registered, provenance-bound model may produce a value, and tests use synthetic models only. If a required valuation cannot be expressed this way, stop at the scientific decision gate; never substitute a value.
3. **C5 / C6 link.** C8 composes C4 → C5 → C6 in that order: C4 weight read contract → C5 `evaluatePerformance` → C6 `resolveGoalTargetApplicability` over that C5 evaluation, with C6 `projectProductionGoals` / `routeProductionGoals` for the goal state. C5's applicability contexts (`{animalId, goalRef?, productionSystemRef?, attributes?}`) are caller-supplied query context, exactly as C5's frozen contract defines. C8 passes them through unchanged and never derives a `goalRef` from C6 goals or any other evidence.
4. **Trusted parameters.** C2's obligation implementation registry is an explicit trusted parameter of the C8 entry point (C2 / C7 precedent), passed unchanged to both C2 and C7. No other trusted, non-canonical input is introduced.
5. **One evidence set per predecessor.** C8 runs C2 and C3 directly for its own hard gates and again inside C7. Both runs must be built from the same canonical C2 / C3 evidence in the request, so they cannot disagree. Duplicate deterministic computation is acceptable; caching or reconciling the two runs is not required.
6. **Derived outputs are never inputs.** C8's request never contains a C4 weight read contract, C5 evaluation, C6 projection, C7 evaluation or C2 / C3 result. C8 builds each in-process from canonical evidence.

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

Build the outcome-driven Cattle recommendation engine answering: which action is most likely to improve the return from this animal or herd, subject to hard regulatory, welfare, health, scientific and evidence constraints? The engine is deterministic and evidence-first: it may validly return `NO_RECOMMENDATION`, `INSUFFICIENT_EVIDENCE` or `BLOCKED`, and every output is reproducible from an immutable C0 Recommendation Evidence Pack.

## Scope

Pipeline (each stage pure, traced and tested):
1. Context assembly at explicit `effectiveAt`/`knowledgeCutoff` for an animal or explicit scope: C1 snapshot, C2 obligation states + hard-gate projection, C3 withdrawal gate + health timeline refs, C4 weight series, C5 performance results, C6 goal snapshot ref, C7 programme status. Each input carries its fingerprint/ref; missing inputs are recorded as missing, never defaulted.
2. Hard gates first: any C2/C3/C7 hard gate that FAILs, is UNKNOWN, in conflict, UNSUPPORTED or REVIEW_REQUIRED for an action's prerequisites makes that action non-actionable (BLOCKED or INSUFFICIENT_EVIDENCE per C0 pack semantics). Favourability is never consulted for a blocked action.
3. Eligibility: candidate actions come from an explicit, versioned `CandidateActionDefinition` registry supplied as data (action kind, applicable goal types, required inputs, prerequisite gates, evidence requirements, expected-effect model ref, economic model ref). The default production registry contains only evidence-free, data-driven actions that need no scientific/economic claim, for example: `RECORD_WEIGHT` (no weight / stale-by-explicit-policy only), `RESOLVE_OBLIGATION_EVIDENCE` (C2 outstanding/overdue/unknown), `REVIEW_WITHDRAWAL_STATUS` (C3 unknown), `COMPLETE_PROGRAMME_ACTION` (C7 due/overdue), `DECLARE_PRODUCTION_GOAL` (C6 NONE), `REQUEST_VETERINARY_REVIEW` only where a supplied, sourced rule or a recorded veterinary programme asks for it. Each is a data-gap/obligation action and claims no biological or economic benefit.
4. Expected effect: produced only via an explicitly registered, provenance-bound effect model (C0 rule version with source binding and review state); absent ⇒ `EFFECT_UNKNOWN` (never a guessed benefit or probability).
5. Economic value: computed only by calling existing Farm Return economic/finance exports (for example `src/domain/livestock.ts`, `finance.ts`, `market*.ts`) with sourced, supplied inputs and their existing evidence states, where an applicable function genuinely exists; otherwise `VALUE_UNKNOWN`. Never a new price, cost, margin or probability constant; never duplicating an existing calculation.
6. Deterministic ranking: documented, total, stable ordering — hard obligations/welfare first (system-priority tiers consistent with the Plan skill: safety/legal/welfare → avoid material loss → expected net return → value of information), then by KNOWN quantified value only where comparable, then by stable action identity. Unknown value never ranks as zero or as best. Ties broken deterministically and recorded.
7. Evidence pack: build via C0 `buildRecommendationEvidencePack` (reuse; do not fork) with target scope + snapshot refs, goal snapshot ref, inputs/provenance, missing inputs, exact rule versions, hard-gate outcomes, calculation trace, candidate actions, rejected alternatives with reasons, selected action, assumptions, limitations, unknowns, source fingerprints; verify via `verifyRecommendationEvidencePack`.
8. Recommendation record: recommended action, reason (structured codes + deterministic template text built only from pack contents), expected outcome (or EFFECT_UNKNOWN), regulatory status, evidence strength and type, source/provenance, assumptions, limitations, unknowns, pack id + fingerprint. Any natural-language explanation is a deterministic rendering of structured fields; no AI call.
9. Herd mode: per-animal results plus a deterministic herd-level ordering; no cross-animal averaging of unknowns.
10. Reproducibility: re-running with the same inputs and cutoff reproduces the identical pack fingerprint; later goal/evidence changes never alter a stored historical recommendation.
11. Barrel exports; DOMAIN_CONTRACTS.md section "Cattle C8 — Recommendation engine".

## Out of scope

- Inventing biological benefit, economic benefit, probability, cost, price, value or target; any new scientific/economic constant.
- Diagnosis, prescribing, treatment selection, legal interpretation.
- AI/LLM narrative generation; Plan job creation (C9); UI (C10); persistence; migrations.
- Earlier-phase module changes beyond additive barrel exports (C0 pack contract reused unchanged).

## Required tests

Synthetic data and synthetic registries only. At least:
1. failed/unknown/conflicting/unsupported/review-required hard gate blocks an otherwise favourable action (pack outcome not ACTIONABLE);
2. missing inputs recorded; no defaults; empty registry ⇒ NO_RECOMMENDATION;
3. each default data-gap action triggers only from its documented condition and claims no benefit;
4. synthetic registered effect/economic model used only when provenance-bound and approved; otherwise EFFECT_UNKNOWN/VALUE_UNKNOWN;
5. ranking deterministic, tier order respected, unknown value never outranks known value or treated as zero, ties stable and recorded;
6. rejected alternatives carry reasons;
7. pack verifies; identical inputs reproduce identical fingerprint; material change changes it;
8. a later goal change or late evidence does not alter the recommendation reproduced at the earlier knowledge cutoff;
9. explanation text derived only from structured fields (snapshot-tested), no model call;
10. herd mode ordering deterministic and input-order independent; alias safety; frozen outputs; no clock read.

## Acceptance criteria

- Full pipeline implemented as above with C0 evidence packs; tests pass.
- No invented benefit/value/probability/target; hard gates precede ranking; unknown never zero.
- Earlier phases unchanged except additive barrel exports; DOMAIN_CONTRACTS.md "Cattle C8" section appended; verify passes; strict full-phase audit CRITICAL=0 HIGH=0 MEDIUM=0.

## Stop conditions

Stop with a `STOP: <TOKEN> — reason` line instead of improvising when:
- a biological/economic effect, value, probability or ranking weight beyond the documented tiers would be needed — scientific decision or product decision gate;
- a veterinary or regulatory judgement would be needed — veterinary decision or regulatory interpretation gate;
- the C0 evidence-pack contract or another earlier module must change — frozen-contract gate;
- scope would leak into C9–C10 — scope-expansion gate.
