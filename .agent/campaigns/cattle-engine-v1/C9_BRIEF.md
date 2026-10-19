# Cattle C9 — Plan Interface

Predecessor: C8P1 — Plan Compatibility Amendment (frozen by the campaign receipt `receipts/C8P1.json`), which follows C8 (`receipts/C8.json`)
Phase directory (new): `src/domain/cattle/plan-interface/`
Verify command: `npx vitest run src/domain/cattle src/tooling/cattle-conformance src/domain/plan --maxWorkers=1 && npm run typecheck && npm run lint`

## Phase contract (Shared Cattle Architecture & Conformance v1)

Read `docs/farm-return-next/cattle/index.md` first, then only the shared documents it routes you to. CAT-INV ids are defined in `docs/farm-return-next/cattle/INVARIANTS.md`; this phase's interface contract is its section of `docs/farm-return-next/cattle/PHASE_INTERFACES.md`. The canonical input boundary (CAMPAIGN.md, "Canonical input contract", 2026-10-12) applies: entry points check the complete input with `toCanonicalPlainData` and reject non-canonical input; engines reason only over detached canonical plain data; malformed canonical data fails closed. This contract does not expand the scope below.

- **Outcome:** pure cattle-owned adapter translating C2/C7/C8 outputs into the existing Plan kernel inputs without duplicating cattle truth. **The "Binding design freeze (2026-10-19)" section below is binding and wins over any other line of this brief and over the stale C9 section of `PHASE_INTERFACES.md` if they differ.**
- **Owner:** only the Cattle→Plan translation.
- **Inputs:** ONE canonical `CattlePlanRequest` (design freeze B1); C9 itself invokes the frozen C2 / C4 / C7 / C8 engines in-process (delegation, CAT-INV-023) — it never accepts caller-supplied C2 / C7 / C8 output records as authoritative input.
- **Outputs:** existing Plan types only, as frozen by C8P1 (job proposals, `PlanBlocker`s, `ScopeReality`, `CanonicalEvidence`, action routes), each carrying cattle output ids/fingerprints, projected from one canonical C9 object (design freeze).
- **Invariants:** CAT-INV-009, 012, 014, 015, 021–023 (001/002 at the adapter entry points).
- **Temporal model:** cattle windows map to Plan timing; recommended window ≠ sourced hard deadline; unknown window ⇒ no invented date; the cattle outputs' `effectiveAt`/`knowledgeCutoff` are carried, never recomputed.
- **Identity model:** deduplication per the Plan kernel's `planJobIdentityKey`; several cattle reasons ⇒ one proposal with several supporting reasons.
- **Semantic equality:** as the Plan kernel defines for its own types; cattle ids exact.
- **Status / evidence precedence:** `docs/farm-return-next/cattle/ARCHITECTURE.md` §Status and evidence precedence: declare the REQUIRED inputs of every authoritative outcome and document/test this phase's own precedence list; unresolved required evidence never surfaces as a resolved-looking state (CAT-INV-009).
- **Units / precision:** none new; values pass through unchanged.
- **Provenance:** every proposal cites cattle output ids and fingerprints.
- **Forbidden dependencies:** cattle calculations; reinterpreting cattle evidence; new Plan variants/routes; modifying Plan code (frozen Plan contract change ⇒ frozen-contract gate). See also `PHASE_INTERFACES.md` common contract.
- **Human gates:** frozen-contract gate (any Plan kernel change); product decision gate (route/creation-source meaning); scope-expansion gate. Use the stop conditions and gate-token discipline below.
- **FAIL_TO_PASS test matrix:** BLOCKED/UNKNOWN become Plan blockers, never dropped; unknown completion evidence never complete; round-trip through real Plan kernel functions; deduplication; input order; non-canonical input rejected. Use the shared kit (`src/tooling/cattle-conformance`) where a check fits; table-driven, no Cartesian suites.
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

## Binding design freeze (2026-10-19)

Human architecture decisions B1–B6 (C9 pre-build and blocker reviews, 2026-10-17) and D1–D4 (C9 design-freeze review, approved 2026-10-18; D1 settled from the frozen contracts 2026-10-19), over the Plan contract frozen by C8P1 (`DOMAIN_CONTRACTS.md` "Plan compatibility amendment (C8P1, cattle campaign)"; receipt `receipts/C8P1.json`). No Plan or C0–C8 change is needed or allowed.

