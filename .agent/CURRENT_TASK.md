# Task: Campaign C — ingest AI scientific adjudication with repository evidence gate

Starting HEAD: 2b6da92b70f765a4f7f6c3d5f23404f8ab41d99e

## Purpose

Move Campaign C forward using the authorised AI scientific review.

The previous CC-B1 repository-only review was correctly blocked because important external
scientific evidence was absent from the repository.

An independent AI research pass has now reviewed current authoritative Teagasc material.

This task must:

1. record that external evidence transparently;
2. distinguish source-direct science from derived implementation choices;
3. update Campaign C's scientific rule state;
4. implement only those provisional v1 behaviours that are supported strongly enough and
   fit the existing architecture safely;
5. preserve a complete audit trail for later blinded expert validation.

This is NOT expert validation.

Do not describe any rule as agronomist-approved, peer-reviewed by Farm Return, or externally
expert-approved.

The correct status is:

AI_SCIENTIFIC_ADJUDICATION

with:

EXPERT_VALIDATION_PENDING

where applicable.

Nothing may be pushed or deployed.

---

# 1. Evidence classification

Every scientific rule used in this task must be classified as exactly one of:

SOURCE_DIRECT
- explicitly stated by an authoritative source.

SOURCE_DERIVED
- arithmetic or logical consequence of authoritative source statements.

AI_PROVISIONAL
- Farm Return implementation rule selected by AI where authoritative evidence defines the
  principle but not the exact algorithm.

Never relabel an AI_PROVISIONAL rule as SOURCE_DIRECT.

All resulting decisions must retain this classification in the evidence trail.

---

# 2. Authorised AI adjudication

The following is the authorised scientific adjudication for this task.

## CONF-01 — spring LESS phosphorus value

Classification:

RESOLVED

Evidence class:

SOURCE_DIRECT

Rule:

For cattle slurry with known 6% dry matter applied by supported spring LESS:

N = 1.0 kg/m3
P = 0.5 kg/m3
K = 3.5 kg/m3

The 0.6 kg P/m3 value belongs to the 7% DM row.

When DM-specific evidence is available, the DM-specific table takes precedence over a generic
"typical slurry" summary value.

Do not alter this value to 0.6 for 6% DM.

---

## CONF-02 — 90 kg K/ha

Classification:

RESOLVED_WITH_SCOPE

Evidence class:

SOURCE_DIRECT for the 90 kg application guidance.
AI_PROVISIONAL for the Farm Return reconciliation with slurry nutrient credit.

Scientific evidence:

Where more than 90 kg K/ha is advised, authoritative Teagasc guidance says only 90 kg K/ha
should be applied in spring, with the remainder applied after silage/aftermath or later in
the year because of luxury K uptake.

Farm Return v1 interpretation:

The 90 kg K/ha figure is an application/timing constraint.

It is NOT a nutrient-content truncation rule.

Therefore:

- do not change the actual calculated available K contained in slurry from e.g. 115.5 to 90;
- preserve the actual nutrient credit;
- separately prevent a Farm Return spring application recommendation from intentionally
  delivering more than the applicable 90 kg K/ha spring limit;
- any remainder must remain identifiable for later application rather than disappearing.

This reconciliation must remain marked AI_PROVISIONAL pending prospective expert validation.

Do not describe it as direct Teagasc wording.

---

## CONF-03 — low-index organic P/K treatment

Classification:

RESOLVED

Evidence class:

SOURCE_DIRECT

Two different layers apply.

### Nutrient availability

On soil P Index 1 or 2:

available slurry P = base available slurry P × 0.50

On soil K Index 1 or 2:

available slurry K = base available slurry K × 0.90

### Organic share of crop requirement

For P Index 1 or 2:

maximum organic-fertiliser contribution = 50% of applicable crop P requirement.

For K Index 1 or 2:

maximum organic-fertiliser contribution = 75% of applicable crop K requirement.

These rules operate at different layers.

Do not choose one instead of the other.

Do not multiply the crop requirement itself by the nutrient-availability factor.

Do not apply the organic-share percentage to the slurry nutrient concentration.

Maintain explicit lineage showing which rule affected which calculation.

---

## CONF-04 — spring nutrient-value class

Classification:

RESOLVED_WITH_SCOPE

Evidence class:

SOURCE_DIRECT plus explicit Farm Return product scope.

Rule:

For Campaign C v1, the standard spring slurry nutrient-value class is:

1 February through 30 April.

Do not claim that January slurry application is universally agronomically invalid.

Instead:

January is outside the Campaign C v1 spring nutrient-value evidence class unless another
supported rule explicitly covers it.

