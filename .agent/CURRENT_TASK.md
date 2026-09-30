# Task: Campaign C — complete remaining architecture, implementation and validation-prep work

Starting HEAD: 465a523585e6a4af186af44b1164b8bf114a9069

## Purpose

Advance Campaign C as far as safely possible in one harness-controlled task.

This task combines the currently known remaining Campaign C work into one bounded programme with internal phase gates.

The task must:

1. log the three outstanding follow-ups;
2. design and, where safe, implement the missing slurry rate/allocation layer;
3. implement repository-verified rules that now have a safe architectural home;
4. investigate N yield-scaling range support from existing repository evidence;
5. assess whether independent per-nutrient P/K handling can be implemented safely;
6. assess and prepare CC-B3 lifecycle persistence;
7. prepare the future blinded expert-validation framework;
8. preserve strict scientific evidence gating throughout.

This task must NOT force completion of phases that genuinely require:
- fresh external evidence;
- migration approval;
- unresolved AI_PROVISIONAL science;
- external human expert input.

Where one phase cannot proceed safely, mark only that phase deferred and continue with the remaining independent phases where possible.

Campaign C remains:

AI_SCIENTIFIC_ADJUDICATION
EXPERT_VALIDATION_PENDING
DRAFT

until the task explicitly proves otherwise.

Do not mark Campaign C expert-approved.

Do not push or deploy anything.

---

# GLOBAL SAFETY RULES

Only scientific rules classified:

REPOSITORY_VERIFIED

may alter production scientific behaviour.

Rules classified:

AI_REVIEW_ONLY
AI_PROVISIONAL

must not alter production outputs.

Do not use WebFetch or WebSearch.

Do not invent scientific values.

Do not introduce a new scientific rule merely because it is mathematically convenient.

Do not silently convert unknown evidence into zero or a default.

Preserve:
- immutable task base;
- Campaign C evidence lineage;
- calculation versioning;
- CC-B2 behaviour;
- CC-B4A behaviour;
- Campaign B regulatory behaviour;
- statutory/NAP rules unless directly and explicitly in scope.

Do not modify the optimised harness.

---

# PHASE 1 — LOG OUTSTANDING FOLLOW-UPS

Add stable follow-up/blocker entries consistent with existing BLOCKERS.md conventions for:

## FOLLOW-UP A — Nutrient-card wording

Current issue:

The headline:

"Slurry nutrient credit not included"

is too broad for missing-index LESS and splashplate cases because valid N credit may still be counted while P/K are withheld.

Required action in this phase:

- log the issue;
- classify it as UI/content follow-up;
- do not change UI yet unless later phases genuinely require it.

## FOLLOW-UP B — Slurry provenance labelling

Current issue:

Some LESS/slurry results may be labelled MEASURED even when slurry DM was not laboratory-measured.

Required action:

- log the issue;
- classify it as provenance/metadata follow-up;
- do not change scientific calculations merely to fix the label.

## FOLLOW-UP C — January spring classification

Current issue:

Production may still classify January inside the current spring timing behaviour while the exact 1 February production boundary remains AI_PROVISIONAL / evidence-gated.

Required action:

- log the issue;
- do not change January production behaviour unless repository-verified evidence already authorises the exact boundary.

Preserve all existing Campaign C blocker statuses.

---

# PHASE 2 — SLURRY RATE / ALLOCATION ARCHITECTURE

## Goal

Create the missing architectural home for:

- crop P/K requirement;
- organic nutrient contribution;
- remaining chemical nutrient requirement;
- repository-verified organic-share caps;
- future deterministic slurry-rate selection;
- evidence provenance for each allocation constraint.

This layer must be distinct from:

- slurry nutrient concentration;
- nutrient availability factors;
- regulatory eligibility;
- weather/actionability;
- final What Matters ranking.

## Required architecture trace

Before editing:

1. locate current nutrient-plan requirement calculations;
2. locate current slurry nutrient-credit calculation;
3. locate current chemical fertiliser residual calculation;
4. locate current slurry volume/planned-volume inputs;
5. locate existing economic-opportunity allocation logic;
6. locate current P/K paired-fertility assumptions;
7. locate current provenance/evidence structures;
8. locate current rule/calculation versioning;
9. determine where a new allocation layer can exist without duplicating existing logic.

