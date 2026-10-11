# Cattle C6 — Production Goal Engine

Predecessor: C5 (frozen by the campaign receipt `receipts/C5.json`)
Phase directory (new): `src/domain/cattle/goals/`
Verify command: `npx vitest run src/domain/cattle --maxWorkers=1 && npm run typecheck && npm run lint`

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

Build explicit, versioned production intent for animals and explicit scopes. Goals are INTENT, never FACT. Changing a goal today must never rewrite the basis of an earlier evaluation or recommendation.

## Scope

1. `ProductionGoal` declaration records (append-only, bitemporal): target (animal `FarmReturnAnimalId` or explicit scope ref), goal type (closed enumeration covering at least `REPLACEMENT`, `BREEDING`, `FINISHING`, `SALE`, `RETAIN`, plus optional target outcome fields: target weight (value + unit), target date, target production outcome as opaque, source-coded value), effective period (`[validFrom, validTo)`), declared-by actor and role (`FARMER`, `ADVISER`, `VETERINARIAN`, `SYSTEM` — a SYSTEM record may only be a suggestion, never an active declared goal), `receivedAt`, provenance, version, correction/supersession, withdrawal/ending of a goal as a new record.
2. Validation: compatible/incompatible goal-type combinations are a product decision; this phase supports several concurrent goals only as declared and reports CONFLICTING intent (for example finish and retain for breeding at the same instant) as `INTENT_CONFLICT` without choosing. Any built-in compatibility matrix must be explicitly minimal and documented as structural (identical target, overlapping period, mutually exclusive by definition such as SALE vs RETAIN); anything beyond that is out of scope.
3. Goal projection at `effectiveAt`/`knowledgeCutoff`: active goals, `NONE` (no declared goal — never a default goal), `INTENT_CONFLICT`, `INVALID`, with full history including superseded and ended goals.
4. Goal reference/snapshot contract: a deterministic `GoalSnapshotRef` (goal record ids + versions + fingerprint, new kind e.g. `CATTLE_GOAL_SNAPSHOT`) that C5 targets, C7 and C8 evidence packs bind to, so an old recommendation stays reproducible after a goal changes.
5. Goal-specific routing contract: a pure function mapping an active goal to the set of explicitly REGISTERED rule/target ids applicable to it (registry supplied as data; empty by default) — no built-in science; unregistered ⇒ `NO_ROUTED_RULES`.
6. Integration with C5: helper resolving which supplied `PerformanceTarget`s are applicable to the animal's active goal(s) at an instant by explicit goal ref/type matching only.
7. Barrel exports; DOMAIN_CONTRACTS.md section "Cattle C6 — Production goal engine".

## Out of scope

- Inferring goals from facts (sex, age, category) — any such suggestion is out of scope in this phase.
- Biological/economic targets or the recommendation engine (C8); veterinary programmes (C7); UI; persistence; migrations; AI.
- Earlier-phase module changes beyond additive barrel exports.

## Required tests

Synthetic data only. At least:
1. declare, correct, supersede and end goals; idempotent duplicate; same-id-different-content rejected;
2. no declaration ⇒ NONE; SYSTEM-sourced record never becomes an active declared goal;
3. structural conflicts (for example SALE vs RETAIN overlapping) ⇒ INTENT_CONFLICT with no winner;
4. effective-period boundaries (inclusive start, exclusive end);
5. changing a goal later does not change the goal projection or GoalSnapshotRef at an earlier knowledge cutoff (old basis reproducible);
6. routing returns only registered ids; empty registry ⇒ NO_ROUTED_RULES;
7. C5 target applicability resolves by explicit goal ref/type only;
8. intent never presented as fact (information class INTENT preserved);
9. input-order independence, alias safety, frozen outputs, deterministic fingerprints, no clock read, no AI dependency.

## Acceptance criteria

- Versioned, bitemporal goal intent with history, conflict reporting, snapshot refs and routing implemented as above; tests pass.
- No inferred or default goal; no invented targets; earlier phases unchanged except additive barrel exports.
- DOMAIN_CONTRACTS.md "Cattle C6" section appended; verify passes; strict full-phase audit CRITICAL=0 HIGH=0 MEDIUM=0.

## Stop conditions

Stop with a `STOP: <TOKEN> — reason` line instead of improvising when:
- goal compatibility rules beyond structural ones, or default goals, would need a product decision — product decision gate;
- a scientific target would be needed — scientific decision gate;
- an earlier phase's module must change — frozen-contract gate;
- scope would leak into C7–C10 — scope-expansion gate.
