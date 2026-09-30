# Task: Campaign C — implement repository-verified rules within existing architecture

Starting HEAD: 942cc81e589448ea6162645b62a8c921a073fd53

Task ID: campaign-c-verified-rules-existing-architecture-20260929

## Current campaign state

Campaign C is AI_SCIENTIFIC_ADJUDICATION, EXPERT_VALIDATION_PENDING, DRAFT. Production scientific
changes are evidence-gated. Only rules already classified REPOSITORY_VERIFIED may change production
scientific behaviour in this task. Rules still classified AI_REVIEW_ONLY or AI_PROVISIONAL must not
change production outputs. Current engine: nutrient_engine_v1.2.0. CC-B2 resolved. CC-B4 resolved
through CC-B4A. CC-B3 deferred (lifecycle persistence requires a migration). GAP-04 independent
per-nutrient P/K handling deferred as a separate architecture task.

## Goal

Implement only those Campaign C scientific rules that:

1. are already REPOSITORY_VERIFIED;
2. have stored, traceable source evidence in the repository;
3. fit safely within the existing production architecture;
4. do not require inventing a new rate/allocation architecture;
5. can be covered with deterministic regression tests.

Do not force implementation of every verified rule. If a verified rule has no safe existing
architectural home, classify it IMPLEMENTATION_DEFERRED_ARCHITECTURE rather than inventing a new
subsystem in this task.

## Repository-verified rules eligible for review

1. Low-index organic-share guidance: P Index 1/2 organic contribution should not exceed 50% of
   applicable crop P requirement; K Index 1/2 should not exceed 75% of applicable crop K requirement.
2. 90 kg K spring guidance text: Teagasc directly states the spring K guidance around the 90 kg K/ha
   threshold and later application of the remainder. The exact Farm Return interpretation of how
   slurry K should count toward this limit remains NOT fully source-direct.
3. Yield scaling: first-cut context supports ±25 kg N/ha, ±4 kg P/ha and ±25 kg K/ha per 1 t DM/ha
   change, within the supported source context only.
4. Rate-selection principles: determine nutrient content; base application on crop nutrient
   requirement/allowance; account for slurry contribution before chemical fertiliser planning.

The exact algorithm AI_PROVISIONAL_RATE_SELECTOR_V1 is NOT repository-verified and must not be
implemented merely because the principle is verified.

## Still provisional — do not implement

- counting slurry K toward the 90 kg K spring limit as a Farm Return hard rule;
- exact 1 February–30 April production boundary;
- the claim that share caps definitely stack with availability factors;
- AI_PROVISIONAL_RATE_SELECTOR_V1;
- independent per-nutrient P/K architecture;
- crop-cycle persistence requiring migration.

## Required architecture trace

1. Where is crop P requirement calculated?
2. Where is crop K requirement calculated?
3. Is there a distinct allocation layer where organic nutrient contribution, crop nutrient
   requirement and remaining chemical nutrient requirement are represented separately?
4. Is there already a safe place to apply the 50% P and 75% K organic-share caps?
5. Would applying these caps require a new rate selector, splitting the paired P/K model, changing
   allocation architecture or adding persistence? If yes, defer rather than force implementation.
6. Trace current yield scaling for N, P and K.
7. Determine whether P/K yield scaling already exists and whether N scaling is missing.
8. Identify supported yield ranges and contexts from repository evidence.
9. Trace where yield-scaled N/P/K requirements feed: nutrient plan; fertiliser products; slurry
   economics; What Matters; reports.
10. Identify any current handling of the 90 kg K guidance.
11. Confirm whether current code distinguishes nutrient content/credit from application/timing
    constraint.
12. Confirm whether the current architecture has a legitimate home for the verified rate principles
    without implementing the provisional selector.

## Rule A — organic-share caps

For P Index 1/2: maximum organic-fertiliser contribution = 50% of applicable crop P requirement.
For K Index 1/2: maximum organic-fertiliser contribution = 75% of applicable crop K requirement.
These are not the same as slurry P availability ×0.50 or slurry K availability ×0.90. Do not alter
slurry nutrient concentration or availability factors to implement the share caps. Do not silently
multiply slurry P by 0.50 again or slurry K by 0.75. The share caps belong at the crop
requirement/allocation layer. Implement only if the existing architecture already has a clear
representation of crop requirement, organic contribution and remaining chemical requirement and the
caps can be applied there without inventing a new rate/allocation engine. If not, classify
IMPLEMENTATION_DEFERRED_ARCHITECTURE and document exactly what capability is missing. Do not build
that architecture in this task.

## Rule B — 90 kg K spring guidance

The exact Farm Return rule "count slurry K toward the 90 kg limit and constrain the application
accordingly" remains AI_PROVISIONAL. Do not introduce a new 90 kg production gate unless existing
production code already implements it in a way independently supported by repository evidence. Do
not truncate slurry K nutrient credit to 90 kg. If current code already contains a 90 kg K rule,
trace it, classify it, add tests if needed, do not broaden it. If no safe verified implementation
exists, mark DEFERRED_EXACT_RULE_PROVISIONAL. Do not invent one.