This is a scope/evidence-class boundary, not a universal agronomic prohibition.

---

## GAP-01 — deterministic slurry-rate selection

Classification:

PROVISIONALLY_RESOLVED

Evidence:

SOURCE_DIRECT for the principle that slurry rate should be based on crop nutrient requirements,
particularly P and K, and should not intentionally exceed crop demand.

AI_PROVISIONAL for the exact deterministic selector.

Authorised provisional v1 selector:

1. determine applicable crop P requirement;
2. determine applicable crop K requirement;
3. apply soil-index rules;
4. apply applicable organic-share constraints;
5. account for relevant prior nutrient inputs supported by evidence;
6. calculate the maximum slurry rate permitted by the P constraint;
7. calculate the maximum slurry rate permitted by the K constraint;
8. choose the lower agronomically permissible slurry rate;
9. then apply separate timing, regulatory, weather/actionability and operational constraints.

The min(P-limited rate, K-limited rate) algorithm MUST be labelled:

AI_PROVISIONAL_RATE_SELECTOR_V1

It must never be represented as a direct Teagasc formula.

If the current architecture cannot implement this without substantial redesign, do not force
it. Record the scientific/algorithmic rule and defer the architecture implementation.

---

## GAP-02 — slurry DM interpolation

Classification:

PROVISIONALLY_RESOLVED

Evidence class:

AI_PROVISIONAL conservative policy based on discrete SOURCE_DIRECT tables.

Rule:

Do not invent continuous interpolation between published slurry DM classes.

Published classes currently supported by the scientific evidence include the repository's
authoritative discrete values.

Where reliable laboratory N/P/K values exist, use those directly under their provenance.

Where DM matches a supported published class, use that class.

Where measured/declared DM falls between unsupported classes and no validated direct N/P/K
analysis exists:

do not silently linearly interpolate.

Fail closed or retain an honestly labelled unsupported/provisional state using the existing
evidence architecture.

Do not introduce invented precision.

---

## GAP-03 — target-yield scaling

Classification:

RESOLVED_WITH_SCOPE

Evidence class:

SOURCE_DIRECT

The authoritative first-cut guidance supports adjustment around its reference yield using:

25 kg N/ha
4 kg P/ha
25 kg K/ha

per 1 tonne DM/ha difference in target yield.

Only implement this within yield ranges already supported by repository evidence.

Do not extrapolate indefinitely.

If supported yield bounds are not established in repository evidence, record the scaling rule
but do not broaden production calculation beyond existing supported bounds.

---

## GAP-04 — mixed P/K indices

Classification:

RESOLVED

Evidence class:

SOURCE_DIRECT

Scientific rule:

P Index governs phosphorus rules.

K Index governs potassium rules.

P and K are scientifically separate fertility dimensions.

However:

CC-B4A deliberately retained the existing paired P/K plan architecture.

Do NOT redesign that architecture inside this task merely because the science supports
independence.

Record GAP-04 as scientifically resolved but:

IMPLEMENTATION_ARCHITECTURE_DEFERRED

if implementing it requires splitting the current paired P/K evidence model.

Do not reopen CC-B4A.

---

## GAP-05 — slurry evidence hierarchy

Classification:

RESOLVED_WITH_SCOPE

Evidence class:

SOURCE_DIRECT plus provenance policy.

Use the following hierarchy:

Level A — laboratory measured
Actual slurry N/P/K/DM laboratory analysis.

Level B — measured DM / authoritative derived nutrient values
Hydrometer or other supported DM measurement mapped to authoritative nutrient tables.

Level C — farmer-declared assumption
Explicit declaration such as "typical 6% DM slurry".

Level D — unknown
No adequate evidence.

Do not represent Level B or C as laboratory-measured evidence.

Do not silently promote Level C to Level A/B.

Preserve provenance with the calculation.

---

## GAP-06 — default assumptions

Classification:

PROVISIONALLY_RESOLVED

Evidence class:

AI_PROVISIONAL safety policy.

Rule:

No silent slurry-DM assumption may be presented as measured scientific evidence.

A farmer may explicitly choose or declare a supported assumption such as "typical 6% DM".

If so, record it explicitly as ASSUMED / FARMER_DECLARED or the repository's equivalent
provenance state.

Unknown must remain unknown.

Do not silently convert missing evidence into a 6% DM observation.

---

## GAP-07 — sward classification

Classification:

RESOLVED_WITH_SCOPE

Evidence class:

SOURCE_DIRECT

Relevant rules:

Recently reseeded grass-sward guidance uses the existing supported 0–3 year category where
present in the authoritative evidence.

