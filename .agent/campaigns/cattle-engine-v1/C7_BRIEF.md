# Cattle C7 — Veterinary Health-Programme Engine

Predecessor: C6 (frozen by the campaign receipt `receipts/C6.json`)
Phase directory (new): `src/domain/cattle/programmes/`
Verify command: `npx vitest run src/domain/cattle src/tooling/cattle-conformance --maxWorkers=1 && npm run typecheck && npm run lint`

## Phase contract (Shared Cattle Architecture & Conformance v1)

Read `docs/farm-return-next/cattle/index.md` first, then only the shared documents it routes you to. CAT-INV ids are defined in `docs/farm-return-next/cattle/INVARIANTS.md`; this phase's interface contract is its section of `docs/farm-return-next/cattle/PHASE_INTERFACES.md`. The canonical input boundary (CAMPAIGN.md, "Canonical input contract", 2026-10-12) applies: entry points check the complete input with `toCanonicalPlainData` and reject non-canonical input; engines reason only over detached canonical plain data; malformed canonical data fails closed. This contract does not expand the scope below.

- **Outcome:** declared veterinary/risk-based programme framework deriving per-occurrence state at an explicit instant — not a vaccination or prescribing engine.
- **Owner:** programme definitions and per-occurrence programme state.
- **Inputs:** versioned programme definitions with provenance and review state; C4 group scopes / explicit sets; C3 administrations and vet events as completion evidence; C3 withdrawal and C2 hard-gate projections as gate inputs.
- **Outputs:** per-occurrence state, programme status per animal/group, fingerprint (new kind), C0 pack / C2 hard-gate compatible gate entries.
- **Invariants:** CAT-INV-001–014, 016, 017, 021–027.
- **Temporal model:** programme definitions AND programme evidence obey the same cutoff model (definitions admitted by their knowledge time before relevance); a programme revision received later cannot contaminate historical programme state.
- **Identity model:** programme id + version; deterministic occurrence id (C2 `obligationOccurrenceId` pattern); completion matched only by explicit references or declared criteria.
- **Semantic equality:** instants by key; product refs exact; windows from declared data with documented boundary conventions.
- **Status / evidence precedence:** `docs/farm-return-next/cattle/ARCHITECTURE.md` §Status and evidence precedence: declare the REQUIRED inputs of every authoritative outcome and document/test this phase's own precedence list; unresolved required evidence never surfaces as a resolved-looking state (CAT-INV-009).
- **Units / precision:** schedule offsets exactly as declared; exact UTC arithmetic (C2 `obligation-time.ts`).
- **Provenance:** declared-by veterinarian/farmer role; veterinary review dimension for veterinarian programmes; unapproved ⇒ REVIEW_REQUIRED.
- **Forbidden dependencies:** universal vaccination schedules; prescribing; fuzzy completion matching; re-deriving C3 withdrawal or C2 obligation state. See also `PHASE_INTERFACES.md` common contract.
- **Human gates:** veterinary decision gate whenever veterinary judgement is required (raise its token exactly as the gate-token discipline below specifies); external evidence gate; frozen-contract gate. Use the stop conditions and gate-token discipline below.
- **FAIL_TO_PASS test matrix:** later programme revision invisible at earlier cutoff (`checkFutureKnowledgeInvisible` over definitions and evidence); malformed definition/evidence knowledge time; unknown anchor/membership ⇒ UNKNOWN never COMPLETED/NOT_APPLICABLE; gate FAIL/UNKNOWN ⇒ BLOCKED; duplicate ids; input order; fingerprint variants; non-canonical input rejected. Use the shared kit (`src/tooling/cattle-conformance`) where a check fits; table-driven, no Cartesian suites.
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

Build the framework for risk-based / veterinary health programmes: a programme is explicitly declared data (by a veterinarian or farmer, with provenance), never inferred and never a universal schedule. The engine derives, per animal or group member, which programme actions are due, done, unknown or blocked at an explicit instant. It is NOT an autonomous vaccination or prescribing engine.

## Scope

