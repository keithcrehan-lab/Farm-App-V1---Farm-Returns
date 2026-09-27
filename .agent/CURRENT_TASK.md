# Task: Campaign A — Slurry recommendation evidence foundation
Starting HEAD: 38b98df

## Campaign purpose

Build the evidence foundation required before Farm Return can safely calculate scientifically defensible slurry recommendations.

This campaign combines the previously separate:

- evidence/provenance semantic corrections;
- existing-evidence wiring.

It MUST NOT implement the future scientific slurry-rate engine, regulatory nutrient-accounting engine, spreadable-area engine, or whole-farm optimiser.

The purpose is to make sure the next phases receive the correct evidence, with the correct meaning and provenance, without repeatedly asking the farmer for information Farm Return already knows.

---

# Non-negotiable principle

Every recommendation Farm Return eventually makes must be reproducible from its underlying data, traceable to the evidence supporting every material transformation, economically auditable, and independently reviewable without trusting Farm Return itself.

For this campaign specifically:

- unknown must never silently become zero;
- measured must never silently become estimated;
- farmer-adjusted must never be presented as laboratory-measured;
- derived must never be presented as directly observed;
- archived/inactive farm entities must not silently enter current planning calculations;
- evidence already held by Farm Return should be reused when still valid;
- the farmer must not be asked again for a still-valid fact the system already holds;
- raw evidence and transformed evidence must remain distinguishable;
- no new scientific transformation may be invented merely to make the data usable.

---

# Existing architecture to preserve

Reuse existing provenance/evidence architecture where possible.

In particular, inspect and preserve the intent of the existing Phase 7.1 provenance/fingerprinting work rather than creating a parallel evidence system.

Do not introduce a second competing provenance abstraction if the existing one can be extended safely.

Canonical historical calculations must remain reproducible.

Do not rewrite previous evidence snapshots when newer evidence appears.

---

# Campaign A internal checkpoints

Complete these in order.

Do not continue through a checkpoint if doing so would require inventing science, regulatory interpretation, or unsupported semantics.

If a STOP condition is reached, document it precisely and return BUILD_RESULT: BLOCKED rather than guessing.

---

# CHECKPOINT A1 — Evidence semantic audit and corrections

Trace the real current production paths that feed:

- slurry planning;
- field nutrient planning;
- What Matters;
- farm-level evidence/context used by slurry opportunity logic.

Do not trust old audit wording blindly. Reproduce each issue against the current HEAD before changing it.

Correct confirmed semantic defects.

## A1.1 Archived/inactive fields

Current planning/recommendation paths must not treat archived/inactive fields as active candidate fields.

Requirements:

- identify the canonical active/archive field state;
- current planning totals and candidate lists must use active fields only where the feature means "current farm planning";
- historical records referencing archived fields must remain intact;
- do not delete or rewrite historical evidence;
- tests must prove an archived field cannot silently affect current slurry/fertiliser opportunity counts or current planning totals;
- historical views may still display it where appropriate.

Do not implement any new agronomic exclusion rules here.

---

## A1.2 Farmer-adjusted P/K versus laboratory evidence

Audit how soil P/K values are represented when:

1. laboratory evidence exists;
2. farmer subsequently adjusts the effective index/value;
3. downstream nutrient planning consumes the result.

The system must preserve the distinction between:

- original laboratory evidence;
- farmer-declared adjustment/override;
- effective value used by a downstream calculation;
- any system-derived value.

A farmer-adjusted value must never be labelled or serialised as if it were:

- laboratory-measured;
- directly derived from the lab result;
- unchanged source evidence.

Do not discard the original lab evidence.

If downstream logic uses the farmer-adjusted value, that usage must be traceable as an override and not rewrite provenance.

Add regression tests covering at minimum:

- lab only;
- farmer override after lab;
- removal/change of farmer override if supported;
- downstream effective value provenance;
- historical lab evidence remains unchanged.

Do not change nutrient recommendation science in this checkpoint.

---

## A1.3 Housing/slurry nutrient unknown versus zero

Audit housing/store representations that currently show or expose nutrient values such as N/P/K as `0` where the system has not actually calculated or measured them.

Unknown nutrient composition must remain unknown.

Requirements:

- do not display `0 kg`, `0 kg/m³`, or equivalent merely because composition is unavailable;
- distinguish genuine measured/calculated zero from missing/not-calculated;
- downstream code must not be able to mistake missing composition for zero nutrient value;
- farmer-facing UI should use plain wording such as `Unknown` or omit the number where appropriate;
- preserve physical slurry volume independently of nutrient-composition knowledge.

Add regression tests proving:

- missing nutrient composition ≠ zero;
- genuine zero remains representable if the domain permits a real zero;
- physical tank volume can be known while nutrient composition remains unknown.

