# Cattle C2 — Regulatory Lifecycle Engine

Predecessor: C1 (frozen `c5b25f23aefbd11267fc9ef53d235548de84cc27`)
Phase directory (new): `src/domain/cattle/regulatory/`
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

Build a deterministic regulatory/obligation lifecycle engine over C1 canonical animal state: given versioned obligation rules (C0 `CattleRuleVersion`s), an animal's C1 bitemporal snapshot/ledger and fulfilment evidence, derive for each applicable obligation an auditable, reproducible obligation state at an explicit `effectiveAt` / `knowledgeCutoff`.

This phase delivers the ENGINE, contracts and interfaces only. It does not encode Irish or EU cattle law. Authoritative legal content (registration, BVD, TB, movement, procedure and welfare duties) is out of scope and must later enter through a separately authorised, evidence-reviewed rule task using the C0 source/rule/review lifecycle. With an empty production rule catalogue the engine must report obligations as unknown/unsupported — never as satisfied or not applicable.

## Scope

1. Obligation definition contract (`ObligationDefinition` or equivalent) binding a C0 rule id to: obligation kind (opaque, rule-declared), rule classification (must preserve `LEGAL_REQUIRED`, `LEGAL_CONDITIONAL`, `SCHEME_CONDITIONAL`, `VETERINARY_PROGRAMME`, `SCIENCE_TARGET`, `SCIENCE_CONSTRAINT`, `FARMER_INTENT`, `SYSTEM_INFERENCE` exactly as C0 defines them — never collapsed), hard-gate vs advisory role (from the C0 rule), applicability (evaluated through C0 `evaluateEffectiveCattleRule` / rule applicability over KNOWN C1 inputs), trigger anchor (an explicit, rule-declared reference to a C1 fact/event such as date of birth or a lifecycle/location transition — the engine never hard-codes which anchor a real law uses), due-window definition expressed as rule data (offsets/durations carried in the rule version, with source binding), and effective period (C0 `[effectiveFrom, effectiveTo)`).
2. Fulfilment evidence records: append-only, provenance-aware (C1 `AnimalDataProvenance` or an equivalent C0/C1-compatible provenance), bitemporal (`receivedAt` knowledge time; effective/occurred time), correction/supersession, idempotent duplicate handling, conflict preserved. Evidence references the obligation id + rule id/version it claims to satisfy.
3. Obligation state derivation per (animal, obligation, occurrence) at `effectiveAt`/`knowledgeCutoff`: at least `NOT_APPLICABLE`, `UPCOMING` (window not yet open), `OUTSTANDING` (window open, unfulfilled), `SATISFIED`, `OVERDUE`, `BLOCKED` (a hard-gate FAIL that blocks a downstream action), `UNKNOWN` (required input unknown), `INSUFFICIENT_EVIDENCE`, `EVIDENCE_CONFLICT`, `INVALID_EVIDENCE`, `UNSUPPORTED` (no effective/valid rule version or invalid lineage) and `REVIEW_REQUIRED` (rule/source not production-approved or source binding not current). Precedence is explicit, documented and tested; unknown anchors never yield NOT_APPLICABLE or SATISFIED.
4. Window arithmetic is deterministic calendar/instant arithmetic on strict UTC values with explicit, documented boundary convention (inclusive start, exclusive end unless the rule data declares otherwise through a closed enumeration). No timezone guessing; a rule needing local-time semantics the engine does not support is UNSUPPORTED.
5. Hard-gate projection: a pure function exposing, for an animal at a point in time, the set of hard-gate obligation outcomes (state + exact rule version + evidence) that downstream engines (C8) must respect, in a form compatible with C0 `buildRecommendationEvidencePack` hard-gate inputs.
6. Provenance/output record: every derived obligation state carries the exact rule id/version/fingerprint, the C0 evaluation record, the C1 snapshot fingerprint (or snapshot ref) used, the fulfilment evidence ids considered/superseded, issue codes, `effectiveAt`, `knowledgeCutoff` and a deterministic fingerprint (new kind, e.g. `CATTLE_OBLIGATION_STATE`).
7. Historical reconstruction: evaluating at an earlier knowledge cutoff reproduces the earlier state exactly, after later corrections, rule supersessions and late-arriving evidence.
8. Herd-level helper: evaluate a supplied set of animals deterministically (input-order independent), with duplicate-animal and invalid-ledger issues reported, never merged.
9. Barrel exports appended to `src/domain/cattle/index.ts`; DOMAIN_CONTRACTS.md section "Cattle C2 — Regulatory lifecycle engine".

