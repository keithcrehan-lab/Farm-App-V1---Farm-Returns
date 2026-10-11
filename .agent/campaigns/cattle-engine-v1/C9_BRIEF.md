# Cattle C9 — Plan Interface

Predecessor: C8 (frozen by the campaign receipt `receipts/C8.json`)
Phase directory (new): `src/domain/cattle/plan-interface/`
Verify command: `npx vitest run src/domain/cattle src/domain/plan --maxWorkers=1 && npm run typecheck && npm run lint`

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

Expose Cattle outputs to the Plan kernel safely: a pure, cattle-owned adapter that translates C2 obligations, C7 programme actions and C8 recommendations into the EXISTING Plan kernel input contracts (`src/domain/plan/` — job creation inputs, target scope/scope reality, completion contracts and canonical evidence, timing windows, action routes) without duplicating cattle truth or cattle calculations inside Plan. Cattle continues to own animal truth, lifecycle, obligations, health state, performance, goals, programme state and recommendations.

## Scope

1. Read the Plan kernel (`src/domain/plan/*.ts`, its DOMAIN_CONTRACTS.md section and `.agent/skills/plan-domain.md`) and map onto its existing types only. Plan code is NOT modified.
2. Job proposals: pure functions producing Plan job-creation inputs (existing kernel input type) from (a) C2 OUTSTANDING/OVERDUE/UPCOMING obligations, (b) C7 DUE/OVERDUE/UPCOMING programme occurrences, (c) C8 selected actionable recommendations — each with stable action key, creation source chosen from the existing `PlanCreationSource` variants exactly as their documented meaning allows (no new variant), supporting reasons referencing cattle output ids/fingerprints, target scope (animal or C4 group scope → Plan subject refs), timing from the cattle window (recommended window vs sourced hard deadline kept distinct; unknown window ⇒ no invented date), system priority tier from the cattle classification/hard-gate role, and dependencies/blockers from cattle hard gates (BLOCKED/UNKNOWN become Plan blockers, never dropped).
3. Deduplication identity consistent with the Plan kernel (`planJobIdentityKey`): several cattle reasons for the same real work ⇒ one proposal with several supporting reasons.
4. Dynamic scope reality: a pure function producing the Plan `ScopeReality` for cattle selectors from C4 group scope / C1 snapshots at an instant (members; unknown membership surfaced, never silently included/excluded).
5. Completion evidence: a pure function producing Plan `CanonicalEvidence` from cattle canonical records (C2 fulfilment evidence, C3 administrations/vet events, C4 weights, C6 declarations) so data-linked Plan jobs complete from canonical cattle data — never a Plan-owned copy; unknown ⇒ unavailable, never zero/complete.
6. Action routes: map to existing `PlanActionRoute` kinds only; where no suitable route exists, return no route (documented) rather than inventing one.
7. Round-trip tests that call the real Plan kernel functions (`createPlanJob`, `resolveScope`, completion evaluation, `reevaluatePlanJob`) with adapter output to prove compatibility.
8. Barrel exports; DOMAIN_CONTRACTS.md section "Cattle C9 — Plan interface".

## Out of scope

- Any change to `src/domain/plan/` (types, behaviour, vocabulary, tests) — if Plan cannot represent a cattle need, stop with the frozen-contract gate.
- Persisting Plan jobs, UI, scheduling services, notifications, connectors, migrations, AI.
- Re-computing cattle calculations inside the adapter beyond selection/mapping of already-derived outputs.
- Earlier-phase module changes beyond additive barrel exports.

## Required tests

Synthetic data only. At least:
1. each cattle source (obligation, programme occurrence, recommendation) maps to a valid Plan job input accepted by `createPlanJob`;
2. creation-source variant chosen per documented mapping; no new variant;
3. hard deadline vs recommended window preserved; unknown window ⇒ no date;
4. BLOCKED/UNKNOWN cattle gates become Plan blockers/dependencies, never dropped;
5. dedup: two cattle reasons for the same action/scope/window ⇒ one proposal, two reasons; identity matches `planJobIdentityKey`;
6. scope reality from group scope; membership change produces the expected Plan scope resolution; unknown members surfaced;
7. completion evidence drives Plan completion from canonical cattle records; unknown ⇒ unavailable, not complete;
8. no Plan file changed (verify by test fixture/diff discipline) and Plan suites still pass (verify command runs them);
9. determinism, input-order independence, alias safety, frozen outputs, no clock read.

## Acceptance criteria

- Adapter implemented as above; Plan kernel untouched; round-trip tests with real Plan functions pass.
- No cattle truth or calculation duplicated in Plan; unknown never becomes complete/zero.
- Earlier phases unchanged except additive barrel exports; DOMAIN_CONTRACTS.md "Cattle C9" section appended; verify passes; strict full-phase audit CRITICAL=0 HIGH=0 MEDIUM=0.

## Stop conditions

Stop with a `STOP: <TOKEN> — reason` line instead of improvising when:
- the Plan kernel would need a new type, variant or behaviour — frozen-contract gate;
- mapping a cattle classification to a Plan priority tier needs a judgement beyond the documented tier order — product decision gate;
- persistence/migration is needed — migration gate;
- scope would leak into C10 — scope-expansion gate.
