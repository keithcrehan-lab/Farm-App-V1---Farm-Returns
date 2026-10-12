# Cattle C3 — Health & Medicines Engine

Predecessor: C2 (frozen by the campaign receipt `receipts/C2.json`)
Phase directory (new): `src/domain/cattle/health/`
Verify command: `npx vitest run src/domain/cattle src/tooling/cattle-conformance --maxWorkers=1 && npm run typecheck && npm run lint`

## Phase contract (Shared Cattle Architecture & Conformance v1)

Read `docs/farm-return-next/cattle/index.md` first, then only the shared documents it routes you to. CAT-INV ids are defined in `docs/farm-return-next/cattle/INVARIANTS.md`; this phase's interface contract is its section of `docs/farm-return-next/cattle/PHASE_INTERFACES.md`. The canonical input boundary (CAMPAIGN.md, "Canonical input contract", 2026-10-12) applies: entry points check the complete input with `toCanonicalPlainData` and reject non-canonical input; engines reason only over detached canonical plain data; malformed canonical data fails closed. This contract does not expand the scope below.

- **Outcome:** canonical, provenance-aware health and medicine timeline with authorised-product binding and a withdrawal hard-gate projection.
- **Owner:** health event timeline, treatment/medicine administration facts, product binding, withdrawal state, health evidence.
- **Inputs:** C1 `AnimalLedger`/`AnimalSnapshot` (via C1 exports only); canonical append-only health records; supplied authorised-product records with C0 source binding.
- **Outputs:** health timeline projection; per-administration product binding state; per-food-product withdrawal end; withdrawal hard-gate projection (C2 hard-gate / C0 pack compatible); medicine ledger view; fingerprints with new kinds.
- **Invariants:** CAT-INV-001–014, 016, 017, 021–027 (018/019 for withdrawal durations).
- **Temporal model:** `effectiveAt` = administration/event instants and withdrawal evaluation instant; `knowledgeCutoff` admits health records by `receivedAt` and product records by retrieved/checked time — cutoff first (CAT-INV-003); a later-received administration or product revision never changes an earlier-cutoff projection.
- **Identity model:** health record id (same id + different content fails closed, identity before validity); administration = record id + animal + product ref + administration instant; product record = product id + version.
- **Semantic equality:** instants by `animalInstantKey`; dates as calendar dates; product/practitioner ids exact per contract; withdrawal durations by canonical value.
- **Status / evidence precedence:** `docs/farm-return-next/cattle/ARCHITECTURE.md` §Status and evidence precedence: declare the REQUIRED inputs of every authoritative outcome and document/test this phase's own precedence list; unresolved required evidence never surfaces as a resolved-looking state (CAT-INV-009).
- **Units / precision:** withdrawal period exactly as supplied (unit and exactness from the record); no rounding except a sourced rule's explicit step.
- **Provenance:** every record carries source category/actor/role + `receivedAt`; DIAGNOSIS only with veterinary/laboratory provenance; product facts are supplied data with validated `SourceVersionRef`/fingerprint (CAT-INV-024).
- **Forbidden dependencies:** diagnosis inference; prescribing, dose/route choice; universal vaccine/medicine assumptions; SPC interpretation beyond supplied fields; re-deriving C1 identity; C2 obligation logic; raw C1 assertion reinterpretation where a C1 snapshot export exists (CAT-INV-023). See also `PHASE_INTERFACES.md` common contract.
- **Human gates:** veterinary decision gate (any diagnosis/treatment/dose/course judgement); external evidence gate (real product or withdrawal value); unsupported external API gate; frozen-contract gate. Use the stop conditions and gate-token discipline below.
- **FAIL_TO_PASS test matrix:** cutoff before/at/after for administrations and product records (`checkFutureKnowledgeInvisible`, including well-timestamped malformed late records); malformed `receivedAt`/retrieved time (`checkMalformedKnowledgeTimeFailsClosed`); duplicate/colliding record ids (`checkDuplicateIdentity`); unknown/conflicting product binding or period never CLEAR (`checkUnresolvedEvidenceNotMasked`); correction keeps history (`checkCorrectionPreservesHistory`); input order (`checkOrderIndependence`); detached frozen output (`checkDetachedResult`); fingerprint equivalent/material variants (`checkFingerprintStability`); non-canonical input rejected at every entry point (collection and element). Use the shared kit (`src/tooling/cattle-conformance`) where a check fits; table-driven, no Cartesian suites.
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

Build the canonical, provenance-aware health and medicines timeline for a bovine: health observations, symptoms, sourced diagnoses, veterinary events, treatments and medicine administrations, with authorised-product binding and a withdrawal-window calculation architecture. Health is a timeline, never a status flag.

## Scope

1. Health timeline record kinds (append-only, bitemporal, provenance-aware, correction/supersession, idempotent duplicates, conflicts preserved — reuse the generic ledger machinery introduced by C2 if C2 exported one, otherwise per engineering constraint 14):
   - `HEALTH_OBSERVATION` (observed sign/finding; free-text or source-coded, never auto-classified);
   - `SYMPTOM` (reported/observed; never upgraded to a diagnosis);
   - `DIAGNOSIS` (accepted only with a diagnosing-source provenance such as a veterinary source or laboratory record; a farmer/system/AI record cannot create a DIAGNOSIS — it can create an observation or a suspected-condition note that stays labelled as such);
   - `VETERINARY_EVENT` (visit, examination, procedure performed by/under a veterinarian; opaque practitioner ref);
   - `TREATMENT` (course/episode grouping administrations; links to prescription ref where supplied);
   - `MEDICINE_ADMINISTRATION` (product identity, batch where supplied, administered dose/route/site exactly as supplied with unit, administered-at instant, administered-by actor, prescription ref where supplied).
   Every record carries C1 `FarmReturnAnimalId`, effective/occurred time, `receivedAt`, provenance and source/version.