## Out of scope

- Any real legal/regulatory rule, deadline, window length, scheme condition, BVD/TB/movement/registration/welfare duty or interpretation; any real source document content.
- Live AIM/DAFM, ICBF or any other connector, field mapping or API assumption.
- Health/medicine (C3), weights (C4), performance (C5), goals (C6), veterinary programmes (C7), recommendation selection (C8), Plan integration (C9), UI (C10).
- Persistence, schema, migration, UI, AI, network.
- Changes to C0/C1 modules (other than additive barrel exports).

## Required tests

Synthetic `SYNTH-*` rules/sources/animals only. At least:
1. obligation applicable / not applicable from KNOWN inputs; unknown applicability input ⇒ UNKNOWN (never NOT_APPLICABLE);
2. window boundaries: one instant before open ⇒ UPCOMING, exactly at open ⇒ OUTSTANDING, exactly at due end ⇒ OVERDUE when unfulfilled, fulfilled inside window ⇒ SATISFIED, fulfilled late ⇒ documented late/overdue-satisfied state;
3. anchor fact unknown or conflicting in C1 ⇒ UNKNOWN / EVIDENCE_CONFLICT, never satisfied;
4. empty production catalogue ⇒ UNSUPPORTED (or documented equivalent) for every queried obligation, never SATISFIED/NOT_APPLICABLE;
5. non-production/unapproved rule or non-current source ⇒ REVIEW_REQUIRED;
6. rule supersession at an effective boundary selects the correct version; invalid lineage ⇒ UNSUPPORTED;
7. fulfilment evidence correction/supersession, idempotent duplicate, same-id-different-content rejected, competing corrections ⇒ EVIDENCE_CONFLICT;
8. bitemporal reconstruction: earlier knowledge cutoff reproduces the earlier state and fingerprint after later corrections and late evidence;
9. hard-gate FAIL ⇒ BLOCKED and is exposed by the hard-gate projection; feeding it to a C0 evidence pack yields BLOCKED (not ACTIONABLE);
10. classifications preserved verbatim through to outputs (one test per classification);
11. input-order independence, caller-alias safety (mutating inputs after the call changes nothing), deep-frozen outputs;
12. fingerprint deterministic; material change (state, rule version, evidence id, cutoff) changes it;
13. no clock read in the deterministic path (static/behavioural test);
14. malformed obligation definitions / evidence fail closed.

Also run the existing C0/C1 cattle suites unchanged (covered by the verify command).

## Acceptance criteria

- Pure engine under `src/domain/cattle/regulatory/` with the states, precedence and contracts above; tests above pass.
- No real legal content; production catalogue empty; empty catalogue never yields a compliant/satisfied result.
- C0/C1 code unchanged except additive barrel exports; no frozen-contract, migration, schema, UI or AI change.
- Deterministic, alias-safe, reproducible at earlier knowledge cutoffs; fingerprints new-kind and stable.
- DOMAIN_CONTRACTS.md has an appended "Cattle C2" section documenting contracts, precedence, limitations (no real rules yet) and exclusions.
- Verify command passes; strict full-phase audit CRITICAL=0 HIGH=0 MEDIUM=0.

## Stop conditions

Stop with a `STOP: <TOKEN> — reason` line (tokens listed under "Gate-token discipline") instead of improvising when:
- satisfying this brief would require a real legal duty, deadline or interpretation (regulatory interpretation or external evidence gate);
- a C0/C1 module must change beyond additive barrel exports (frozen-contract gate);
- a migration/schema is required (migration gate);
- a live AIM/ICBF API shape would have to be assumed (unsupported external API gate);
- a source-precedence choice between conflicting official/farm evidence would be needed (source-precedence gate);
- work would leak into C3–C10 scope (scope-expansion gate).