1. `HealthProgrammeDefinition` (versioned, effective-period bound, C0 rule classification `VETERINARY_PROGRAMME` for veterinarian-declared programmes or `FARMER_INTENT` for farmer-declared ones — never `LEGAL_*` unless bound to a legal rule from C2): programme id/version, declared-by (veterinarian/farmer role + opaque ref), declaration provenance, applicability (explicit animal set, C4 group scope, or rule-declared criteria over KNOWN C1 facts), actions (opaque action kind, optional product ref bound to a C3 `AuthorisedProductRecord` as supplied data, schedule/window expressed as data — anchor + offsets, repeat interval, occurrence count — exactly as declared), approval/review state (veterinary review dimension from C0 for veterinarian programmes).
2. Membership resolution over time: animal/group membership at `effectiveAt`/`knowledgeCutoff` (C4 group scope / explicit sets); unknown membership reported, never assumed.
3. Action occurrence derivation from declared schedule data (deterministic, documented boundary conventions); unknown anchor ⇒ UNKNOWN.
4. Completion evidence: links to C3 `MEDICINE_ADMINISTRATION` / `VETERINARY_EVENT` records or explicit completion declarations (veterinarian/farmer), with provenance and bitemporal semantics; matching is by explicit references or explicitly declared matching criteria (programme action ↔ product ref and window) — never by fuzzy inference.
5. Per-occurrence state: `NOT_APPLICABLE`, `UPCOMING`, `DUE`, `COMPLETED`, `OVERDUE`, `BLOCKED` (for example a C3 withdrawal/contra-indication gate is supplied as data and fails, or a hard-gate obligation from C2 blocks), `UNKNOWN`, `INSUFFICIENT_EVIDENCE`, `EVIDENCE_CONFLICT`, `REVIEW_REQUIRED` (programme not approved/current). Precedence documented and tested.
6. Programme status projection per animal/group with historical reconstruction and deterministic fingerprint (new kind e.g. `CATTLE_PROGRAMME_STATUS`); outputs compatible with C0 evidence-pack inputs and with the C2 hard-gate projection shape where a programme action is a gate.
7. Barrel exports; DOMAIN_CONTRACTS.md section "Cattle C7 — Veterinary health-programme engine".

## Out of scope

- Any universal or default vaccine/health schedule; any real product, dose, interval or disease programme content.
- Choosing products, doses or timings; prescribing; diagnosing; converting a risk signal into a programme.
- NVPS/HPRA/veterinary-practice connectors; UI; persistence; migrations; AI.
- Earlier-phase module changes beyond additive barrel exports.

## Required tests

Synthetic data only. At least:
1. no declared programme ⇒ nothing due (and explicitly reported as no programme, not "compliant");
2. declared programme applicability via explicit set, group scope and rule criteria; unknown membership ⇒ UNKNOWN;
3. schedule occurrence derivation at exact window boundaries; repeat intervals; unknown anchor ⇒ UNKNOWN;
4. completion by explicit C3 administration ref and by declaration; mismatched product ⇒ not completed; competing completion records ⇒ conflict;
5. unapproved/non-current programme ⇒ REVIEW_REQUIRED; veterinarian programme requires veterinary review dimension;
6. supplied blocking gate ⇒ BLOCKED;
7. programme version supersession at effective boundary; old status reproducible at earlier knowledge cutoff;
8. farmer-declared programme keeps FARMER_INTENT classification, never presented as veterinary or legal;
9. input-order independence, alias safety, frozen outputs, deterministic fingerprints, no clock read, no AI dependency.

## Acceptance criteria

- Programme framework implemented as above; tests pass.
- No universal schedule, prescribing, diagnosing or real content; classifications preserved.
- Earlier phases unchanged except additive barrel exports; DOMAIN_CONTRACTS.md "Cattle C7" section appended; verify passes; strict full-phase audit CRITICAL=0 HIGH=0 MEDIUM=0.

## Stop conditions

Stop with a `STOP: <TOKEN> — reason` line instead of improvising when:
- veterinary judgement is required (programme content, product/timing choice, completion equivalence) — veterinary decision gate;
- a real programme/product fact is needed — external evidence gate;
- a connector shape would be assumed — unsupported external API gate;
- an earlier phase's module must change — frozen-contract gate;
- scope would leak into C8–C10 — scope-expansion gate.
