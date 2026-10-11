# Cattle C8 — Recommendation Engine

Predecessor: C7 (frozen by the campaign receipt `receipts/C7.json`)
Phase directory (new): `src/domain/cattle/recommendations/`
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
