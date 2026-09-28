# Task: Campaign B live evidence wiring — canonical loaders and blocker propagation

Starting HEAD: 0ddfb7f

## Goal

Wire the Campaign B persisted evidence into the real application read paths so the
canonical regulatory context used by downstream nutrient/slurry logic can consume:

1. regulatory neat-slurry evidence persisted for stores; and
2. spreadable-area evidence persisted for fields.

This task is about LIVE READ INTEGRATION and blocker propagation only.

Do not add farmer-facing forms yet.

Do not invent missing slurry-origin evidence.

Do not change recommendation science, optimisation or What Matters ranking.

## Background

Campaign B now has clean, audited domain/persistence work for:

- immutable regulatory neat-slurry evidence;
- immutable spreadable-area evidence;
- deterministic observation selection;
- temporal integrity between historical neat evidence and current physical store state;
- current regulatory interpretation for home-produced grazing manure vs imported manure.

However, the persistence build explicitly noted that the live app was not yet loading
the new records into the real canonical context.

Also, the regulatory interpretation currently has an optional slurry `origin` input,
but the real application does not yet persist/capture whether slurry is:

- home-produced grazing-livestock manure;
- imported organic manure;
- or unknown.

Unknown origin must remain UNKNOWN/BLOCKED.

## A. Mandatory trace before changes

Trace the actual live call chain for:

- Today / What Matters;
- Nutrients;
- fertiliser-plan overview;
- scientific evidence report;
- any other production callers of `calculateNutrientPlan`;
- `slurry-regulatory-context`;
- farm-data loaders;
- mappers/row-types;
- Campaign B regulatory evidence repository.

Document exactly where each production caller currently gets:

- physical store volume;
- slurry allocations;
- slurry composition;
- regulatory neat-slurry evidence;
- gross field area;
- spreadable area;
- slurry origin.

Do not assume the new evidence tables are already consumed.

## B. Regulatory neat-slurry live loading

Wire the real persisted regulatory-neat evidence into the canonical store/regulatory
context.

Requirements:

1. Existing farms with no evidence remain NOT_ESTABLISHED/UNKNOWN.
2. Physical store volume must never be substituted.
3. Explicit zero remains known zero only when temporal/current-state comparability
   permits it under the already-audited temporal rules.
4. Unavailable/conflicting/historical/non-comparable states survive unchanged.
5. Status/source/effective/capture dates survive the real database -> mapper ->
   domain path.
6. Live callers must use the canonical evidence selector, not reimplement
   "latest row" logic separately.

## C. Spreadable-area live loading

Wire persisted spreadable-area evidence into the canonical field context.

Requirements:

1. Missing spreadable area remains missing.
2. Gross field area is never silently used as spreadable area.
3. Known zero remains known zero.
4. Positive known values retain provenance/status/date.
5. A historical value that now conflicts with gross-area constraints must remain
   canonical invalid/conflicting evidence, never silently clamped.
6. Do not yet implement new recommendation-rate or whole-field volume logic unless
   an existing caller already accepts the fact and only needs wiring.

## D. Slurry-origin audit

Trace whether ANY existing canonical persisted fact can establish:

- home-produced grazing-livestock manure;
- imported organic manure.

Do not infer origin from:

- store ownership;
- housing location;
- cattle being present on farm;
- the fact that slurry is in the farmer's store;
- allocation source;
- composition evidence.

If there is no canonical persisted origin evidence, keep the regulatory calculation
blocked with the existing origin-unknown reason.

Document the exact persistence gap.

Do NOT add a schema or farmer-facing origin form in this task.

That will be the next task if required.

## E. Downstream blocker propagation

Ensure production consumers receive the canonical evidence state rather than
silently falling back.

At minimum inspect:

- nutrient-plan/NAP compliance;
- scientific evidence report;
- fertiliser-plan overview;
- Today/What Matters inputs.

If a consumer cannot use the new evidence yet because its public contract lacks the
field, STOP for that consumer and document it rather than widening a frozen contract
without review.

No recommendation should become more actionable merely because wiring is incomplete.

## F. Required regression tests

At minimum prove:

A. real loader + no neat evidence => NOT_ESTABLISHED;

B. real loader + known neat evidence => same canonical fact as direct domain resolution;

C. real loader + unavailable neat evidence => unavailable survives;

D. real loader + temporally non-comparable neat evidence => current fact remains blocked;

E. no spreadable record => missing, never gross field area;

F. persisted known spreadable area survives mapper/load with provenance;

G. explicit spreadable zero survives as known zero;

H. persisted invalid/conflicting spreadable evidence remains invalid/conflicting;

I. unknown slurry origin remains regulatory BLOCKED in a real production caller;

J. no caller infers home-produced origin from cattle/store ownership;

K. existing physical-volume, agronomic-composition and gross-area behaviour does not regress;

L. Campaign B evidence is consumed through one canonical path rather than duplicate
   per-screen selection logic.

## G. Scope exclusions

Do NOT:

- add farmer-facing evidence forms;
- add slurry-origin persistence;
- change database schema/migrations;
- apply anything to Farm Return V1 Dev;
- resolve new regulatory interpretations;
- change nutrient coefficients;
- alter Campaign C science;
- recommend slurry application rates;
- optimise whole-farm allocation;
- change What Matters ranking/selection;
- re-open the clean persistence/tie/temporal logic unless integration exposes a
  genuine defect in it.

## H. STOP conditions

STOP rather than guessing if:

1. a frozen downstream contract must change to carry the evidence;
2. real slurry origin cannot be represented with current persistence;
3. two production callers use incompatible canonical context models;
4. wiring would require silently substituting gross area, physical volume or inferred origin.

Document the exact blocker and affected call chain.

## I. Documentation/state

Update in the SAME commit:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`

Record:

- exact production call chains wired;
- evidence still unavailable in real production;
- slurry-origin persistence status;
- any STOP condition;
- no migration applied to Farm Return V1 Dev;
- Campaign B remains PARTIAL.

## Verification

Run targeted regulatory evidence, mappers/farm-data, nutrient-plan and affected
production-caller tests.

Then full `npm test`.

Verify command: `npm run typecheck && npm run build`

Only report DONE if all tests and verification pass.