## Required conceptual model

The architecture should represent separately:

CROP_REQUIREMENT
AVAILABLE_SLURRY_NUTRIENT
ORGANIC_SHARE_LIMIT
ORGANIC_ALLOCATED_NUTRIENT
REMAINING_CHEMICAL_REQUIREMENT
RATE_CONSTRAINT
FINAL_ALLOWED_RATE

Do not collapse these concepts into one value.

Do not apply organic-share limits by mutating slurry concentration.

Do not apply share caps by modifying the 50% P / 90% K availability factors.

## Required provenance

Every constraint must retain:

- rule ID;
- evidence class;
- source claim ID;
- calculation version;
- input;
- limit;
- output;
- whether binding;
- reason.

---

# PHASE 3 — IMPLEMENT REPOSITORY-VERIFIED ORGANIC-SHARE CAPS

Only proceed if Phase 2 creates a safe allocation layer.

Repository-verified rules:

For soil P Index 1 or 2:

maximum organic contribution =
50% of applicable crop P requirement.

For soil K Index 1 or 2:

maximum organic contribution =
75% of applicable crop K requirement.

Important:

These are NOT nutrient-availability factors.

Current slurry availability factors remain:

P Index 1/2:
available slurry P × 0.50

K Index 1/2:
available slurry K × 0.90

The architecture must distinguish:

1. available nutrient from slurry;
2. maximum permitted organic share of crop requirement.

Do not assume the two layers "stack" in any undocumented way beyond their separate roles.

If implementing the share caps still depends materially on the unresolved question of how they interact with the availability factors, STOP this phase and classify:

IMPLEMENTATION_DEFERRED_RULE_INTERACTION_PROVISIONAL

Do not invent a reconciliation.

---

# PHASE 4 — RATE PRINCIPLE / SELECTOR ARCHITECTURE

Repository-verified principle:

- slurry rate must be informed by nutrient content;
- application must reflect crop nutrient requirement/allowance;
- slurry nutrients must be considered before chemical fertiliser planning.

Still provisional:

AI_PROVISIONAL_RATE_SELECTOR_V1

Specifically, do NOT automatically implement:

min(P-limited rate, K-limited rate)

unless repository evidence directly supports the exact selector.

Required work:

- create a rate-constraint architecture capable of representing multiple independent constraints;
- support named constraints such as:
  P_REQUIREMENT_LIMIT
  K_REQUIREMENT_LIMIT
  ORGANIC_SHARE_LIMIT
  REGULATORY_LIMIT
  TIMING_LIMIT
  WEATHER_LIMIT
  OPERATIONAL_LIMIT
- expose which constraint is binding;
- preserve evidence provenance.

The exact final selector may remain unimplemented.

If no repository-verified algorithm determines how multiple scientific constraints select one rate, mark:

RATE_SELECTOR_IMPLEMENTATION_DEFERRED_PROVISIONAL

Do not invent the selector.

---

# PHASE 5 — 90 KG K SPRING GUIDANCE

Repository-verified:

The Teagasc source contains the 90 kg K/ha spring guidance and later application of the remainder.

Still provisional:

- whether all slurry K must count toward the 90 kg limit;
- exact Farm Return operational enforcement;
- interaction with the Green Book 33 t/ha example.

Required work:

- represent the verified 90 kg guidance as a scientific constraint record;
- do not activate it as a production rate gate unless the exact operational interpretation is repository-verified;
- do not truncate slurry K nutrient credit to 90 kg;
- preserve current production output unless exact rule support exists.

Expected status if still unresolved:

RULE_RECORDED_IMPLEMENTATION_DEFERRED_PROVISIONAL

---

# PHASE 6 — YIELD SCALING

Repository-verified:

Per 1 t DM/ha change in the supported first-cut context:

N = 25 kg/ha
P = 4 kg/ha
K = 25 kg/ha

Current state:

- P/K scaling already exists;
- N implementation was deferred because supported yield range was unclear.

Required work:

