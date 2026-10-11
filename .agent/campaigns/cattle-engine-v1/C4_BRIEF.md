# Cattle C4 — Weight Observations & Groups

Predecessor: C3 (frozen by the campaign receipt `receipts/C3.json`)
Phase directory (new): `src/domain/cattle/weights/`
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

Build canonical, provenance-aware bovine weight observations and a dynamic group-scope resolver. Weight is an OBSERVATION over time — never a mutable animal property. Provide the clean interface C5 (performance) consumes, without performance interpretation here.

## Scope

1. `WeightObservation` record (cattle-canonical; distinct from the legacy `src/domain/types.ts` `WeightObservation`, which must not be modified or re-used as the canonical type): animal `FarmReturnAnimalId`, value + explicit unit (closed unit enumeration; kilograms required for C5 consumption; no silent conversion — any conversion is explicit, exact and tested, or the record is rejected/UNSUPPORTED), observation instant (effective time), `receivedAt` (knowledge time), source/provenance (C1 `AnimalDataProvenance` categories), collection method (closed enumeration such as `SCALE`, `WEIGHBRIDGE`, `ESTIMATE_VISUAL`, `ESTIMATE_TAPE`, `DERIVED_EXTERNAL`, `UNKNOWN` — an estimate is never relabelled as a scale reading), device/source identifier where supplied, optional evidence quality/confidence exactly as supplied (no invented confidence), optional fasted/conditions note as supplied.
2. Append-only ledger semantics: correction/supersession, idempotent duplicates, same-id-different-content rejected, competing corrections ⇒ conflict (no winner), malformed/non-positive/non-finite weights rejected (fail closed), reuse of the generic ledger machinery from an earlier phase where available.
3. Projections at explicit `effectiveAt`/`knowledgeCutoff`: (a) historical series — all live observations with effective time ≤ `effectiveAt` known by the cutoff, deterministically ordered, superseded history retained; (b) current/latest-known observation per animal with explicit `NONE`/`EVIDENCE_CONFLICT` states (several distinct live observations at the same instant ⇒ conflict, never averaged); (c) per-observation provenance and method preserved for C5's evidence-quality reasoning.
4. Deterministic fingerprint (new kind e.g. `CATTLE_WEIGHT_SERIES`); reproducible at earlier knowledge cutoffs.
5. Group scope resolver: given C1 ledgers and a group ref (C1 `MANAGEMENT_GROUP` assertions), resolve members at `effectiveAt`/`knowledgeCutoff` using C1 snapshot projection only (no new group truth), reporting members, animals whose group is UNKNOWN/conflicting/invalid (never silently excluded or included) and membership history between two instants for audit. Herd scope = explicit supplied animal set. Deterministic and input-order independent.
6. C5 interface: a typed, documented read contract (series + quality metadata + scope) C5 will consume. No ADG, trend or target here.
7. Barrel exports; DOMAIN_CONTRACTS.md section "Cattle C4 — Weight observations & groups".

## Out of scope

- ADG, gain, trend, targets, coverage scoring or any performance interpretation (C5).
- Changing legacy `src/domain/types.ts`, `src/domain/livestock.ts` or `src/lib/farm-data/` weight/animal code; any legacy-to-canonical adapter (C10 decides presentation data flow).
- Device/scale connectors or API assumptions; persistence; migrations; UI; AI.
- Earlier-phase module changes beyond additive barrel exports.

## Required tests

Synthetic `SYNTH-*` data only. At least:
1. valid observation round-trips with provenance/method/device preserved;
2. non-finite, zero, negative, unit-less, unknown-unit weights rejected; no silent unit conversion;
3. estimate methods never relabelled as measured;
4. correction/supersession; idempotent duplicate; same-id-different-content rejected; competing corrections ⇒ conflict;
5. two distinct live weights at the same instant ⇒ conflict for latest-known, never averaged;
6. historical series excludes observations after `effectiveAt` and those received after the cutoff; earlier cutoff reproduces earlier series and fingerprint after later corrections;
7. latest-known with no observations ⇒ NONE (never zero);
8. group scope: members at instant; unknown/conflicting group membership reported separately; membership change between instants reported; input-order independence;
9. caller-alias safety, deep-frozen outputs, deterministic fingerprints; material change changes fingerprint;
10. no clock read; no AI dependency.

## Acceptance criteria

- Canonical weight observations and group scope implemented as above; weight never stored as an animal property; tests pass.
- No performance interpretation; legacy code untouched; earlier phases unchanged except additive barrel exports.
- DOMAIN_CONTRACTS.md "Cattle C4" section appended; verify passes; strict full-phase audit CRITICAL=0 HIGH=0 MEDIUM=0.

## Stop conditions

Stop with a `STOP: <TOKEN> — reason` line instead of improvising when:
- a scientific judgement is required (for example whether an estimate method is acceptable for a purpose) — scientific decision gate;
- an earlier phase's module must change — frozen-contract gate;
- precedence between conflicting weight sources would have to be chosen — source-precedence gate;
- persistence/migration is needed — migration gate;
- scope would leak into C5–C10 — scope-expansion gate.