### B1 — delegation (input model)

- **Request.** `CattlePlanRequest = { cattle: CattleRecommendationRequest; groupScopes: { groupRef: string }[] }`, entry point checked whole with `toCanonicalPlainData` plus a field-presence policy (fail closed); the C8 trusted inputs (`RecommendationTrustedInputs`, the C2 implementation registry) are the only trusted parameter. No caller-supplied C2 / C7 / C8 output, no caller-supplied ledgers for C4, no caller-supplied mapping configuration (every mapping is a compiled-in C9 table).
- **Pinned call shapes** (exactly as C8 composes them in `recommendations/evaluation-context.ts`, the same canonical request and viewpoint): C8 `recommendCattle(cattle, hash, trusted)`; C2 `evaluateHerdObligations({ ledgers: <the C1-rematerialised request ledgers, sorted by animal id>, evidence: cattle.obligations.evidence, catalogue: cattle.obligations.catalogue, implementations: trusted.obligationImplementations, query: { effectiveAt, knowledgeCutoff, obligationIds: cattle.obligations.obligationIds } }, hash)`; C7 `evaluateHealthProgrammes({ ...cattle.programmes, ledgers: cattle.ledgers, health: cattle.health, obligations: cattle.obligations, query: { effectiveAt, knowledgeCutoff } }, hash, { obligationImplementations: trusted.obligationImplementations })`; C4 `resolveGroupScope({ scope: { kind: "GROUP", groupRef, ledgers: cattle.ledgers }, query: { effectiveAt, knowledgeCutoff } }, hash)` per `groupScopes` entry. C9 never builds a second interpretation of how the common request is materialised for these engines.
- **Structural equivalence (required test, fail closed).** For every animal, C9's C2 record fingerprints equal C8's sealed-context `obligations.recordFingerprints`, and C9's C7 animal-status fingerprints equal C8's `programmes.animalStatusFingerprints`, for the same request and viewpoint. A mismatch is an internal invariant failure: C9 returns an issue and no proposals.

### B2 — subjects and scope

- C1 animal ids → `{ type: "CATTLE_ANIMAL", id }`; C1 management-group values → `{ type: "CATTLE_GROUP", id }`. Never `ANIMAL` / `ANIMAL_GROUP` (V1 rows), never reinterpreted.
- Individual-animal work: `TargetScope` `STATIC` with the `CATTLE_ANIMAL` member. Group work: `DYNAMIC` `MEMBERS_OF { parent: CATTLE_GROUP ref, memberType: "CATTLE_ANIMAL" }`, additions policy `ABSORB_INTO_JOB`.
- `ScopeReality` per group selector from C4: every member `MEMBER` / `NOT_MEMBER` ⇒ `KNOWN` with the `MEMBER` animals; any member `UNKNOWN`, `EVIDENCE_CONFLICT` or `INVALID` ⇒ the whole selector `UNKNOWN` with a deterministic reason (all-or-unknown; Plan has no partial membership).

### B3 — creation source

C2 obligation → `FARM_RETURN / OBLIGATION`; C7 programme → `FARM_RETURN / PROGRAMME`; C8 data-gap action (`benefitClaim: NONE`) → `FARM_RETURN / DATA_GAP`; standalone modelled C8 recommendation → `FARM_RETURN / RECOMMENDATION`; a proposal group with more than one distinct Farm Return origin → `FARM_RETURN / COMPOSITE`. `COMPOSITE` is a projection only — the canonical group keeps every individual origin and its provenance. Never `ADVISER_APPROVED` for a C8 recommendation (unreviewed).

### B4 — priority (C8P1-frozen tiers)