1. inspect all existing repository evidence for explicit supported yield ranges;
2. inspect locally stored Teagasc snapshots and Green Book extracts;
3. determine whether safe bounds are already stored locally.

If bounds are repository-verified:

- implement N scaling inside those bounds;
- preserve P/K scaling;
- add deterministic bounds tests;
- version the engine if output changes.

If bounds are NOT repository-verified:

mark:

IMPLEMENTATION_DEFERRED_SUPPORTED_RANGE_UNCLEAR

Do not invent bounds.

Do not use web retrieval in this task.

---

# PHASE 7 — INDEPENDENT PER-NUTRIENT P/K ARCHITECTURE

Scientific state:

GAP-04 is scientifically resolved:
P Index governs P.
K Index governs K.

Current architecture:

CC-B4A deliberately retained paired P/K missing-evidence behaviour.

Required work:

Perform an architecture assessment.

Determine:

- what must change to represent P known / K unknown;
- P unknown / K known;
- P known / K known;
- both unknown;

while preserving:
- valid N independently;
- truthful evidence status;
- downstream Nutrients;
- reports;
- What Matters;
- fertiliser planning;
- statutory outputs.

Do NOT implement the redesign if it requires broad changes that would reopen CC-B2 or CC-B4A in this task.

If architecture is narrow and safely testable, implementation is allowed.

If substantial:

record a formal architecture design and classify:

IMPLEMENTATION_DEFERRED_ARCHITECTURE

Do not force it.

---

# PHASE 8 — CC-B3 LIFECYCLE PERSISTENCE

Current state:

CC-B3 is deferred because persistence is expected to require a migration.

Required work:

Design the lifecycle persistence model completely.

At minimum define persisted fields for:

- calculation ID;
- engine version;
- rule-set version;
- source/evidence claim IDs;
- scientific classification;
- input provenance;
- calculation timestamp;
- evidence snapshot/version;
- decision status;
- superseded-by relationship where applicable;
- immutable historical result;
- audit fingerprint where appropriate.

Do not perform a migration unless this task is explicitly authorised to create one by existing project rules.

If migration approval is absent:

- produce the schema/migration design;
- tests/specification where possible;
- classify:

CC_B3_READY_FOR_MIGRATION_TASK

Do not modify production database schema.

---

# PHASE 9 — BLINDED EXPERT VALIDATION FRAMEWORK

This task cannot perform expert validation.

It must prepare the validation protocol.

Create a formal protocol for future prospective validation.

Required design:

## Case set

Initial target:

50 cases.

Cases should span:

- soil P Index 1–4;
- soil K Index 1–4;
- mixed indices;
- slurry DM classes;
- LESS;
- splashplate;
- first-cut yield differences;
- missing evidence;
- low-index organic-share situations;
- regulatory constraints;
- weather/actionability constraints;
- economic prioritisation;
- cases where the correct output is BLOCKED / insufficient evidence.

## Farm Return arm

For each case freeze:

- raw inputs;
- recommendation;
- nutrient calculations;
- rate decision where available;
- blocked/allowed state;
- evidence trail;
- confidence;
- rule set version;
- engine version.

## Expert arm

Expert receives the same raw inputs without Farm Return's answer.

Expert records:

- recommendation;
- rate;
- nutrient values;
- reasoning;
- confidence;
- whether evidence is sufficient.

## Blind comparison

Comparison should measure:

- exact agreement;
- directional agreement;
- numerical deviation;
- safety disagreement;
- false blocking;
- evidence-principle agreement;
- confidence calibration.

Do not claim this validation has happened.

Create a schema/template capable of storing future cases and comparison results without requiring production integration yet.

---

# PHASE 10 — OPTIONAL FOLLOW-UP FIXES

Only after the core architecture phases above are complete and only if the changes are narrow.

## A. Nutrient-card headline

If straightforward and isolated:

replace the inaccurate blanket wording with text that distinguishes:

- N credit retained;
- P/K credit withheld.

Add UI regression tests.

If UI change triggers visual-check requirements, perform them.

## B. MEASURED provenance