For grass-white-clover nutrient strategy, approximately 20% or greater average annual white
clover content is the evidence threshold for the relevant reduced-N strategy.

Early-season clover contribution is lower.

Do not create a generic rule saying any visible clover permits reduced nitrogen.

Only implement where the current Farm Return domain has sufficient inputs to distinguish the
supported category honestly.

Otherwise record the scientific rule and defer implementation.

---

## GAP-08 — prior nutrient inputs

Classification:

RESOLVED_WITH_SCOPE

Evidence class:

SOURCE_DIRECT for accounting for prior relevant nutrient applications.
AI_PROVISIONAL for the bookkeeping boundary where the source does not define an exact database
window.

Rule:

Prior nutrient inputs attributable to the current crop cycle must be considered.

Do not use an arbitrary 30-day / 90-day rule merely for convenience.

For first-cut silage, relevant fertiliser or organic nutrient inputs applied before closing
that contribute to the crop must be included.

Existing authoritative guidance also indicates that a portion of early grazing N can remain
available to the silage crop.

The correct conceptual boundary is:

CURRENT_CROP_CYCLE

If the existing domain cannot identify the crop cycle safely, record the rule but do not add a
speculative time window.

---

# 3. External scientific source record

Update the Campaign C source/evidence registry with the external AI research.

Primary authoritative organisation:

Teagasc — Agriculture and Food Development Authority, Ireland.

Relevant source titles reviewed include:

- Organic Manures
- Fertilising for First Cut Grass Silage
- Correct fertiliser application rates and cutting dates for first-cut silage
- Fertilising 1st Cut Grass Silage
- Nutrient management of white clover swards
- Using white clover to reduce nitrogen fertilisation
- Teagasc soil fertility / soil index guidance
- Teagasc material on slurry dry-matter measurement and nutrient composition
- Teagasc crop-management guidance covering prior P/K applications

The source record must state clearly:

EXTERNAL_RETRIEVAL_PERFORMED_BY_AUTHORISED_AI_REVIEW
DATE: 2026-09-29

Do not claim Claude retrieved these sources.

Do not invent SHA-256 source fingerprints.

Do not claim local copies exist unless they actually do.

Where the repository already contains a locally traceable version/extract, link the claim to
both the local evidence and the external AI review.

Where only the external AI review establishes the claim, mark that provenance explicitly.

---

# 4. Campaign C state

Replace the previous blanket statement that CC-B1 requires a named agronomist before AI can
continue.

The correct state is now:

AI scientific adjudication performed.

Expert prospective validation pending.

The future expert-validation strategy is:

- freeze a representative set of Farm Return cases;
- Farm Return generates decisions without expert answers;
- an expert independently evaluates the same cases without seeing Farm Return outputs;
- compare decisions only after both are frozen;
- measure agreement, numerical deviation, safety disagreement, false blocking and evidence
  agreement.

Do not claim that this future validation has occurred.

CC-B1 may be moved from BLOCKED to an appropriate state such as:

AI_ADJUDICATED_EXPERT_VALIDATION_PENDING

if the repository state model supports it.

Do not mark it HUMAN_VALIDATED or EXPERT_APPROVED.

---

# 5. Implementation phase

## Production evidence gate

A scientific rule may enter production only when its authoritative supporting evidence is
stored and traceable in the repository.

The authorised AI external review may be used to:

- discover candidate rules;
- classify evidence;
- identify likely resolutions;
- populate the scientific claims/conflict record;
- identify external sources that must be ingested.

However, an AI-review-only statement is NOT sufficient provenance for a production scientific
calculation.

For every rule considered for implementation, classify its implementation evidence as:

REPOSITORY_VERIFIED
- authoritative supporting evidence is stored locally or otherwise traceably represented in
  the repository with sufficient source/page/table/section metadata.

AI_REVIEW_ONLY
- the rule is supported by the authorised AI external review, but the underlying authoritative
  source evidence has not yet been stored/verified in the repository.

Only REPOSITORY_VERIFIED rules may change production scientific calculations in this task.

AI_REVIEW_ONLY rules must:

- be recorded in the claims/evidence register;
- retain SOURCE_DIRECT / SOURCE_DERIVED / AI_PROVISIONAL classification as appropriate;
- identify the external source that must be ingested;
- have implementation status IMPLEMENTATION_DEFERRED_EVIDENCE_INGESTION;
- not change production outputs.

This specifically applies to any value or rule whose authoritative source cannot be independently
checked by the build agent from repository evidence, including where applicable:

- the 75% organic K share cap;
- the interpretation/application of the 90 kg K/ha spring constraint;
- the 25 / 4 / 25 kg per tonne DM yield-scaling rule;
- AI_PROVISIONAL_RATE_SELECTOR_V1.