- C2: classification `LEGAL_REQUIRED` / `LEGAL_CONDITIONAL` / `SCHEME_CONDITIONAL` with gate role `HARD_GATE` in a resolved state (`UPCOMING`, `OUTSTANDING`, `OVERDUE`, hard-gate `BLOCKED`) → `HARD_OBLIGATION`; resolved advisory / non-hard management work (incl. `ADVISORY_FAIL`) → `ROUTINE_MANAGEMENT`; evidence-resolution work (any unresolved state) → `INFORMATION_VALUE`, the possible underlying obligation kept in provenance and blockers, never promoted.
- C7 work with no stronger evidence-backed priority → `ROUTINE_MANAGEMENT`.
- C8 by an explicit, compile-checked table over the C8 action kinds C9 consumes (D4): the default-registry kinds — `RECORD_WEIGHT` → `INFORMATION_VALUE`; `DECLARE_PRODUCTION_GOAL` → `INFORMATION_VALUE`; `REVIEW_WITHDRAWAL_STATUS` → `INFORMATION_VALUE` (the planned work establishes authoritative status); `RESOLVE_OBLIGATION_EVIDENCE` → `INFORMATION_VALUE` when not folded (evidence resolution); `COMPLETE_PROGRAMME_ACTION` → `ROUTINE_MANAGEMENT` when not folded (C7 rule). Modelled actions supplied by a registry map by their C8 tier only for `EXPECTED_NET_RETURN` → `EXPECTED_NET_RETURN`, `VALUE_OF_INFORMATION` → `INFORMATION_VALUE`, `AVOID_MATERIAL_LOSS` → `AVOID_MATERIAL_LOSS`. A C8 `SAFETY_LEGAL_WELFARE` label never establishes `HARD_OBLIGATION` and is never a blanket fallback: any action kind not in the compiled table that is not a modelled action with one of those three tiers fails closed (C9 issue `CATTLE_PLAN_ACTION_KIND_UNMAPPED`, no proposal) — no default tier.

### B5 — timing and hard-deadline authority (D1)

- **D1 (frozen-contract finding, Case A).** C2's documented state precedence makes "window source not a rule binding" rule-level `UNSUPPORTED` with `window: null` (`obligation-engine.ts` 382 / 398), so every C2 record with a window comes from a rule whose `sourceBindings` include its definition's `windowSource`; C0 `evaluateCattleRule` emits exactly one `sourceChecks` entry per rule source binding (`evaluation.ts` 212). Therefore, for a C2 record with a non-null window whose `ruleEvaluation.sourceChecks` has **exactly one** entry, that entry's bound `SourceVersionRef` **is** the window source by contract.
- **Hard deadline.** Only for C2 classification `LEGAL_REQUIRED` / `LEGAL_CONDITIONAL` / `SCHEME_CONDITIONAL`, gate role `HARD_GATE`, a non-null window, exactly one source check, and that check `CURRENT`: `HARD_DEADLINE { dueIso: window.dueAt, authority: { kind: "VERSIONED_SOURCE", sourceId, version, contentFingerprint } }` from that check's `bound` reference (plus the recommended window `opensAt..dueAt`).
- **Authority not provable.** Same legal / scheme hard-gate record with a window but two or more source checks, or a single check that is not `CURRENT`: no hard deadline; the window becomes a `RECOMMENDED_WINDOW` whose basis states why; an `UNKNOWN` blocker with reason `DEADLINE_AUTHORITY_NOT_UNIQUELY_ESTABLISHED`; provenance records the source checks seen. C9 never reads the catalogue to find the window source (CAT-INV-023) and never changes C0 / C2 / Plan.
- C2 non-hard / advisory windows → `RECOMMENDED_WINDOW`; C2 with no window → no timing. C7 occurrence windows → `RECOMMENDED_WINDOW` (no C7 contract proves hard authority). C8 → no timing. Never an invented date or authority.

### B6 — state → proposal (total, compile-checked `satisfies Record<…>` tables)

- **C2:** `NOT_APPLICABLE`, `NOT_TRIGGERED`, `SATISFIED`, `SATISFIED_LATE` → no proposal. `UPCOMING`, `OUTSTANDING`, `OVERDUE` → proposal. `ADVISORY_FAIL` → proposal (advisory / management priority). `UNKNOWN`, `INSUFFICIENT_EVIDENCE`, `EVIDENCE_CONFLICT`, `INVALID_EVIDENCE`, `UNSUPPORTED`, `REVIEW_REQUIRED` → proposal (evidence-resolution work) with an `UNKNOWN` blocker. `BLOCKED` (hard-gate FAIL) → proposal with an `ACTIVE` blocker. Unresolved evidence never counts as completion.
- **C7:** `NOT_APPLICABLE`, `COMPLETED` → no proposal. `UPCOMING`, `DUE`, `OVERDUE` → proposal. `BLOCKED` → proposal with an `ACTIVE` blocker. `UNKNOWN`, `INSUFFICIENT_EVIDENCE`, `EVIDENCE_CONFLICT`, `REVIEW_REQUIRED`, `INVALID_EVIDENCE` → proposal with an `UNKNOWN` blocker where a concrete programme action exists.
- **C8:** `NO_RECOMMENDATION` → no proposal. `ACTIONABLE` → proposal. `BLOCKED` with a concrete proposed action → proposal with an `ACTIVE` blocker. `REVIEW_REQUIRED` / `INSUFFICIENT_EVIDENCE` with a concrete proposed or evidence-resolution action → proposal with an `UNKNOWN` blocker. No concrete action → nothing invented.