Investigate whether LESS result provenance incorrectly says MEASURED when DM is farmer-declared / assumed / hydrometer-derived.

If the metadata model already supports correct provenance:

fix the label.

If it requires broad evidence-model redesign:

defer.

## C. January spring classification

Do not change production timing unless the exact boundary is REPOSITORY_VERIFIED.

If not verified:

leave code unchanged and retain blocker.

---

# ENGINE VERSIONING

Current engine:

nutrient_engine_v1.2.0

If production scientific outputs change:

follow the lifecycle contract.

Bump version as required.

Document:

- previous engine version;
- new engine version;
- exact rule/change;
- affected outputs;
- no historical-record rewrite.

If no production scientific output changes:

do not bump.

---

# CONTRACT FREEZE

If a frozen production scientific contract must change:

follow the existing contract-change protocol exactly.

Do not silently modify a frozen contract.

If contracts_frozen must temporarily become false:

- record why;
- prevent unrelated task handoff;
- restore true in a separate bookkeeping step if required by existing rules;
- audit according to current contract procedure.

---

# TESTING

Add targeted tests for every implemented change.

At minimum cover:

- organic-share allocation architecture;
- no double reduction of P/K;
- availability factors unchanged;
- P/K yield scaling unchanged;
- N scaling if implemented;
- rate constraint provenance;
- existing CC-B2 regression tests;
- existing CC-B4A missing-index tests;
- complete-data slurry behaviour;
- unsupported evidence states;
- What Matters reachability if allocation affects economics;
- statutory/NAP unchanged unless explicitly authorised;
- engine version.

Run:

targeted domain tests;
Campaign C tests;
relevant economic/orchestration tests;
npm run typecheck;
npm run build;
npm test if permitted.

---

# REQUIRED OUTPUT TABLE

At completion report every phase:

PHASE
STATUS
PRODUCTION CHANGE
ENGINE VERSION IMPACT
FILES
TESTS
DEFERRED REASON

Allowed statuses:

DONE
ALREADY_IMPLEMENTED
DEFERRED_EVIDENCE
DEFERRED_ARCHITECTURE
DEFERRED_PROVISIONAL_RULE
READY_FOR_MIGRATION_TASK
EXPERT_VALIDATION_PENDING
NOT_APPLICABLE

---

# STOP CONDITIONS

Return:

BUILD_RESULT: BLOCKED <reason>

only if the entire programme cannot make a truthful safe checkpoint.

For an individual phase, prefer deferral.

Hard STOP if:

1. repository-verified evidence conflicts materially;
2. production change would require unsupported science;
3. database schema would be modified without migration authorisation;
4. Campaign B regulation would need reinterpretation;
5. statutory calculations would change without direct authority;
6. existing CC-B2/CC-B4A guarantees cannot be preserved;
7. harness safety would need weakening;
8. task scope becomes materially unrelated to Campaign C.

---

# COMPLETION CRITERIA

This master task is successful if it:

1. logs the three follow-ups;
2. creates the slurry rate/allocation architecture where safe;
3. implements verified rules only where scientifically and architecturally justified;
4. does not implement provisional rules as fact;
5. resolves or formally defers N yield scaling range;
6. assesses independent P/K architecture;
7. prepares CC-B3 persistence design;
8. creates the blinded 50-case expert-validation protocol;
9. preserves Campaign C evidence lineage;
10. preserves CC-B2 and CC-B4A behaviour;
11. runs required tests;
12. leaves no undocumented production science changes;
13. leaves Campaign C DRAFT / EXPERT_VALIDATION_PENDING unless an existing contract explicitly permits another state;
14. commits locally only;
15. pushes nothing.

If successful:

BUILD_RESULT: DONE

If the programme cannot proceed safely:

BUILD_RESULT: BLOCKED <reason>

VERIFY COMMAND

npm run typecheck && npm run build

AUDIT FLOW

After build:

./scripts/agent-audit --primary

Only if Critical/High findings exist:

./scripts/agent-fix

Then only those findings:

./scripts/agent-audit --remediation <finding-id>

Finally once:

./scripts/agent-audit --final

Do not run broad historical audits.

Verify command: `npm run typecheck && npm run build`