Do not implement these merely because they appear in this task text.

If repository evidence independently supports them, document the exact stored source and they
may proceed normally.

This evidence gate overrides any later instruction in this task that could otherwise be read as
permission to put an AI-review-only scientific value into production.

After updating the evidence/rule record, inspect the current production architecture.

Implement only adjudicated rules that:

1. have adequate evidence classification;
2. fit the existing domain architecture;
3. do not require a prohibited migration;
4. do not reopen previously closed corrections;
5. can be implemented with deterministic regression tests.

Do NOT force every GAP into production in one task.

For each rule classify implementation as:

IMPLEMENTED
ALREADY_IMPLEMENTED
IMPLEMENTATION_DEFERRED_ARCHITECTURE
IMPLEMENTATION_DEFERRED_MISSING_INPUT
NOT_APPLICABLE

Document why.

Priority implementation targets are:

A. confirm/freeze 6% LESS P = 0.5;
B. implement/verify the separate low-index organic-share caps without corrupting the existing
   availability factors;
C. represent the 90 kg K spring constraint separately from nutrient credit;
D. implement/verify February–April v1 spring evidence-class boundary;
E. implement AI_PROVISIONAL_RATE_SELECTOR_V1 only if it fits the existing architecture without
   substantial redesign;
F. preserve discrete DM evidence/fail-closed semantics;
G. implement yield scaling only within already-supported evidence bounds;
H. improve provenance classification where the existing model already supports it.

GAP-04 independent per-nutrient P/K architecture is explicitly NOT required in this task.

GAP-08 crop-cycle persistence is explicitly NOT permission for a database migration.

---

# 6. Safety

Do not:

- invent scientific values;
- hide AI-derived policy behind a Teagasc attribution;
- alter statutory/NAP rules unless directly required by an already-authoritative statutory
  rule;
- change Campaign B regulatory behaviour;
- change closed CC-B2/CC-B4A behaviour except where a regression test proves compatibility;
- create database migrations;
- deploy;
- push;
- modify the optimised harness;
- broaden into unrelated features.

Existing nutrient engine version:

nutrient_engine_v1.2.0

If production calculation semantics change, follow the existing lifecycle/versioning contract
and bump the engine version appropriately.

Historical calculations must not be rewritten.

---

# 7. Required tests

For every implemented rule add deterministic regression coverage.

At minimum verify:

- 6% LESS remains P = 0.5;
- 7% LESS remains P = 0.6;
- low-index availability factors remain 50% P / 90% K;
- organic-share caps operate at the requirement/allocation layer rather than corrupting nutrient
  concentration;
- the 90 kg K constraint does not truncate calculated nutrient content;
- a spring recommendation cannot intentionally allocate beyond the supported spring K constraint
  where that rule is implemented;
- Feb–Apr v1 timing boundary is deterministic;
- unsupported DM interpolation is not silently introduced;
- CC-B2 behaviour remains intact;
- CC-B4A behaviour remains intact;
- nutrient-engine version changes correctly if semantics change;
- statutory outputs do not change accidentally;
- Campaign C source/rule classifications remain internally consistent.

Run relevant domain and Campaign C tests.

Run:

npm run typecheck

Run:

npm run build

Run the full npm test suite if permitted by the harness.

---

# 8. STOP conditions

Return:

BUILD_RESULT: BLOCKED <reason>

only if:

1. supplied AI adjudication contradicts a stronger locally traceable authoritative source;
2. a proposed implementation requires a database migration;
3. implementation requires rewriting the paired P/K architecture;
4. a rule cannot be represented without inventing additional science;
5. Campaign B regulatory behaviour would need reinterpretation;
6. statutory calculations would have to be changed without authoritative statutory evidence;
7. the task would require substantial unrelated architecture work.

A STOP affecting one implementation item does not automatically invalidate the scientific
evidence ingestion.

Where safe, record the adjudication and mark that implementation item DEFERRED.

---

# 9. Completion report

Report a table with every CONF/GAP containing:

- scientific classification;
- evidence class;
- final provisional rule;
- implementation status;
- changed files/tests;
- remaining uncertainty.

Explicitly report:

- resulting Campaign C status;
- resulting CC-B1 status;
- nutrient-engine version;
- deferred architecture items;
- whether any database migration occurred;
- whether production code changed;
- whether anything was pushed.

If successful:

BUILD_RESULT: DONE

If the overall task cannot safely proceed:

BUILD_RESULT: BLOCKED <reason>

Verify command: `npm run typecheck && npm run build`