### C8 restatement folding (D2)

A C8 work item folds into an authoritative C2 / C7 work item (becoming supporting provenance; no separate job) only when ALL hold: (1) a trigger reason code of its proposed action parses under the frozen C8 grammar `CATTLE_RECOMMENDATION_TRIGGER_OBLIGATION_<STATE>:<JSON [obligationId, occurrenceId]>` or `CATTLE_RECOMMENDATION_TRIGGER_PROGRAMME_<STATE>:<JSON [programmeId, actionId, occurrenceId]>` (`recommendation-engine.ts` 204 / 220); (2) the exact cited C2 obligation occurrence / C7 occurrence exists among C9's own work items; (3) the animal matches; (4) the action kind is in the compile-time whitelist `RESOLVE_OBLIGATION_EVIDENCE` ↔ C2, `COMPLETE_PROGRAMME_ACTION` ↔ C7; (5) the grammar and link are pinned by round-trip tests against real C8 output. Any condition failing ⇒ a separate proposal (never a guessed equivalence). A valid action citing several items adds provenance to each cited item; Plan identity alone decides whether those authoritative jobs merge.

### Blockers (D3)

- Kind: a C3 withdrawal gate → `LEGAL_WINDOW`; every other current cattle gate (C2, C7, C8 generated) → `OTHER`. The B5 deadline-authority blocker → `OTHER`.
- Status (from the C0 gate state, total table): `PASS` / `NOT_APPLICABLE` → `CLEARED`; `FAIL` → `ACTIVE`; `INSUFFICIENT_EVIDENCE` / C0's conflicting-evidence state / `UNSUPPORTED` / `REVIEW_REQUIRED` and generated not-evaluated gates → `UNKNOWN`.
- Identity: `PlanBlocker.id` is a namespaced canonical serialisation of the minimum tuple that identifies the gate instance — `[sourceFamily, authoritative output id + fingerprint digest, gate rule id, subject (type, id), obligation / occurrence id or null]` — never `ruleId + source + animal` alone. One blocker per id, shared by every job it affects; identity and collision behaviour pinned by tests.

### Canonical vocabulary, object, provenance and fingerprints

- **One compiled vocabulary table** drives both the Plan action projection and the completion / `CanonicalEvidence` projection. Keys are namespaced (`CATTLE_OBLIGATION:<obligationKind or obligationId>`, `CATTLE_PROGRAMME:<programmeId>:<actionKind>`, the explicit C8 action kinds) so source families never merge through coincidentally equal strings. Each row defines: source family, Plan action key, completion contract, the canonical record kinds / decision keys that can prove completion (each citing the owning canonical record), and evidence-backed vs `MANUAL`. Where authoritative evidence cannot reliably prove completion ⇒ `MANUAL`; no other completion vocabulary exists.
- **One canonical object.** Each work item keeps: origin / source family, authoritative upstream output id / reference and fingerprint, subject, consumed state, reason codes, timing and its basis, gates / blockers, vocabulary row, creation origin, priority and its basis. Proposal groups keep every origin. `supportingReasons`, provenance, blockers, creation source, priority, completion evidence and fingerprints are each produced by one projection / serialiser from these objects — never rebuilt independently.
- **Fingerprint.** A phase-local wrapper with a new kind and payload version (`FINGERPRINTS.md`) over the canonical work items and groups, not the lossy Plan projections. A consumed upstream fact that changes ⇒ the fingerprint changes; a non-consumed input ⇒ unchanged.

### Merge algebra (proposal groups by `planJobIdentityKey`)

Associative, commutative, idempotent, input-order independent; no source precedence. Supporting reasons, evidence references and blocker ids: union. Same blocker id: require equal (one request, one viewpoint; mismatch fails closed). Window basis: sorted union. Hard deadline: earliest `dueIso` (every deadline must be met); all authorities kept in provenance; the projected authority is chosen by canonical key, never input order; a hard deadline beats none. Priority: highest tier; bases unioned. Scope, completion contract, title and route: require equal (one vocabulary table makes them equal by construction). Creation source: one distinct origin → that reason; more than one → `COMPOSITE`.