Do not calculate nutrient content in this checkpoint.

---

# CHECKPOINT A2 — Reuse evidence Farm Return already holds

After A1 passes targeted tests, trace evidence that is already collected but currently fails to reach the slurry-planning/recommendation context.

The goal is wiring, not new inference.

---

## A2.1 Existing farmer answers

Audit previously collected farmer answers relevant to slurry planning and actionability, including confirmed examples from the earlier evidence audit such as:

- commonage context;
- water/buffer-related answers;

and any directly equivalent stored evidence discovered in the current implementation.

Requirements:

- reuse existing still-valid answers rather than asking the same question again;
- preserve original source/provenance and recorded time;
- do not manufacture an answer from absence;
- stale/expired evidence must not be silently treated as current;
- if the same fact exists in conflicting sources, preserve conflict rather than arbitrarily choosing one;
- do not introduce new legal interpretation based on these answers in Campaign A.

This checkpoint may make evidence available to later engines without changing the regulatory decision itself.

Tests must demonstrate that previously stored answers can be retrieved through the real evidence path used by slurry planning.

---

## A2.2 Recorded slurry dry matter evidence

Audit every real place where slurry dry matter is already recorded.

Determine whether the current slurry/nutrient planning path receives that evidence.

Requirements:

- recorded DM must not disappear between persistence and the evidence context;
- preserve its source and provenance;
- preserve the actual recorded value;
- distinguish measured/declared DM from standard/default composition;
- do not invent a DM value when missing.

CRITICAL SCIENCE BOUNDARY:

Campaign A MUST NOT create a new DM → N/P/K conversion.

Campaign A MUST NOT interpolate between DM bands.

Campaign A MUST NOT decide which scientific composition table is authoritative.

If an already-existing, previously approved/audited transformation contract safely consumes DM, it may continue to do so.

If no such approved transformation exists:

- wire the raw DM evidence through;
- leave the nutrient transformation unknown/blocked;
- document that conversion as a Campaign C scientific dependency.

Tests must prove that recorded DM reaches the evidence boundary without being silently replaced by a default.

---

## A2.3 Existing slurry/application evidence

Trace whether Farm Return already possesses reusable evidence for planned or historical slurry applications, such as:

- application method;
- application timing/date;
- source store/housing;
- actual/planned physical volume;
- field identity.

Reuse these values only where their semantic identity is genuinely the same fact required downstream.

Requirements:

- planned values must remain planned;
- completed actuals must remain actual;
- historical values must not be assumed to describe a future application;
- previous application method must not silently become the method for a new future application;
- no cross-field attribution;
- no physical-volume → regulatory neat-slurry conversion.

The existing Phase 1A lifecycle remains canonical for allocation lifecycle facts.

---

# CHECKPOINT A3 — Canonical evidence boundary

After A1 and A2 are working, ensure the downstream slurry recommendation work has one clearly defined way to inspect the evidence it needs.

Do not build the recommendation engine.

Prefer extending an existing canonical evidence snapshot/context over inventing another model.

The evidence boundary should make it possible to distinguish, where relevant:

- value;
- source/provenance;
- recorded/observed time;
- effective/current status;
- farmer override versus source measurement;
- missing;
- conflicting;
- stale where freshness is meaningful.

Do not create fake confidence percentages.

Do not collapse conflicting evidence to a single value unless an already-audited deterministic rule exists.

If the current provenance architecture has established names/types for these concepts, use them.

---

# CHECKPOINT A4 — Minimum-interruption behaviour

Review the evidence-gathering path from the farmer's perspective.

The intended future sequence is:

1. use reliable evidence already stored;
2. safely derive only where an approved rule exists;
3. use authoritative external evidence where already supported;
4. identify genuine blockers;
5. ask the farmer only for the minimum missing facts.

Campaign A only implements steps 1 and the evidence-identification portion of step 4.

Do not build the future full evidence-questionnaire UX yet.

But ensure current code cannot ask for a fact when the same still-valid canonical fact is already available.

Add tests where practical for:

- known fact → no duplicate ask/blocker;
- missing fact → remains missing;
- conflicting fact → remains unresolved;
- unknown → never becomes false/0/default.

---

# Required audit of downstream consumers

Before completing this campaign, inspect downstream consumers affected by the changes, including where relevant:

- What Matters;
- nutrient-plan construction;
- slurry planning;
- fertiliser planning where shared soil provenance is consumed;
- field counts/current farm totals;
- evidence/provenance display.

Correct only semantic/wiring regressions introduced or confirmed by Campaign A.

Do not expand scope into recommendation science.

---

# Explicit exclusions — future campaigns

The following are NOT part of Campaign A.

## Campaign B

Do not implement:

- statutory N/P manure accounting;
- physical slurry versus regulatory neat slurry conversion;
- organic N limit calculations;
- regulatory eligibility decisions;
- spreadable-area calculation;
- watercourse/legal buffer geometry;
- gross-area → spreadable-area assumptions;
- new regulatory-question workflow.

Evidence may be wired for future use, but no new legal conclusion may be created.

## Campaign C

Do not implement:

- new Teagasc slurry composition rules;
- DM interpolation;
- new crop nutrient-rate rules;
- resolution of current scientific source conflicts;
- P/K slurry availability transformations;
- first-cut slurry rate recommendations;
- lime/pH response multipliers;
- scientific confidence scoring.

## Campaign D

Do not implement:

- recommended m³/ha;
- recommended total m³;
- field ranking;
- finite whole-farm slurry optimisation.

## Campaign E

Do not implement:

- farmer recommendation overrides/reallocation;
- new weather/actionability logic;
- final What Matters recommendation cards.

---

# Database/schema policy

Prefer no migration.

If the existing database genuinely cannot preserve a required provenance distinction without schema change:

STOP.

Document:

- exact missing persistence capability;
- tables/columns involved;
- why application-only code cannot preserve truth;
- proposed minimal migration;
- compatibility impact on existing records.

Return BUILD_RESULT: BLOCKED.

Do not create or apply a migration automatically in this campaign without a separate reviewed task.

---

# No production data mutation

Do not mutate Dev or production data as part of this build.

Automated tests may use fixtures/mocks/local test data.

No Supabase migration push.

---

# Testing requirements

Add focused regression tests for every confirmed defect changed.

At minimum the final campaign must cover:

A. archived field excluded from current planning but history preserved;

B. laboratory P/K evidence preserved after farmer override;

C. farmer override explicitly distinguishable from lab evidence;

D. downstream effective P/K value carries truthful provenance;

E. unknown slurry nutrient composition does not become zero;

F. known physical slurry volume can coexist with unknown nutrient composition;

G. existing commonage answer is reused where the same evidence is requested;

H. existing water/buffer answer is reused where the same evidence is requested;

I. missing answer remains missing rather than false/default;

J. recorded slurry DM reaches the relevant evidence context;

K. missing DM remains missing;

L. recorded DM is not silently replaced by a standard value;

M. no new unsupported DM-to-nutrient transformation is introduced;

N. planned slurry evidence remains distinct from completed actual evidence;

O. historical application method is not silently reused as a future method;

P. evidence conflicts remain explicit where no canonical resolution rule exists;

Q. current field counts exclude archived fields where semantically appropriate;

R. full existing test suite remains green.

Run targeted tests after each checkpoint.

Then run:

`npm test`

and the verify command below.

---

# Documentation

Update the existing evidence audit/documentation to record:

- which Campaign A findings were reproduced;
- which were fixed;
- which were already fixed in current code;
- which are intentionally deferred to Campaign B/C;
- exact remaining blockers.

Do not rewrite historical audit findings as though they never existed.

Add a concise Campaign A completion section with final evidence-flow semantics.

---

# Completion report

Report:

1. starting HEAD;
2. final HEAD/worktree state;
3. files changed;
4. each original evidence finding and its final status:
   - FIXED;
   - NOT REPRODUCIBLE on current HEAD;
   - DEFERRED with reason;
   - BLOCKED;
5. tests run/results;
6. whether any migration is required;
7. remaining Campaign B dependencies;
8. remaining Campaign C scientific dependencies;
9. any open concerns.

Do not claim a finding is fixed without a regression test or a clear traced code path.

---

# STOP conditions

Return BUILD_RESULT: BLOCKED rather than guessing if any of these occur:

- a required provenance distinction cannot be persisted safely without schema change;
- fixing a finding requires choosing between conflicting scientific sources;
- fixing a finding requires a new regulatory/legal interpretation;
- the only way forward is to treat unknown as zero/default;
- evidence identity cannot be established well enough to know two values represent the same fact;
- historical evidence would need to be rewritten;
- a farmer override cannot be separated from original source evidence;
- a migration is required.

---

# Definition of done

Campaign A is complete only when:

- confirmed evidence semantic defects are fixed;
- existing reusable evidence reaches the correct downstream evidence boundary;
- unknown remains unknown;
- lab/farmer/derived provenance remains distinguishable;
- archived fields do not contaminate current planning;
- recorded DM is preserved without inventing science;
- duplicate farmer asks are prevented where existing canonical evidence is still valid;
- no Campaign B/C/D/E logic has leaked into this campaign;
- targeted tests pass;
- full tests pass;
- typecheck passes;
- build passes;
- documentation reflects reality.

Verify command: `npm run typecheck && npm run build`