2. Product identity contract: opaque product reference (authorisation number/scheme + label as supplied by an `AuthorisedProductRecord` supplied as input data with C0-style source binding — authority, version, content fingerprint, retrieved/checked). Product facts (species authorisation, withdrawal periods per food product such as meat/milk, units) are DATA supplied with provenance, never constants in code. An administration whose product record is missing, not current, or not authorised for BOVINE in the supplied data ⇒ explicit UNKNOWN/REVIEW_REQUIRED/UNSUPPORTED product binding — never assumed.
3. Withdrawal-window architecture: deterministic computation of withdrawal end per food product from (administration instant, the bound product record's withdrawal period for that product/route/species as supplied, any explicitly supplied prescriber-specified longer period). Unknown/ambiguous period, unknown administration time, conflicting records, multi-dose courses without a supplied rule for how the period applies ⇒ UNKNOWN / INSUFFICIENT_EVIDENCE with reasons — never zero, never "no withdrawal". Boundary convention explicit and tested.
4. Withdrawal hard-gate projection: for an animal at `effectiveAt`/`knowledgeCutoff`, per food product, `CLEAR` / `IN_WITHDRAWAL` (until instant) / `UNKNOWN` / `EVIDENCE_CONFLICT`, with exact administrations and product-record versions used, compatible with C0 evidence-pack hard-gate inputs (unknown ⇒ not actionable for sale/slaughter/milk-supply actions downstream).
5. Medicine ledger view: deterministic chronological medicine record (administrations with product binding, prescription refs, withdrawal ends) at a knowledge cutoff; reproducible historically.
6. Health timeline projection: ordered, filterable (by kind, period) view at `effectiveAt`/`knowledgeCutoff`, including superseded history, with deterministic fingerprint (new kind e.g. `CATTLE_HEALTH_TIMELINE`).
7. Barrel exports; DOMAIN_CONTRACTS.md section "Cattle C3 — Health & medicines engine".

## Out of scope

- Autonomous diagnosis, disease inference from symptoms, risk scoring presented as diagnosis.
- Prescribing, choosing a medicine, inventing or recommending a dose/route, or interpreting an SPC beyond reading supplied structured product fields.
- Any real product, authorisation number, withdrawal period, dose or vaccine; any assumption that every Irish bovine needs a standard vaccine/medicine set.
- HPRA/EMA/NVPS connectors or API assumptions.
- Vaccination/health programmes (C7), recommendations (C8), weights (C4), UI, persistence, migrations, AI.
- Changes to C0/C1/C2 modules beyond additive barrel exports.

## Required tests

Synthetic `SYNTH-*` products/animals/practitioners only. At least:
1. each record kind appends, projects and supersedes correctly; idempotent duplicate; same-id-different-content rejected; competing corrections ⇒ conflict state;
2. farmer/system-sourced record cannot become a DIAGNOSIS; vet/lab-sourced diagnosis accepted with provenance;
3. symptom never upgraded to diagnosis; no code path infers a condition;
4. administration with missing/non-current/non-bovine product record ⇒ explicit non-clear binding;
5. withdrawal end computed from supplied period at exact boundaries (one instant before end ⇒ IN_WITHDRAWAL, at end ⇒ CLEAR per documented convention);
6. prescriber-specified longer period honoured; unknown period/administration time ⇒ UNKNOWN, never CLEAR;
7. multiple administrations: latest withdrawal end governs only when each period is known; any unknown ⇒ UNKNOWN;
8. bitemporal reconstruction: late-arriving administration changes the current projection but not a projection at an earlier knowledge cutoff;
9. withdrawal hard-gate UNKNOWN/IN_WITHDRAWAL produces a non-actionable C0 evidence pack for a synthetic sale action;
10. timeline ordering deterministic and input-order independent; caller-alias safety; deep-frozen outputs;
11. fingerprints deterministic; material change changes them;
12. no clock read; no AI dependency; malformed records fail closed.

## Acceptance criteria

- Health timeline, product binding, withdrawal architecture and gate projection implemented with the semantics above; tests pass.
- No autonomous diagnosis/prescription; no real product/medicine/withdrawal/dose values; product facts are supplied data with provenance.
- Unknown never becomes CLEAR/zero; conflicts visible.
- Earlier phases unchanged except additive barrel exports; no migration/schema/UI/AI.
- DOMAIN_CONTRACTS.md "Cattle C3" section appended; verify passes; strict full-phase audit CRITICAL=0 HIGH=0 MEDIUM=0.

## Stop conditions

Stop with a `STOP: <TOKEN> — reason` line instead of improvising when:
- any behaviour would require veterinary judgement (diagnosis, treatment choice, dose, how a withdrawal period applies to a course) — veterinary decision gate;
- a real product/withdrawal value or SPC interpretation would be needed — external evidence gate;
- an HPRA/NVPS API shape would be assumed — unsupported external API gate;
- an earlier phase's module must change — frozen-contract gate;
- persistence/migration is needed — migration gate;
- scope would leak into C4–C10 — scope-expansion gate.
