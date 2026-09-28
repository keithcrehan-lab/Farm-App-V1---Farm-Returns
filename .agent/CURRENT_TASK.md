# Task: Campaign B slurry-origin evidence — canonical persistence and minimal capture

Starting HEAD: 39b8aaa

## Goal

Close the current Campaign B production gap around slurry origin.

The regulatory engine already distinguishes relevant manure-origin cases, but the live
application currently has no canonical persisted evidence establishing the origin of
the slurry used in a planned application.

Implement the smallest safe solution that allows a farmer to explicitly establish
origin without Farm Return inferring it.

This task includes:

1. establishing the correct evidence scope;
2. immutable/auditable persistence;
3. canonical resolution;
4. live wiring into the existing regulatory context;
5. the minimum farmer-facing capture required to provide the missing fact.

Do not implement optimisation, Campaign C science or new What Matters logic.

## Core safety rule

NEVER infer slurry origin from:

- ownership of the slurry store;
- location of the store;
- cattle being present on the holding;
- housing records;
- the allocation source;
- slurry composition;
- physical volume;
- historical behaviour;
- the farmer owning the livestock.

The farmer or another authoritative evidence source must explicitly establish origin.

Unknown must remain unknown.

## A. Mandatory architecture trace before schema changes

Trace the complete existing path for:

- slurry stores;
- slurry allocation planning;
- allocation lifecycle;
- planned application records;
- regulatory neat-slurry evidence;
- nutrient-plan construction;
- NAP compliance;
- `plannedRegulatoryNeatSlurryForNutrientPlan`;
- the optional/current slurry-origin input;
- Plan Slurry Spreading UI;
- relevant farm-data repositories/mappers;
- evidence/provenance patterns used elsewhere in Campaign B.

Determine which entity the origin fact actually belongs to.

Explicitly evaluate:

1. store-level origin;
2. allocation/application-level origin;
3. whether a store may contain slurry of more than one origin;
4. whether a single binary origin attached permanently to a store could become false
   after imported material is added;
5. whether an allocation can safely represent one origin;
6. what must happen if the material is mixed or the farmer is unsure.

Do not implement a store-level binary merely because it is convenient.

## B. Required modelling decision

Origin evidence must describe the material used in the relevant planned application
accurately enough for the existing regulatory calculation.

At minimum the canonical domain must distinguish:

- HOME_PRODUCED_GRAZING_LIVESTOCK
- IMPORTED_ORGANIC_MANURE
- UNKNOWN

If the real architecture requires an explicit MIXED state, add one.

MIXED without a defensible quantity split must remain BLOCKED/UNKNOWN for regulatory
calculation rather than being forced into either origin category.

If the current engine cannot safely represent a mixed-origin allocation without
inventing a split, STOP and document that boundary.

Do not invent origin-volume proportions.

## C. Persistence

If the architecture trace identifies a safe persistence scope, add immutable/add-only
origin evidence using the existing Campaign B evidence conventions.

Requirements:

- database-generated/authoritative capture timestamp;
- authenticated actor identity where existing patterns support it;
- explicit subject identity;
- explicit origin value;
- effective date/time where materially required;
- provenance/source classification;
- no silent update-overwrite history;
- deterministic current-evidence selection;
- conflicting/ambiguous evidence fails closed;
- existing farms receive NO fabricated backfill;
- no default home-produced value.

Follow the hardened patterns already used by:

- regulatory neat-slurry evidence;
- spreadable-area evidence.

Do not duplicate evidence-selection rules unnecessarily.

## D. Temporal and lifecycle integrity

Trace how origin evidence behaves when a slurry allocation is:

- created;
- edited;
- moved to another store;
- completed;
- cancelled;
- recreated.

Historical completed/cancelled records must retain the evidence that supported the
historical calculation.

Editing a planned allocation must not accidentally reuse origin evidence that no
longer applies.

Do not rewrite historical evidence.

## E. Live regulatory wiring

Wire the canonical origin evidence into the existing live regulatory context.

Requirements:

1. explicit home-produced grazing-livestock evidence reaches the existing origin input;
2. explicit imported-organic-manure evidence reaches the existing origin input;
3. missing evidence remains `PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED` or the canonical
   equivalent;
4. mixed/ambiguous evidence remains blocked unless an existing audited contract can
   represent it correctly;
5. no caller independently guesses origin;
6. Scientific Evidence Report exposes the provenance/status where its existing
   contract permits it;
7. Nutrients/NAP compliance consumes the canonical fact through one path.