## Rule C — yield scaling

Per 1 t DM/ha difference in supported target yield: N 25, P 4, K 25 kg/ha. If P and K scaling are
already implemented and match, classify ALREADY_IMPLEMENTED_REPOSITORY_VERIFIED and add/strengthen
regression tests. If N scaling is missing, implement only if target yield is already a trusted
input, the current first-cut yield model already supports the relevant range, no new user-input
architecture is required, and no unsupported extrapolation is introduced. Do not invent bounds. If
the repository does not define safe yield bounds, classify N scaling
IMPLEMENTATION_DEFERRED_SUPPORTED_RANGE_UNCLEAR and do not alter production output.

## Rule D — rate principles

If current production behaviour already follows the verified principles, classify
ALREADY_IMPLEMENTED_REPOSITORY_VERIFIED and add tests/documentation only where needed. Do NOT
implement AI_PROVISIONAL_RATE_SELECTOR_V1 or min(P-limited-rate, K-limited-rate). Do not create a
new rate engine.

## Engine versioning

If no production output changes, do not bump nutrient_engine_v1.2.0. If a repository-verified rule
changes production calculation semantics, follow the lifecycle contract and record affected/new
version, rule ID, source evidence, and no historical-record rewrite.

## Campaign C status

Must remain AI_SCIENTIFIC_ADJUDICATION, EXPERT_VALIDATION_PENDING, DRAFT. Do not mark APPROVED,
HUMAN_VALIDATED, EXPERT_APPROVED or PRODUCTION_SCIENCE_COMPLETE.

## Testing

For every implemented or confirmed rule add deterministic tests. At minimum: P 50% / K 90% slurry
availability factors unchanged; organic-share cap tests if implemented; N yield-scaling tests if
implemented; CC-B2 complete-data behaviour unchanged; CC-B4A missing-index behaviour unchanged; no
new 90 kg K nutrient-credit truncation; rate selector absent; statutory/NAP unchanged; engine
version correct. Run targeted Campaign C tests, relevant nutrient-domain and slurry/economic tests,
npm run typecheck, npm run build, full npm test if permitted.

## Production reachability

For every implemented rule record where it enters the engine, which outputs it can affect,
Nutrients / Scientific Evidence Report / What Matters reachability; live-user exposure UNKNOWN.

## Documentation

Update only the minimum required (SCIENCE_FREEZE.md, SOURCES_AND_CLAIMS.md,
AI_ADJUDICATION_2026-09-29.md, BLOCKERS.md, BUILD_STATE.json, IMPLEMENTATION_LOG.md,
evidence-register.md where appropriate). For each verified rule record implementation status as
exactly one of: IMPLEMENTED; ALREADY_IMPLEMENTED_REPOSITORY_VERIFIED;
IMPLEMENTATION_DEFERRED_ARCHITECTURE; IMPLEMENTATION_DEFERRED_MISSING_INPUT;
IMPLEMENTATION_DEFERRED_SUPPORTED_RANGE_UNCLEAR; DEFERRED_EXACT_RULE_PROVISIONAL; NOT_APPLICABLE.
Do not mark something implemented merely because its science is verified.

## Prohibited work

Do not: build a new general rate/allocation engine; implement AI_PROVISIONAL_RATE_SELECTOR_V1;
redesign independent P/K evidence handling; create migrations; implement CC-B3 persistence;
reinterpret Campaign B regulation; alter statutory/NAP science without direct authority; change UI;
fix unrelated optional follow-ups; change the "Slurry nutrient credit not included" headline; fix
MEASURED provenance labelling; fix January spring classification; modify the agent harness; push;
deploy; use external web research.

## STOP conditions

Return BUILD_RESULT: BLOCKED <reason> if: (1) implementing the share caps requires creating a new
rate/allocation architecture; (2) implementing N yield scaling requires unsupported yield bounds;
(3) the verified rule conflicts with stronger stored evidence; (4) a migration is required; (5) the
change would require splitting the paired P/K architecture; (6) a supposedly verified rule still
depends materially on AI_PROVISIONAL interpretation; (7) Campaign B regulatory behaviour would need
reinterpretation; (8) statutory calculations would need unsupported change; (9) scope expands
materially beyond existing architecture. A STOP affecting one rule does not require the entire task
to fail if other rules can safely be confirmed or implemented; prefer IMPLEMENTATION_DEFERRED_...
for individual rules. Only return overall BLOCKED if the task as a whole cannot make a truthful,
safe checkpoint.

## Audit flow

After a successful build: ./scripts/agent-audit --primary; for actual Critical/High findings
./scripts/agent-fix; then ./scripts/agent-audit --remediation <finding-id>; finally
./scripts/agent-audit --final. Do not run baseline-wide historical audits.

Verify command: `npm run typecheck && npm run build`