### Trust boundary

C9 persists nothing; it obtains predecessor semantics only through the delegated in-process path above; no C9 public API turns an untrusted stored C9 object or C8 pack into authoritative Plan work. CAT-INV-028 is unchanged.

### Required test-first matrix (written before production behaviour; table-driven / metamorphic)

1. total mapping of every C2 state; 2. every C7 state; 3. every C8 outcome and every consumed C8 action kind (unmapped kind fails closed); 4. every C0 gate state; 5. every C4 membership state; 6. C9 ↔ C8 C2 / C7 fingerprint equivalence; 7. C8 restatement grammar round trip against real C8 output; 8. restatement whitelist (non-whitelisted kind, wrong animal, missing cited item ⇒ separate); 9. blocker identity and collision; 10. vocabulary consistency between Plan projection and `CanonicalEvidence`; 11. provenance mutation / metamorphic matrix; 12. relevant vs irrelevant fingerprint changes; 13. merge permutation / partition-remerge / duplicate idempotence / canonical fixed point; 14. real Plan round trips through `createPlanJob`, `resolveScope`, `evaluateCompletion` and `reevaluatePlanJob`; 15. a guard that no `src/domain/plan` file changes. D1 additionally pinned: a single `CURRENT` binding ⇒ `VERSIONED_SOURCE` equal to that reference; two bindings or a non-`CURRENT` single binding ⇒ no hard deadline, recommended window, `UNKNOWN` blocker `DEADLINE_AUTHORITY_NOT_UNIQUELY_ESTABLISHED`; and a C2 definition whose window source is not a rule binding yields rule-level `UNSUPPORTED` with no window (the C2 guarantee D1 relies on).

## Objective

Expose Cattle outputs to the Plan kernel safely: a pure, cattle-owned adapter that translates C2 obligations, C7 programme actions and C8 recommendations into the EXISTING Plan kernel input contracts (`src/domain/plan/` — job creation inputs, target scope/scope reality, completion contracts and canonical evidence, timing windows, action routes) without duplicating cattle truth or cattle calculations inside Plan. Cattle continues to own animal truth, lifecycle, obligations, health state, performance, goals, programme state and recommendations.

## Scope

1. Read the Plan kernel (`src/domain/plan/*.ts`, its DOMAIN_CONTRACTS.md section and `.agent/skills/plan-domain.md`) and map onto its existing types only. Plan code is NOT modified.
2. Job proposals: pure functions producing Plan job-creation inputs (existing kernel input type) from (a) C2 OUTSTANDING/OVERDUE/UPCOMING obligations, (b) C7 DUE/OVERDUE/UPCOMING programme occurrences, (c) C8 recommendations per design freeze B6 (ACTIONABLE, and BLOCKED / REVIEW_REQUIRED / INSUFFICIENT_EVIDENCE only where C8 supplies a concrete proposed action) — each with stable action key, creation source per design freeze B3 from the C8P1-frozen `PlanCreationSource` vocabulary (no new variant), supporting reasons referencing cattle output ids/fingerprints, target scope per design freeze B2 (`CATTLE_ANIMAL` / `CATTLE_GROUP`), timing per design freeze B5, system priority per design freeze B4, and dependencies/blockers from cattle hard gates (BLOCKED/UNKNOWN become Plan blockers, never dropped).
3. Deduplication identity consistent with the Plan kernel (`planJobIdentityKey`): several cattle reasons for the same real work ⇒ one proposal with several supporting reasons.
4. Dynamic scope reality: a pure function producing the Plan `ScopeReality` for cattle selectors from C4 group scope / C1 snapshots at an instant (members; unknown membership surfaced, never silently included/excluded).
5. Completion evidence: a pure function producing Plan `CanonicalEvidence` from cattle canonical records (C2 fulfilment evidence, C3 administrations/vet events, C4 weights, C6 declarations) so data-linked Plan jobs complete from canonical cattle data — never a Plan-owned copy; unknown ⇒ unavailable, never zero/complete.
6. Action routes: map to existing `PlanActionRoute` kinds only; no cattle workflow route exists, so every proposal carries `{ kind: "NONE", reason: "MANUAL_TASK" }` (documented) — never an invented route and never a V1 `LIVESTOCK_GROUP` route for a C1 group.
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