Do not change the previously audited legal interpretation in this task.

## F. Minimal farmer-facing capture

Add the smallest interaction necessary to establish the missing fact.

Prefer placing it in the existing slurry-planning workflow close to the allocation or
application that requires the evidence.

Farmer-facing wording should be plain English.

Conceptually the farmer must be able to state something equivalent to:

- produced on this holding by grazing livestock;
- imported organic manure;
- mixed / not sure.

Do not expose internal enum names or legal reason codes.

Do not add a large settings page merely for this fact.

Do not repeatedly ask for the same still-valid fact during one unchanged planning
workflow.

A saved explicit declaration should be visible/reviewable before the farmer relies on
the resulting regulatory calculation.

## G. Fail-closed behaviour

Until valid origin evidence exists:

- NAP/regulatory calculations that require origin remain blocked;
- no zero is substituted;
- no home-produced assumption is made;
- no imported assumption is made;
- no recommendation becomes actionable merely because the UI was added.

Database/read failures must not become UNKNOWN in a way that conceals a real system
error unless that behaviour is already an explicitly audited repository convention.

## H. Required tests

At minimum cover:

A. existing farm/allocation with no origin evidence remains BLOCKED;

B. explicit home-produced grazing-livestock evidence reaches the canonical regulatory
   calculation;

C. explicit imported-organic-manure evidence reaches the canonical regulatory
   calculation;

D. unknown/unsure remains BLOCKED;

E. mixed without a defensible split remains BLOCKED;

F. cattle on the farm does not infer home-produced origin;

G. store ownership does not infer home-produced origin;

H. imported origin is not changed because it resides in a farmer-owned store;

I. historical origin evidence is retained after completion/cancellation;

J. editing/moving an allocation cannot silently retain inapplicable evidence;

K. conflicting current evidence fails closed;

L. existing farms receive no backfilled origin;

M. provenance/actor/capture information survives DB -> mapper -> domain;

N. real production Nutrients/NAP caller consumes the canonical origin;

O. Scientific Evidence Report does not overstate unknown origin;

P. farmer-facing capture persists and reloads correctly;

Q. internal enum/reason-code text is not leaked into farmer-facing UI;

R. existing Campaign B neat-volume/spreadable-area behaviour remains unchanged.

Where database invariants are introduced, add static migration tests and the strongest
database-boundary verification available without applying to Farm Return V1 Dev.

## I. STOP conditions

STOP for human review rather than guessing if:

1. origin cannot safely be modelled at store or allocation/application level with the
   existing architecture;
2. mixed-origin slurry requires quantity accounting not supported by the current
   contracts;
3. implementing origin requires changing the already-frozen legal interpretation;
4. a frozen downstream contract must be materially widened;
5. an origin declaration would be reused across allocations without proof that it
   remains valid;
6. persistence cannot preserve historical provenance;
7. a database migration would need to be applied to Farm Return V1 Dev to complete
   the task.

Document the exact blocker and affected call chain.

## J. Migration rule

Schema/migration creation is allowed if required by the safe model.

Do NOT apply migrations to Farm Return V1 Dev.

If a migration is created:

- validate it statically;
- test it through existing repository/database test conventions where possible;
- record clearly that it remains unapplied to Dev.

## K. Documentation/state

Update in the SAME commit:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`
- relevant Campaign B evidence documentation

Record:

- chosen subject/scope for origin evidence and why;
- rejected unsafe alternatives;
- unknown/mixed behaviour;
- provenance model;
- live callers wired;
- migration status;
- remaining Campaign B gaps.

Campaign B remains PARTIAL unless every remaining Campaign B requirement has actually
been completed.

## L. Scope exclusions

Do NOT:

- implement Campaign C agronomic science;
- change slurry nutrient coefficients;
- recommend application rates;
- optimise whole-farm slurry allocation;
- change What Matters ranking;
- apply migrations to Farm Return V1 Dev;
- redesign unrelated screens;
- infer origin;
- invent mixed-origin volume splits;
- reopen clean Campaign B persistence/temporal rules except where directly required
  to integrate this new evidence type.

## Verification

Run targeted origin-evidence, regulatory-context, allocation-lifecycle,
farm-data/repository and affected UI tests.

Then full:

`npm test`

Verify command: `npm run typecheck && npm run build`

Only report DONE if:

- the evidence model is safe;
- unknown/mixed cases fail closed;
- real production callers consume the canonical origin;
- farmer capture is persisted/reloaded;
- historical provenance survives;
- all tests and verification pass.

